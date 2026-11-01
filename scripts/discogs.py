"""Discografia a partir da API pública do Discogs (fonte aprovada).

O site discogs.com está protegido contra robôs e não é usado; a API oficial é. Sem token, o limite é
de 25 pedidos/minuto; com um token pessoal (variável de ambiente DISCOGS_TOKEN) sobe para 60 e as
imagens das capas ficam disponíveis.

Cada lançamento, master ou artista é guardado como texto em arquivo/web/discogs/, com o URL da página
do Discogs, para as citações poderem ser verificadas (ex.: «Editora: Alvorada – MEP 60054»).

Uso:
    python scripts/discogs.py procurar "fado de coimbra" [--tipo release|master|artist] [--paginas 3]
    python scripts/discogs.py artista 1234567 [--discografia]   # perfil, membros, grupos (+ lançamentos)
    python scripts/discogs.py lancamento 7654321                # editora, nº de catálogo, faixas, créditos, vídeos
    python scripts/discogs.py master 111111
Depois: python scripts/indexar.py
"""
import argparse
import hashlib
import html as html_lib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from comum import ARQUIVO
from recolher_blogger import AGENTE

API = "https://api.discogs.com"
PASTA = ARQUIVO / "web" / "discogs"
TOKEN = os.environ.get("DISCOGS_TOKEN", "")
PAUSA = 1.1 if TOKEN else 2.6


def obter(caminho, params=None):
    url = API + caminho + ("?" + urllib.parse.urlencode(params) if params else "")
    cab = {"User-Agent": AGENTE}
    if TOKEN:
        cab["Authorization"] = f"Discogs token={TOKEN}"
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=cab), timeout=60) as r:
                time.sleep(PAUSA)
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(60); continue
            if e.code == 404:
                return None
            sys.exit(f"HTTP {e.code} em {url}")
        except (urllib.error.URLError, TimeoutError):
            time.sleep(5 * (i + 1))
    return None


def nomes(lista):
    return ", ".join(a.get("name", "") + (f" ({a['anv']})" if a.get("anv") else "") for a in lista or [])


def guardar(url, titulo, data, linhas, bruto):
    texto = "\n".join(l for l in linhas if l is not None)
    reg = {"url": url, "fonte": "discogs", "titulo": titulo, "data": data or "",
           "obtido_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), "metodo": "api",
           "texto": texto, "dados": bruto,
           "html": "".join(f"<p>{_ligar(html_lib.escape(l))}</p>" for l in texto.splitlines())}
    PASTA.mkdir(parents=True, exist_ok=True)
    (PASTA / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".json")).write_text(
        json.dumps(reg, ensure_ascii=False, indent=1), encoding="utf-8")
    return texto


def _ligar(s):  # torna clicáveis os URLs (o índice extrai daí os vídeos do YouTube)
    import re
    return re.sub(r"(https?://\S+)", r'<a href="\1">\1</a>', s)


def lancamento(i, tipo="release"):
    d = obter(f"/{'releases' if tipo == 'release' else 'masters'}/{i}")
    if not d:
        return print(f"{tipo} {i} não encontrado")
    url = f"https://www.discogs.com/{tipo}/{i}"
    linhas = [f"{'Lançamento' if tipo == 'release' else 'Master'} Discogs {i}", f"Título: {d.get('title', '')}",
              f"Artistas: {nomes(d.get('artists'))}"]
    for lb in d.get("labels", []):
        linhas.append(f"Editora: {lb.get('name', '')} – {lb.get('catno', '')}")
    for fm in d.get("formats", []):
        linhas.append("Formato: " + ", ".join([fm.get("qty", "") + " × " + fm.get("name", "")] + fm.get("descriptions", [])
                                                + ([fm["text"]] if fm.get("text") else [])))
    linhas += [f"País: {d.get('country', '')}" if d.get("country") else None,
               f"Data: {d.get('released') or d.get('year') or ''}",
               f"Géneros: {', '.join(d.get('genres', []) + d.get('styles', []))}"]
    if d.get("main_release"):
        linhas.append(f"Lançamento principal: https://www.discogs.com/release/{d['main_release']}")
    linhas.append("Faixas:")
    for t in d.get("tracklist", []):
        cred = f" [{nomes(t.get('extraartists'))}]" if t.get("extraartists") else ""
        art = f" — {nomes(t.get('artists'))}" if t.get("artists") else ""
        linhas.append(f"{t.get('position', '')} {t.get('title', '')}{art} {t.get('duration', '')}{cred}".strip())
    if d.get("extraartists"):
        linhas.append("Créditos:")
        linhas += [f"{c.get('role', '')} – {c.get('name', '')}" + (f" ({c['tracks']})" if c.get("tracks") else "")
                   for c in d["extraartists"]]
    if d.get("notes"):
        linhas += ["Notas:", d["notes"].strip()]
    for v in d.get("videos", []):
        linhas.append(f"Vídeo: {v.get('title', '')} — {v.get('uri', '')}")
    for im in d.get("images", []):
        if im.get("uri"):
            linhas.append(f"Imagem ({im.get('type', '')}): {im['uri']}")
    texto = guardar(url, d.get("title", ""), str(d.get("released") or d.get("year") or ""), linhas, d)
    print(texto)


