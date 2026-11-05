"""Cataloga como media (dados/media/rtp-<…>.json) as fichas arquivadas do RTP Arquivos que são da Canção de Coimbra.

Não escreve informação nova: título, data e canal vêm da ficha da RTP e cada ficha cita-a literalmente.
As pessoas ligam-se só quando um nome do campo «Personalidades» (ou o nome completo de um músico, no título)
corresponde a uma, e uma só, pessoa do arquivo; nomes partilhados por várias pessoas ficam por ligar e aparecem
no relatório.

Uma ficha da RTP conta como sendo da Canção de Coimbra quando
  - o texto fala dela (CONTEXTO: canção/fado/guitarra de Coimbra, serenata, balada, Orfeon, tuna académica…), ou
  - fala de música, é sobre um músico do arquivo (o nome está no título ou na descrição e nas Personalidades)
    e a própria RTP, noutra ficha, associa esse músico à Canção de Coimbra (ex.: uma entrevista a Rui Pato).
    Aí só se liga esse músico.
Nunca altera nem apaga ficheiros que já existem. As fichas criadas ficam «rascunho».
Nunca volta a criar o que um editor retirou do catálogo (dados/excluidos.json, ver dados/ESQUEMA.md).

Uso:
    python scripts/rtp_catalogar.py --simular     # mostra o que faria, sem escrever
    python scripts/rtp_catalogar.py
Antes: python scripts/indexar.py --paginas (as citações são verificadas no índice). Depois: validar.py e construir.py
"""
import argparse
import re
from collections import Counter, defaultdict

from comum import ARQUIVO, DADOS, carregar_excluidos, chave_endereco, escrever_json, ler_json, slug
from rtp_arquivos import MUSICA, PAPEIS_MUSICA

PASTA = ARQUIVO / "web" / "rtp-arquivos"
CONTEXTO = re.compile(
    r"canç(?:ão|ões) de coimbra|fados? de coimbra|guitarras? de coimbra|baladas? de coimbra"
    r"|quinteto de coimbra|fado académico|fado estudantil"
    r"|coimbr[^\n]{0,80}(?:fado|guitarr|serenat|balad)|(?:fado|guitarr|serenat|balad)[^\n]{0,80}coimbr", re.I)
# estas só contam numa ficha que também fale de Coimbra (há serenatas, tunas, orfeões, tricanas e baladeiros noutras
# cidades: «Tricanas da Beira Mar», de Aveiro; Pedro Barroso, «o último trovador e baladeiro»). «tuna» é a palavra
# inteira: senão apanhava «fortuna» e «oportuna»
_EM_COIMBRA = r"(?:serenata|orfeon|orfeão|\btunas?\b|estudantina|grupos? de fados?|tricana|baladeir)"
# perto de «Coimbra» (até 80 caracteres, na mesma linha), como as regras de cima: «Tunas das Universidades Lusíada e
# Lusófona» num debate que noutro parágrafo fala da Académica de Coimbra não conta
CONTEXTO_EM_COIMBRA = re.compile(rf"{_EM_COIMBRA}[^\n]{{0,80}}coimbr|coimbr[^\n]{{0,80}}{_EM_COIMBRA}", re.I)
# «musicólogo» não faz de uma ficha uma ficha de música (um debate com Rui Vieira Nery)
NAO_MUSICA = re.compile(r"musicólog\w*", re.I)
# num programa de fado de Lisboa, «X na guitarra portuguesa de Coimbra» diz só o instrumento: sozinho, não conta
SO_INSTRUMENTO = re.compile(r"guitarras? portuguesas? de coimbra", re.I)
# decisão do utilizador (29-10-2026): destes cantores de Lisboa/Porto só interessa o que é de Coimbra
SO_COM_CONTEXTO = {"duarte-silva", "avelino-baptista"}
PARTICULAS = {"de", "da", "do", "dos", "das", "e"}
RADIO = re.compile(r"antena|rdp|emissora|r[aá]dio", re.I)


def chaves(nome):
    """Formas de comparar um nome: o slug, e o slug sem «de/da/do…» (RTP: «Edmundo Bettencourt»)."""
    nome = re.sub(r"\s*\(.*?\)", "", nome or "").strip()
    s = slug(nome)
    if len(s.split("-")) < 2:
        return set()
    return {s, "-".join(p for p in s.split("-") if p not in PARTICULAS)}


