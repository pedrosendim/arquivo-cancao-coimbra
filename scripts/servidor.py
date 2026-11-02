"""Servidor local: serve o site, a API de pesquisa no arquivo e o modo de edição do dono do arquivo.

Uso:  python scripts/servidor.py [--porta 8765] [--abrir]
Depois abrir http://localhost:8765
"""
import argparse
import json
import re
import sqlite3
import subprocess
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from comum import INDICE, RAIZ, em, escrever_json, ler_json, valores
from pesquisar import pesquisar, pesquisar_media

POR_PAGINA = 30
# ficheiros que o modo de edição pode ler e gravar (nunca o arquivo/ nem os scripts)
RE_EDITAVEL = re.compile(r"dados/(pessoas|instrumentos|gravacoes|obras|media|blogue)/[a-z0-9]+(-[a-z0-9]+)*\.json"
                         r"|dados/contribuidores\.json|fontes/fontes\.json")
SEM_INDICE = {"sessao", "dados", "historico", "versao"}  # rotas da edição: funcionam mesmo sem o índice do arquivo
GRAVACAO = threading.Lock()
# erros de validação já existentes antes de uma gravação, guardados enquanto dados/ não mudar por fora
CONHECIDOS = {"assinatura": None, "erros": set()}


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


class Pedido(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            return
        super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/"):
            return super().do_GET()
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        nome = u.path[5:].strip("/").replace("/", "_")
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
        return (re.fullmatch(r"(localhost|127\.0\.0\.1)(:\d+)?", host) is not None
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
        # uma ficha juntada a outra (desambiguação) apaga-se na mesma gravação em que a outra a regista em «juntou»
        juntadas = {f"dados/{a['caminho'].split('/')[1]}/{j.get('id')}.json" for a in alteracoes if isinstance(a.get("conteudo"), dict)
                     and str(a.get("caminho", "")).startswith("dados/") for j in a["conteudo"].get("juntou") or []}
        for a in alteracoes:
            if not RE_EDITAVEL.fullmatch(str(a.get("caminho", ""))):
                return self.json({"erro": f"ficheiro não editável: {a.get('caminho')}"}, 400)
            if a.get("conteudo") is None and not (a["caminho"].startswith("dados/blogue/") or a["caminho"] in juntadas
                                                  or criada_na_edicao(RAIZ / a["caminho"])):
                return self.json({"erro": "só se apagam textos do blogue e fichas criadas no modo de edição, sem factos"}, 400)
            if a.get("conteudo") is not None and not isinstance(a["conteudo"], dict):
                return self.json({"erro": "conteúdo inválido"}, 400)
        if not alteracoes:
            return self.json({"erro": "nada para gravar"}, 400)
        with GRAVACAO:
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
        print(f"[edição] {pedido.get('resumo') or ', '.join(a['caminho'] for a in alteracoes)}")
        return self.json({"ok": True, "erros_anteriores": len(erros_antes)})

    def api_sessao(self, db, q):
        """Na cópia local quem edita é sempre o dono do arquivo: o servidor só aceita ligações deste computador."""
        from validar import carregar_contribuidores
        dono = next((c for c in carregar_contribuidores().values() if c.get("papel") == "dono"), None)
        return {"modo": "local", "contribuidor": dono}

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
        return {"caminho": caminho, "conteudo": ler_json(f)}

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
        por_fonte = db.execute("SELECT fonte, tipo, COUNT(*) n, MIN(substr(data,1,10)) desde, "
                               "MAX(substr(data,1,10)) ate FROM docs GROUP BY fonte, tipo").fetchall()
        filtro = "" if q.get("todos") else "WHERE disponivel IS NULL OR disponivel = 1"
        media = db.execute(f"SELECT tipo, COUNT(DISTINCT plataforma||chave) n FROM media {filtro} GROUP BY tipo").fetchall()
        fora = db.execute("SELECT COUNT(DISTINCT plataforma||chave) FROM media WHERE disponivel = 0").fetchone()[0]
        return {"arquivo": True, "documentos": [dict(r) for r in por_fonte],
                "media": {r["tipo"]: r["n"] for r in media}, "indisponiveis": fora}

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
                f"substr(texto,1,240) excerto FROM docs WHERE {w} ORDER BY data {ordem} LIMIT ? OFFSET ?",
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
        d["media"] = [dict(m) for m in db.execute(
            "SELECT tipo, plataforma, chave, url, legenda, disponivel, miniatura, titulo_externo FROM media WHERE doc_id = ?",
            (d["doc_id"],))]
        d["comentarios"] = [dict(c) for c in db.execute(
            "SELECT doc_id, data, autor, html FROM docs WHERE post_url = ? AND tipo='comentario' ORDER BY data",
            (d["url"],))] if d["tipo"] == "post" else []
        return d

    def api_media(self, db, q):
        pagina = max(1, int(q.get("pagina", 1)))
        w, a = ["1=1"], []
        if not q.get("todos"):  # esconde os vídeos que já não tocam (ver verificar_media.py)
            w.append("(disponivel IS NULL OR disponivel = 1)")
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
        # quantos há de cada origem com os outros filtros (para o seletor de origens)
        por_plataforma = {r[0]: r[1] for r in db.execute(
            f"SELECT plataforma, COUNT(DISTINCT plataforma||chave) FROM media WHERE {' AND '.join(w)} GROUP BY plataforma", a)}
        if valores(q.get("plataforma")):  # uma ou várias origens
            w.append(em("plataforma", valores(q["plataforma"]))); a += valores(q["plataforma"])
        w = " AND ".join(w)
        ordem = "RANDOM()" if q.get("ordem") == "aleatorio" else ("data ASC" if q.get("ordem") == "antigos" else "data DESC")
        total = db.execute(f"SELECT COUNT(DISTINCT plataforma||chave) FROM media WHERE {w}", a).fetchone()[0]
        res = [dict(r) for r in db.execute(
            f"""SELECT tipo, plataforma, chave, url, MIN(data) AS data, COUNT(*) AS n_posts, doc_id, titulo_doc,
                       url_doc, fonte, legenda, contexto_antes, contexto_depois, MAX(titulo_externo) AS titulo_externo,
                       MAX(miniatura) AS miniatura, MIN(disponivel) AS disponivel
                FROM media WHERE {w} GROUP BY plataforma, chave ORDER BY {ordem} LIMIT ? OFFSET ?""",
            a + [POR_PAGINA, (pagina - 1) * POR_PAGINA])]
        for r in res:  # sem miniatura oficial: uma fotografia do mesmo post serve de capa
            if not r["miniatura"] and r["plataforma"] != "youtube":
                img = db.execute("SELECT url FROM media WHERE doc_id = ? AND tipo = 'imagem' LIMIT 1", (r["doc_id"],)).fetchone()
                r["imagem_post"] = img[0] if img else None
        return {"total": total, "pagina": pagina, "por_pagina": POR_PAGINA, "resultados": res, "por_plataforma": por_plataforma}

    def api_efemerides(self, db, q):
        md = q.get("md", "")
        res = db.execute("SELECT doc_id, fonte, url, titulo, substr(data,1,10) data, substr(texto,1,200) excerto "
                         "FROM docs WHERE mes_dia = ? AND tipo='post' ORDER BY data DESC LIMIT 40", (md,))
        return {"md": md, "resultados": [dict(r) for r in res]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=8765)
    ap.add_argument("--abrir", action="store_true")
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.porta), partial(Pedido, directory=str(RAIZ / "site")))
    url = f"http://localhost:{a.porta}"
    print(f"Arquivo da Canção de Coimbra em {url}  (Ctrl+C para parar)")
    if a.abrir:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
