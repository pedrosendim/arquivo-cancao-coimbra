"""Constrói arquivo/indice.sqlite a partir do arquivo local.

- docs:      um registo por post, comentário ou página web guardada (texto limpo + HTML)
- docs_fts:  índice de texto integral (sem acentos, sem distinção de maiúsculas)
- media:     vídeos, áudio e imagens encontrados em cada documento, com o texto à volta

Nas páginas web, o texto pesquisável (e onde o validar.py procura as citações) deixa de fora os menus: blocos de 5 ou
mais linhas seguidas que se repetem em 80% ou mais das páginas da mesma fonte (ex.: as categorias e o arquivo mensal
da AJA). O HTML guardado fica igual.

Uso:  python scripts/indexar.py
      python scripts/indexar.py --paginas                    # só as páginas web novas
      python scripts/indexar.py --refazer aja,jornal-a-cabra  # volta a indexar as páginas destas fontes
"""
import json
import os
import re
import sqlite3
import sys
import time
from collections import Counter
from urllib.parse import urljoin

from comum import ARQUIVO, INDICE, classificar_url, em, html_para_texto, slug

MENU_LINHAS, MENU_PARTE, MENU_PAGINAS = 5, 0.8, 8  # bloco mínimo, parte das páginas da fonte, páginas da fonte
_menus = {}

