"""Valida os dados curados e gera site/dados/base.json para o site.

Uso:  python scripts/construir.py [--forcar]
"""
import json
import sys
from datetime import datetime, timezone

from comum import ARQUIVO, DADOS, FONTES, SITE_DADOS, classificar_url, escrever_json, ler_json
from validar import TIPOS, VERIFICACAO, carregar_blogue, mencoes, validar

# estado dos media catalogados (verificar_media.py); a cópia em dados/ serve à publicação online, sem o arquivo
ESTADO_MEDIA_COPIA = DADOS / "estado_media.json"


def main():
    ent, v = validar()
    if v.erros:
        for e in v.erros:
            print("ERRO  ", e)
        if "--forcar" not in sys.argv:
            sys.exit(f"\n{len(v.erros)} erros: corrija-os (ou use --forcar) antes de construir o site.")
    gerar(ent, v)


def gerar(ent, v):
    """Escreve site/dados/base.json a partir das entidades já validadas (também usado pelo servidor ao gravar)."""
    contagem = {}

    def contar(x):  # todas as citações, em qualquer entidade
        if isinstance(x, dict):
            if "fonte" in x and "url" in x:
                contagem[x["fonte"]] = contagem.get(x["fonte"], 0) + 1
            for y in x.values():
                contar(y)
        elif isinstance(x, list):
            for y in x:
                contar(y)
    contar(ent)

    fontes = []
    for f in ler_json(FONTES)["fontes"]:
        f = {k: f[k] for k in ("id", "nome", "tipo", "url", "autor", "estado", "decidido_em", "uso", "notas", "aprovacao",
                               "proposta_por", "decidido_por") if k in f}
        f["n_citacoes"] = contagem.get(f["id"], 0)
        fontes.append(f)

    # estado dos media catalogados (verificar_media.py): disponível, título e miniatura oficiais
    estado_media = ARQUIVO / "media_estado.json"
    local = estado_media.exists()
    fonte_estados = estado_media if local else ESTADO_MEDIA_COPIA
    estados = json.loads(fonte_estados.read_text(encoding="utf-8")) if fonte_estados.exists() else {}
    usados = {}
    for m in ent["media"].values():
        c = classificar_url(m.get("url", ""), "a")
        est = estados.get(f"{c['plataforma']}|{c['chave']}") if c else None
        if est:
            usados[f"{c['plataforma']}|{c['chave']}"] = est
            m["disponivel"] = est["disponivel"]
            if est.get("miniatura"):
                m["miniatura"] = est["miniatura"]

    # imagens escondidas por um editor: saem da galeria e do retrato, mas continuam à vista no modo de edição
    for t in ("pessoas", "instrumentos"):
        for d in ent[t].values():
            if any(im.get("oculta") for im in d.get("imagens", [])):
                d["imagens_ocultas"] = [im for im in d["imagens"] if im.get("oculta")]
                d["imagens"] = [im for im in d["imagens"] if not im.get("oculta")]

    # blogue: cada texto leva as fichas que menciona, para as fichas mostrarem «mencionada no blogue»
    tipo_de = {i: t for t in ("pessoas", "obras", "gravacoes", "instrumentos") for i in ent[t]}
    blogue = []
    for post in carregar_blogue().values():
        post["mencoes"] = [{"tipo": tipo_de[i], "id": i} for i in mencoes(post.get("texto")) if i in tipo_de]
        blogue.append(post)

    base = {
        "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fontes": fontes,
        **{t: sorted(ent[t].values(), key=lambda d: d.get("nome") or d.get("titulo") or d.get("designacao") or d["id"])
           for t in TIPOS},
        "contribuidores": list(v.contribuidores.values()),
        "blogue": sorted(blogue, key=lambda p: (p["data"], p["id"]), reverse=True),
        "validacao": {"erros": len(v.erros), "avisos": len(v.avisos), "citacoes_verificadas": v.n_citacoes},
    }
    escrever_json(SITE_DADOS / "base.json", base)
    if v.db is not None:  # na cópia local: guardar o que a versão online, sem o arquivo, precisa de saber
        escrever_json(VERIFICACAO, sorted(v.verificadas))
    if local:
        escrever_json(ESTADO_MEDIA_COPIA, dict(sorted(usados.items())))
    print(f"site/dados/base.json gerado: " + ", ".join(f"{len(ent[t])} {t}" for t in TIPOS)
          + f"; {v.n_citacoes} citações verificadas; {len(v.avisos)} avisos")


if __name__ == "__main__":
    main()
