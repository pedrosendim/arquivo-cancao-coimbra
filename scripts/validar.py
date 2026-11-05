"""Valida os dados curados contra as regras do arquivo.

Erros (bloqueiam a construção do site):
  - fonte inexistente, não aprovada ou sem o uso adequado
  - facto/relação/excerto sem citação literal
  - citação que NÃO aparece no documento arquivado
  - referências a entidades inexistentes, ids inválidos, datas mal formatadas
  - endereços que não começam por http:// ou https://
  - contribuição assinada (decisão editorial, nota) sem contribuidor registado ou sem data
  - texto do blogue que liga a uma ficha inexistente
Avisos (não bloqueiam; cada um diz o que corrigir):
  - citação de página não arquivada, ou ainda por confirmar na cópia local (publicação online)
  - citação de uma fonte que os editores rejeitaram depois de citada (deixa de servir de prova)
  - a forma dos dados: valores fora das listas, anos mal escritos, divergências marcadas só numa das versões, grupos
    sem membros, relações repetidas ou contraditórias, o mesmo media em duas fichas… (ver regras_de_forma)
No GitHub (propostas e publicação), os erros e os avisos dos ficheiros alterados ficam como anotações desses ficheiros.

Uso:  python scripts/validar.py
"""
import hashlib
import os
import re
import sqlite3
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

from comum import (DADOS, INDICE, RAIZ, RE_PALAVRA, carregar_excluidos, carregar_fontes, chave_endereco, ler_json,
                   normalizar, onde_diverge, procurar_documento, texto_verificavel, troco_em_falta, troco_escrito)

TIPOS = ["pessoas", "instrumentos", "gravacoes", "obras", "media"]
RELACOES = {"filho_de", "irmao_de", "conjuge_de", "neto_de", "sobrinho_de", "primo_de",
            "aluno_de", "influenciado_por", "tocou_com", "acompanhou", "membro_de"}
PAPEIS = {"guitarrista", "violista", "cantor", "compositor", "letrista", "poeta", "luthier", "investigador",
          "colecionador", "editor", "professor", "agrupamento", "outro"}
PAPEIS_CONTRIBUIDOR = {"dono", "administrador", "editor", "contribuidor", "antigo"}  # antigo: sem acesso, os contributos ficam
RE_DATA = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")
RE_DIA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RE_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
RE_GITHUB = re.compile(r"^[A-Za-z0-9](-?[A-Za-z0-9]){0,38}$")
RE_ANO = re.compile(r"^\d{4}$")
# listas do ESQUEMA (pela ordem do site, estado.js): um valor fora delas dá aviso, não erro (pode ser o termo da fonte)
CAMPOS_FACTO = ("nome_completo", "nascimento", "morte", "naturalidade", "formacao", "profissao", "atividade", "estreia",
                "gravacao", "atuacao", "premio", "homenagem", "ensino", "instrumento", "afinacao", "residencia",
                "publicacao", "outro")
TIPOS_PESSOA = ("pessoa", "grupo")
ESTADOS_REVISAO = ("rascunho", "revisto")
FORMATOS = ("cilindro", "disco de massa", "78rpm", "EP", "LP", "single", "CD", "cassete", "radio", "televisao",
            "inedito", "digital")
GENEROS = ("fado", "balada", "cancao", "serenata", "guitarrada", "variacoes", "estudo", "outro")
TIPOS_MEDIA = ("video", "audio", "imagem", "partitura")
SIMETRICAS = {"irmao_de", "conjuge_de", "primo_de", "tocou_com"}  # A→B diz o mesmo que B→A
MSG_ENDERECO = "o endereço tem de começar por http:// ou https://"
CONTRIBUIDORES = DADOS / "contribuidores.json"
BLOGUE = DADOS / "blogue"
# o que a cópia local do arquivo apurou sobre cada citação (verificada, documento não arquivado, frase não encontrada):
# serve quando o arquivo não existe (publicação online). Escreve-o o construir.py; ver «Verificação das citações».
VERIFICACAO = DADOS / "verificacao.json"
REGISTO = {"verificadas": "verificada", "nao_arquivadas": "nao-arquivado", "nao_encontradas": "nao-encontrada"}
# estado de cada citação com frase, no base.json: «verificada»: true, ou «verificada»: false e «verificacao» igual a
ESTADOS_CITACAO = {
    "verificada": "a frase está, palavra por palavra, no documento arquivado",
    "por-confirmar": "publicação online (sem o arquivo): a cópia local ainda não a verificou (ex.: acrescentada online)",
    "nao-arquivado": "o documento citado não está no arquivo local: não se pode verificar",
    "nao-encontrada": "a cópia local não encontrou a frase no documento (na cópia local é erro)",
    "fonte-rejeitada": "a fonte foi rejeitada pelos editores depois de citada: a citação não serve de prova",
}
# ligações do blogue às fichas: [[id]], [[id|texto]] ou [texto](#/pessoa/id)
RE_MENCAO = re.compile(r"\[\[([a-z0-9]+(?:-[a-z0-9]+)*)(?:\|[^\]]*)?\]\]|\]\(#/(?:pessoa|obra|gravacao|instrumento)/([a-z0-9-]+)\)")