ESQUEMA = """
CREATE TABLE docs (
  rowid INTEGER PRIMARY KEY,
  doc_id TEXT UNIQUE, tipo TEXT, fonte TEXT, url TEXT, post_url TEXT,
  titulo TEXT, data TEXT, ano INTEGER, mes_dia TEXT, autor TEXT,
  etiquetas TEXT, n_comentarios INTEGER, texto TEXT, html TEXT,
  obtido_em TEXT
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
  disponivel INTEGER, titulo_externo TEXT, miniatura TEXT,
  obtido_em TEXT
);
CREATE INDEX media_tipo ON media(tipo, plataforma);
CREATE INDEX media_chave ON media(plataforma, chave);
CREATE INDEX media_doc ON media(doc_id, tipo);
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


def html_da_pagina(p):
    return p.get("html") or "<pre>" + p.get("texto", "") + "</pre>"


def linhas_de_menu(fonte):
    """Linhas que aparecem em MENU_PARTE ou mais das páginas web arquivadas desta fonte (só fontes com MENU_PAGINAS
    páginas ou mais). Calcula-se uma vez por fonte em cada corrida."""
    if fonte not in _menus:
        paginas = sorted((ARQUIVO / "web" / fonte).glob("*.json"))
        n = Counter()
        if len(paginas) >= MENU_PAGINAS:
            for f in paginas:
                texto, _ = html_para_texto(html_da_pagina(json.loads(f.read_text(encoding="utf-8"))))
                n.update({l.strip() for l in texto.splitlines() if l.strip()})
        _menus[fonte] = {l for l, k in n.items() if k >= MENU_PARTE * len(paginas)}
    return _menus[fonte]


def tirar_menus(texto, repetidas):
    """Tira do texto os blocos de MENU_LINHAS ou mais linhas seguidas (sem contar as vazias) que são todas repetidas."""
    if not repetidas:
        return texto
    linhas, fica, i = texto.splitlines(), [], 0
    while i < len(linhas):
        j = i
        while j < len(linhas) and (not linhas[j].strip() or linhas[j].strip() in repetidas):
            j += 1
        if sum(1 for l in linhas[i:j] if l.strip()) >= MENU_LINHAS:
            i = j
        else:
            fica.append(linhas[i])
            i += 1
    return "\n".join(fica)


def inserir(db, doc, html, menus=None):
    texto, media = html_para_texto(html)
    texto = tirar_menus(texto, menus)
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
    for nova, tipo in (("disponivel", "INTEGER"), ("titulo_externo", "TEXT"), ("miniatura", "TEXT"), ("obtido_em", "TEXT")):
        if nova not in colunas:  # índice criado por uma versão anterior
            db.execute(f"ALTER TABLE media ADD COLUMN {nova} {tipo}")
    if "obtido_em" not in {r[1] for r in db.execute("PRAGMA table_info(docs)")}:
        db.execute("ALTER TABLE docs ADD COLUMN obtido_em TEXT")
    db.execute("CREATE INDEX IF NOT EXISTS media_doc ON media(doc_id, tipo)")  # capas e media de cada documento
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


RE_RELATIVO = re.compile(r"""(\b(?:src|href)\s*=\s*)(["'])(?!\s*(?:[a-z][a-z0-9+.-]*:|//|#))([^"']+)\2""", re.I)
RE_NAO_E_FOTO = re.compile(r"placeholder|fallback|spacer|1x1|/pixel\.", re.I)
_estado_media = {}


def absolutos(html, base):
    """As imagens e ligações relativas de uma página guardada («Images/x.jpg») com o endereço completo, a partir do da
    própria página: senão o site local pedia-as a si mesmo (localhost) e ficavam partidas. O ficheiro arquivado não muda."""
    return RE_RELATIVO.sub(lambda m: f"{m.group(1)}{m.group(2)}{urljoin(base, m.group(3).strip())}{m.group(2)}", html or "")


def titulo_na_plataforma(plataforma, chave):
    """Título oficial de um vídeo, guardado pelo verificar_media.py (arquivo/media_estado.json), ou ''."""
    if not _estado_media:
        f = ARQUIVO / "media_estado.json"
        _estado_media.update(json.loads(f.read_text(encoding="utf-8")) if f.exists() else {"": {}})
    return (_estado_media.get(f"{plataforma}|{chave}") or {}).get("titulo", "")


def inserir_pagina(db, f, p):
    # a data é a da própria página, ou nenhuma: a da recolha fica em obtido_em e nunca passa por data do documento
    doc = {"doc_id": f"{p['fonte']}:w{f.stem}", "tipo": "pagina", "fonte": p["fonte"], "url": p["url"],
           "titulo": p.get("titulo") or p["url"], "data": p.get("data") or "",
           "autor": p.get("autor", "")}
    rowid = inserir(db, doc, absolutos(html_da_pagina(p), p["url"]), linhas_de_menu(p["fonte"]))
    db.execute("UPDATE docs SET obtido_em = ? WHERE rowid = ?", (p.get("obtido_em") or None, rowid))
    # endereços data: e imagens de enchimento (placeholder, 1x1…) não são fotografias
    for mid, url in db.execute("SELECT id, url FROM media WHERE doc_id = ? AND tipo = 'imagem'", (doc["doc_id"],)).fetchall():
        if url.lower().startswith("data:") or RE_NAO_E_FOTO.search(url):
            db.execute("DELETE FROM media WHERE id = ?", (mid,))
    for item in p.get("itens", []):  # playlists: o título de cada vídeo vem do oEmbed
        db.execute("UPDATE media SET legenda = ?, titulo_externo = ? WHERE doc_id = ? AND plataforma = 'youtube' AND chave = ?",
                   (item.get("titulo", ""), item.get("titulo", ""), doc["doc_id"], item["id"]))
    if p["fonte"] in ("youtube", "discogs") or p.get("itens"):
        # página que é uma lista (canal, playlist, discografia): o texto à volta de cada vídeo são os títulos dos vizinhos.
        # Procura-se pelo título do próprio vídeo e pelo da página, e o contexto fica vazio.
        for mid, plat, chave, legenda in db.execute("SELECT id, plataforma, chave, legenda FROM media WHERE doc_id = ? AND tipo != 'imagem'",
                                                    (doc["doc_id"],)).fetchall():
            proprio = legenda or titulo_na_plataforma(plat, chave)
            db.execute("UPDATE media SET contexto_antes = '', contexto_depois = '', busca = ? WHERE id = ?",
                       (slug(" ".join([doc["titulo"], proprio])), mid))
    mp = p.get("media_proprio")  # registo com áudio próprio (ex.: Arquivo Sonoro do Museu do Fado)
    if mp:
        # o mesmo áudio já veio do HTML da página: completa essa linha (legenda, descrição, capa) em vez de o repetir
        junta = db.execute("UPDATE media SET legenda = ?, contexto_depois = ?, busca = busca || '-' || ?, miniatura = COALESCE(?, miniatura) "
                           "WHERE doc_id = ? AND plataforma = ? AND chave = ?",
                           (mp.get("legenda", ""), mp.get("descricao", ""), slug(mp.get("descricao", "")), mp.get("miniatura") or None,
                            doc["doc_id"], mp["plataforma"], mp["chave"])).rowcount
        if not junta:
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
    db.execute("UPDATE media SET obtido_em = ? WHERE doc_id = ?", (p.get("obtido_em") or None, doc["doc_id"]))
    return rowid


def main():
    if "--refazer" in sys.argv and INDICE.exists():  # ex.: as páginas destas fontes ainda têm os menus no texto
        resto = sys.argv[sys.argv.index("--refazer") + 1:]
        fontes = [x for x in (resto[0] if resto else "").split(",") if x]
        if not fontes:
            sys.exit("Indique as fontes, por exemplo: python scripts/indexar.py --refazer aja,jornal-a-cabra")
        db = sqlite3.connect(INDICE, timeout=120)
        ids = [r[0] for r in db.execute(f"SELECT doc_id FROM docs WHERE tipo = 'pagina' AND {em('fonte', fontes)}", fontes)]
        db.close()
        print(f"{len(ids)} páginas de {', '.join(fontes)} a indexar de novo")
        return paginas_incremental(substituir=ids)
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