def artista(i, discografia=False):
    d = obter(f"/artists/{i}")
    if not d:
        return print(f"artista {i} não encontrado")
    url = f"https://www.discogs.com/artist/{i}"
    linhas = [f"Artista Discogs {i}", f"Nome: {d.get('name', '')}",
              f"Nome real: {d.get('realname', '')}" if d.get("realname") else None,
              f"Variações do nome: {', '.join(d.get('namevariations', []))}" if d.get("namevariations") else None,
              "Perfil:", (d.get("profile") or "").strip()]
    if d.get("members"):
        linhas.append("Membros:")
        linhas += [f"{m['name']} (https://www.discogs.com/artist/{m['id']})" + ("" if m.get("active", True) else " [inativo]")
                   for m in d["members"]]
    if d.get("groups"):
        linhas.append("Grupos:")
        linhas += [f"{g['name']} (https://www.discogs.com/artist/{g['id']})" for g in d["groups"]]
    linhas += [f"Ligação: {u}" for u in d.get("urls", [])]
    linhas += [f"Imagem: {im['uri']}" for im in d.get("images", []) if im.get("uri")]
    if discografia:
        linhas.append("Discografia:")
        pagina = 1
        while True:
            r = obter(f"/artists/{i}/releases", {"per_page": 100, "page": pagina, "sort": "year"})
            if not r:
                break
            for x in r.get("releases", []):
                linhas.append(f"{x.get('year', '?')} · {x.get('title', '')} · {x.get('label', '') or ''} · "
                              f"{x.get('format', '') or ''} · {x.get('role', '')} · "
                              f"https://www.discogs.com/{x.get('type', 'release')}/{x.get('id')}")
            if pagina >= r.get("pagination", {}).get("pages", 1):
                break
            pagina += 1
    print(guardar(url, d.get("name", ""), "", linhas, d))


def procurar(q, tipo, paginas):
    for p in range(1, paginas + 1):
        params = {"q": q, "per_page": 100, "page": p}
        if tipo:
            params["type"] = tipo
        r = obter("/database/search", params)
        if not r:
            break
        if p == 1:
            print(f"{r['pagination']['items']} resultados para «{q}»")
        for x in r.get("results", []):
            print(f"{x.get('type', ''):8} {x.get('id')}  {x.get('year', '') or '':4}  {x.get('title', '')}  "
                  f"[{', '.join(x.get('label', [])[:1])} {x.get('catno', '')}]  {', '.join(x.get('format', [])[:3])}")
        if p >= r["pagination"]["pages"]:
            break


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("procurar"); p.add_argument("q"); p.add_argument("--tipo", choices=["release", "master", "artist", "label"])
    p.add_argument("--paginas", type=int, default=1)
    a_ = sub.add_parser("artista"); a_.add_argument("id"); a_.add_argument("--discografia", action="store_true")
    l = sub.add_parser("lancamento"); l.add_argument("id")
    m = sub.add_parser("master"); m.add_argument("id")
    a = ap.parse_args()
    if a.cmd == "procurar":
        procurar(a.q, a.tipo, a.paginas)
    elif a.cmd == "artista":
        artista(a.id, a.discografia)
    else:
        lancamento(a.id, "release" if a.cmd == "lancamento" else "master")


if __name__ == "__main__":
    main()