def carregar_contribuidores():
    return {c["id"]: c for c in ler_json(CONTRIBUIDORES)["contribuidores"]} if CONTRIBUIDORES.exists() else {}


def carregar_blogue():
    return {f.stem: ler_json(f) for f in sorted(BLOGUE.glob("*.json"))}


def ler_registo():
    """dados/verificacao.json → {chave: estado}. Aceita a forma antiga (só a lista das verificadas)."""
    if not VERIFICACAO.exists():
        return {}
    r = ler_json(VERIFICACAO)
    if isinstance(r, list):
        return dict.fromkeys(r, "verificada")
    return {k: estado for campo, estado in REGISTO.items() for k in r.get(campo, [])}


def mencoes(texto):
    """Ids das fichas a que um texto do blogue liga, pela ordem em que aparecem."""
    return list(dict.fromkeys(a or b for a, b in RE_MENCAO.findall(texto or "")))


def cortar(texto, n, do_fim=False):
    """O texto com n caracteres no máximo, cortado entre palavras, com «…» só do lado onde se cortou (do_fim: fica o
    fim do texto)."""
    t = " ".join((texto or "").split())
    if len(t) <= n:
        return t
    if do_fim:
        return "…" + (t[-n:] if t[-n - 1] == " " else t[-n:].split(" ", 1)[-1])
    return (t[:n] if t[n] == " " else t[:n].rsplit(" ", 1)[0]) + "…"


def carregar_entidades():
    ent = {t: {} for t in TIPOS}
    erros = []
    for t in TIPOS:
        for f in sorted((DADOS / t).glob("*.json")):
            try:
                d = ler_json(f)
            except Exception as e:
                erros.append(f"{t}/{f.name}: JSON inválido ({e})")
                continue
            if d.get("id") != f.stem:
                erros.append(f"{t}/{f.name}: id '{d.get('id')}' diferente do nome do ficheiro")
            ent[t][f.stem] = d
    return ent, erros


