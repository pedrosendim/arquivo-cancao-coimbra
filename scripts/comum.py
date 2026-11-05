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


def escrever_json(caminho, dados, compacto=False):
    """Grava de uma só vez: escreve <ficheiro>.<processo>.tmp e troca-o pelo antigo (os.replace é atómico, também no
    Windows). Quem o ler a meio (o site, outro script) vê a versão antiga ou a nova, nunca um JSON cortado.
    compacto: sem indentação nem espaços (para o site/dados/base.json, que só o browser lê)."""
    import os
    import threading
    import time
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    texto = (json.dumps(dados, ensure_ascii=False, separators=(",", ":")) if compacto
             else json.dumps(dados, ensure_ascii=False, indent=2)) + "\n"
    tmp = caminho.with_name(f"{caminho.name}.{os.getpid()}-{threading.get_ident()}.tmp")  # *.tmp está no .gitignore
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)
    for _ in range(10):
        try:
            os.replace(tmp, caminho)
            return
        except PermissionError:  # no Windows, o destino aberto noutro processo (o servidor a enviá-lo, o OneDrive) bloqueia a troca
            time.sleep(0.1)
    tmp.unlink(missing_ok=True)  # continua bloqueado: escreve por cima, como antes
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)


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


def trocos(citacao):
    """Troços normalizados de uma citação, separados por '...' / '…' / '[…]'. As aspas e os espaços nas pontas de cada
    troço não contam: quem copia uma frase põe-na muitas vezes entre «» ou "", e o documento não as tem. A frase guardada
    fica como foi escrita; isto só muda a comparação."""
    partes = re.split(r"\.\.\.|…|\[\s*\.\.\.\s*\]|\[…\]", normalizar(citacao))
    return [p for p in (x.strip(" \"'") for x in partes) if p]


RE_PALAVRA = re.compile(r"[^\W_]")  # uma letra ou um algarismo


def troco_em_falta(citacao, texto_normalizado):
    """None se a citação aparece no texto (cada troço, por ordem). Senão, (troço que falta, início desse troço que
    ainda aparece no texto): mostra a quem copiou onde a frase deixa de bater com o documento. Uma citação sem
    palavras (só aspas, reticências ou pontuação: «», "", …) nunca aparece: sem palavras não há prova."""
    partes = trocos(citacao)
    if not any(RE_PALAVRA.search(p) for p in partes):
        return normalizar(citacao), ""
    pos = 0
    for p in partes:
        i = texto_normalizado.find(p, pos)
        if i < 0:
            bate, n = 0, len(p)  # o início mais comprido que ainda aparece (se um início aparece, os mais curtos também)
            while bate < n:
                m = (bate + n + 1) // 2
                if texto_normalizado.find(p[:m], pos) >= 0:
                    bate = m
                else:
                    n = m - 1
            return p, p[:bate]
        pos = i + len(p)
    return None


def citacao_presente(citacao, texto_normalizado):
    """A citação (ou cada troço separado por '...' / '[…]') aparece, por ordem, no texto."""
    return troco_em_falta(citacao, texto_normalizado) is None


# o que normalizar() junta num só carácter: para voltar a encontrar um troço normalizado na frase original
IGUAIS = {'"': "[“”«»„\"]", "'": "[‘’`´']", "-": "[–—‒−-]"}


def troco_escrito(frase, normalizado):
    """Um troço na forma normalizada (de normalizar()) tal como está escrito na frase: com as maiúsculas, os acentos e
    as aspas de quem a copiou. Se não se encontrar, fica o normalizado."""
    n = (normalizado or "").strip()
    if not n:
        return ""
    padrao = "".join(r"\s+" if ch == " " else IGUAIS.get(ch, re.escape(ch)) for ch in n)
    m = re.search(padrao, unicodedata.normalize("NFC", frase or "").replace("​", ""), re.I)
    return re.sub(r"\s+", " ", m.group(0)) if m else n


def onde_diverge(frase, falta):
    """Onde a frase deixa de bater com o documento (falta: o que troco_em_falta devolve), em palavras inteiras e como
    foi escrita: (o que bate, o que vem a seguir). O que bate fica vazio se nem a primeira palavra do troço bate."""
    troco, bate = falta
    if bate and len(bate) < len(troco) and RE_PALAVRA.match(bate[-1]) and RE_PALAVRA.match(troco[len(bate)]):
        bate = bate[:bate.rfind(" ") + 1]  # cortou uma palavra a meio: fica só até à anterior
    certo = bate.strip()
    return troco_escrito(frase, certo), troco_escrito(frase, troco[len(certo):])


# endereço de uma citação → documento arquivado (mesmas regras que api_doc no servidor.py)
RE_BLOGSPOT_PAIS = re.compile(r"\.blogspot\.(?!com/)[a-z]{2,3}(?:\.[a-z]{2})?/")
RE_RASTREIO = re.compile(r"(?:utm_\w+|fbclid|gclid)(?:=|$)")
CAMPOS_DOC = ("doc_id", "tipo", "fonte", "url", "titulo", "texto")


