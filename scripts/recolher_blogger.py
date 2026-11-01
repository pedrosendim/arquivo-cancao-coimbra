"""Recolhe todos os posts (e comentários) das fontes aprovadas do tipo blogger-feed.

Usa o feed JSON oficial do Blogger, de forma pausada. Grava em
arquivo/blogger/<fonte>/posts.jsonl e comentarios.jsonl (um registo por linha).

Uso:
    python scripts/recolher_blogger.py            # todas as fontes aprovadas
    python scripts/recolher_blogger.py gc-v       # só uma fonte
"""
import json
import sys
import time
import urllib.error
import urllib.request

from comum import ARQUIVO, carregar_fontes

POR_PAGINA = 150
PAUSA = 1.0
AGENTE = "ArquivoCancaoCoimbra/1.0 (arquivo pessoal de estudo)"


def obter(url, tentativas=4):
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            espera = 5 * (i + 1)
            print(f"   aviso: {e} — nova tentativa em {espera}s", file=sys.stderr)
            time.sleep(espera)
    raise RuntimeError(f"falhou: {url}")


def ligacao(entrada, rel):
    for l in entrada.get("link", []):
        if l.get("rel") == rel:
            return l.get("href")
    return None


def paginar(blog, feed):
    inicio, total = 1, None
    while True:
        url = (f"https://{blog}.blogspot.com/feeds/{feed}/default?alt=json"
               f"&max-results={POR_PAGINA}&start-index={inicio}")
        d = obter(url)["feed"]
        total = int(d["openSearch$totalResults"]["$t"])
        entradas = d.get("entry", [])
        yield from entradas
        inicio += len(entradas)
        print(f"   {feed}: {min(inicio - 1, total)}/{total}")
        if not entradas or inicio > total:
            break
        time.sleep(PAUSA)


def id_post(tag):
    # tag:blogger.com,1999:blog-123.post-456
    return tag.rsplit("post-", 1)[-1]


def recolher(fonte):
    blog = fonte["recolha"]["blog"]
    destino = ARQUIVO / "blogger" / fonte["id"]
    destino.mkdir(parents=True, exist_ok=True)
    print(f"== {fonte['id']} ({blog}.blogspot.com)")

    posts = []
    for e in paginar(blog, "posts"):
        posts.append({
            "id": id_post(e["id"]["$t"]),
            "fonte": fonte["id"],
            "url": ligacao(e, "alternate"),
            "titulo": e.get("title", {}).get("$t", ""),
            "publicado": e.get("published", {}).get("$t", ""),
            "atualizado": e.get("updated", {}).get("$t", ""),
            "autor": (e.get("author") or [{}])[0].get("name", {}).get("$t", ""),
            "etiquetas": [c["term"] for c in e.get("category", [])],
            "n_comentarios": int(e.get("thr$total", {}).get("$t", 0) or 0),
            "html": (e.get("content") or e.get("summary") or {}).get("$t", ""),
        })
    gravar(destino / "posts.jsonl", posts)

    comentarios = []
    try:
        for e in paginar(blog, "comments"):
            alvo = e.get("thr$in-reply-to", {})
            comentarios.append({
                "id": id_post(e["id"]["$t"]),
                "fonte": fonte["id"],
                "post_url": alvo.get("href", ""),
                "url": ligacao(e, "alternate") or alvo.get("href", ""),
                "publicado": e.get("published", {}).get("$t", ""),
                "autor": (e.get("author") or [{}])[0].get("name", {}).get("$t", ""),
                "html": (e.get("content") or e.get("summary") or {}).get("$t", ""),
            })
    except RuntimeError as e:
        print(f"   comentários indisponíveis: {e}", file=sys.stderr)
    gravar(destino / "comentarios.jsonl", comentarios)
    print(f"   {len(posts)} posts, {len(comentarios)} comentários")


def gravar(caminho, registos):
    tmp = caminho.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        for r in registos:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    tmp.replace(caminho)


def main():
    fontes = carregar_fontes()
    pedidas = sys.argv[1:]
    for f in fontes.values():
        if f["estado"] != "aprovada" or f.get("recolha", {}).get("metodo") != "blogger-feed":
            continue
        if pedidas and f["id"] not in pedidas:
            continue
        recolher(f)


if __name__ == "__main__":
    main()
