"""Constrói arquivo/indice.sqlite a partir do arquivo local.

- docs:      um registo por post, comentário ou página web guardada (texto limpo + HTML)
- docs_fts:  índice de texto integral (sem acentos, sem distinção de maiúsculas)
- media:     vídeos, áudio e imagens encontrados em cada documento, com o texto à volta

Uso:  python scripts/indexar.py
"""
import json
import os
import sqlite3
import sys
import time

from comum import ARQUIVO, INDICE, classificar_url, html_para_texto, slug

ESQUEMA = """
CREATE TABLE docs (
  rowid INTEGER PRIMARY KEY,
  doc_id TEXT UNIQUE, tipo TEXT, fonte TEXT, url TEXT, post_url TEXT,
  titulo TEXT, data TEXT, ano INTEGER, mes_dia TEXT, autor TEXT,
  etiquetas TEXT, n_comentarios INTEGER, texto TEXT, html TEXT
);
CREATE VIRTUAL TABLE docs_fts USING fts5(
  titulo, texto, etiquetas, content='docs', content_rowid='rowid',
  tokenize="unicode61 remove_diacritics 2"
);
CREATE TABLE media (
  id INTEGER PRIMARY KEY,
  doc_id TEXT, fonte TEXT, data TEXT, titulo_doc TEXT, url_doc TEXT,
  tipo TEXT, plataforma TEXT, chave TEXT, url TEXT, legenda TEXT,
  contexto_antes TEXT, contexto_depois TEXT, busca TEXT,
  disponivel INTEGER, titulo_externo TEXT, miniatura TEXT
);
CREATE INDEX media_tipo ON media(tipo, plataforma);
CREATE INDEX media_chave ON media(plataforma, chave);
CREATE INDEX docs_md ON docs(mes_dia);
CREATE INDEX docs_url ON docs(url);
CREATE INDEX docs_post ON docs(post_url);
"""


def ler_jsonl(caminho):
    if not caminho.exists():
        return
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            if linha.strip():
                yield json.loads(linha)


def titulo_de_recurso(texto):
    """Posts sem título: usar a primeira linha do texto (o site mostra-o em itálico)."""
    linha = next((l.strip() for l in texto.splitlines() if len(l.strip()) > 3), "")
    return "~" + (linha[:90].rstrip() + "…" if len(linha) > 90 else linha) if linha else "(sem título)"


def inserir(db, doc, html):
    texto, media = html_para_texto(html)
    if not doc.get("titulo"):
        doc["titulo"] = titulo_de_recurso(texto)
    data = doc.get("data") or ""
    cur = db.execute(
        "INSERT OR REPLACE INTO docs (doc_id,tipo,fonte,url,post_url,titulo,data,ano,mes_dia,autor,"
        "etiquetas,n_comentarios,texto,html) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (doc["doc_id"], doc["tipo"], doc["fonte"], doc.get("url"), doc.get("post_url"), doc.get("titulo", ""),
         data, int(data[:4]) if data[:4].isdigit() else None, data[5:10] if len(data) >= 10 else None,
         doc.get("autor", ""), " · ".join(doc.get("etiquetas", [])), doc.get("n_comentarios", 0), texto, html))
    for m in media:
        db.execute(
            "INSERT INTO media (doc_id,fonte,data,titulo_doc,url_doc,tipo,plataforma,chave,url,legenda,"
            "contexto_antes,contexto_depois,busca) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (doc["doc_id"], doc["fonte"], data, doc.get("titulo", ""), doc.get("url"), m["tipo"], m["plataforma"],
             m["chave"], m["url"], m.get("legenda", ""), m["contexto_antes"], m["contexto_depois"],
             slug(" ".join([doc.get("titulo", ""), m.get("legenda", ""), m["contexto_antes"], m["contexto_depois"]]))))
    return cur.lastrowid


def aplicar_estado_media(db):
    """Marca os vídeos verificados por verificar_media.py (disponível ou não, título no YouTube)."""
    f = ARQUIVO / "media_estado.json"
    if not f.exists():
        return
    for chave, v in json.loads(f.read_text(encoding="utf-8")).items():
        plat, ch = chave.split("|", 1)
        db.execute("UPDATE media SET disponivel = ?, titulo_externo = ?, miniatura = COALESCE(NULLIF(?, ''), miniatura) "
                   "WHERE plataforma = ? AND chave = ?",
                   (1 if v.get("disponivel") else 0, v.get("titulo", ""), v.get("miniatura", ""), plat, ch))


def paginas_incremental(substituir=()):
    """Junta ao índice existente só as páginas web arquivadas que ainda lá não estão (seguro com vários agentes).
    `substituir`: doc_ids a apagar primeiro (ex.: uma playlist importada de novo)."""
    db = sqlite3.connect(INDICE, timeout=120)
    for doc_id in substituir:
        linha = db.execute("SELECT rowid, titulo, texto, etiquetas FROM docs WHERE doc_id = ?", (doc_id,)).fetchone()
        if linha:
            db.execute("INSERT INTO docs_fts(docs_fts, rowid, titulo, texto, etiquetas) VALUES('delete', ?, ?, ?, ?)", linha)
            db.execute("DELETE FROM docs WHERE doc_id = ?", (doc_id,))
            db.execute("DELETE FROM media WHERE doc_id = ?", (doc_id,))
    db.commit()
    colunas = {r[1] for r in db.execute("PRAGMA table_info(media)")}
    for nova, tipo in (("disponivel", "INTEGER"), ("titulo_externo", "TEXT"), ("miniatura", "TEXT")):
        if nova not in colunas:  # índice criado por uma versão anterior
            db.execute(f"ALTER TABLE media ADD COLUMN {nova} {tipo}")
    db.commit()
    db.execute("BEGIN IMMEDIATE")
    existentes = {r[0] for r in db.execute("SELECT doc_id FROM docs WHERE tipo='pagina'")}
    novas = 0
    for f in sorted((ARQUIVO / "web").glob("*/*.json")):
        p = json.loads(f.read_text(encoding="utf-8"))
        if f"{p['fonte']}:w{f.stem}" in existentes:
            continue
        rowid = inserir_pagina(db, f, p)
        db.execute("INSERT INTO docs_fts(rowid, titulo, texto, etiquetas) SELECT rowid, titulo, texto, etiquetas "
                   "FROM docs WHERE rowid = ?", (rowid,))
        novas += 1
    aplicar_estado_media(db)  # disponibilidade e miniaturas verificadas (verificar_media.py)
    db.commit()
    db.close()
    print(f"{novas} páginas novas acrescentadas ao índice")