def indice_pessoas():
    """(chave → ids que se podem ligar, chave → ids com qualquer nome assim, músicos, pessoas que não são grupos)."""
    por_chave, todos, musicos, individuos = defaultdict(set), defaultdict(set), set(), set()
    for f in (DADOS / "pessoas").glob("*.json"):
        p = ler_json(f)
        if PAPEIS_MUSICA & set(p.get("papeis", [])):
            musicos.add(p["id"])
        if p.get("tipo") != "grupo":
            individuos.add(p["id"])
        apelido = slug(p.get("nome", "")).split("-")[-1]
        for n in [p.get("nome", "")] + [x if isinstance(x, str) else x.get("nome", "") for x in p.get("nomes_alternativos", [])]:
            for c in chaves(n):
                todos[c].add(p["id"])
                # um nome alternativo de duas palavras só serve com o mesmo apelido («Zeca Afonso», «Luís Goes»):
                # «António Sérgio» (de António Sérgio Azevedo) é, na RTP, outra pessoa
                if n == p.get("nome") or len(c.split("-")) >= 3 or c.split("-")[-1] == apelido:
                    por_chave[c].add(p["id"])
    return por_chave, todos, musicos, individuos


def personalidades(campo):
    """[(texto tal como está na ficha, {nomes a comparar})]; «Zeca Afonso (José Afonso)» dá os dois nomes."""
    saida = []
    for e in [x.strip() for x in (campo or "").split(",") if x.strip()]:
        nomes = [re.sub(r"\s*\(.*?\)", "", e).strip()] + re.findall(r"\(([^)]+)\)", e)
        saida.append((e, nomes))
    return saida