class Validador:
    def __init__(self):
        self.fontes = carregar_fontes()
        self.contribuidores = carregar_contribuidores()
        self.erros, self.avisos = [], []
        self.db = sqlite3.connect(INDICE) if INDICE.exists() else None
        self._cache = {}
        self.n_citacoes = 0
        self.estados = {}  # chave da citação → o que esta validação apurou (vai para dados/verificacao.json)
        self.por_estado = Counter()  # citações com texto, por estado de verificação
        self.registo = ler_registo() if not self.db else {}
        self.avisos_forma = []  # os avisos de regras_de_forma (e de dados/excluidos.json), à parte dos das citações

    @property
    def verificadas(self):
        return {k for k, e in self.estados.items() if e == "verificada"}

    @staticmethod
    def chave(c, texto_cit):
        return hashlib.sha1(f"{c.get('doc') or c.get('url')}\n{normalizar(texto_cit)}".encode()).hexdigest()[:16]

    def texto_doc(self, doc, url):
        chave = doc or url
        if chave not in self._cache:
            d = procurar_documento(self.db, doc, url) if self.db else None
            self._cache[chave] = texto_verificavel(d) if d else None
        return self._cache[chave]

    def citacao(self, onde, c, uso="factos", exige_texto=True):
        if not isinstance(c, dict):
            self.erros.append(f"{onde}: citação mal formada")
            return
        fid = c.get("fonte")
        f = self.fontes.get(fid)
        if not f:
            self.erros.append(f"{onde}: fonte '{fid}' não existe em fontes.json")
            return
        # rejeitada depois de citada: a citação deixa de ser prova (o site di-lo), mas não pára a publicação do site
        rejeitada = f["estado"] == "rejeitada"
        if f["estado"] == "pendente" and c.get("acrescentada"):
            # citada por um contribuidor num site que ainda não era fonte: fica proposta até um editor a decidir
            self.avisos.append(f"{onde}: fonte '{fid}' por aprovar (proposta por um contribuidor)")
        elif rejeitada:
            self.avisos.append(f"{onde}: a fonte '{fid}' foi rejeitada pelos editores: esta citação já não serve de "
                               f"prova; retire-a ou troque-a por uma fonte aprovada")
        elif f["estado"] != "aprovada":
            self.erros.append(f"{onde}: fonte '{fid}' está '{f['estado']}' — só fontes aprovadas")
        if not rejeitada and uso not in f.get("uso", []):
            self.erros.append(f"{onde}: fonte '{fid}' não está aprovada para uso '{uso}'")
        if not c.get("url"):
            self.erros.append(f"{onde}: citação sem url")
        else:
            self.endereco(f"{onde}.url", c["url"])
        if c.get("acrescentada"):  # citação acrescentada por um contribuidor no modo de edição
            self.assinatura(f"{onde}.acrescentada", c["acrescentada"])
        texto_cit = (c.get("citacao") or "").strip()
        # o estado de verificação só vai para site/dados/base.json; os ficheiros em dados/ não são alterados.
        # verificada: true, ou verificada: false com «verificacao» a dizer porquê (ver ESTADOS_CITACAO)
        if not texto_cit:
            if exige_texto:
                self.erros.append(f"{onde}: falta a citação literal (campo 'citacao')")
            elif rejeitada:  # referência de media sem frase, de uma fonte rejeitada
                c.update(verificada=False, verificacao="fonte-rejeitada")
            return
        self.n_citacoes += 1
        chave = self.chave(c, texto_cit)
        if rejeitada:
            estado = "fonte-rejeitada"
        elif not RE_PALAVRA.search(texto_cit):  # só aspas, reticências ou pontuação («», "", …): não prova nada
            self.erros.append(f"{onde}: falta a citação literal ('{texto_cit[:20]}' não tem palavras: copie a frase da "
                              f"fonte{'' if exige_texto else ', ou deixe o campo vazio'})")
            estado = self.estados[chave] = "nao-encontrada"
        else:
            estado = self.verificar_texto(onde, c, texto_cit, chave)
            self.estados[chave] = estado
        self.por_estado[estado] += 1
        c["verificada"] = estado == "verificada"
        if estado != "verificada":
            c["verificacao"] = estado
        else:
            c.pop("verificacao", None)

    def verificar_texto(self, onde, c, texto_cit, chave):
        """Procura a frase no documento arquivado. Devolve o estado: verificada, nao-encontrada (erro), nao-arquivado
        ou, sem o arquivo (online), o que a cópia local registou, ou por-confirmar se ainda não a viu."""
        texto = self.texto_doc(c.get("doc"), c.get("url"))
        doc = c.get("doc") or c.get("url")
        if texto is not None:
            falta = troco_em_falta(texto_cit, texto)
            if not falta:
                return "verificada"
            # em palavras inteiras e como foi escrita; um início curto («a», «de») aparece em qualquer texto e não ajuda
            certo, seguinte = onde_diverge(texto_cit, falta)
            onde_falha = (f"bate até «{cortar(certo, 60, do_fim=True)}», mas não a partir de «{cortar(seguinte, 60)}»"
                          if len(certo) >= 15 else f"o troço «{cortar(troco_escrito(texto_cit, falta[0]), 80)}» não está lá")
            # (o modo de edição, edicao.js MENSAGENS, lê esta mensagem: «citação NÃO encontrada no documento …: «…» — …»)
            self.erros.append(f"{onde}: citação NÃO encontrada no documento {doc}: «{cortar(texto_cit, 100)}» — "
                              f"{onde_falha}. Copie a frase à letra; pode cortar troços com …")
            return "nao-encontrada"
        estado = self.registo.get(chave, "por-confirmar") if self.db is None else "nao-arquivado"
        if estado == "nao-arquivado":
            self.avisos.append(f"{onde}: documento não arquivado — citação não verificável ({c.get('url')}): "
                               f"arquive a página para a poder verificar")
        elif estado == "por-confirmar":
            self.avisos.append(f"{onde}: citação por confirmar: ainda não foi verificada na cópia local do arquivo "
                               f"({c.get('url')})")
        elif estado == "nao-encontrada":  # online não se pode corrigir sozinho; na cópia local é erro
            self.avisos.append(f"{onde}: a cópia local do arquivo não encontrou esta frase no documento {doc}: "
                               f"corrija-a (copie-a à letra)")
        return estado

    def endereco(self, onde, u, vazio=False):
        """Endereços que o site abre ou incorpora: só http:// e https:// (nunca javascript:, data:…)."""
        if (u in (None, "") and vazio) or (isinstance(u, str) and u.startswith(("http://", "https://"))):
            return
        self.erros.append(f"{onde}: {MSG_ENDERECO} ({str(u)[:60]!r})")

    def lista_citacoes(self, onde, lista, uso="factos", exige_texto=True, obrigatoria=True):
        if not lista:
            if obrigatoria:
                self.erros.append(f"{onde}: sem fontes")
            return
        for i, c in enumerate(lista):
            self.citacao(f"{onde}[{i}]", c, uso, exige_texto)

    def contribuidor(self, onde, cid):
        if cid not in self.contribuidores:
            self.erros.append(f"{onde}: contribuidor '{cid}' não existe em contribuidores.json")

    def assinatura(self, onde, a, campo_texto=None):
        """Contribuição humana assinada (decisão editorial): quem e quando. Não é fonte e nunca se cita."""
        if not isinstance(a, dict):
            self.erros.append(f"{onde}: assinatura mal formada")
            return
        self.contribuidor(onde, a.get("por"))
        if not RE_DIA.match(str(a.get("data", ""))):
            self.erros.append(f"{onde}: data '{a.get('data')}' fora do formato AAAA-MM-DD")
        if campo_texto and not str(a.get(campo_texto, "")).strip():
            self.erros.append(f"{onde}: falta o texto ('{campo_texto}')")

    def factos(self, onde, factos):
        for i, fa in enumerate(factos or []):
            o = f"{onde}.factos[{i}:{fa.get('campo')}]"
            if not fa.get("campo") or not fa.get("valor"):
                self.erros.append(f"{o}: faltam 'campo' ou 'valor'")
            if fa.get("data") and not RE_DATA.match(str(fa["data"])):
                self.erros.append(f"{o}: data '{fa['data']}' fora do formato AAAA[-MM[-DD]]")
            if fa.get("editorial"):  # testemunho de um contribuidor, sem fonte: fica assinado e à vista
                self.assinatura(f"{o}.editorial", fa["editorial"])
            self.lista_citacoes(o, fa.get("fontes"), obrigatoria=not fa.get("editorial"))
            if fa.get("nota_editorial"):
                self.assinatura(f"{o}.nota_editorial", fa["nota_editorial"], "texto")
            self.notas(f"{o}.notas_editoriais", fa.get("notas_editoriais"))

    def notas(self, onde, notas):
        """Notas assinadas em lista ({por, data, texto}), cada uma do seu autor; uma nota escondida por um editor
        leva a assinatura dele em «oculta»."""
        if notas in (None, []):
            return
        if not isinstance(notas, list):
            self.erros.append(f"{onde}: tem de ser uma lista de notas assinadas ({{por, data, texto}})")
            return
        for k, n in enumerate(notas):
            self.assinatura(f"{onde}[{k}]", n, "texto")
            if isinstance(n, dict) and n.get("oculta"):
                self.assinatura(f"{onde}[{k}].oculta", n["oculta"])

    def referencias(self, onde, refs):
        """Artigos e páginas indicados por contribuidores: leituras, não fontes."""
        for i, r in enumerate(refs or []):
            o = f"{onde}.referencias[{i}]"
            if not str(r.get("titulo", "")).strip():
                self.erros.append(f"{o}: sem título")
            if not str(r.get("url", "")).startswith(("http://", "https://")):
                self.erros.append(f"{o}: endereço inválido")
            if r.get("ano") and not re.match(r"^\d{4}$", str(r["ano"])):
                self.erros.append(f"{o}: ano '{r['ano']}' fora do formato AAAA")
            self.assinatura(f"{o}.editorial", r.get("editorial"))

    def comum(self, onde, x, tipo, ent):
        """O que todas as fichas podem ter: assinatura de quem a criou, referências e «não confundir com»."""
        if x.get("editorial"):  # ficha criada no modo de edição
            self.assinatura(f"{onde}.editorial", x["editorial"])
        for chave in ("nota_editor_por", "revisto_por"):
            if x.get(chave):
                self.contribuidor(f"{onde}.{chave}", x[chave])
        self.notas(f"{onde}.notas_editor", x.get("notas_editor"))
        ligacoes = x.get("ligacoes")  # pessoas: [{rotulo, url}]; gravações: {spotify, youtube, …} (vazios permitidos)
        if isinstance(ligacoes, dict):
            for k, u in ligacoes.items():
                self.endereco(f"{onde}.ligacoes.{k}", u, vazio=True)
        elif isinstance(ligacoes, list):
            for k, li in enumerate(ligacoes):
                self.endereco(f"{onde}.ligacoes[{k}]", li.get("url") if isinstance(li, dict) else li)
        self.referencias(onde, x.get("referencias"))
        for k, j in enumerate(x.get("juntou") or []):  # ficha juntada a esta: o ficheiro dela já não existe
            if j.get("id") in ent[tipo]:
                self.erros.append(f"{onde}.juntou[{k}]: a ficha juntada '{j.get('id')}' ainda existe")
            self.assinatura(f"{onde}.juntou[{k}]", j)
        for k, d in enumerate(x.get("distinta_de") or []):
            if d.get("id") not in ent[tipo]:
                self.erros.append(f"{onde}.distinta_de[{k}]: ficha inexistente '{d.get('id')}'")
            self.assinatura(f"{onde}.distinta_de[{k}]", d)

    def imagens(self, onde, imagens):
        for i, im in enumerate(imagens or []):
            o = f"{onde}.imagens[{i}]"
            if not im.get("url"):
                self.erros.append(f"{o}: sem url")
            else:
                self.endereco(f"{o}.url", im["url"])
            # uma fotografia acrescentada por um contribuidor não tem fonte aprovada: fica assinada, com a origem
            if im.get("editorial"):
                self.assinatura(f"{o}.editorial", im["editorial"])
                if not str(im["editorial"].get("origem", "")).startswith(("http://", "https://")):
                    self.erros.append(f"{o}.editorial: falta a página de origem da fotografia ('origem')")
            self.lista_citacoes(o, im.get("fontes"), "media", exige_texto=False, obrigatoria=not im.get("editorial"))
            for chave in ("escolhida", "oculta"):
                if im.get(chave):
                    self.assinatura(f"{o}.{chave}", im[chave])