def inserir_pagina(db, f, p):
    doc = {"doc_id": f"{p['fonte']}:w{f.stem}", "tipo": "pagina", "fonte": p["fonte"], "url": p["url"],
           "titulo": p.get("titulo") or p["url"], "data": p.get("data") or p.get("obtido_em", ""),
           "autor": p.get("autor", "")}
    rowid = inserir(db, doc, p.get("html") or "<pre>" + p.get("texto", "") + "</pre>")
    for item in p.get("itens", []):  # playlists: o título de cada vídeo vem do oEmbed
        db.execute("UPDATE media SET legenda = ?, titulo_externo = ? WHERE doc_id = ? AND plataforma = 'youtube' AND chave = ?",
                   (item.get("titulo", ""), item.get("titulo", ""), doc["doc_id"], item["id"]))
    mp = p.get("media_proprio")  # registo com áudio próprio (ex.: Arquivo Sonoro do Museu do Fado)
    if mp:
        db.execute(
            "INSERT INTO media (doc_id,fonte,data,titulo_doc,url_doc,tipo,plataforma,chave,url,legenda,"
            "contexto_antes,contexto_depois,busca,miniatura) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (doc["doc_id"], doc["fonte"], doc["data"], doc["titulo"], p["url"], mp["tipo"], mp["plataforma"], mp["chave"],
             mp["url"], mp.get("legenda", ""), "", mp.get("descricao", ""),
             slug(" ".join([doc["titulo"], mp.get("descricao", "")])), mp.get("miniatura") or None))
    proprio = classificar_url(p["url"], "a")  # a própria página é um vídeo (ex.: ficha do RTP Arquivos)
    if proprio and proprio["tipo"] in ("video", "audio"):
        ficha = p.get("ficha", {})
        db.execute(
            "INSERT INTO media (doc_id,fonte,data,titulo_doc,url_doc,tipo,plataforma,chave,url,legenda,"
            "contexto_antes,contexto_depois,busca,miniatura) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (doc["doc_id"], doc["fonte"], doc["data"], doc["titulo"], p["url"], proprio["tipo"], proprio["plataforma"],
             proprio["chave"], proprio["url"], doc["titulo"], "", ficha.get("descricao", ""),
             slug(" ".join([doc["titulo"], ficha.get("descricao", ""), json.dumps(ficha.get("campos", {}), ensure_ascii=False)])),
             ficha.get("imagem") or None))
    return rowid


def main():
    if "--paginas" in sys.argv and INDICE.exists():
        return paginas_incremental()
    tmp = INDICE.with_suffix(f".{os.getpid()}.tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    db.executescript(ESQUEMA)
    n = {"post": 0, "comentario": 0, "pagina": 0}

    for pasta in sorted((ARQUIVO / "blogger").glob("*")):
        titulos = {}
        for p in ler_jsonl(pasta / "posts.jsonl"):
            titulos[p["url"]] = p["titulo"]
            inserir(db, {"doc_id": f"{p['fonte']}:{p['id']}", "tipo": "post", "fonte": p["fonte"], "url": p["url"],
                         "titulo": p["titulo"], "data": p["publicado"], "autor": p["autor"],
                         "etiquetas": p["etiquetas"], "n_comentarios": p["n_comentarios"]}, p["html"])
            n["post"] += 1
        for c in ler_jsonl(pasta / "comentarios.jsonl"):
            inserir(db, {"doc_id": f"{c['fonte']}:c{c['id']}", "tipo": "comentario", "fonte": c["fonte"],
                         "url": c["url"], "post_url": c["post_url"],
                         "titulo": "Comentário a: " + titulos.get(c["post_url"], "(post)"),
                         "data": c["publicado"], "autor": c["autor"]}, c["html"])
            n["comentario"] += 1

    for f in sorted((ARQUIVO / "web").glob("*/*.json")):
        inserir_pagina(db, f, json.loads(f.read_text(encoding="utf-8")))
        n["pagina"] += 1

    db.execute("INSERT INTO docs_fts(docs_fts) VALUES('rebuild')")
    aplicar_estado_media(db)
    db.commit()
    nm = dict(db.execute("SELECT tipo, COUNT(*) FROM media GROUP BY tipo").fetchall())
    nv = db.execute("SELECT COUNT(DISTINCT plataforma||chave) FROM media WHERE tipo!='imagem'").fetchone()[0]
    db.close()
    for tentativa in range(20):  # no Windows a troca falha enquanto outro processo tem o índice aberto
        try:
            os.replace(tmp, INDICE)
            break
        except PermissionError:
            time.sleep(1.5)
    else:
        sys.exit(f"Não foi possível substituir o índice (em uso). Novo índice ficou em {tmp}")
    print(f"Índice: {n['post']} posts, {n['comentario']} comentários, {n['pagina']} páginas web")
    print(f"Media:  {nm}  ({nv} vídeos/áudios distintos)")


if __name__ == "__main__":
    main()
