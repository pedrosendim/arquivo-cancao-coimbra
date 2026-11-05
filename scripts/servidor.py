"""Servidor local: serve o site, a API de pesquisa no arquivo e o modo de edição do dono do arquivo.

Uso:  python scripts/servidor.py [--porta 8765] [--abrir]
Depois abrir http://localhost:8765
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import threading
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from comum import INDICE, RAIZ, em, escrever_json, ler_json, valores
from pesquisar import pesquisar, pesquisar_media

POR_PAGINA = 30
# ficheiros que o modo de edição pode ler e gravar (nunca o arquivo/ nem os scripts); o mesmo em online/comum.js
RE_EDITAVEL = re.compile(r"dados/(pessoas|instrumentos|gravacoes|obras|media|blogue)/[a-z0-9]+(-[a-z0-9]+)*\.json"
                         r"|dados/contribuidores\.json|dados/excluidos\.json|fontes/fontes\.json")
SEM_INDICE = {"sessao", "dados", "historico", "versao", "alteracoes"}  # rotas da edição: funcionam mesmo sem o índice do arquivo
GRAVACAO = threading.Lock()
# erros de validação já existentes antes de uma gravação, guardados enquanto dados/ não mudar por fora
CONHECIDOS = {"assinatura": None, "erros": set()}
MUDOU_ENTRETANTO = ("Outra pessoa alterou esta ficha enquanto a editava. Recarregue a página para ver a versão nova "
                    "e volte a fazer a alteração.")
JA_CRIADA = ("Entretanto alguém criou uma ficha com o mesmo nome. Recarregue a página para a ver: se for a mesma, "
             "acrescente-lhe lá o que queria; se for outra, volte a criar a sua.")
RE_HOST_LOCAL = re.compile(r"(localhost|127\.0\.0\.1)(:\d+)?")
# o site online (GitHub) comparado com esta cópia: quantas alterações feitas online ainda não estão aqui (None: não se sabe)
ONLINE = {"atras": None}

# Proteções do browser (as mesmas do site online: site/_headers e online/cabecalhos.js). Os scripts só podem vir do
# próprio site, do cdnjs (dagre) e das APIs oficiais dos leitores (YouTube, Vimeo, SoundCloud), mais os scripts em
# linha de cada página, autorizados pelo seu hash, e os dois onerror em linha das imagens (componentes.js e
# vistas/linhagens.js). CSP_SCRIPTS tem de ser igual a SCRIPTS de online/cabecalhos.js: um script novo de fora
# acrescenta-se nos dois. Ao contrário do site online, as imagens e o áudio não se limitam: muitos endereços das fichas
# e dos posts arquivados ainda são http://.
CSP_BASE = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
CSP_SCRIPTS = "'self' https://cdnjs.cloudflare.com https://www.youtube.com"
# P4: as APIs oficiais dos leitores do Vimeo e do SoundCloud (leitor.js), para a fila avançar quando o vídeo ou o som acaba
CSP_SCRIPTS += " https://player.vimeo.com https://w.soundcloud.com"
ESTADO_GUARDADO = {}  # /api/estado em memória enquanto o índice não mudar (api_estado)
ONERROR_EM_LINHA = ["this.closest('figure').remove()", "this.remove()"]
_HASHES = {}


def hash_csp(texto):
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")  # o browser lê as mudanças de linha assim
    return "'sha256-" + base64.b64encode(hashlib.sha256(texto.encode("utf-8")).digest()).decode() + "'"


def csp_pagina(f):
    """Content-Security-Policy de uma página HTML: os seus scripts em linha autorizados um a um (hash calculado do
    ficheiro tal como está, por isso nunca fica desatualizado quando a página muda)."""
    chave = (f, f.stat().st_mtime_ns)
    if chave not in _HASHES:
        em_linha = re.findall(r"<script(?![^>]*\bsrc\s*=)[^>]*>(.*?)</script>", f.read_text(encoding="utf-8"), re.S | re.I)
        _HASHES[chave] = " ".join(hash_csp(s) for s in em_linha)
    eventos = " ".join(hash_csp(s) for s in ONERROR_EM_LINHA)
    return f"script-src {CSP_SCRIPTS} {_HASHES[chave]} 'unsafe-hashes' {eventos}; {CSP_BASE}"


def versao_de(f):
    """Versão de um ficheiro de dados, para saber se mudou depois de o browser o ler: o hash do git (blob) do
    conteúdo em disco, ou None se não existe."""
    if not f.exists():
        return None
    b = f.read_bytes()
    return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()


def _git_sem_perguntas(*a):
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never"}
    return subprocess.run(["git", "-c", "http.lowSpeedLimit=1000", "-c", "http.lowSpeedTime=8", *a], cwd=RAIZ,
                          capture_output=True, text=True, timeout=10, env=env)


def contar_atras():
    """Quantos commits do main online (o último origin/main que se trouxe) esta cópia ainda não tem. Só lê o git local:
    é rápido, e mostra logo o efeito de um git pull feito com o servidor a correr."""
    try:
        r = _git_sem_perguntas("rev-list", "--count", "HEAD..origin/main")
        if r.returncode == 0:
            ONLINE["atras"] = int(r.stdout.strip() or 0)
    except (OSError, subprocess.SubprocessError, ValueError):
        pass


def comparar_com_online(intervalo=15 * 60):
    """Em segundo plano: git fetch (10 s no máximo; sem rede ou sem git, não avisa) e conta os commits do main online
    que esta cópia ainda não tem. O site mostra-o a quem edita. Repete de 15 em 15 minutos."""
    while True:
        try:
            if _git_sem_perguntas("fetch", "--quiet", "origin", "main").returncode == 0:
                contar_atras()
        except (OSError, subprocess.SubprocessError):
            pass
        time.sleep(intervalo)


class ErroValidacao(Exception):
    pass


def criada_na_edicao(f):
    """Ficha criada por um contribuidor e ainda sem factos nem excertos: a única que se pode apagar."""
    if f.parent.name not in ("pessoas", "obras", "gravacoes", "instrumentos", "media") or not f.exists():
        return False
    p = ler_json(f)
    return bool(p.get("editorial")) and not p.get("factos") and not p.get("biografia")


def assinatura_dados():
    ficheiros = [RAIZ / "fontes" / "fontes.json", *(RAIZ / "dados").rglob("*.json")]
    return len(ficheiros), sum(f.stat().st_mtime_ns for f in ficheiros)


def ligar():
    db = sqlite3.connect(f"file:{INDICE.as_posix()}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    return db


def colunas(db, tabela):
    """Colunas de uma tabela do índice (um índice feito por uma versão anterior do indexar.py pode não ter as novas)."""
    return {r[1] for r in db.execute(f"PRAGMA table_info({tabela})")}


class Pedido(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            return
        super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        caminho = urlparse(self.path).path
        pagina = RAIZ / "site" / ("index.html" if caminho in ("", "/") else caminho.lstrip("/"))
        try:
            csp = csp_pagina(pagina) if pagina.suffix == ".html" and pagina.is_file() else CSP_BASE
        except (OSError, ValueError):
            csp = CSP_BASE
        self.send_header("Content-Security-Policy", csp)
        super().end_headers()

    def host_local(self):
        """O endereço pedido é deste computador. Um site de fora que aponte um nome seu para 127.0.0.1 (DNS rebinding)
        não consegue assim ler o arquivo privado nem a API."""
        return RE_HOST_LOCAL.fullmatch(self.headers.get("Host", "")) is not None

    def recusar_host(self):
        self.json({"erro": f"Endereço não permitido: abra http://localhost:{self.server.server_port}"}, 403)

    def do_HEAD(self):
        if not self.host_local():
            return self.recusar_host()
        return super().do_HEAD()

    def do_GET(self):
        if not self.host_local():
            return self.recusar_host()
        u = urlparse(self.path)
        if not u.path.startswith("/api/"):
            return super().do_GET()
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        nome = u.path[5:].strip("/").replace("/", "_").replace("-", "_")  # /api/verificar-citacao → api_verificar_citacao
        rota = getattr(self, "api_" + nome, None)
        if not rota:
            return self.json({"erro": "rota desconhecida"}, 404)
        if nome in SEM_INDICE:
            try:
                return self.json(rota(None, q))
            except LookupError as e:
                return self.json({"erro": str(e)}, 404)
        if not INDICE.exists():
            return self.json({"erro": "arquivo por indexar", "arquivo": False}, 503)
        try:
            db = ligar()
            try:
                self.json(rota(db, q))
            finally:
                db.close()
        except LookupError as e:
            self.json({"erro": str(e)}, 404)
        except Exception as e:  # devolve o erro ao site em vez de fechar a ligação
            self.json({"erro": str(e)}, 500)

    def mesma_origem(self):
        """Escritas só a partir do próprio site, neste computador: outro site aberto no browser não pode gravar."""
        host = self.headers.get("Host", "")
        return (self.host_local()
                and self.headers.get("Origin") == f"http://{host}"
                and self.headers.get("Content-Type", "").startswith("application/json"))

    def do_POST(self):
        """Escritas: gravar alterações do modo de edição e importar playlists do YouTube lidas pelo leitor oficial."""
        caminho = urlparse(self.path).path
        if caminho not in ("/api/playlist", "/api/gravar"):
            return self.json({"erro": "rota desconhecida"}, 404)
        if not self.mesma_origem():
            return self.json({"erro": "pedido recusado: só o próprio site, neste computador, pode gravar"}, 403)
        try:
            tam = min(int(self.headers.get("Content-Length", 0)), 2_000_000)
            pedido = json.loads(self.rfile.read(tam).decode("utf-8"))
        except Exception as e:
            return self.json({"erro": f"pedido inválido ({e})"}, 400)
        if caminho == "/api/gravar":
            return self.gravar(pedido)
        try:
            lista = str(pedido.get("lista", ""))
            if not re.fullmatch(r"[A-Za-z0-9_-]{10,64}", lista):
                return self.json({"erro": "identificador de playlist inválido"}, 400)
            from youtube_lista import guardar_lista
            from indexar import paginas_incremental
            r = guardar_lista(lista, [str(i) for i in pedido.get("ids", [])][:1000], pedido.get("titulo") or None,
                              mostrar=lambda *_: None)
            paginas_incremental(substituir=[r["doc_id"]])
            self.json({"ok": True, **r})
        except Exception as e:
            self.json({"erro": str(e)}, 500)

    def gravar(self, pedido):
        """Grava ficheiros de dados/ (e fontes.json), valida tudo e reconstrói o site.
        Se a alteração criar erros de validação, os ficheiros voltam ao que eram e os erros seguem para o site."""
        from construir import gerar
        from validar import validar
        alteracoes = pedido.get("alteracoes") or []
        if not isinstance(alteracoes, list) or not all(isinstance(a, dict) for a in alteracoes):
            return self.json({"erro": "pedido inválido"}, 400)
        # uma ficha juntada a outra (desambiguação) apaga-se na mesma gravação em que a outra a regista em «juntou»
        juntadas = {f"dados/{a['caminho'].split('/')[1]}/{j.get('id')}.json" for a in alteracoes if isinstance(a.get("conteudo"), dict)
                     and str(a.get("caminho", "")).startswith("dados/") for j in a["conteudo"].get("juntou") or [] if isinstance(j, dict)}
        # «Retirar do catálogo»: uma ficha de media apaga-se na mesma gravação em que o seu endereço entra em dados/excluidos.json
        excluidos = next((a["conteudo"] for a in alteracoes if a.get("caminho") == "dados/excluidos.json"
                          and isinstance(a.get("conteudo"), dict)), {})
        urls_excluidas = {e.get("url") for e in excluidos.get("media") or [] if isinstance(e, dict) and e.get("url")}

        def retirada_do_catalogo(caminho):
            f = RAIZ / caminho
            return caminho.startswith("dados/media/") and f.exists() and ler_json(f).get("url") in urls_excluidas

        for a in alteracoes:
            if not RE_EDITAVEL.fullmatch(str(a.get("caminho", ""))):
                return self.json({"erro": f"ficheiro não editável: {a.get('caminho')}"}, 400)
            if a.get("conteudo") is None and not (a["caminho"].startswith("dados/blogue/") or a["caminho"] in juntadas
                                                  or criada_na_edicao(RAIZ / a["caminho"]) or retirada_do_catalogo(a["caminho"])):
                return self.json({"erro": "só se apagam textos do blogue e fichas criadas no modo de edição, sem factos"}, 400)
            if a.get("conteudo") is not None and not isinstance(a["conteudo"], dict):
                return self.json({"erro": "conteúdo inválido"}, 400)
        if not alteracoes:
            return self.json({"erro": "nada para gravar"}, 400)
        with GRAVACAO:
            # a ficha mudou depois de o browser a ler (outra janela, o agente, um script)? Gravar por cima apagava essa mudança
            mudados = [a for a in alteracoes if "versao_base" in a and versao_de(RAIZ / a["caminho"]) != a["versao_base"]]
            if mudados:  # versao_base null: uma ficha nova, mas entretanto alguém criou uma com o mesmo nome de ficheiro
                return self.json({"erro": JA_CRIADA if all(a["versao_base"] is None for a in mudados) else MUDOU_ENTRETANTO,
                                  "ficheiros": [a["caminho"] for a in mudados]}, 409)
            if CONHECIDOS["assinatura"] != assinatura_dados():  # alguém (o agente, um script) mexeu nos dados
                CONHECIDOS.update(erros=set(validar()[1].erros), assinatura=assinatura_dados())
            erros_antes = CONHECIDOS["erros"]
            antes = {}
            try:
                for a in alteracoes:
                    f = RAIZ / a["caminho"]
                    antes.setdefault(f, f.read_bytes() if f.exists() else None)
                    if a["conteudo"] is None:
                        f.unlink(missing_ok=True)
                    else:
                        escrever_json(f, a["conteudo"])
                ent, v = validar()
                novos = [e for e in v.erros if e not in erros_antes]
                if novos:
                    raise ErroValidacao(novos)
                gerar(ent, v)
                CONHECIDOS.update(erros=set(v.erros), assinatura=assinatura_dados())
            except Exception as e:
                for f, conteudo in antes.items():
                    if conteudo is None:
                        f.unlink(missing_ok=True)
                    else:
                        f.write_bytes(conteudo)
                CONHECIDOS["assinatura"] = assinatura_dados()  # os ficheiros voltaram ao que eram
                if isinstance(e, ErroValidacao):
                    return self.json({"erro": "a alteração não passou na validação", "erros": e.args[0][:20]}, 422)
                return self.json({"erro": str(e)}, 500)
        motivo = str(pedido.get("motivo") or "").strip()[:500]
        print(f"[edição] {pedido.get('resumo') or ', '.join(a['caminho'] for a in alteracoes)}" + (f" — motivo: {motivo}" if motivo else ""))
        return self.json({"ok": True, "erros_anteriores": len(erros_antes)})

    def api_sessao(self, db, q):
        """Na cópia local quem edita é sempre o dono do arquivo: o servidor só aceita ligações deste computador.
        «atras»: quantas alterações feitas no site online ainda não estão nesta cópia (None: não se sabe, por ex. sem rede)."""
        from validar import carregar_contribuidores
        dono = next((c for c in carregar_contribuidores().values() if c.get("papel") == "dono"), None)
        if ONLINE["atras"]:  # depois de um git pull com o servidor a correr, o aviso desaparece logo (sem esperar pelo fetch)
            contar_atras()
        return {"modo": "local", "contribuidor": dono, "atras": ONLINE["atras"]}

    def api_historico(self, db, q):
        """Versões de um ficheiro de dados (git log), a mais recente primeiro; o que ainda não foi publicado vem à frente."""
        caminho = q.get("caminho", "")
        if not RE_EDITAVEL.fullmatch(caminho):
            raise LookupError("ficheiro não editável")
        git = lambda *a: subprocess.run(["git", *a], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8").stdout
        versoes = []
        for linha in git("log", "-n", "40", "--format=%H%x1f%P%x1f%aI%x1f%an%x1f%s", "--", caminho).splitlines():
            sha, pais, data, autor, mensagem = (linha.split("\x1f") + [""] * 5)[:5]
            versoes.append({"sha": sha, "pai": pais.split(" ")[0], "data": data, "autor": autor, "mensagem": mensagem})
        if git("status", "--porcelain", "--", caminho).strip():
            versoes.insert(0, {"sha": "local", "pai": versoes[0]["sha"] if versoes else "", "data": "", "autor": "cópia local",
                               "mensagem": "Alterações ainda não publicadas"})
        return {"versoes": versoes}

    def api_versao(self, db, q):
        """O ficheiro numa versão do git («local»: como está agora no disco); null se não existia."""
        caminho, sha = q.get("caminho", ""), q.get("sha", "")
        if not RE_EDITAVEL.fullmatch(caminho) or not re.fullmatch(r"[0-9a-f]{7,40}|local", sha):
            raise LookupError("pedido inválido")
        if sha == "local":
            f = RAIZ / caminho
            return {"conteudo": ler_json(f) if f.exists() else None}
        r = subprocess.run(["git", "show", f"{sha}:{caminho}"], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8")
        return {"conteudo": json.loads(r.stdout) if r.returncode == 0 else None}

    def api_dados(self, db, q):
        """Ficheiro original de dados/ (sem os campos que o construir.py acrescenta), para o modo de edição."""
        caminho = q.get("caminho", "")
        if not RE_EDITAVEL.fullmatch(caminho):
            raise LookupError("ficheiro não editável")
        f = RAIZ / caminho
        if not f.exists():
            raise LookupError(f"ficheiro inexistente: {caminho}")
        b = f.read_bytes()  # o conteúdo e a versão vêm da mesma leitura
        # «versao» volta com a gravação (versao_base): se o ficheiro mudar entretanto, a gravação é recusada
        return {"caminho": caminho, "conteudo": json.loads(b.decode("utf-8")),
                "versao": hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()}

    def api_alteracoes(self, db, q):
        """Últimas alterações aos dados (git log de dados/ e fontes/), a mais recente primeiro, com os ficheiros de cada
        uma; o que ainda não foi publicado (só nesta cópia) vem à frente."""
        git = lambda *a: subprocess.run(["git", *a], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8").stdout
        n = min(max(int(q.get("n", 50) or 50), 1), 200)
        estados = {"A": "added", "D": "removed", "R": "renamed"}
        alteracoes = []
        locais = []
        for linha in git("status", "--porcelain", "--untracked-files=all", "--", "dados", "fontes").splitlines():
            xy, caminho = linha[:2], linha[3:].split(" -> ")[-1].strip('"')
            if RE_EDITAVEL.fullmatch(caminho):
                locais.append({"caminho": caminho, "estado": "added" if "?" in xy or "A" in xy else "removed" if "D" in xy else "modified"})
        if locais:
            alteracoes.append({"sha": "local", "pai": git("rev-parse", "HEAD").strip(), "data": "", "autor": "cópia local",
                               "mensagem": "Alterações ainda não publicadas", "corpo": "", "ficheiros": locais})
        saida = git("log", "-n", str(n), "--format=%x1e%H%x1f%P%x1f%aI%x1f%an%x1f%s%x1f%b%x1f", "--name-status", "--", "dados", "fontes")
        for bloco in saida.split("\x1e")[1:]:
            sha, pais, data, autor, mensagem, corpo, resto = (bloco.split("\x1f") + [""] * 7)[:7]
            ficheiros = []
            for linha in resto.strip().splitlines():
                partes = linha.split("\t")
                if len(partes) >= 2 and RE_EDITAVEL.fullmatch(partes[-1]):
                    ficheiros.append({"caminho": partes[-1], "estado": estados.get(partes[0][:1], "modified")})
            if ficheiros:  # só as que mexem em fichas, fontes ou contribuidores (não nos ficheiros gerados)
                alteracoes.append({"sha": sha, "pai": pais.split(" ")[0], "data": data, "autor": autor, "mensagem": mensagem,
                                   "corpo": corpo.strip(), "ficheiros": ficheiros})
        return {"alteracoes": alteracoes}

    def api_playlists(self, db, q):
        res = db.execute("SELECT d.doc_id, d.titulo, d.url, COUNT(m.id) AS n FROM docs d LEFT JOIN media m ON m.doc_id = d.doc_id "
                         "WHERE d.fonte = 'youtube' AND d.tipo = 'pagina' GROUP BY d.doc_id ORDER BY d.titulo").fetchall()
        return {"resultados": [dict(r) for r in res]}

    def json(self, dados, estado=200):
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    # ------------------------------------------------------------- rotas

    def api_estado(self, db, q):
        """Contagens do arquivo (o site espera por elas ao abrir): guardadas em memória enquanto o índice não mudar."""
        chave = (INDICE.stat().st_mtime_ns, bool(q.get("todos")))
        if ESTADO_GUARDADO.get("chave") == chave:
            return ESTADO_GUARDADO["resposta"]
        por_fonte = db.execute("SELECT fonte, tipo, COUNT(*) n, MIN(substr(data,1,10)) desde, "
                               "MAX(substr(data,1,10)) ate FROM docs GROUP BY fonte, tipo").fetchall()
        filtro = "" if q.get("todos") else "WHERE disponivel IS NULL OR disponivel = 1"
        media = db.execute(f"SELECT tipo, COUNT(DISTINCT plataforma||chave) n FROM media {filtro} GROUP BY tipo").fetchall()
        fora = db.execute("SELECT COUNT(DISTINCT plataforma||chave) FROM media WHERE disponivel = 0").fetchone()[0]
        resposta = {"arquivo": True, "documentos": [dict(r) for r in por_fonte],
                    "media": {r["tipo"]: r["n"] for r in media}, "indisponiveis": fora}
        ESTADO_GUARDADO.update(chave=chave, resposta=resposta)
        return resposta

    def api_pesquisa(self, db, q):
        pagina = max(1, int(q.get("pagina", 1)))
        args = dict(fonte=q.get("fonte") or None, tipo=q.get("tipo") or None,
                    desde=q.get("desde") or None, ate=q.get("ate") or None)
        if q.get("q", "").strip():
            total, res = pesquisar(db, q["q"].strip(), **args, limite=POR_PAGINA,
                                   deslocamento=(pagina - 1) * POR_PAGINA,
                                   ordem=q.get("ordem", "relevancia"), marcas=("\u0001", "\u0002"))
        else:  # sem termos: navegar por data
            w, a = ["1=1"], []
            for campo in ("fonte", "tipo"):  # um ou vários valores
                if valores(args[campo]):
                    w.append(em(campo, valores(args[campo]))); a += valores(args[campo])
            for campo, op in (("desde", ">="), ("ate", "<=")):
                if args[campo]:
                    w.append(f"ano {op} ?"); a.append(args[campo])
            w = " AND ".join(w)
            total = db.execute(f"SELECT COUNT(*) FROM docs WHERE {w}", a).fetchone()[0]
            ordem = "ASC" if q.get("ordem") == "antigos" else "DESC"
            res = [dict(r) for r in db.execute(
                f"SELECT doc_id, tipo, fonte, url, titulo, substr(data,1,10) data, autor, n_comentarios, "
                f"substr(texto,1,240) excerto FROM docs WHERE {w} ORDER BY (data IS NULL OR data = ''), data {ordem} LIMIT ? OFFSET ?",
                a + [POR_PAGINA, (pagina - 1) * POR_PAGINA])]
        return {"total": total, "pagina": pagina, "por_pagina": POR_PAGINA, "resultados": res}

    def api_doc(self, db, q):
        campos = "doc_id, tipo, fonte, url, post_url, titulo, data, autor, etiquetas, n_comentarios, html"
        if q.get("url"):  # links entre posts: aceitar http/https e domínios .blogspot.pt etc.
            u = q["url"].split("?")[0].split("#")[0]
            u = "https://" + u.split("://", 1)[-1]
            u = u.replace(".blogspot.pt/", ".blogspot.com/").replace(".blogspot.com.br/", ".blogspot.com/")
            d = db.execute(f"SELECT {campos} FROM docs WHERE url IN (?, ?) AND tipo='post'",
                           (u, u.replace("https://", "http://"))).fetchone()
        else:
            d = db.execute(f"SELECT {campos} FROM docs WHERE doc_id = ?", (q.get("id", ""),)).fetchone()
        if not d:
            raise LookupError("documento não encontrado no arquivo")
        d = dict(d)
        if "obtido_em" in colunas(db, "docs"):  # índice novo: data da recolha à parte da data do documento
            d["obtido_em"] = db.execute("SELECT obtido_em FROM docs WHERE doc_id = ?", (d["doc_id"],)).fetchone()[0]
        d["media"] = [dict(m) for m in db.execute(  # pela ordem do documento
            "SELECT tipo, plataforma, chave, url, legenda, disponivel, miniatura, titulo_externo FROM media WHERE doc_id = ? ORDER BY id",
            (d["doc_id"],))]
        d["comentarios"] = [dict(c) for c in db.execute(
            "SELECT doc_id, data, autor, html FROM docs WHERE post_url = ? AND tipo='comentario' ORDER BY data",
            (d["url"],))] if d["tipo"] == "post" else []
        return d

    def api_media(self, db, q):
        """Vídeos, áudios, partituras e imagens do índice, um por plataforma+chave. Cada um traz os dados de um só
        documento, o mais antigo com data (a data, o título, o texto à volta e a ligação são todos desse), quantos
        documentos o têm, e as contagens para o seletor de origens e para «+ N com link morto»."""
        pagina = max(1, int(q.get("pagina", 1)))
        w, a = ["1=1"], []
        if q.get("tipo"):
            w.append("tipo = ?"); a.append(q["tipo"])
        if q.get("fonte"):
            w.append("fonte = ?"); a.append(q["fonte"])
        if q.get("doc"):
            w.append("doc_id = ?"); a.append(q["doc"])
        if q.get("q", "").strip():
            from comum import slug
            if q.get("frase"):  # nome completo seguido (ex.: ficha de pessoa); «|» separa variantes do nome
                alternativas = [slug(x) for x in q["q"].split("|") if slug(x)]
                w.append("(" + " OR ".join("busca LIKE ?" for _ in alternativas) + ")")
                a += [f"%{x}%" for x in alternativas]
            else:
                for t in slug(q["q"]).split("-"):
                    w.append("busca LIKE ?"); a.append(f"%{t}%")
        vivos = "(disponivel IS NULL OR disponivel = 1)"  # sem os vídeos que já não tocam (ver verificar_media.py)
        # quantos há de cada origem com os outros filtros (para o seletor de origens)
        por_plataforma = {r[0]: r[1] for r in db.execute(
            f"SELECT plataforma, COUNT(DISTINCT plataforma||chave) FROM media WHERE {' AND '.join(w + ([] if q.get('todos') else [vivos]))} "
            "GROUP BY plataforma", a)}
        if valores(q.get("plataforma")):  # uma ou várias origens
            w.append(em("plataforma", valores(q["plataforma"]))); a += valores(q["plataforma"])
        # com link morto, com os mesmos filtros: o site mostra «+ N com link morto» (ou «Esconder os N»)
        mortos = db.execute(f"SELECT COUNT(DISTINCT plataforma||chave) FROM media WHERE {' AND '.join(w)} AND disponivel = 0", a).fetchone()[0]
        if not q.get("todos"):
            w.append(vivos)
        w = " AND ".join(w)
        # as datas vazias (páginas sem data própria) ficam no fim, nos mais recentes e nos mais antigos
        ordem = "RANDOM()" if q.get("ordem") == "aleatorio" else \
            f"(l.data IS NULL OR l.data = ''), l.data {'ASC' if q.get('ordem') == 'antigos' else 'DESC'}, l.id"
        total = db.execute(f"SELECT COUNT(DISTINCT plataforma||chave) FROM media WHERE {w}", a).fetchone()[0]
        recolha = ", l.obtido_em" if "obtido_em" in colunas(db, "media") else ""
        res = [dict(r) for r in db.execute(
            f"""WITH sel AS (SELECT * FROM media WHERE {w}),
                grupo AS (SELECT plataforma, chave, COUNT(DISTINCT doc_id) AS n_posts, MAX(titulo_externo) AS titulo_externo,
                                 MAX(miniatura) AS miniatura, MIN(disponivel) AS disponivel FROM sel GROUP BY plataforma, chave),
                linha AS (SELECT sel.*, ROW_NUMBER() OVER (PARTITION BY plataforma, chave
                                 ORDER BY (NULLIF(data, '') IS NULL), data, id) AS k FROM sel)
                SELECT l.tipo, l.plataforma, l.chave, l.url, NULLIF(l.data, '') AS data, l.doc_id, l.titulo_doc, l.url_doc, l.fonte,
                       l.legenda, l.contexto_antes, l.contexto_depois, g.n_posts, g.titulo_externo, g.miniatura, g.disponivel,
                       d.tipo AS tipo_doc{recolha}
                FROM linha l JOIN grupo g ON g.plataforma = l.plataforma AND g.chave = l.chave LEFT JOIN docs d ON d.doc_id = l.doc_id
                WHERE l.k = 1 ORDER BY {ordem} LIMIT ? OFFSET ?""",
            a + [POR_PAGINA, (pagina - 1) * POR_PAGINA])]
        # sem miniatura oficial: uma fotografia do mesmo documento serve de capa (numa só consulta; nunca nas imagens)
        sem_capa = list({r["doc_id"] for r in res if not r["miniatura"] and r["plataforma"] != "youtube" and r["tipo"] != "imagem"})
        capas = dict(db.execute(f"SELECT doc_id, MIN(url) FROM media WHERE tipo = 'imagem' AND {em('doc_id', sem_capa)} GROUP BY doc_id",
                                sem_capa).fetchall()) if sem_capa else {}
        for r in res:
            if not r["miniatura"] and r["plataforma"] != "youtube" and r["tipo"] != "imagem":
                r["imagem_post"] = capas.get(r["doc_id"])
        return {"total": total, "pagina": pagina, "por_pagina": POR_PAGINA, "resultados": res, "por_plataforma": por_plataforma,
                "indisponiveis": mortos}

    def api_efemerides(self, db, q):
        md = q.get("md", "")
        res = db.execute("SELECT doc_id, fonte, url, titulo, substr(data,1,10) data, substr(texto,1,200) excerto "
                         "FROM docs WHERE mes_dia = ? AND tipo='post' ORDER BY data DESC LIMIT 40", (md,))
        return {"md": md, "resultados": [dict(r) for r in res]}

    def api_verificar_citacao(self, db, q):
        """A frase copiada está no documento arquivado? O modo de edição pergunta-o antes de gravar, para dizer logo a quem
        contribui se a frase bate (e onde deixa de bater). As regras são as do validar.py (comum.procurar_documento e
        comum.troco_em_falta): «encontrada», «nao-encontrada» (com o troço) ou «nao-arquivada» (fica por verificar).
        Onde deixa de bater diz-se como o validar.py o diz (comum.onde_diverge: em palavras inteiras e como foi escrita);
        um início curto («a», «de») aparece em qualquer texto e não ajuda: aí diz-se só o troço que não bate."""
        from comum import onde_diverge, procurar_documento, texto_verificavel, troco_em_falta, troco_escrito
        url, frase = q.get("url", "").strip(), q.get("citacao", "").strip()
        if not url or not frase:
            raise LookupError("faltam o endereço e a frase")
        d = procurar_documento(db, url=url)
        if not d:
            return {"estado": "nao-arquivada"}
        r = {"doc": d["doc_id"], "tipo": d["tipo"], "fonte": d["fonte"], "url": d["url"], "titulo": d["titulo"]}
        falta = troco_em_falta(frase, texto_verificavel(d))
        if falta is None:
            return {**r, "estado": "encontrada"}
        certo, seguinte = onde_diverge(frase, falta)

        def inicio(t, n=10):  # as primeiras n palavras
            p = t.split()
            return " ".join(p[:n]) + (" …" if len(p) > n else "")
        if len(certo) < 15:
            return {**r, "estado": "nao-encontrada", "bate": "", "troco": inicio(troco_escrito(frase, falta[0]))}
        return {**r, "estado": "nao-encontrada", "bate": " ".join(certo.split()[-6:]), "troco": inicio(seguinte)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=8765)
    ap.add_argument("--abrir", action="store_true")
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.porta), partial(Pedido, directory=str(RAIZ / "site")))
    url = f"http://localhost:{a.porta}"
    print(f"Arquivo da Canção de Coimbra em {url}  (Ctrl+C para parar)")
    threading.Thread(target=comparar_com_online, daemon=True).start()
    if a.abrir:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