def validar():
    ent, erros = carregar_entidades()
    v = Validador()
    v.erros.extend(erros)
    pessoas, obras, media, gravs = ent["pessoas"], ent["obras"], ent["media"], ent["gravacoes"]

    def ref(onde, tipo, i):
        if i and i not in ent[tipo]:
            v.erros.append(f"{onde}: referência a {tipo[:-1]} inexistente '{i}'")

    for t in TIPOS:
        for i in ent[t]:
            if not RE_ID.match(i):
                v.erros.append(f"{t}/{i}: id inválido (usar minúsculas, sem acentos, hífens)")

    for i, p in pessoas.items():
        o = f"pessoas/{i}"
        if not p.get("nome"):
            v.erros.append(f"{o}: sem nome")
        for papel in p.get("papeis", []):
            if papel not in PAPEIS:
                v.erros.append(f"{o}: papel desconhecido '{papel}'")
        for k, c in enumerate(p.get("biografia", [])):
            v.citacao(f"{o}.biografia[{k}]", c)
        v.factos(o, p.get("factos"))
        for k, r in enumerate(p.get("relacoes", [])):
            ro = f"{o}.relacoes[{k}:{r.get('tipo')}]"
            if r.get("tipo") not in RELACOES:
                v.erros.append(f"{ro}: tipo de relação desconhecido")
            ref(ro, "pessoas", r.get("alvo"))
            if r.get("alvo") == i:
                v.erros.append(f"{ro}: relação da pessoa consigo própria")
            if r.get("editorial"):  # indicada por um contribuidor, sem fonte: fica assinada e à vista
                v.assinatura(f"{ro}.editorial", r["editorial"])
            v.lista_citacoes(ro, r.get("fontes"), obrigatoria=not r.get("editorial"))
        v.imagens(o, p.get("imagens"))
        v.comum(o, p, "pessoas", ent)

    for i, x in ent["instrumentos"].items():
        o = f"instrumentos/{i}"
        ref(o, "pessoas", x.get("construtor"))
        for k, pr in enumerate(x.get("proprietarios", [])):
            ref(f"{o}.proprietarios[{k}]", "pessoas", pr.get("pessoa"))
            v.lista_citacoes(f"{o}.proprietarios[{k}]", pr.get("fontes"))
        v.factos(o, x.get("factos"))
        v.imagens(o, x.get("imagens"))
        v.lista_citacoes(o, x.get("fontes"), obrigatoria=not x.get("editorial"))
        v.comum(o, x, "instrumentos", ent)

    for i, g in gravs.items():
        o = f"gravacoes/{i}"
        for k, it in enumerate(g.get("interpretes", [])):
            ref(f"{o}.interpretes[{k}]", "pessoas", it.get("pessoa"))
        for k, fx in enumerate(g.get("faixas", [])):
            ref(f"{o}.faixas[{k}]", "obras", fx.get("obra"))
            for m in fx.get("media", []):
                ref(f"{o}.faixas[{k}]", "media", m)
        if g.get("capa", {}).get("url"):
            v.endereco(f"{o}.capa.url", g["capa"]["url"])
            v.lista_citacoes(f"{o}.capa", g["capa"].get("fontes"), "media", exige_texto=False)
        v.factos(o, g.get("factos"))
        v.lista_citacoes(o, g.get("fontes"), obrigatoria=not g.get("editorial"))
        v.comum(o, g, "gravacoes", ent)

    for i, ob in obras.items():
        o = f"obras/{i}"
        for p in ob.get("musica", []) + ob.get("letra", []):
            ref(o, "pessoas", p)
        if ob.get("letra_texto"):
            v.citacao(f"{o}.letra_texto", ob["letra_texto"])
        v.factos(o, ob.get("factos"))
        v.lista_citacoes(o, ob.get("fontes"), obrigatoria=not ob.get("editorial"))
        v.comum(o, ob, "obras", ent)

    for i, m in media.items():
        o = f"media/{i}"
        if not m.get("url"):
            v.erros.append(f"{o}: sem url")
        else:  # o leitor incorpora este endereço: nunca javascript: (ver seg-xss no leitor)
            v.endereco(f"{o}.url", m["url"])
        v.endereco(f"{o}.miniatura", m.get("miniatura"), vazio=True)
        for p in m.get("pessoas", []):
            ref(o, "pessoas", p)
        for ob in m.get("obras", []):
            ref(o, "obras", ob)
        ref(o, "gravacoes", m.get("gravacao"))
        v.lista_citacoes(o, m.get("fontes"), "media", exige_texto=False, obrigatoria=not m.get("editorial"))
        v.comum(o, m, "media", ent)

    # contribuidores convidados pelo dono do arquivo
    for cid, c in v.contribuidores.items():
        o = f"contribuidores/{cid}"
        if not RE_ID.match(cid):
            v.erros.append(f"{o}: id inválido")
        if not c.get("nome"):
            v.erros.append(f"{o}: sem nome")
        if c.get("papel") not in PAPEIS_CONTRIBUIDOR:
            v.erros.append(f"{o}: papel '{c.get('papel')}' desconhecido ({', '.join(sorted(PAPEIS_CONTRIBUIDOR))})")
        if c.get("github") and not RE_GITHUB.match(c["github"]):
            v.erros.append(f"{o}: nome de utilizador do GitHub inválido '{c['github']}'")
        if "github_id" in c and (type(c["github_id"]) is not int or c["github_id"] <= 0):
            v.erros.append(f"{o}: github_id '{c['github_id']}' tem de ser o número da conta do GitHub")
    # a mesma conta do GitHub em dois contribuidores com acesso: online só a primeira contaria (online/comum.js)
    for campo in ("github", "github_id"):
        vistos = {}
        for cid, c in v.contribuidores.items():
            k = str(c.get(campo) or "").lower()
            if k and c.get("papel") != "antigo":
                if k in vistos:
                    v.erros.append(f"contribuidores/{cid}: a mesma conta do GitHub ({campo} '{c[campo]}') que '{vistos[k]}'")
                vistos.setdefault(k, cid)
    if v.contribuidores and not any(c.get("papel") == "dono" for c in v.contribuidores.values()):
        v.erros.append("contribuidores.json: tem de haver um contribuidor com o papel 'dono'")
    for f in v.fontes.values():
        for chave in ("proposta_por", "decidido_por"):
            if f.get(chave):
                v.contribuidor(f"fontes/{f['id']}.{chave}", f[chave])
        v.endereco(f"fontes/{f['id']}.url", f.get("url"), vazio=True)

    inicio_forma = len(v.avisos)  # daqui para baixo, avisos sobre a forma dos dados (não sobre citações)
    # media retirados do catálogo (dados/excluidos.json): decisões assinadas, que os scripts de catálogo respeitam
    try:
        excluidos = carregar_excluidos()
    except Exception as e:
        v.erros.append(f"excluidos.json: JSON inválido ({e})")
        excluidos = []
    retirados = {}
    for k, x in enumerate(excluidos):
        o = f"excluidos.media[{k}]"
        if not isinstance(x, dict):
            v.erros.append(f"{o}: entrada mal formada (url, motivo, por, em)")
            continue
        v.endereco(f"{o}.url", x.get("url"))
        if not str(x.get("motivo", "")).strip():
            v.erros.append(f"{o}: falta o motivo")
        v.contribuidor(f"{o}.por", x.get("por"))
        if not RE_DIA.match(str(x.get("em", ""))[:10]):
            v.erros.append(f"{o}: data '{x.get('em')}' fora do formato AAAA-MM-DD")
        retirados[chave_endereco(x.get("url"))] = x
    for i, m in media.items():
        x = retirados.get(chave_endereco(m.get("url")))
        if x:
            v.avisos.append(f"media/{i}: este endereço foi retirado do catálogo por '{x.get('por')}' em {x.get('em')} "
                            f"(«{x.get('motivo')}»): apague esta ficha, ou tire o endereço de dados/excluidos.json")

    # blogue: textos assinados, que ligam às fichas mas nunca servem de fonte
    for pid, post in carregar_blogue().items():
        o = f"blogue/{pid}"
        if post.get("id") != pid or not RE_ID.match(pid):
            v.erros.append(f"{o}: id inválido ou diferente do nome do ficheiro")
        if not str(post.get("titulo", "")).strip():
            v.erros.append(f"{o}: sem título")
        if not RE_DIA.match(str(post.get("data", ""))):
            v.erros.append(f"{o}: data '{post.get('data')}' fora do formato AAAA-MM-DD")
        if post.get("estado") not in ("rascunho", "publicado"):
            v.erros.append(f"{o}: estado '{post.get('estado')}' (rascunho ou publicado)")
        v.contribuidor(f"{o}.autor", post.get("autor"))
        juntadas = {j.get("id") for t in ("pessoas", "obras", "gravacoes", "instrumentos") for x in ent[t].values() for j in x.get("juntou") or []}
        for m in mencoes(post.get("texto")):
            if m not in juntadas and not any(m in ent[t] for t in ("pessoas", "obras", "gravacoes", "instrumentos")):
                v.erros.append(f"{o}: liga a uma ficha inexistente '{m}'")

    regras_de_forma(ent, v)
    v.avisos_forma = v.avisos[inicio_forma:]
    return ent, v


