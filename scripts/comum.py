"""Utilitários partilhados pelos scripts do arquivo."""
import json
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, parse_qs

RAIZ = Path(__file__).resolve().parent.parent
FONTES = RAIZ / "fontes" / "fontes.json"
ARQUIVO = RAIZ / "arquivo"
INDICE = ARQUIVO / "indice.sqlite"
DADOS = RAIZ / "dados"
SITE_DADOS = RAIZ / "site" / "dados"

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except AttributeError:
        pass


def ler_json(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def escrever_json(caminho, dados):
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.write("\n")


def carregar_fontes():
    return {f["id"]: f for f in ler_json(FONTES)["fontes"]}


def slug(texto):
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def valores(filtro):
    """Valores escolhidos num filtro: «a,b» (como vem do site) ou uma lista. Vazio = sem filtro."""
    if not filtro:
        return []
    return [v.strip() for v in (filtro.split(",") if isinstance(filtro, str) else filtro) if v and v.strip()]


def em(coluna, lista):
    """Condição SQL «coluna IN (?, …)» para os valores de um filtro."""
    return f"{coluna} IN ({', '.join('?' * len(lista))})"


def normalizar(texto):
    """Forma canónica para comparar citações com o texto arquivado."""
    t = unicodedata.normalize("NFC", texto or "").lower()
    t = re.sub(r"[“”«»„\"]", '"', t)
    t = re.sub(r"[‘’`´]", "'", t)
    t = re.sub(r"[–—‒−]", "-", t)
    t = t.replace(" ", " ").replace("​", "")
    return re.sub(r"\s+", " ", t).strip()


def citacao_presente(citacao, texto_normalizado):
    """A citação (ou cada troço separado por '...' / '[…]') aparece, por ordem, no texto."""
    partes = [p.strip() for p in re.split(r"\.\.\.|…|\[\s*\.\.\.\s*\]|\[…\]", normalizar(citacao))]
    pos = 0
    for p in filter(None, partes):
        i = texto_normalizado.find(p, pos)
        if i < 0:
            return False
        pos = i + len(p)
    return True


# ---------------------------------------------------------------- media

RE_YOUTUBE = re.compile(
    r"(?:youtube(?:-nocookie)?\.com/(?:embed/|v/|watch\?(?:[^\"'\s]*&(?:amp;)?)?v=|shorts/)|youtube\.googleapis\.com/v/|youtu\.be/)"
    r"([A-Za-z0-9_-]{11})"
)
RE_MUSESCORE = re.compile(r"musescore\.com/(?:user/(\d+)/)?scores/(\d+)")
RE_DAILYMOTION = re.compile(r"dailymotion\.com/(?:embed/)?video/([a-z0-9]+)", re.I)
RE_FACEBOOK = re.compile(r"facebook\.com/(?:video\.php\?v=(\d+)|[^/?]+/videos/(?:[^/?]+/)?(\d+)|watch/?\?v=(\d+))")
RE_VIMEO = re.compile(r"vimeo\.com/(?:video/)?(\d{5,})")
RE_SPOTIFY = re.compile(r"open\.spotify\.com/(?:embed/)?(track|album|playlist|artist|episode)/([A-Za-z0-9]{22})")
RE_IMAGEM = re.compile(r"\.(?:jpe?g|png|gif|webp)(?:$|\?)", re.I)
RE_AUDIO = re.compile(r"\.(?:mp3|ogg|wav|m4a)(?:$|\?)", re.I)
RE_URL_TEXTO = re.compile(r"https?://[^\s<>\"')\]]+")


def classificar_url(url, origem):
    """Devolve dict com tipo/plataforma/id do media, ou None se não for media reconhecido."""
    if not url or url.startswith(("javascript:", "mailto:", "#")):
        return None
    if url.startswith("//"):
        url = "https:" + url
    m = RE_YOUTUBE.search(url)
    if m:
        return {"tipo": "video", "plataforma": "youtube", "chave": m.group(1),
                "url": f"https://www.youtube.com/watch?v={m.group(1)}"}
    m = RE_VIMEO.search(url)
    if m:
        return {"tipo": "video", "plataforma": "vimeo", "chave": m.group(1),
                "url": f"https://vimeo.com/{m.group(1)}"}
    m = RE_SPOTIFY.search(url)
    if m:
        return {"tipo": "audio", "plataforma": "spotify", "chave": f"{m.group(1)}/{m.group(2)}",
                "url": f"https://open.spotify.com/{m.group(1)}/{m.group(2)}"}
    m = RE_MUSESCORE.search(url)
    if m:
        base = f"https://musescore.com/user/{m.group(1)}/scores/{m.group(2)}" if m.group(1) else f"https://musescore.com/score/{m.group(2)}"
        return {"tipo": "partitura", "plataforma": "musescore", "chave": m.group(2), "url": base}
    m = RE_DAILYMOTION.search(url)
    if m:
        return {"tipo": "video", "plataforma": "dailymotion", "chave": m.group(1).split("_")[0],
                "url": f"https://www.dailymotion.com/video/{m.group(1).split('_')[0]}"}
    m = RE_FACEBOOK.search(url)
    if m:
        vid = next(g for g in m.groups() if g)
        return {"tipo": "video", "plataforma": "facebook", "chave": vid, "url": f"https://www.facebook.com/watch/?v={vid}"}
    host = urlparse(url).netloc.lower()
    if host.endswith("arquivosonoro.museudofado.pt") and RE_AUDIO.search(url):
        return {"tipo": "audio", "plataforma": "museu-do-fado", "chave": url.rsplit("/", 1)[-1].split("?")[0], "url": url}
    if host.endswith("music.apple.com"):
        caminho = urlparse(url).path.strip("/")
        consulta = parse_qs(urlparse(url).query).get("i", [""])[0]
        return {"tipo": "audio", "plataforma": "apple-music", "chave": caminho + (f"?i={consulta}" if consulta else ""),
                "url": url.split("#")[0]}
    if "blogger.com" in host and "video.g" in url:
        token = parse_qs(urlparse(url).query).get("token", [""])[0]
        return {"tipo": "video", "plataforma": "blogger", "chave": token[:60] or url, "url": url}
    if host.endswith("arquivos.rtp.pt") and "/conteudos/" in url:
        return {"tipo": "video", "plataforma": "rtp-arquivos", "chave": url.split("?")[0].rstrip("/"),
                "url": url.split("?")[0]}
    if host.endswith("rtp.pt") and "/play/" in url:
        return {"tipo": "video", "plataforma": "rtp-play", "chave": url.split("?")[0].rstrip("/"),
                "url": url.split("?")[0]}
    if host.endswith("soundcloud.com"):
        return {"tipo": "audio", "plataforma": "soundcloud", "chave": url.split("?")[0], "url": url}
    if host.endswith("archive.org") and ("/details/" in url or "/embed/" in url):
        ident = re.split(r"/(?:details|embed)/", url, 1)[1].split("/")[0].split("?")[0]
        return {"tipo": "audio", "plataforma": "internet-archive", "chave": ident,
                "url": f"https://archive.org/details/{ident}"}
    if RE_AUDIO.search(url):
        return {"tipo": "audio", "plataforma": "ficheiro", "chave": url, "url": url}
    if origem == "img" or (origem == "a" and RE_IMAGEM.search(url)
                           and ("blogspot.com" in host or "googleusercontent.com" in host)):
        return {"tipo": "imagem", "plataforma": "imagem", "chave": url, "url": url}
    return None


class _Conversor(HTMLParser):
    BLOCOS = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table", "hr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.partes = []
        self.tamanho = 0
        self.media = []
        self._ignorar = 0
        self._link_img = None

    def _escrever(self, s):
        self.partes.append(s)
        self.tamanho += len(s)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style"):
            self._ignorar += 1
            return
        if tag in self.BLOCOS:
            self._escrever("\n")
        url, origem = None, tag
        if tag in ("iframe", "embed", "audio", "source", "video"):
            url = a.get("src")
        elif tag == "param" and (a.get("name") or "").lower() in ("movie", "src"):
            url = a.get("value")
        elif tag == "object":
            url = a.get("data")
        elif tag == "a":
            url = a.get("href")
            if url and RE_IMAGEM.search(url):
                self._link_img = url
        elif tag == "img":
            url = a.get("src")
            if self._link_img:  # imagem embrulhada num link para a versão grande
                url = self._link_img
        if url:
            m = classificar_url(url.strip(), origem)
            if m:
                if tag == "img":
                    m["legenda"] = (a.get("alt") or a.get("title") or "").strip()
                m["pos"] = self.tamanho
                self.media.append(m)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._ignorar = max(0, self._ignorar - 1)
        elif tag == "a":
            self._link_img = None
        elif tag in self.BLOCOS:
            self._escrever("\n")

    def handle_data(self, data):
        if self._ignorar:
            return
        for u in RE_URL_TEXTO.finditer(data):  # links escritos como texto simples
            m = classificar_url(u.group(0), "texto")
            if m:
                m["pos"] = self.tamanho + u.start()
                self.media.append(m)
        self._escrever(data)


def html_para_texto(html):
    """Converte o HTML de um post em texto limpo e lista de media com o texto à volta."""
    c = _Conversor()
    try:
        c.feed((html or "").replace("\\/", "/"))  # alguns posts têm URLs com barras escapadas
        c.close()
    except Exception:
        pass
    bruto = "".join(c.partes)
    # o texto final é compactado; recalcular contexto no texto bruto
    media, vistos = [], set()
    for m in c.media:
        chave = (m["plataforma"], m["chave"])
        if chave in vistos:
            continue
        vistos.add(chave)
        p = m.pop("pos")
        antes = re.sub(r"\s+", " ", bruto[max(0, p - 400):p]).strip()[-220:]
        depois = re.sub(r"\s+", " ", bruto[p:p + 400]).strip()[:220]
        m["contexto_antes"], m["contexto_depois"] = antes, depois
        media.append(m)
    texto = bruto.replace(" ", " ")
    texto = re.sub(r"[ \t\r\f\v]+", " ", texto)
    texto = re.sub(r" *\n *", "\n", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto).strip()
    return texto, media