def url_canonico(u):
    return u.split("?")[0].rstrip("/") + "/"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--simular", action="store_true")
    a = ap.parse_args()

    por_chave, todos, musicos, individuos = indice_pessoas()
    # nomes completos (três palavras ou mais) de músicos, sem homónimos no arquivo: servem também no título
    sem_homonimos = {c: next(iter(ids)) for c, ids in por_chave.items() if len(todos[c]) == 1
                     and next(iter(ids)) in musicos and next(iter(ids)) in individuos}
    no_titulo = {c: i for c, i in sem_homonimos.items() if len(c.split("-")) >= 3}
    ja = {url_canonico(ler_json(f).get("url", "")) for f in (DADOS / "media").glob("*.json")}
    ids_usados = {f.stem for f in (DADOS / "media").glob("*.json")}
    retirados = {chave_endereco(x.get("url")) for x in carregar_excluidos()}  # decisão de um editor: não voltam
    n_retirados = 0

    fichas = []
    for f in sorted(PASTA.glob("*.json")):
        r = ler_json(f)
        texto = r.get("texto", "")
        ligados, ambiguos = [], []
        assunto = slug(" ".join([r["titulo"], r["ficha"].get("descricao", "")]))
        for e, nomes in personalidades(r["ficha"]["campos"].get("Personalidades")):
            ids = set().union(*[por_chave.get(c, set()) for n in nomes for c in chaves(n)]) if nomes else set()
            if ids:  # um nome que outra pessoa do arquivo também usa (mesmo como nome alternativo) fica por ligar
                ids |= set().union(*[todos.get(c, set()) for n in nomes for c in chaves(n)])
            if len(ids) == 1:
                no_assunto = any(f"-{c}-" in f"-{assunto}-" for n in nomes for c in chaves(n))
                ligados.append((e, next(iter(ids)), no_assunto))
            elif len(ids) > 1:
                ambiguos.append((e, tuple(sorted(ids))))
        titulo = f"-{slug(r['titulo'])}-"
        so_nome = slug(re.sub(r"\s+[–-]\s+.*Parte.*$", "", r["titulo"]))  # um título que é só um nome («Carlos Paredes»)
        candidatos = [*no_titulo.items(), *([(so_nome, sem_homonimos[so_nome])] if so_nome in sem_homonimos else [])]
        for c, i in candidatos:
            if f"-{c}-" in titulo and i not in {x[1] for x in ligados}:
                ligados.append((None, i, True))  # e = None: a prova é o título
        sem_instr = SO_INSTRUMENTO.sub("guitarra portuguesa", texto)
        contexto = (CONTEXTO.search(sem_instr) or CONTEXTO_EM_COIMBRA.search(sem_instr)
                    # «Latada do Direito em Coimbra», «Queima das Fitas em Coimbra»: Coimbra no título, a tuna na descrição
                    or (re.search("coimbr", r["titulo"], re.I) and re.search(_EM_COIMBRA, sem_instr, re.I)))
        fichas.append({"r": r, "doc": f"rtp-arquivos:w{f.stem}", "contexto": bool(contexto),
                       "musica": bool(re.search(MUSICA, NAO_MUSICA.sub("", texto), re.I)), "ligados": ligados, "ambiguos": ambiguos})

    # músicos que a RTP associa à Canção de Coimbra em pelo menos uma ficha
    de_coimbra = ({i for x in fichas if x["contexto"] for _, i, _ in x["ligados"]} & musicos) - SO_COM_CONTEXTO

    criadas, sem_pessoas, ligacoes, por_ligar = [], 0, Counter(), Counter()
    for x in fichas:
        r = x["r"]
        if url_canonico(r["url"]) in ja:
            continue
        if chave_endereco(r["url"]) in retirados:
            n_retirados += 1
            continue
        if x["contexto"]:
            ligados = [(e, i) for e, i, _ in x["ligados"]]
        elif x["musica"]:
            ligados = [(e, i) for e, i, assunto in x["ligados"] if assunto and i in de_coimbra]
            if not ligados:
                continue
        else:
            continue
        ligados = list(dict.fromkeys(ligados))
        pessoas = list(dict.fromkeys(i for _, i in ligados))
        campos = r["ficha"]["campos"]
        canal = campos.get("Canal", "") if campos.get("Canal", "") not in ("", "na") else ""
        ano = (r.get("data") or "")[:4]
        rotulo = ", ".join(filter(None, [canal, ano]))
        fontes = []
        descricao = (r["ficha"].get("descricao") or campos.get("Resumo Analítico") or r["titulo"]).strip()
        if len(descricao) > 400:  # a primeira frase chega para dizer o que é
            descricao = re.split(r"(?<=[.!?])\s", descricao, maxsplit=1)[0]
        fontes.append({"fonte": "rtp-arquivos", "url": r["url"], "doc": x["doc"], "citacao": descricao})
        nomes = list(dict.fromkeys(e for e, _ in ligados if e))
        if nomes:
            fontes.append({"fonte": "rtp-arquivos", "url": r["url"], "doc": x["doc"],
                           "citacao": "Personalidades: … " + " … ".join(nomes)})
        if any(e is None for e, _ in ligados) and descricao != r["titulo"]:
            fontes.append({"fonte": "rtp-arquivos", "url": r["url"], "doc": x["doc"], "citacao": r["titulo"]})
        # cortado aos 70 caracteres pode acabar em «-», e o validar.py recusa esse id (e «…--2»)
        base_id = "rtp-" + slug(r["url"].rstrip("/").rsplit("/", 1)[-1])[:70].rstrip("-")
        mid, k = base_id, 2
        while mid in ids_usados:
            mid, k = f"{base_id}-{k}", k + 1
        ids_usados.add(mid)
        m = {"id": mid, "tipo": "audio" if RADIO.search(canal) else "video", "plataforma": "rtp-arquivos",
             "url": r["url"], "titulo": f"{r['titulo']} ({rotulo})" if rotulo else r["titulo"], "data": r.get("data", ""),
             "pessoas": pessoas, "obras": [], "gravacao": "", "fontes": fontes, "estado_revisao": "rascunho"}
        criadas.append(m)
        sem_pessoas += not pessoas
        ligacoes.update(pessoas)
        por_ligar.update(x["ambiguos"])
        if not a.simular:
            escrever_json(DADOS / "media" / f"{mid}.json", m)

    print(f"{len(fichas)} fichas da RTP arquivadas; {len(criadas)} media {'a criar' if a.simular else 'criados'}"
          f" ({sem_pessoas} sem pessoas ligadas)"
          + (f"; {n_retirados} retirados do catálogo por um editor ficam de fora" if n_retirados else ""))
    print(f"Pessoas mais ligadas: {', '.join(f'{i} ({n})' for i, n in ligacoes.most_common(15))}")
    if por_ligar:
        print("Nomes por ligar (há mais de uma pessoa do arquivo com esse nome; decide quem edita):")
        for (e, ids), n in por_ligar.most_common():
            print(f"  {e} ({n}×) → {', '.join(ids)}")
    if a.simular:
        for m in criadas:
            print(f"  {m['data']} {m['titulo'][:80]} → {', '.join(m['pessoas'])}")


if __name__ == "__main__":
    main()
