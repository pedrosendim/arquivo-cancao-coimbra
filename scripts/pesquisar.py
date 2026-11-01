"""Pesquisa de texto integral no arquivo local (posts, comentários, páginas guardadas).

Uso:
    python scripts/pesquisar.py "Flávio Rodrigues"
    python scripts/pesquisar.py '"Artur Paredes" guitarra' --fonte gc-v --desde 2015 --limite 40
    python scripts/pesquisar.py "Raposo" --tipo comentario
    python scripts/pesquisar.py --media youtube "Brojo"     # vídeos/media cujo contexto refere o termo

A sintaxe é a do SQLite FTS5: palavras soltas = todas têm de aparecer (sem acentos nem maiúsculas);
"entre aspas" = expressão exata; OR, NOT e prefixo* também funcionam.
"""
import argparse
import sqlite3
import sys

from comum import INDICE, em, slug, valores


def ligar():
    if not INDICE.exists():
        sys.exit("Índice inexistente. Corra primeiro: python scripts/indexar.py")
    db = sqlite3.connect(INDICE)
    db.row_factory = sqlite3.Row
    return db


def pesquisar(db, q, fonte=None, tipo=None, desde=None, ate=None, limite=25, deslocamento=0, ordem="relevancia",
              marcas=("[[", "]]")):
    filtros, args = ["docs_fts MATCH ?"], [q]
    for coluna, filtro in (("d.fonte", fonte), ("d.tipo", tipo)):  # um ou vários valores
        if valores(filtro):
            filtros.append(em(coluna, valores(filtro))); args += valores(filtro)
    if desde:
        filtros.append("d.ano >= ?"); args.append(int(desde))
    if ate:
        filtros.append("d.ano <= ?"); args.append(int(ate))
    ordenar = {"data": "d.data DESC", "antigos": "d.data ASC"}.get(ordem, "bm25(docs_fts, 8.0, 1.0, 2.0)")
    sql = f"""SELECT d.doc_id, d.tipo, d.fonte, d.url, d.titulo, substr(d.data,1,10) AS data, d.autor,
                     d.n_comentarios, snippet(docs_fts, 1, ?, ?, ' … ', 24) AS excerto
              FROM docs_fts JOIN docs d ON d.rowid = docs_fts.rowid
              WHERE {' AND '.join(filtros)} ORDER BY {ordenar} LIMIT ? OFFSET ?"""
    total_sql = f"SELECT COUNT(*) FROM docs_fts JOIN docs d ON d.rowid = docs_fts.rowid WHERE {' AND '.join(filtros)}"
    try:
        total = db.execute(total_sql, args).fetchone()[0]
        linhas = db.execute(sql, list(marcas) + args + [limite, deslocamento]).fetchall()
    except sqlite3.OperationalError:
        # termos com pontuação: tratar cada palavra como expressão literal
        q2 = " ".join('"' + t.replace('"', "") + '"' for t in q.split())
        return (pesquisar(db, q2, fonte, tipo, desde, ate, limite, deslocamento, ordem, marcas)
                if q2 != q else (0, []))
    return total, [dict(l) for l in linhas]


def pesquisar_media(db, termo, plataforma=None, tipo=None, limite=25, deslocamento=0):
    filtros, args = ["1=1"], []
    if termo:
        for t in slug(termo).split("-"):
            filtros.append("busca LIKE ?"); args.append(f"%{t}%")
    if plataforma:
        filtros.append("plataforma = ?"); args.append(plataforma)
    if tipo:
        filtros.append("tipo = ?"); args.append(tipo)
    w = " AND ".join(filtros)
    total = db.execute(f"SELECT COUNT(*) FROM media WHERE {w}", args).fetchone()[0]
    linhas = db.execute(f"SELECT * FROM media WHERE {w} ORDER BY data DESC LIMIT ? OFFSET ?",
                        args + [limite, deslocamento]).fetchall()
    return total, [dict(l) for l in linhas]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("consulta", nargs="?", default="")
    ap.add_argument("--fonte")
    ap.add_argument("--tipo", choices=["post", "comentario", "pagina"])
    ap.add_argument("--desde", type=int)
    ap.add_argument("--ate", type=int)
    ap.add_argument("--limite", type=int, default=25)
    ap.add_argument("--pagina", type=int, default=1)
    ap.add_argument("--data", action="store_true", help="ordenar por data (mais recente primeiro)")
    ap.add_argument("--media", nargs="?", const="", metavar="PLATAFORMA",
                    help="pesquisar media (youtube, vimeo, blogger, rtp-arquivos, spotify, imagem...)")
    a = ap.parse_args()
    db = ligar()
    desl = (a.pagina - 1) * a.limite

    if a.media is not None:
        total, res = pesquisar_media(db, a.consulta, a.media or None, None, a.limite, desl)
        print(f"{total} media encontrados\n")
        for m in res:
            print(f"[{m['plataforma']}] {m['url']}")
            print(f"   em: {m['data'][:10]} · {m['titulo_doc']} · {m['url_doc']}  ({m['doc_id']})")
            ctx = (m["contexto_antes"][-120:] + " ▶ " + m["contexto_depois"][:120]).strip()
            print(f"   contexto: {ctx}\n")
        return

    if not a.consulta:
        sys.exit("Indique uma consulta.")
    total, res = pesquisar(db, a.consulta, a.fonte, a.tipo, a.desde, a.ate, a.limite, desl,
                           "data" if a.data else "relevancia")
    print(f"{total} documentos encontrados (página {a.pagina})\n")
    for r in res:
        print(f"{r['doc_id']}  {r['data']}  [{r['tipo']}]  {r['titulo']}")
        print(f"   {r['url']}")
        print(f"   … {r['excerto'].replace(chr(10), ' ')}\n")


if __name__ == "__main__":
    main()
