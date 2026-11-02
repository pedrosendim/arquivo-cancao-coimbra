"""Valida os dados curados contra as regras do arquivo.

Erros (bloqueiam a construção do site):
  - fonte inexistente, não aprovada ou sem o uso adequado
  - facto/relação/excerto sem citação literal
  - citação que NÃO aparece no documento arquivado
  - referências a entidades inexistentes, ids inválidos, datas mal formatadas
  - contribuição assinada (decisão editorial) sem contribuidor registado ou sem data
  - texto do blogue que liga a uma ficha inexistente
Avisos:
  - citação de página não arquivada (não verificável localmente)

Uso:  python scripts/validar.py
"""
import hashlib
import re
import sqlite3
import sys
from pathlib import Path

from comum import DADOS, INDICE, carregar_fontes, citacao_presente, ler_json, normalizar

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
CONTRIBUIDORES = DADOS / "contribuidores.json"
BLOGUE = DADOS / "blogue"
# citações já confirmadas na cópia local do arquivo: servem quando o arquivo não existe (publicação online)
VERIFICACAO = DADOS / "verificacao.json"
# ligações do blogue às fichas: [[id]], [[id|texto]] ou [texto](#/pessoa/id)
RE_MENCAO = re.compile(r"\[\[([a-z0-9]+(?:-[a-z0-9]+)*)(?:\|[^\]]*)?\]\]|\]\(#/(?:pessoa|obra|gravacao|instrumento)/([a-z0-9-]+)\)")


def carregar_contribuidores():
    return {c["id"]: c for c in ler_json(CONTRIBUIDORES)["contribuidores"]} if CONTRIBUIDORES.exists() else {}


def carregar_blogue():
    return {f.stem: ler_json(f) for f in sorted(BLOGUE.glob("*.json"))}


def mencoes(texto):
    """Ids das fichas a que um texto do blogue liga, pela ordem em que aparecem."""
    return list(dict.fromkeys(a or b for a, b in RE_MENCAO.findall(texto or "")))


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
        self.verificadas = set()  # chaves das citações confirmadas nesta validação
        self.ja_verificadas = set(ler_json(VERIFICACAO)) if not self.db and VERIFICACAO.exists() else set()

    @staticmethod
    def chave(c, texto_cit):
        return hashlib.sha1(f"{c.get('doc') or c.get('url')}\n{normalizar(texto_cit)}".encode()).hexdigest()[:16]

    def texto_doc(self, doc, url):
        chave = doc or url
        if chave in self._cache:
            return self._cache[chave]
        texto = None
        if self.db:
            linha = None
            if doc:
                linha = self.db.execute("SELECT texto, titulo FROM docs WHERE doc_id=?", (doc,)).fetchone()
            if not linha and url:
                for u in {url, url.replace("http://", "https://"), url.replace("https://", "http://")}:
                    linha = self.db.execute("SELECT texto, titulo FROM docs WHERE url=?", (u,)).fetchone()
                    if linha:
                        break
            if linha:
                texto = normalizar(linha[1] + "\n" + linha[0])
        self._cache[chave] = texto
        return texto

    def citacao(self, onde, c, uso="factos", exige_texto=True):
        if not isinstance(c, dict):
            self.erros.append(f"{onde}: citação mal formada")
            return
        fid = c.get("fonte")
        f = self.fontes.get(fid)
        if not f:
            self.erros.append(f"{onde}: fonte '{fid}' não existe em fontes.json")
            return
        if f["estado"] == "pendente" and c.get("acrescentada"):
            # citada por um contribuidor num site que ainda não era fonte: fica proposta até um editor a decidir
            self.avisos.append(f"{onde}: fonte '{fid}' por aprovar (proposta por um contribuidor)")
        elif f["estado"] != "aprovada":
            self.erros.append(f"{onde}: fonte '{fid}' está '{f['estado']}' — só fontes aprovadas")
        if uso not in f.get("uso", []):
            self.erros.append(f"{onde}: fonte '{fid}' não está aprovada para uso '{uso}'")
        if not c.get("url"):
            self.erros.append(f"{onde}: citação sem url")
        if c.get("acrescentada"):  # citação acrescentada por um contribuidor no modo de edição
            self.assinatura(f"{onde}.acrescentada", c["acrescentada"])
        texto_cit = (c.get("citacao") or "").strip()
        if not texto_cit:
            if exige_texto:
                self.erros.append(f"{onde}: falta a citação literal (campo 'citacao')")
            return
        self.n_citacoes += 1
        texto = self.texto_doc(c.get("doc"), c.get("url"))
        c["verificada"] = False  # só vai para site/dados/base.json; os ficheiros em dados/ não são alterados
        chave = self.chave(c, texto_cit)
        if texto is None:
            if chave in self.ja_verificadas:  # sem o arquivo (online): confirmada antes na cópia local
                c["verificada"] = True
            else:
                self.avisos.append(f"{onde}: documento não arquivado — citação não verificável ({c.get('url')})")
        elif not citacao_presente(texto_cit, texto):
            self.erros.append(f"{onde}: citação NÃO encontrada no documento {c.get('doc') or c.get('url')}: "
                              f"«{texto_cit[:90]}…»")
        else:
            c["verificada"] = True
            self.verificadas.add(chave)

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
        self.referencias(onde, x.get("referencias"))
        for k, d in enumerate(x.get("distinta_de") or []):
            if d.get("id") not in ent[tipo]:
                self.erros.append(f"{onde}.distinta_de[{k}]: ficha inexistente '{d.get('id')}'")
            self.assinatura(f"{onde}.distinta_de[{k}]", d)

    def imagens(self, onde, imagens):
        for i, im in enumerate(imagens or []):
            o = f"{onde}.imagens[{i}]"
            if not im.get("url"):
                self.erros.append(f"{o}: sem url")
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
        for chave in ("nota_editor_por", "revisto_por"):
            if p.get(chave):
                v.contribuidor(f"{o}.{chave}", p[chave])
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
    if v.contribuidores and not any(c.get("papel") == "dono" for c in v.contribuidores.values()):
        v.erros.append("contribuidores.json: tem de haver um contribuidor com o papel 'dono'")
    for f in v.fontes.values():
        for chave in ("proposta_por", "decidido_por"):
            if f.get(chave):
                v.contribuidor(f"fontes/{f['id']}.{chave}", f[chave])

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
        for m in mencoes(post.get("texto")):
            if not any(m in ent[t] for t in ("pessoas", "obras", "gravacoes", "instrumentos")):
                v.erros.append(f"{o}: liga a uma ficha inexistente '{m}'")

    return ent, v


def main():
    ent, v = validar()
    total = sum(len(x) for x in ent.values())
    for a in v.avisos:
        print("AVISO ", a)
    for e in v.erros:
        print("ERRO  ", e)
    resumo = ", ".join(f"{len(ent[t])} {t}" for t in TIPOS)
    print(f"\n{total} entidades ({resumo}); {v.n_citacoes} citações verificadas; "
          f"{len(v.erros)} erros; {len(v.avisos)} avisos")
    if v.db is None:
        print(f"Nota: sem o arquivo local — {len(v.ja_verificadas)} citações dadas como verificadas pelo registo "
              f"dados/verificacao.json; as novas ficam por verificar até se correr o validar.py na cópia local.")
    sys.exit(1 if v.erros else 0)


if __name__ == "__main__":
    main()
