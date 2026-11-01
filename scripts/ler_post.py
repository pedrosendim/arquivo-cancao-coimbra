"""Mostra um documento arquivado (texto limpo + media + comentários).

Uso:
    python scripts/ler_post.py gc-v:1234567890
    python scripts/ler_post.py https://guitarradecoimbra4.blogspot.com/2026/10/....html
    python scripts/ler_post.py gc-v:1234567890 --html      # HTML original
"""
import argparse
import sqlite3

from comum import INDICE


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ref", help="doc_id (ex.: gc-v:123) ou URL do post")
    ap.add_argument("--html", action="store_true")
    a = ap.parse_args()
    db = sqlite3.connect(INDICE)
    db.row_factory = sqlite3.Row
    campo = "url" if a.ref.startswith("http") else "doc_id"
    ref = a.ref.replace("http://", "https://") if campo == "url" else a.ref
    d = db.execute(f"SELECT * FROM docs WHERE {campo} = ?", (ref,)).fetchone()
    if not d and campo == "url":
        d = db.execute("SELECT * FROM docs WHERE url = ?", (ref.replace("https://", "http://"),)).fetchone()
    if not d:
        raise SystemExit("Documento não encontrado no arquivo.")

    print(f"ID:        {d['doc_id']}  ({d['tipo']})")
    print(f"FONTE:     {d['fonte']}")
    print(f"TÍTULO:    {d['titulo']}")
    print(f"DATA:      {d['data']}")
    print(f"AUTOR:     {d['autor']}")
    print(f"URL:       {d['url']}")
    if d["etiquetas"]:
        print(f"ETIQUETAS: {d['etiquetas']}")
    print("-" * 78)
    print(d["html"] if a.html else d["texto"])
    media = db.execute("SELECT tipo, plataforma, url, legenda FROM media WHERE doc_id = ?", (d["doc_id"],)).fetchall()
    if media:
        print("-" * 78 + "\nMEDIA NESTE DOCUMENTO:")
        for m in media:
            leg = f" — {m['legenda']}" if m["legenda"] else ""
            print(f"  [{m['tipo']}/{m['plataforma']}] {m['url']}{leg}")
    if d["tipo"] == "post":
        coms = db.execute("SELECT doc_id, data, autor, texto FROM docs WHERE post_url = ? ORDER BY data",
                          (d["url"],)).fetchall()
        if coms:
            print("-" * 78 + f"\nCOMENTÁRIOS ({len(coms)}):")
            for c in coms:
                print(f"\n  {c['doc_id']} · {c['data'][:10]} · {c['autor']}\n  {c['texto']}")


if __name__ == "__main__":
    main()
