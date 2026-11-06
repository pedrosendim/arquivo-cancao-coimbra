"""Chave da API do Spotify, só neste computador: serve para encontrar os endereços das faixas.

A chave fica fora do projeto, em ~/.arquivo-spotify.json, e nunca vai para o repositório nem para o site. No site só ficam
os endereços públicos das faixas, que continuam a funcionar mesmo que a chave deixe de existir.

Uso:
  python scripts/spotify.py guardar   # pede o Client ID e o Client secret (o que se escreve não aparece no ecrã)
  python scripts/spotify.py testar    # confirma que a chave funciona
"""
import base64
import getpass
import json
import stat
import sys
import urllib.parse
import urllib.request
from pathlib import Path

CHAVE = Path.home() / ".arquivo-spotify.json"
AGENTE = {"User-Agent": "arquivo-cancao-coimbra"}


def pedir_json(pedido):
    with urllib.request.urlopen(pedido, timeout=30) as r:
        return json.load(r)


def token():
    if not CHAVE.exists():
        sys.exit("Ainda não há chave. Corra: python scripts/spotify.py guardar")
    c = json.loads(CHAVE.read_text(encoding="utf-8"))
    basico = base64.b64encode(f"{c['id']}:{c['segredo']}".encode()).decode()
    pedido = urllib.request.Request("https://accounts.spotify.com/api/token", data=b"grant_type=client_credentials",
                                    headers={**AGENTE, "Authorization": f"Basic {basico}", "Content-Type": "application/x-www-form-urlencoded"})
    return pedir_json(pedido)["access_token"]


def guardar():
    ident = input("Client ID: ").strip()
    segredo = getpass.getpass("Client secret (não aparece ao escrever): ").strip()
    if not ident or not segredo:
        sys.exit("Faltou um dos dois valores.")
    CHAVE.write_text(json.dumps({"id": ident, "segredo": segredo}), encoding="utf-8")
    CHAVE.chmod(stat.S_IRUSR | stat.S_IWUSR)
    print(f"Guardada em {CHAVE}, fora do projeto.")


def testar():
    q = urllib.parse.urlencode({"q": "Carlos Paredes", "type": "artist", "limit": 1})
    r = pedir_json(urllib.request.Request(f"https://api.spotify.com/v1/search?{q}", headers={**AGENTE, "Authorization": f"Bearer {token()}"}))
    nomes = [a["name"] for a in r["artists"]["items"]]
    print("A chave funciona:", ", ".join(nomes) or "(sem resultados)")


if __name__ == "__main__":
    {"guardar": guardar, "testar": testar}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