def partes_aviso(a):
    """Um aviso como {ficheiro, onde, texto}, para o site o mostrar junto da ficha (construir.py → base.json)."""
    onde, _, texto = a.partition(": ")
    return {"ficheiro": ficheiro_de(a), "onde": onde, "texto": texto}


def regras_de_forma(ent, v):
    """Avisos sobre a forma dos dados. Não bloqueiam a publicação; cada um diz, em português simples, o que corrigir."""
    av = v.avisos.append
    pessoas = ent["pessoas"]

    def fora(o, valor, lista, como):
        if valor not in lista:
            av(f"{o}: {como} '{valor}' não está na lista do esquema ({', '.join(lista)}): se é um engano, use um "
               f"valor da lista; se é o termo da fonte, deixe-o e avise o fundador")

    for t in TIPOS:
        for i, x in ent[t].items():
            o = f"{t}/{i}"
            fora(o, x.get("estado_revisao"), ESTADOS_REVISAO, "o estado de revisão")
            if x.get("estado_revisao") == "revisto" and not (x.get("revisto_por") and x.get("revisto_em")):
                av(f"{o}: está marcada como revista, mas falta quem a reviu ou quando (revisto_por, revisto_em)")
            por_campo = defaultdict(list)
            for k, fa in enumerate(x.get("factos") or []):
                if isinstance(fa, dict) and fa.get("campo"):
                    fora(f"{o}.factos[{k}:{fa['campo']}]", fa["campo"], CAMPOS_FACTO, "o campo")
                    por_campo[fa["campo"]].append(fa)
            # divergência: um facto por versão, todos com «conflito». Num campo com vários factos e só um marcado, as
            # outras versões aparecem como se não houvesse divergência. Ficam de fora o campo «outro», que junta factos
            # sem relação entre si, e o campo com um só facto (a outra versão está noutro campo ou na nota)
            for campo, lista in por_campo.items():
                if campo != "outro" and len(lista) > 1 and sum(1 for fa in lista if fa.get("conflito")) == 1:
                    outros = "o outro" if len(lista) == 2 else f"algum dos outros {len(lista) - 1}"
                    av(f"{o}: em '{campo}', só um dos {len(lista)} factos está marcado como divergente (conflito). Se "
                       f"{outros} é outra versão do mesmo facto, marque-o também, para as versões aparecerem lado a "
                       f"lado; não retire a marca sem ver a fonte")
            for campo in ("nascimento", "morte"):
                datadas = [fa for fa in por_campo.get(campo, []) if str(fa.get("data") or "")[:4].isdigit()]
                anos = sorted({str(fa["data"])[:4] for fa in datadas})
                if len(anos) > 1 and not all(fa.get("conflito") for fa in datadas):
                    av(f"{o}: há datas de {campo} com anos diferentes ({', '.join(anos)}) sem a divergência marcada em "
                       f"todas: marque cada versão com conflito")
            ano = x.get("ano")
            if t in ("gravacoes", "obras", "instrumentos") and ano not in (None, "") and not RE_ANO.match(str(ano)):
                av(f"{o}: ano '{ano}' fora do formato AAAA (uma data aproximada fica no valor de um facto, ex.: c. 1920)")

    for i, p in pessoas.items():
        fora(f"pessoas/{i}", p.get("tipo"), TIPOS_PESSOA, "o tipo")
    grupos = {i for i, p in pessoas.items() if p.get("tipo") == "grupo"}
    com_membros = set()
    relacoes = Counter()
    for i, p in pessoas.items():
        for r in p.get("relacoes") or []:
            if not isinstance(r, dict):
                continue
            relacoes[(i, r.get("tipo"), r.get("alvo"))] += 1
            if r.get("tipo") == "membro_de":
                com_membros.add(r.get("alvo"))
                if r.get("alvo") in pessoas and r.get("alvo") not in grupos:
                    av(f"pessoas/{i}: membro_de aponta para '{r.get('alvo')}', que não é um grupo: confirme a relação "
                       f"ou marque essa ficha como grupo (tipo 'grupo')")
    for g in sorted(grupos - com_membros):
        av(f"pessoas/{g}: grupo sem membros: ligue cada membro na ficha da pessoa, com a relação membro_de e a citação")
    for (a, tipo, b), n in sorted(relacoes.items(), key=lambda x: tuple(map(str, x[0]))):
        if n > 1:
            av(f"pessoas/{a}: a relação {tipo} com '{b}' está repetida: junte as citações numa só")
        if tipo in SIMETRICAS and (b, tipo, a) in relacoes and str(a) < str(b):
            av(f"pessoas/{a}: a relação {tipo} com '{b}' também está na ficha de '{b}': guarda-se só num sentido (o site "
               f"mostra o outro); junte as citações numa só e apague a outra")
        if tipo in ("filho_de", "neto_de", "sobrinho_de", "membro_de") and (b, tipo, a) in relacoes and str(a) < str(b):
            av(f"pessoas/{a}: '{a}' e '{b}' são {tipo} um do outro: uma das duas relações está trocada")

    for i, g in ent["gravacoes"].items():
        if not g.get("formato"):
            av(f"gravacoes/{i}: falta o formato ({', '.join(FORMATOS)})")
        else:
            fora(f"gravacoes/{i}", g["formato"], FORMATOS, "o formato")
    for i, ob in ent["obras"].items():
        if ob.get("genero"):
            fora(f"obras/{i}", ob["genero"], GENEROS, "o género")

    # o mesmo vídeo ou faixa em duas fichas de media: o site mostra-o duas vezes
    por_endereco = defaultdict(list)
    for i, m in ent["media"].items():
        fora(f"media/{i}", m.get("tipo"), TIPOS_MEDIA, "o tipo")
        if m.get("data") and not RE_DATA.match(str(m["data"])):
            av(f"media/{i}: data '{m['data']}' fora do formato AAAA[-MM[-DD]]")
        if m.get("url"):
            por_endereco[chave_endereco(m["url"])].append(i)
    for ids in por_endereco.values():
        for i in sorted(ids)[1:]:
            primeiro = sorted(ids)[0]
            if ent["media"][i].get("gravacao"):
                av(f"media/{i}: o mesmo endereço já está em media/{primeiro}: na faixa desta edição use esse id em "
                   f"faixas[].media")
            else:
                av(f"media/{i}: o mesmo endereço já está em media/{primeiro}: junte as pessoas e as obras numa só ficha")


