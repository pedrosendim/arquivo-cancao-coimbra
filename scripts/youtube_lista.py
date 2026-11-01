"""Importa uma playlist do YouTube (por exemplo, uma criada pelo utilizador) para o arquivo.

Os vídeos lêem-se pelo leitor oficial do YouTube (IFrame API, numa página do site local aberta num
browser sem janela) e os títulos pelo oEmbed público. Não se usa a página da playlist (aviso de cookies)
nem o feed (vedado pelo robots.txt). A lista fica arquivada como documento da fonte `youtube`; os vídeos
entram na mediateca e podem ser ligados às faixas (pesquisar.py --media youtube "título").

Precisa do servidor local a correr (python scripts/servidor.py) e do Google Chrome ou Microsoft Edge.

Uso:  python scripts/youtube_lista.py "https://www.youtube.com/watch?v=…&list=PL…" [--titulo "Playlist do utilizador"]
Depois: python scripts/indexar.py --paginas
"""
import argparse
import hashlib
import html as html_lib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from comum import ARQUIVO
from recolher_blogger import AGENTE

NAVEGADORES = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
               r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "google-chrome", "chromium"]


def ids_da_lista(lista, porta):
    nav = next((n for n in NAVEGADORES if os.path.exists(n) or "\\" not in n), None)
    perfil = tempfile.mkdtemp(prefix="yt-lista-")
    cmd = [nav, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={perfil}",
           "--virtual-time-budget=20000", "--dump-dom", f"http://localhost:{porta}/ferramentas/lista-youtube.html?list={lista}"]
    dom = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120).stdout
    m = re.search(r"IDS:([A-Za-z0-9_,-]*)", dom)
    if not m:
        sys.exit("Não foi possível ler a playlist (servidor local desligado? playlist privada?).")
    return [i for i in m.group(1).split(",") if i]


def oembed(vid):
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": AGENTE}), timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"title": "", "author_name": "", "erro": e.code}
    finally:
        time.sleep(0.4)


def titulo_da_lista(lista):
    """Título e autor da playlist, pelo oEmbed público."""
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/playlist?list={lista}")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": AGENTE}), timeout=30) as r:
            d = json.loads(r.read().decode("utf-8"))
            return d.get("title", ""), d.get("author_name", "")
    except Exception:
        return "", ""


def guardar_lista(lista, ids, titulo=None, mostrar=print):
    """Vai buscar o título de cada vídeo (oEmbed) e arquiva a playlist como documento da fonte `youtube`."""
    ids = [i for i in ids if re.fullmatch(r"[A-Za-z0-9_-]{11}", i)]
    t, autor = titulo_da_lista(lista)
    titulo = titulo or (f"Playlist «{t}»" + (f" de {autor}" if autor else "") if t else "Playlist do YouTube")
    linhas, itens = [f"Playlist: {titulo}", f"Lista: https://www.youtube.com/playlist?list={lista}"], []
    for n, vid in enumerate(ids, 1):
        o = oembed(vid)
        tit, canal = o.get("title", ""), o.get("author_name", "")
        itens.append({"n": n, "id": vid, "titulo": tit, "canal": canal, "indisponivel": "erro" in o})
        linhas.append(f"{n}. {tit or '(indisponível)'} — {canal} — https://www.youtube.com/watch?v={vid}")
        mostrar(f"  {n:>3}. {tit[:70]}  [{canal}]")
    url_doc = f"https://www.youtube.com/playlist?list={lista}"
    reg = {"url": url_doc, "fonte": "youtube", "titulo": titulo, "data": "",
           "obtido_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), "metodo": "iframe-api+oembed",
           "texto": "\n".join(linhas), "itens": itens,
           "html": "".join(f'<p>{html_lib.escape(l.rsplit(" — https://", 1)[0])} — <a href="https://www.youtube.com/watch?v={i["id"]}">'
                           f'https://www.youtube.com/watch?v={i["id"]}</a></p>' for l, i in zip(linhas[2:], itens))}
    pasta = ARQUIVO / "web" / "youtube"
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / (hashlib.sha1(url_doc.encode()).hexdigest()[:16] + ".json")
    destino.write_text(json.dumps(reg, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"titulo": titulo, "n": len(itens), "indisponiveis": sum(1 for i in itens if i["indisponivel"]),
            "doc_id": f"youtube:w{destino.stem}"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url")
    ap.add_argument("--titulo")
    ap.add_argument("--porta", type=int, default=8765)
    a = ap.parse_args()
    lista = (urllib.parse.parse_qs(urllib.parse.urlparse(a.url).query).get("list") or [""])[0]
    if not lista:
        sys.exit("O URL não tem o parâmetro list=.")
    ids = ids_da_lista(lista, a.porta)
    if not ids:
        sys.exit("O leitor não devolveu vídeos neste modo. Importe a playlist no site: Mediateca → Playlists.")
    r = guardar_lista(lista, ids, a.titulo)
    print(f"Arquivada ({r['n']} vídeos). Corra python scripts/indexar.py --paginas")


if __name__ == "__main__":
    main()
