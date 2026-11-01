"""Retratos a partir da Wikidata (propriedade P18) e da Wikimedia Commons, pelas APIs oficiais.

As APIs da Wikimedia existem para uso programático: identificamo-nos (User-Agent) e fazemos uma pausa
entre pedidos (e esperamos quando pedem). A ficha de cada imagem (descrição, autor, licença) fica
arquivada em arquivo/web/wikimedia-commons/, para a fotografia poder ser citada e verificada.

Uso:
    python scripts/wikimedia.py procurar "Luiz Goes"     # entidades candidatas, com a descrição (para escolher a certa)
    python scripts/wikimedia.py retrato Q312891          # arquiva a imagem P18 dessa entidade e mostra a citação a usar
Depois: python scripts/indexar.py --paginas
"""
import argparse
import hashlib
import html as html_lib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from comum import ARQUIVO
from recolher_blogger import AGENTE

PASTA = ARQUIVO / "web" / "wikimedia-commons"
CAB = {"User-Agent": AGENTE + " (uso pessoal; pedidos espaçados)"}


def obter(url):
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=CAB), timeout=60) as r:
                time.sleep(1.0)
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:  # pedem para esperar
                espera = int(e.headers.get("Retry-After", "30") or 30)
                print(f"  (a Wikimedia pediu para esperar {espera}s)", file=sys.stderr)
                time.sleep(min(espera, 120))
                continue
            if e.code == 404:
                return None
            sys.exit(f"HTTP {e.code} em {url}")
        except (urllib.error.URLError, TimeoutError):
            time.sleep(5 * (i + 1))
    sys.exit("A Wikimedia não respondeu; tente mais tarde.")


def limpar(s):
    return re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", " ", str(s or "")))).strip()


def procurar(nome):
    r = obter("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "wbsearchentities", "search": nome, "language": "pt", "uselang": "pt", "format": "json", "limit": 8}))
    for e in (r or {}).get("search", []):
        print(f"{e['id']:<12} {e.get('label', '')} — {e.get('description', '(sem descrição)')}")


def retrato(qid):
    ent = obter(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json")
    if not ent:
        sys.exit("Entidade não encontrada.")
    e = ent["entities"][qid]
    rotulo = e.get("labels", {}).get("pt", e.get("labels", {}).get("en", {})).get("value", qid)
    descr = e.get("descriptions", {}).get("pt", e.get("descriptions", {}).get("en", {})).get("value", "")
    p18 = [c["mainsnak"]["datavalue"]["value"] for c in e.get("claims", {}).get("P18", []) if "datavalue" in c["mainsnak"]]
    if not p18:
        sys.exit(f"{qid} ({rotulo}) não tem imagem (P18) na Wikidata.")
    ficheiro = p18[0]
    info = obter("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "query", "titles": f"File:{ficheiro}", "prop": "imageinfo", "iiprop": "url|extmetadata",
         "iiurlwidth": 800, "format": "json"}))
    pagina = next(iter(info["query"]["pages"].values()))
    ii = (pagina.get("imageinfo") or [{}])[0]
    meta = {k: limpar(v.get("value", "")) for k, v in ii.get("extmetadata", {}).items()}
    url_pagina = "https://commons.wikimedia.org/wiki/" + urllib.parse.quote("File:" + ficheiro.replace(" ", "_"))
    imagem = f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(ficheiro)}?width=800"
    linhas = [f"Ficheiro: {ficheiro}",
              f"Imagem (P18) da entidade Wikidata {qid}: {rotulo}" + (f" — {descr}" if descr else ""),
              f"Descrição: {meta.get('ImageDescription', '')}",
              f"Data: {meta.get('DateTimeOriginal', '')}",
              f"Autor: {meta.get('Artist', '')}",
              f"Licença: {meta.get('LicenseShortName', '')}",
              f"Atribuição: {meta.get('Attribution', '') or meta.get('Credit', '')}",
              f"Imagem: {imagem}"]
    texto = "\n".join(linhas)
    reg = {"url": url_pagina, "fonte": "wikimedia-commons", "titulo": f"Retrato: {rotulo} ({ficheiro})",
           "data": "", "obtido_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), "metodo": "api",
           "texto": texto, "html": "".join(f"<p>{html_lib.escape(l)}</p>" for l in linhas)}
    PASTA.mkdir(parents=True, exist_ok=True)
    (PASTA / (hashlib.sha1(url_pagina.encode()).hexdigest()[:16] + ".json")).write_text(
        json.dumps(reg, ensure_ascii=False, indent=1), encoding="utf-8")
    print(texto)
    print("\nPara a ficha (imagens[0]), depois de indexar.py --paginas:")
    print(json.dumps({"url": imagem, "legenda": meta.get("ImageDescription", "")[:200] or rotulo,
                      "fontes": [{"fonte": "wikimedia-commons", "url": url_pagina,
                                  "citacao": f"Imagem (P18) da entidade Wikidata {qid}: {rotulo}"}]},
                     ensure_ascii=False, indent=2))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("procurar"); p.add_argument("nome")
    r = sub.add_parser("retrato"); r.add_argument("qid")
    a = ap.parse_args()
    procurar(a.nome) if a.cmd == "procurar" else retrato(a.qid)


if __name__ == "__main__":
    main()