def sem_rastreio(url):
    """O endereço sem «#…» e sem os parâmetros de rastreio (utm_…, fbclid, gclid), que não mudam a página."""
    caminho, _, consulta = url.split("#", 1)[0].partition("?")
    params = [p for p in consulta.split("&") if p and not RE_RASTREIO.match(p)]
    return caminho + ("?" + "&".join(params) if params else "")


def url_do_post(url):
    """Endereço de um post do Blogger tal como está no arquivo (https, .blogspot.com, sem «?…» nem «#…»), ou None se
    não for do Blogger. Serve para o endereço copiado no telemóvel («?m=1»), num comentário ou no domínio do país."""
    u = "https://" + (url or "").strip().split("://", 1)[-1]
    u = u.split("#", 1)[0].split("?", 1)[0]
    partes = u.split("/")
    if len(partes) < 4 or ".blogspot." not in partes[2].lower():
        return None
    return RE_BLOGSPOT_PAIS.sub(".blogspot.com/", u)


def procurar_documento(db, doc=None, url=None):
    """O documento arquivado de uma citação, como dicionário (CAMPOS_DOC), ou None se não estiver no índice.
    Procura pelo doc_id e depois pelo endereço: tal como está (em http ou https), sem rastreio e, nos blogues, o post
    (ou o comentário «#c…») pelo endereço limpo de url_do_post. O endereço de um comentário do Blogger («#c<número>»,
    com ou sem «?showComment=…») só dá esse comentário, nunca o post: a frase é do comentário, e no post daria um erro
    falso. Se o comentário não estiver no índice, fica por arquivar (None)."""
    pedidos = [("doc_id = ?", (doc,))] if doc else []
    u = (url or "").strip()
    if u:
        post = url_do_post(u)
        comentario = re.search(r"#c(\d+)$", u) if post else None
        for x in dict.fromkeys([u] if comentario else [u, sem_rastreio(u)]):  # sem o «#c…», seria o endereço do post
            resto = x.split("://", 1)[-1]
            pedidos.append(("url IN (?, ?)", ("https://" + resto, "http://" + resto)))
        if post:
            p = (post, "http://" + post.split("://", 1)[1])
            if comentario:
                pedidos.append(("tipo = 'comentario' AND post_url IN (?, ?) AND doc_id LIKE ?",
                                p + (f"%:c{comentario.group(1)}",)))
            elif "showComment=" not in u:  # sem o número do comentário não se sabe qual é: o post não serve
                pedidos.append(("tipo = 'post' AND url IN (?, ?)", p))
    for onde, args in pedidos:
        linha = db.execute(f"SELECT {', '.join(CAMPOS_DOC)} FROM docs WHERE {onde}", args).fetchone()
        if linha:
            return dict(zip(CAMPOS_DOC, linha))
    return None


def texto_verificavel(d):
    """Texto normalizado de um documento (o título e o texto) onde se procuram as citações."""
    return normalizar((d["titulo"] or "") + "\n" + (d["texto"] or ""))


# media retirados do catálogo por quem edita (ver dados/ESQUEMA.md): os scripts de catálogo nunca os voltam a criar
EXCLUIDOS = DADOS / "excluidos.json"


def carregar_excluidos():
    """Entradas {url, motivo, por, em} de dados/excluidos.json (lista vazia se o ficheiro não existir)."""
    return ler_json(EXCLUIDOS).get("media", []) if EXCLUIDOS.exists() else []


def chave_endereco(url):
    """Chave para saber se dois endereços são o mesmo vídeo, áudio ou página: a do leitor (plataforma|id) quando se
    conhece; senão, o endereço sem rastreio nem «/» no fim. Em https, para http e https darem o mesmo."""
    u = (url or "").strip()
    m = classificar_url(u, "a")
    chave = f"{m['plataforma']}|{m['chave']}" if m else sem_rastreio(u).rstrip("/")
    return chave.replace("http://", "https://", 1)


# ---------------------------------------------------------------- media

RE_YOUTUBE = re.compile(
    r"(?:youtube(?:-nocookie)?\.com/(?:embed/|v/|watch\?(?:[^\"'\s]*&(?:amp;)?)?v=|shorts/|live/)|youtube\.googleapis\.com/v/|youtu\.be/)"
    r"([A-Za-z0-9_-]{11})"
)
RE_MUSESCORE = re.compile(r"musescore\.com/(?:user/(\d+)/)?scores/(\d+)")
RE_DAILYMOTION = re.compile(r"dailymotion\.com/(?:embed/)?video/([a-z0-9]+)", re.I)
RE_FACEBOOK = re.compile(r"facebook\.com/(?:video\.php\?v=(\d+)|[^/?]+/videos/(?:[^/?]+/)?(\d+)|watch/?\?v=(\d+))")
RE_VIMEO = re.compile(r"vimeo\.com/(?:video/)?(\d{5,})")
RE_SPOTIFY = re.compile(r"open\.spotify\.com/(?:intl-[a-z-]+/)?(?:embed/)?(track|album|playlist|artist|episode)/([A-Za-z0-9]{22})")
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
    # vídeo carregado no Blogger: só o leitor do próprio Blogger (espelha classificar() em site/js/util.js)
    if host in ("www.blogger.com", "blogger.com") and urlparse(url).path == "/video.g":
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
