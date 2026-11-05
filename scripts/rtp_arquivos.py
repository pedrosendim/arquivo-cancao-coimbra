"""Recolha dirigida do RTP Arquivos (fonte aprovada) a partir do sitemap público do site.

O robots.txt do RTP Arquivos permite o acesso. Usamos um identificador honesto e pausas entre pedidos.
Guarda-se só a ficha descritiva (título, data, descrição, personalidades, resumo…); o vídeo vê-se
sempre no site da RTP, como pedem os termos de utilização.

Uso:
    python scripts/rtp_arquivos.py sitemap                       # lista de conteúdos e pessoas (cache local)
    python scripts/rtp_arquivos.py procurar coimbra guitarra     # endereços que contêm todas as palavras
    python scripts/rtp_arquivos.py recolher --termos "coimbra fado" "serenata coimbra"
    python scripts/rtp_arquivos.py recolher https://arquivos.rtp.pt/conteudos/xyz/
    python scripts/rtp_arquivos.py pessoa carlos-paredes         # todos os conteúdos ligados a uma personalidade
    python scripts/rtp_arquivos.py pesquisar '"canção de coimbra"' serenata   # pela pesquisa do site (procura nas descrições)
    python scripts/rtp_arquivos.py pesquisar --temas --pessoas-do-arquivo     # os temas da Canção de Coimbra e cada músico do arquivo
Depois: python scripts/indexar.py --paginas e python scripts/rtp_catalogar.py
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

from comum import ARQUIVO, DADOS, ler_json, slug
from recolher_blogger import AGENTE

BASE = "https://arquivos.rtp.pt"
PASTA = ARQUIVO / "web" / "rtp-arquivos"
CACHE = ARQUIVO / "rtp-sitemap.json"
PESQUISAS = ARQUIVO / "rtp-pesquisas.json"  # o que cada pesquisa devolveu (para não repetir pedidos)
FORA = ARQUIVO / "rtp-fora-do-tema.json"  # páginas já lidas e postas de parte pelo filtro
PAUSA = 1.2
# pesquisas dos temas da Canção de Coimbra (a pesquisa do site exige todas as palavras; aspas = expressão)
TEMAS = ['"canção de coimbra"', '"canções de coimbra"', '"fado de coimbra"', '"fados de coimbra"', '"guitarra de coimbra"',
         '"guitarra portuguesa" coimbra', 'guitarrada coimbra', 'serenata coimbra', '"serenata monumental"',
         '"balada de coimbra"', 'baladas coimbra', 'baladeiros', 'tricana', '"orfeon académico"', 'orfeon coimbra',
         '"tuna académica"', 'estudantina coimbra', '"quinteto de coimbra"', '"antigos orfeonistas"',
         '"grupo de fados"', '"fado académico"', '"queima das fitas" fado', '"capa e batina"',
         '"antigos estudantes de coimbra"', '"fado estudantil"', 'fado coimbra entrevista', 'guitarra coimbra entrevista']
# filtro por omissão do comando «pesquisar»: só se guardam fichas que falem de música
MUSICA = (r"fado|guitarr|serenat|balad|tricana|orfeon|tuna|estudantin|cant[oa]r|cantad|cantig|canç|músic|music|"
          r"poet|poesia|disco|concerto|recital|espect[aá]culo|espet[aá]culo|viola")
PAPEIS_MUSICA = {"cantor", "guitarrista", "violista", "compositor", "agrupamento", "letrista", "poeta", "luthier"}
CAMPOS = ["Nome do Programa", "Nome da série", "Locais", "Personalidades", "Temas", "Canal", "Tipo de conteúdo",
          "Cor", "Som", "Relação do aspeto", "Resumo Analítico"]


def obter(url, tentativas=3):
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429):
                sys.exit(f"HTTP {e.code} em {url}: o site recusou. Parar (não contornar).")
            if e.code == 404:  # o WordPress do RTP serve parte dos sitemaps com 404, mas com a lista completa
                corpo = e.read().decode("utf-8", errors="replace")
                return corpo if "<urlset" in corpo else None
            time.sleep(5 * (i + 1))
        except (urllib.error.URLError, TimeoutError):
            time.sleep(5 * (i + 1))
    return None


def locs(xml):
    return re.findall(r"<loc>([^<]+)</loc>", xml or "")


def cmd_sitemap(_):
    indice = locs(obter(f"{BASE}/wp-sitemap.xml"))
    dados = {"conteudos": [], "pessoas": [], "obtido_em": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    for i, sm in enumerate(indice):
        tipo = "conteudos" if "posts-content" in sm else "pessoas" if "taxonomies-person" in sm else None
        if not tipo:
            continue
        dados[tipo] += locs(obter(sm))
        print(f"  {i + 1}/{len(indice)} {sm.rsplit('/', 1)[-1]}: {len(dados['conteudos'])} conteúdos, {len(dados['pessoas'])} pessoas")
        time.sleep(PAUSA)
    CACHE.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    print(f"Guardado: {len(dados['conteudos'])} conteúdos e {len(dados['pessoas'])} pessoas")


def cache():
    if not CACHE.exists():
        sys.exit("Corra primeiro: python scripts/rtp_arquivos.py sitemap")
    return json.loads(CACHE.read_text(encoding="utf-8"))


def filtrar(urls, termo):
    palavras = slug(termo).split("-")
    return [u for u in urls if all(p in u.rstrip("/").rsplit("/", 1)[-1].split("-") for p in palavras)]


def ficha(url, pagina):
    """Extrai a ficha descritiva de uma página de conteúdo."""
    i = pagina.find('class="entry-main"')
    bloco = pagina[i:pagina.find("</main>", i)] if i >= 0 else pagina
    bloco = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", bloco, flags=re.S)
    linhas = [l.strip() for l in html_lib.unescape(re.sub(r"<[^>]+>", "\n", bloco)).splitlines()]
    linhas = [l for l in linhas if l and not l.startswith('class="')]
    corte = next((k for k, l in enumerate(linhas) if l.startswith("Termos e condições")), len(linhas))
    linhas = linhas[:corte]
    titulo = re.search(r'<meta property="og:title" content="([^"]*)"', pagina)
    descricao = re.search(r'<meta property="og:description" content="([^"]*)"', pagina)
    imagem = re.search(r'<meta property="og:image" content="([^"]*)"', pagina)
    reg = {"titulo": html_lib.unescape(titulo.group(1)) if titulo else (linhas[0] if linhas else url),
           "descricao": html_lib.unescape(descricao.group(1)) if descricao else "", "campos": {},
           "imagem": imagem.group(1) if imagem else ""}
    datas = [l for l in linhas[:6] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", l)]
    duracao = [l for l in linhas[:6] if re.fullmatch(r"\d{2}:\d{2}:\d{2}", l)]
    reg["data"] = datas[0] if datas else ""
    reg["duracao"] = duracao[0] if duracao else ""
    for k, l in enumerate(linhas):
        nome = l.rstrip(":").strip()
        if nome in CAMPOS and k + 1 < len(linhas) and linhas[k + 1].rstrip(":").strip() not in CAMPOS:
            reg["campos"][nome] = linhas[k + 1]
    return reg


def lista_json(caminho):
    return json.loads(caminho.read_text(encoding="utf-8")) if caminho.exists() else {}


def arquivar(url, filtro=None):
    url = url.split("?")[0]
    destino = PASTA / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".json")
    if destino.exists():
        return "já"
    fora = lista_json(FORA)
    if filtro and fora.get(url) == filtro:
        return "já"  # lida antes e posta de parte com este mesmo filtro
    pagina = obter(url)
    if not pagina:
        return "falhou"
    f = ficha(url, pagina)
    if filtro and not re.search(filtro, " ".join([f["titulo"], f["descricao"], *f["campos"].values()]), re.I):
        fora[url] = filtro
        FORA.write_text(json.dumps(fora, ensure_ascii=False), encoding="utf-8")
        return "fora do tema"
    texto = "\n".join([f"Título: {f['titulo']}", f"Data: {f['data']}", f"Duração: {f['duracao']}",
                       f"Descrição: {f['descricao']}"] + [f"{k}: {v}" for k, v in f["campos"].items()])
    registo = {"url": url, "fonte": "rtp-arquivos", "titulo": f["titulo"], "data": f["data"],
               "obtido_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), "metodo": "automatico",
               "ficha": f, "texto": texto,
               "html": "<p>" + "</p><p>".join(html_lib.escape(l) for l in texto.splitlines()) + "</p>"}
    PASTA.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(registo, ensure_ascii=False, indent=1), encoding="utf-8")
    return f"{f['data']} {f['titulo'][:70]}"


def cmd_procurar(a):
    c = cache()
    alvo = c["pessoas"] if a.pessoas else c["conteudos"]
    res = filtrar(alvo, " ".join(a.palavras))
    print(f"{len(res)} endereços")
    for u in res[: a.limite]:
        print(" ", u)


def cmd_recolher(a):
    urls = list(a.urls)
    if a.termos:
        c = cache()
        for t in a.termos:
            urls += filtrar(c["conteudos"], t)
    urls = list(dict.fromkeys(urls))
    print(f"{len(urls)} páginas a arquivar")
    for k, u in enumerate(urls, 1):
        r = arquivar(u, getattr(a, "filtro", None))
        print(f"  {k}/{len(urls)} {r}")
        if r != "já":
            time.sleep(PAUSA)


def conteudos_de(pagina):
    return sorted(set(re.findall(r'href="(https://arquivos\.rtp\.pt/conteudos/[^"#?]+)"', pagina or "")))


def pesquisa(termo, max_paginas):
    """Conteúdos que a pesquisa do site devolve para `termo` (até `max_paginas` de 12) e o total de páginas."""
    urls, n, total = [], 1, 1
    while n <= min(total, max_paginas):
        pagina = obter(f"{BASE}/{f'page/{n}/' if n > 1 else ''}?s={urllib.parse.quote_plus(termo)}")
        if n == 1:
            m = re.search(r"Página\s+\d+\s+de\s+(\d+)", pagina or "")
            total = int(m.group(1)) if m else 1
        urls += [u for u in conteudos_de(pagina) if u not in urls]
        n += 1
        time.sleep(PAUSA)
    return urls, total


def nomes_do_arquivo():
    """Nomes (com duas palavras ou mais) dos músicos, poetas, luthiers e grupos de dados/pessoas."""
    nomes = []
    for f in sorted((DADOS / "pessoas").glob("*.json")):
        p = ler_json(f)
        if not PAPEIS_MUSICA & set(p.get("papeis", [])):
            continue
        for n in [p.get("nome", "")] + [x if isinstance(x, str) else x.get("nome", "") for x in p.get("nomes_alternativos", [])]:
            n = re.sub(r"\s*\(.*?\)", "", n or "").strip()
            if len(n.split()) >= 2 and n not in nomes:
                nomes.append(n)
    return nomes


def cmd_pesquisar(a):
    feitas = lista_json(PESQUISAS)
    termos = list(a.termos) + (TEMAS if a.temas else []) + [f'"{n}"' for n in (nomes_do_arquivo() if a.pessoas_do_arquivo else [])]
    urls = []
    termos = list(dict.fromkeys(termos))
    for k, t in enumerate(termos, 1):
        if t not in feitas or a.de_novo:
            usado = t
            achados, paginas = pesquisa(t, a.max_paginas)
            if paginas > a.max_paginas and t.startswith('"') and t.endswith('"'):  # nome muito comum: só com Coimbra
                usado = f"{t} coimbra"
                achados, paginas = pesquisa(usado, a.max_paginas)
            feitas[t] = {"pesquisa": usado, "urls": achados, "paginas": paginas,
                         "em": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            PESQUISAS.write_text(json.dumps(feitas, ensure_ascii=False, indent=0), encoding="utf-8")
            print(f"  {k}/{len(termos)} {usado}: {len(achados)} conteúdos ({paginas} pág.)")
        urls += [u for u in feitas[t]["urls"] if u not in urls]
    if a.so_listar:
        print(f"{len(urls)} conteúdos encontrados")
        return
    a.urls, a.termos, a.filtro = urls, None, a.filtro or MUSICA
    cmd_recolher(a)


def cmd_pessoa(a):
    c = cache()
    alvos = [u for u in c["pessoas"] if u.rstrip("/").rsplit("/", 1)[-1] == a.slug] or filtrar(c["pessoas"], a.slug)
    if not alvos:
        sys.exit("Personalidade não encontrada no sitemap. Experimente: rtp_arquivos.py procurar --pessoas <nome>")
    for p in alvos:
        urls, pagina, n = [], p, 1
        while pagina and n <= 30:
            h = obter(pagina)
            novos = conteudos_de(h)
            if not novos or set(novos) <= set(urls):
                break
            urls += [u for u in novos if u not in urls]
            n += 1
            pagina = p.rstrip("/") + f"/page/{n}/"
            time.sleep(PAUSA)
        print(f"{p}: {len(urls)} conteúdos")
        a.urls, a.termos = urls, None
        cmd_recolher(a)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("sitemap")
    p = sub.add_parser("procurar"); p.add_argument("palavras", nargs="+"); p.add_argument("--pessoas", action="store_true")
    p.add_argument("--limite", type=int, default=60)
    r = sub.add_parser("recolher"); r.add_argument("urls", nargs="*"); r.add_argument("--termos", nargs="+")
    r.add_argument("--filtro", help="expressão regular: só guarda fichas cujo texto lhe corresponda")
    pe = sub.add_parser("pessoa"); pe.add_argument("slug")
    ps = sub.add_parser("pesquisar"); ps.add_argument("termos", nargs="*")
    ps.add_argument("--temas", action="store_true", help="as pesquisas dos temas da Canção de Coimbra (TEMAS)")
    ps.add_argument("--pessoas-do-arquivo", action="store_true", help="o nome de cada músico, poeta, luthier e grupo")
    ps.add_argument("--max-paginas", type=int, default=15, help="nomes com mais páginas pesquisam-se com «coimbra»")
    ps.add_argument("--filtro", help="expressão regular (por omissão, só fichas que falem de música)")
    ps.add_argument("--de-novo", action="store_true", help="repetir pesquisas já feitas")
    ps.add_argument("--so-listar", action="store_true")
    a = ap.parse_args()
    {"sitemap": cmd_sitemap, "procurar": cmd_procurar, "recolher": cmd_recolher, "pessoa": cmd_pessoa,
     "pesquisar": cmd_pesquisar}[a.cmd](a)


if __name__ == "__main__":
    main()