ROTULOS_ESTADO = {"por-confirmar": "por confirmar", "nao-arquivado": "de documentos não arquivados",
                  "nao-encontrada": "não encontradas", "fonte-rejeitada": "de fontes rejeitadas"}


def ficheiro_de(msg):
    """Ficheiro de que fala uma mensagem («pessoas/x.factos[2:…]…» → dados/pessoas/x.json), ou None."""
    m = re.match(r"(pessoas|instrumentos|gravacoes|obras|media|blogue)/([^.:\[\s]+)", msg)
    if m:
        return f"dados/{m.group(1)}/{m.group(2)}.json"
    for prefixo, f in (("contribuidores", "dados/contribuidores.json"), ("fontes/", "fontes/fontes.json"),
                       ("excluidos", "dados/excluidos.json")):
        if msg.startswith(prefixo):
            return f
    return None


def anotar(nivel, msg):
    """Linha que o GitHub Actions transforma numa anotação do ficheiro, à vista na proposta (pull request)."""
    f = ficheiro_de(msg)
    texto = msg.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::{nivel} file={f}::{texto}" if f else f"::{nivel}::{texto}")


def alterados_no_github():
    """Ficheiros que a proposta (ou a publicação) em verificação no GitHub muda; None se não se souber. O passo
    «checkout» do .github/workflows/validar.yml precisa de fetch-depth: 2 para o commit anterior estar disponível."""
    try:
        r = subprocess.run(["git", "diff", "--name-only", "HEAD^1", "HEAD"], cwd=RAIZ, capture_output=True,
                           text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    return set(r.stdout.splitlines()) if r.returncode == 0 else None


def main():
    ent, v = validar()
    total = sum(len(x) for x in ent.values())
    # no GitHub, só os avisos dos ficheiros que a proposta muda viram anotações (os outros já lá estavam)
    github = os.environ.get("GITHUB_ACTIONS") == "true"
    alterados = alterados_no_github() if github else None
    for a in v.avisos:
        if alterados is not None and ficheiro_de(a) in alterados:
            anotar("warning", a)
        else:
            print("AVISO ", a)
    for e in v.erros:
        if github:
            anotar("error", e)
        else:
            print("ERRO  ", e)
    resumo = ", ".join(f"{len(ent[t])} {t}" for t in TIPOS)
    outras = ", ".join(f"{n} {ROTULOS_ESTADO[k]}" for k, n in sorted(v.por_estado.items()) if k != "verificada" and n)
    print(f"\n{total} entidades ({resumo}); {v.n_citacoes} citações, {v.por_estado['verificada']} verificadas"
          f"{f' ({outras})' if outras else ''}; {len(v.erros)} erros; {len(v.avisos)} avisos")
    if v.db is None:
        print(f"Nota: sem o arquivo local — vale o que a cópia local apurou (dados/verificacao.json, {len(v.registo)} "
              f"citações); as novas ficam por confirmar até se correr o validar.py na cópia local.")
    if github and alterados is None and v.avisos:
        print("::notice::Os avisos não ficaram como anotações: não se sabe que ficheiros mudaram "
              "(o checkout precisa de fetch-depth: 2).")
    sys.exit(1 if v.erros else 0)


if __name__ == "__main__":
    main()
