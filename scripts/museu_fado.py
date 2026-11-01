"""Arquivo Sonoro Digital do Museu do Fado (fonte aprovada `museu-do-fado`).

O robots.txt do arquivo permite o acesso. Cada registo tem ficha (título, intérprete, editora e número,
referências, intervenientes, transcrição da etiqueta, imagem da etiqueta) e, quando existe, o áudio (mp3)
que se ouve no leitor do site. Cada registo fica arquivado em arquivo/web/museu-do-fado/ para poder
ser citado (ex.: «Editora: Od.136.806») e o áudio aparece na mediateca.

Uso:
    python scripts/museu_fado.py procurar "Menano"             # intérpretes do arquivo com esse nome
    python scripts/museu_fado.py interprete 232                 # arquiva todos os registos de um intérprete (id)
    python scripts/museu_fado.py interprete "António Menano"    # idem, pelo nome
Depois: python scripts/indexar.py --paginas
"""
import argparse
import hashlib
import html as html_lib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from comum import ARQUIVO
from recolher_blogger import AGENTE

BASE = "https://arquivosonoro.museudofado.pt"
PASTA = ARQUIVO / "web" / "museu-do-fado"


def obter(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": AGENTE}), timeout=60) as r:
                time.sleep(1.0)
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:
            if getattr(e, "code", None) in (401, 403, 429):
                sys.exit(f"HTTP {e.code}: o site recusou. Parar (não contornar).")
            time.sleep(5 * (i + 1))
    sys.exit(f"Sem resposta: {url}")


def interpretes(nome):
    h = obter(f"{BASE}/interpretes?search={urllib.parse.quote(nome)}")
    return sorted(set(re.findall(r'href="https://arquivosonoro\.museudofado\.pt/interprete/(\d+)/([^"]+)"', h)), key=lambda x: x[1])


def registos(pagina_html):
    """Os registos vêm num vetor JSON dentro da página; lê-o a partir do primeiro {"id_repertorio"."""
    i = pagina_html.find('[{"id_repertorio"')
    if i < 0:
        return []
    dados, _ = json.JSONDecoder().raw_decode(pagina_html[i:])
    return dados


def todos_os_registos(url):
    """As páginas de intérprete mostram 20 registos de cada vez (?page=2, 3…)."""
    vistos, res, pagina = set(), [], 1
    while pagina <= 50:
        regs = registos(obter(url + (f"?page={pagina}" if pagina > 1 else "")))
        novos = [r for r in regs if r.get("id_repertorio") not in vistos]
        if not novos:
            break
        vistos.update(r.get("id_repertorio") for r in novos)
        res += novos
        if len(regs) < 20:
            break
        pagina += 1
    return res


def arquivar(r):
    url = r.get("permalink") or f"{BASE}/fado/{r['id_repertorio']}"
    transc = html_lib.unescape((r.get("transcricao") or "").replace("\u000b", " / "))
    linhas = [f"Título: {r.get('titulo', '')}", f"Intérprete: {r.get('nome_interprete', '')}",
              f"Editora: {r.get('editora', '')}", f"Referências: {(r.get('references') or '').replace('|', '; ')}",
              f"Intervenientes: {r.get('intervenientes', '')}", f"Etiqueta: {transc}",
              f"Estado de conservação: {r.get('estado', '')}", f"Coleção: {r.get('colecao', '')}"]
    audio = r.get("music") or ""
    if audio:
        linhas.append(f"Áudio: {audio}")
    if r.get("image"):
        linhas.append(f"Imagem da etiqueta: {r['image']}")
    texto = "\n".join(linhas)
    reg = {"url": url, "fonte": "museu-do-fado", "titulo": f"{r.get('titulo', '')} — {r.get('nome_interprete', '')}",
           "data": "", "obtido_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), "metodo": "automatico",
           "texto": texto, "html": "".join(f"<p>{html_lib.escape(l)}</p>" for l in linhas), "registo": r,
           "media_proprio": ({"tipo": "audio", "plataforma": "museu-do-fado", "chave": audio.rsplit("/", 1)[-1], "url": audio,
                              "legenda": f"{r.get('titulo', '')} — {r.get('nome_interprete', '')}", "miniatura": r.get("image", ""),
                              "descricao": f"{r.get('editora', '')} · {transc}"} if audio else None)}
    PASTA.mkdir(parents=True, exist_ok=True)
    (PASTA / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".json")).write_text(
        json.dumps(reg, ensure_ascii=False, indent=1), encoding="utf-8")
    return audio


def cmd_interprete(alvo):
    if alvo.isdigit():
        lista = [(alvo, "")]
    else:
        lista = interpretes(alvo)
        if not lista:
            sys.exit("Intérprete não encontrado no Arquivo Sonoro.")
    for iid, slug in lista:
        url = f"{BASE}/interprete/{iid}/{slug}" if slug else f"{BASE}/interprete/{iid}"
        regs = todos_os_registos(url)
        print(f"== {slug or iid}: {len(regs)} registos")
        for r in regs:
            audio = arquivar(r)
            print(f"  {r.get('titulo', '')[:45]:45} | {r.get('editora', '')[:28]:28} | {'♪ ' + audio.rsplit('/', 1)[-1] if audio else '(sem áudio)'}")
    print("Corra python scripts/indexar.py --paginas")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("procurar"); p.add_argument("nome")
    i = sub.add_parser("interprete"); i.add_argument("alvo")
    a = ap.parse_args()
    if a.cmd == "procurar":
        for iid, slug in interpretes(a.nome):
            print(f"{iid:>6}  {slug}")
    else:
        cmd_interprete(a.alvo)


if __name__ == "__main__":
    main()
