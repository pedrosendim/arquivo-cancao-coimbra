"""Gestão do registo de fontes (fontes/fontes.json).

Uso:
    python scripts/fontes.py listar [--estado pendente]
    python scripts/fontes.py aprovar musicbrainz
    python scripts/fontes.py rejeitar discogs "dados pouco fiáveis para 78 rpm"
    python scripts/fontes.py propor --id museu-x --nome "Museu X" --url https://... --tipo instituicao \
        --uso factos media --notas "Porque é relevante"
"""
import argparse
import sys
from datetime import date

from comum import FONTES, ler_json, escrever_json

TIPOS = ["blogue", "arquivo-audiovisual", "plataforma", "base-de-dados", "arquivo-web",
         "repositorio-academico", "instituicao", "biblioteca", "livro", "imprensa", "site", "outro"]


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    l = sub.add_parser("listar"); l.add_argument("--estado")
    ap_ = sub.add_parser("aprovar"); ap_.add_argument("id")
    r = sub.add_parser("rejeitar"); r.add_argument("id"); r.add_argument("motivo", nargs="?", default="")
    p = sub.add_parser("propor")
    p.add_argument("--id", required=True); p.add_argument("--nome", required=True)
    p.add_argument("--url", required=True); p.add_argument("--tipo", choices=TIPOS, default="site")
    p.add_argument("--uso", nargs="+", choices=["factos", "media"], default=["factos"])
    p.add_argument("--autor", default=""); p.add_argument("--notas", required=True)
    p.add_argument("--pedido-geral", metavar="PEDIDO",
                   help="fica aprovada ao abrigo de um pedido geral do utilizador (ex.: fotografias); o utilizador confirma depois")
    a = ap.parse_args()

    reg = ler_json(FONTES)
    por_id = {f["id"]: f for f in reg["fontes"]}

    if a.cmd == "listar":
        for f in reg["fontes"]:
            if a.estado and f["estado"] != a.estado:
                continue
            print(f"{f['estado']:<10} {f['id']:<18} {f['nome']}  <{f['url']}>")
            if f["estado"] == "pendente" and f.get("notas"):
                print(f"{'':<29} ↳ {f['notas']}")
        return

    if a.cmd == "propor":
        if a.id in por_id:
            sys.exit(f"Já existe uma fonte '{a.id}' ({por_id[a.id]['estado']}).")
        nova = {"id": a.id, "nome": a.nome, "tipo": a.tipo, "url": a.url, "autor": a.autor,
                "estado": "pendente", "decidido_em": None, "uso": a.uso,
                "recolha": {"metodo": "manual"}, "notas": a.notas}
        if a.pedido_geral:
            nova.update(estado="aprovada", decidido_em=date.today().isoformat(), aprovacao="pedido-geral",
                        notas=f"{a.notas} [Aprovada ao abrigo do pedido do utilizador: {a.pedido_geral} — por confirmar]")
        reg["fontes"].append(nova)
        escrever_json(FONTES, reg)
        print(f"Fonte registada: {a.id} ({'aprovada por pedido geral, por confirmar' if a.pedido_geral else 'pendente de aprovação do utilizador'})")
        return

    f = por_id.get(a.id) or sys.exit(f"Fonte '{a.id}' não encontrada.")
    f.pop("aprovacao", None)  # decisão explícita do utilizador substitui a aprovação por pedido geral
    f["estado"] = "aprovada" if a.cmd == "aprovar" else "rejeitada"
    f["decidido_em"] = date.today().isoformat()
    if a.cmd == "rejeitar" and a.motivo:
        f["notas"] = (f.get("notas", "") + f" [Rejeitada: {a.motivo}]").strip()
    escrever_json(FONTES, reg)
    print(f"{a.id}: {f['estado']}")


if __name__ == "__main__":
    main()
