"""A Música Portuguesa a Gostar Dela Própria (fonte aprovada `mpagdp`): vídeos ligados à Canção de Coimbra.

O robots.txt do site permite o acesso; usa-se a API pública que o próprio mapa usa (/api/videos).
Escolhem-se os vídeos da série «Arquivo Canção de Coimbra» e outros gravados em Coimbra sobre a
Canção de Coimbra (guitarra, baladas, variações…), ou onde aparecem pessoas do arquivo.
Cada vídeo fica arquivado (título, data, local, intérpretes, descrição) e entra na mediateca (Vimeo).

Uso:
    python scripts/mpagdp.py catalogo               # descarrega o catálogo completo (um pedido)
    python scripts/mpagdp.py coimbra                # arquiva os vídeos da Canção de Coimbra
    python scripts/mpagdp.py coimbra --ids 3920 3921 # e/ou vídeos escolhidos à mão
Depois: python scripts/indexar.py --paginas  e  python scripts/verificar_media.py --plataforma vimeo
"""
import argparse
import hashlib
import html as html_lib
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone

from comum import ARQUIVO, DADOS, slug
from recolher_blogger import AGENTE

BASE = "https://amusicaportuguesaagostardelapropria.org"
CACHE = ARQUIVO / "mpagdp" / "videos.json"
PASTA = ARQUIVO / "web" / "mpagdp"
TEMAS = re.compile(r"can[cç][aã]o de coimbra|fado de coimbra|guitarra (de coimbra|portuguesa)|balada|varia[cç][oõ]es|"
                   r"paredes|zeca|serenata|despedida", re.I)


def catalogo():
    req = urllib.request.Request(f"{BASE}/api/videos", headers={"User-Agent": AGENTE, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        dados = json.loads(r.read().decode("utf-8"))
    dados = dados.get("data", dados) if isinstance(dados, dict) else dados
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    print(f"{len(dados)} vídeos no catálogo")


def pt(v):
    c = [x for x in v.get("video_lang_content", []) if x.get("language_id") == 2] or v.get("video_lang_content", [])
    return c[0] if c else {}


def relevantes(videos, extra_ids):
    nomes = set()
    for f in (DADOS / "pessoas").glob("*.json"):
        p = json.loads(f.read_text(encoding="utf-8"))
        if p.get("papeis") and len(p["nome"].split()) >= 2:
            nomes.add(slug(p["nome"]))
    res = []
    for v in videos:
        c = pt(v)
        texto = " ".join([c.get("title") or "", c.get("description") or ""]).replace("António Variações", "")  # o cantor, não as variações
        artistas = " ".join(a["name"] for a in v.get("artists", []))
        serie = "arquivo-cancao-de-coimbra" in slug(c.get("description") or "")
        em_coimbra = slug(c.get("area") or "") == "coimbra" and TEMAS.search(texto)
        # pessoas do arquivo filmadas na região de Coimbra, mas só quando o tema é da Canção de Coimbra
        com_pessoa = (slug(c.get("region") or "") == "coimbra" and TEMAS.search(texto)
                      and any(n in slug(texto + " " + artistas) for n in nomes))
        if serie or em_coimbra or com_pessoa or v["id"] in extra_ids:
            res.append(v)
    return res


def arquivar(v):
    c = pt(v)
    url = f"{BASE}/map?video={v['id']}"
    artistas = [a["name"] for a in v.get("artists", [])]
    linhas = [f"Título: {c.get('title', '')}", f"Data: {v.get('video_date', '')}",
              f"Local: {', '.join(x for x in (c.get('area'), c.get('region'), c.get('country')) if x)}",
              f"Créditos: {'; '.join(artistas)}", "Descrição:"] + [l for l in (c.get("description") or "").splitlines() if l.strip()]
    linhas.append(f"Vídeo: {v.get('video_link', '')}")
    texto = "\n".join(linhas)
    reg = {"url": url, "fonte": "mpagdp", "titulo": c.get("title", ""), "data": v.get("video_date") or "",
           "obtido_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), "metodo": "api",
           "texto": texto, "registo": {k: v[k] for k in ("id", "video_link", "video_date", "lat", "long")},
           "html": "".join(f"<p>{html_lib.escape(l)}</p>" for l in linhas[:-1])
                   + f'<p>Vídeo: <a href="{html_lib.escape(v.get("video_link", ""))}">{html_lib.escape(v.get("video_link", ""))}</a></p>'}
    PASTA.mkdir(parents=True, exist_ok=True)
    (PASTA / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".json")).write_text(
        json.dumps(reg, ensure_ascii=False, indent=1), encoding="utf-8")
    return c.get("title", "")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("catalogo")
    c = sub.add_parser("coimbra"); c.add_argument("--ids", nargs="*", type=int, default=[])
    a = ap.parse_args()
    if a.cmd == "catalogo":
        return catalogo()
    if not CACHE.exists():
        catalogo()
    videos = json.loads(CACHE.read_text(encoding="utf-8"))
    videos = videos.get("data", videos) if isinstance(videos, dict) else videos  # resposta da API em bruto
    escolhidos = relevantes(videos, set(a.ids))
    for v in sorted(escolhidos, key=lambda v: v.get("video_date") or ""):
        print(f"  {v['id']:>5} {v.get('video_date')}  {arquivar(v)[:90]}")
    print(f"{len(escolhidos)} vídeos arquivados. Corra python scripts/indexar.py --paginas")


if __name__ == "__main__":
    main()
