"""Guarda no arquivo local uma página de uma fonte APROVADA, para poder ser citada e verificada.

Respeita o robots.txt e não contorna bloqueios: se o site recusar acesso automático,
guarde a página no browser (Ctrl+S, "só HTML") e importe-a com --ficheiro.

Uso:
    python scripts/guardar_pagina.py https://exemplo.pt/pagina --fonte museu-do-fado
    python scripts/guardar_pagina.py https://arquivos.rtp.pt/conteudos/xyz --fonte rtp-arquivos --ficheiro pagina.html
Depois: python scripts/indexar.py
"""
import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from urllib.parse import urlparse

from comum import ARQUIVO, carregar_fontes, html_para_texto
from recolher_blogger import AGENTE


def permitido(url):
    """Lê o robots.txt com o nosso identificador (o do Python é bloqueado por alguns sites) e respeita-o."""
    p = urlparse(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        req = urllib.request.Request(f"{p.scheme}://{p.netloc}/robots.txt", headers={"User-Agent": AGENTE})
        with urllib.request.urlopen(req, timeout=30) as r:
            rp.parse(r.read().decode("utf-8", errors="replace").splitlines())
    except urllib.error.HTTPError as e:
        # RFC 9309: robots.txt 4xx = indisponível → acesso permitido; 5xx = inacessível → não arriscar
        return e.code < 500
    except Exception:
        return True
    return rp.can_fetch(AGENTE, url)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--fonte", required=True)
    ap.add_argument("--ficheiro", help="HTML ou texto guardado manualmente a partir do browser")
    a = ap.parse_args()

    fonte = carregar_fontes().get(a.fonte)
    if not fonte:
        sys.exit(f"Fonte '{a.fonte}' não existe em fontes/fontes.json")
    if fonte["estado"] != "aprovada":
        sys.exit(f"Fonte '{a.fonte}' está '{fonte['estado']}'. Só fontes aprovadas pelo utilizador podem ser arquivadas.")

    if a.ficheiro:
        with open(a.ficheiro, encoding="utf-8", errors="replace") as f:
            html = f.read()
    else:
        if not permitido(a.url):
            sys.exit("robots.txt não permite acesso automático a esta página. Guarde-a manualmente e use --ficheiro.")
        try:
            req = urllib.request.Request(a.url, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(req, timeout=60) as r:
                html = r.read().decode(r.headers.get_content_charset() or "utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            sys.exit(f"HTTP {e.code}: o site recusou o pedido. Não contornar — guarde a página no browser e use --ficheiro.")

    if not re.search(r"<\w+[^>]*>", html):
        html = "<pre>" + html + "</pre>"
    titulo = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    corpo = re.search(r"<body[^>]*>(.*)</body>", html, re.S | re.I)
    html_corpo = corpo.group(1) if corpo else html
    texto, _ = html_para_texto(html_corpo)
    registo = {
        "url": a.url, "fonte": a.fonte,
        "titulo": re.sub(r"\s+", " ", titulo.group(1)).strip() if titulo else a.url,
        "obtido_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "metodo": "manual" if a.ficheiro else "automatico",
        "texto": texto, "html": html_corpo,
    }
    destino = ARQUIVO / "web" / a.fonte / (hashlib.sha1(a.url.encode()).hexdigest()[:16] + ".json")
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(registo, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Guardado: {destino.relative_to(ARQUIVO.parent)}  ({len(texto)} caracteres de texto)")
    print("Corra python scripts/indexar.py --paginas para o tornar pesquisável e verificável.")


if __name__ == "__main__":
    main()
