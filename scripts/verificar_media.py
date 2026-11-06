"""Verifica se os vídeos e áudios ainda se podem ver/ouvir e recolhe a miniatura oficial de cada um.

Plataformas e serviço usado (todos públicos):
  youtube           oEmbed (título; 401 = incorporação desativada, 400/404 = removido ou privado)
  blogger           página do leitor («Video is unavailable» = removido)
  vimeo, spotify    oEmbed (título + miniatura)
  soundcloud        não se verifica: o robots.txt do SoundCloud veda endereços com «?», e o oEmbed é um deles
  dailymotion       API pública de vídeos (título + miniatura)
  internet-archive  metadados + serviço de miniaturas
  rtp-arquivos/play og:image e og:title da ficha
  ficheiro          pedido ao próprio ficheiro de áudio
  facebook          não verificável sem sessão: fica por verificar

Inclui os media do índice do arquivo e os catalogados em dados/media/. O resultado fica em
arquivo/media_estado.json: o indexar.py e o construir.py usam-no (o site esconde por omissão o que já não funciona).

Uso:  python scripts/verificar_media.py [--tudo] [--plataforma youtube]
"""
import json
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from comum import ARQUIVO, DADOS, INDICE, classificar_url
from recolher_blogger import AGENTE

ESTADO = ARQUIVO / "media_estado.json"
Q = urllib.parse.quote


def pedir(url, metodo="GET"):
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Range": "bytes=0-1023"} if metodo == "PARCIAL"
                                 else {"User-Agent": AGENTE})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read(400_000).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return None, ""


def oembed(url_servico):
    cod, corpo = pedir(url_servico)
    if cod == 200:
        d = json.loads(corpo or "{}")
        return {"disponivel": True, "titulo": d.get("title", ""), "miniatura": d.get("thumbnail_url", "")}
    if cod in (400, 403, 404, 410):
        return {"disponivel": False, "motivo": f"HTTP {cod}"}
    return None  # sem resposta: tentar noutra altura


def og(url):
    cod, corpo = pedir(url)
    if cod == 200:
        img = re.search(r'<meta property="og:image" content="([^"]+)"', corpo)
        tit = re.search(r'<meta property="og:title" content="([^"]+)"', corpo)
        return {"disponivel": True, "miniatura": img.group(1) if img else "", "titulo": tit.group(1) if tit else ""}
    return {"disponivel": False, "motivo": f"HTTP {cod}"} if cod in (404, 410) else None


def verificar(plat, chave, url):
    if plat == "youtube":
        cod, corpo = pedir("https://www.youtube.com/oembed?format=json&url=" + Q(f"https://www.youtube.com/watch?v={chave}"))
        if cod == 200:
            return {"disponivel": True, "titulo": json.loads(corpo).get("title", "")}
        if cod == 401:
            return {"disponivel": True, "motivo": "incorporação desativada (abre no YouTube)"}
        return {"disponivel": False, "motivo": f"HTTP {cod}"} if cod else None
    if plat == "blogger":
        cod, corpo = pedir(url)
        if cod is None:
            return None
        # prova positiva: a página do leitor só tem o fluxo de vídeo (googlevideo/videoplayback) se o vídeo existir
        ok = cod == 200 and "Video is unavailable" not in corpo and ("videoplayback" in corpo or "googlevideo" in corpo)
        return {"disponivel": ok, **({} if ok else {"motivo": "removido do Blogger"})}
    if plat == "vimeo":
        return oembed("https://vimeo.com/api/oembed.json?url=" + Q(url))
    if plat == "spotify":
        return oembed("https://open.spotify.com/oembed?url=" + Q(url))
    if plat == "dailymotion":
        cod, corpo = pedir(f"https://api.dailymotion.com/video/{chave}?fields=title,thumbnail_480_url")
        if cod == 200:
            d = json.loads(corpo)
            return {"disponivel": True, "titulo": d.get("title", ""), "miniatura": d.get("thumbnail_480_url", "")}
        return {"disponivel": False, "motivo": f"HTTP {cod}"} if cod else None
    if plat == "internet-archive":
        cod, corpo = pedir(f"https://archive.org/metadata/{chave}")
        if cod != 200:
            return None
        d = json.loads(corpo or "{}")
        if not d.get("metadata"):
            return {"disponivel": False, "motivo": "item inexistente"}
        return {"disponivel": True, "titulo": d["metadata"].get("title", ""), "miniatura": f"https://archive.org/services/img/{chave}"}
    if plat in ("rtp-arquivos", "rtp-play"):
        return og(url)
    if plat == "ficheiro":
        cod, _ = pedir(url, "PARCIAL")
        if cod in (200, 206):
            return {"disponivel": True}
        return {"disponivel": False, "motivo": f"HTTP {cod}" if cod else "servidor inexistente"}
    return None  # facebook e outros: não verificável


def alvos():
    res = {}
    db = sqlite3.connect(INDICE)
    for plat, chave, url in db.execute("SELECT plataforma, chave, MIN(url) FROM media WHERE tipo IN ('video','audio') "
                                       "GROUP BY plataforma, chave"):
        res[f"{plat}|{chave}"] = (plat, chave, url)
    db.close()
    for f in (DADOS / "media").glob("*.json"):
        m = json.loads(f.read_text(encoding="utf-8"))
        c = classificar_url(m.get("url", ""), "a")
        if c and c["tipo"] != "imagem":
            res.setdefault(f"{c['plataforma']}|{c['chave']}", (c["plataforma"], c["chave"], c["url"]))
    return res


def main():
    estado = json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {}
    so = sys.argv[sys.argv.index("--plataforma") + 1] if "--plataforma" in sys.argv else None
    todos = alvos()
    pendentes = [(k, v) for k, v in todos.items() if (not so or v[0] == so)
                 and ("--tudo" in sys.argv or k not in estado) and v[0] not in ("facebook", "soundcloud")]
    print(f"{len(todos)} media; a verificar {len(pendentes)}")
    for n, (k, (plat, chave, url)) in enumerate(pendentes, 1):
        r = verificar(plat, chave, url)
        if r is not None:
            r["verificado_em"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            estado[k] = r
        if n % 50 == 0:
            ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=0), encoding="utf-8")
            print(f"  {n}/{len(pendentes)}")
        time.sleep(0.4)
    ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=0), encoding="utf-8")
    fora = sum(1 for v in estado.values() if not v["disponivel"])
    print(f"Verificados: {len(estado)}; indisponíveis: {fora}. Corra python scripts/indexar.py e construir.py para aplicar.")


if __name__ == "__main__":
    main()
