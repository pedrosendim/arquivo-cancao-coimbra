// Peças de interface reutilizadas por várias vistas.
import { E, CAMPOS, vida, iniciais, catalogado, comArquivo, parentescoDe, nomeContribuidor, fonteNome } from './estado.js';
import { seloPapel } from './icones.js';
import { html, raw, esc, miniatura, capaMedia, classificar, NOME_PLATAFORMA, fmtData, tituloDoc, partituraEmbed, estiloRecorte } from './util.js';
import { itemDoArquivo } from './leitor.js';
import { marcas } from './citacoes.js';
import { notaEditorial, marcaEditorial, acoesMedia, botaoCatalogar } from './formularios.js';
import { notasDoFacto } from './notas.js';
// media (P4): o mesmo vídeo em várias fichas, discos, ligações seguras e o que não toca aqui
import { catalogadosDe, chaveMedia, dataMedia, anoDoDisco, visivel, FORMATOS } from './estado.js';
import { enderecoSeguro, compararPt } from './util.js';
import { tocaAqui } from './leitor.js';
import { nomeAmbiguo, relacaoDistintiva } from './estado.js'; // músicos com o mesmo nome (ou um só): a relação que os distingue

/** Tabela de factos agrupados por campo; só os factos em conflito ficam na caixa «As fontes divergem».
 *  Com `editar` («pessoas/<id>», «obras/<id>»… ou só o id de uma pessoa), cada facto ganha o botão ✎ para uma nota
 *  assinada, e os acrescentados no modo de edição o botão × para os retirar. */
export function tabelaFactos(factos, { editar } = {}) {
  if (editar && !editar.includes('/')) editar = `pessoas/${editar}`;
  const deContribuidor = (f) => f.editorial || (f.fontes?.length && f.fontes.every((c) => c.acrescentada));
  if (!factos?.length) return '';
  const grupos = {};
  for (const f of factos) (grupos[f.campo] ||= []).push(f);
  const ordem = Object.keys(CAMPOS);
  const posicao = (c) => { const k = ordem.indexOf(c); return k < 0 ? ordem.length : k; };
  const linha = (f) => html`<div>${f.valor}${marcas(f.fontes)}${marcaEditorial(f.editorial, 'Testemunho dado')}${f.nota ? html` <span class="nota-agente" title="Nota do agente, não é facto">nota: ${f.nota}</span>` : ''}${notaEditorial(f.nota_editorial)}${notasDoFacto(f, editar && { alvo: editar, facto: factos.indexOf(f) })}
    ${editar ? html`<button class="botao-nota" data-acao="nota-facto" data-alvo="${editar}" data-indice="${factos.indexOf(f)}" data-valor-facto="${f.valor}" data-pedir-campo="texto"
      data-valor="${f.nota_editorial?.texto || ''}" data-pedir="Nota sobre este facto (ex.: qual das versões lhe parece certa e porquê). Fica assinada; apague o texto para a retirar."
      title="Acrescentar uma nota assinada a este facto">✎</button>
      ${deContribuidor(f) ? html`<button class="botao-nota" data-acao="retirar-facto" data-alvo="${editar}" data-indice="${factos.indexOf(f)}" data-valor="${f.valor}"
        data-confirmar="Retirar este facto?" title="Retirar (só factos acrescentados no modo de edição)">×</button>` : ''}` : ''}</div>`;
  // um campo com muitos factos sem conflito mostra os 4 primeiros e «mais N» (nunca no modo de edição);
  // as versões que divergem ficam sempre todas à vista, para nenhuma parecer a escolhida
  const ver = editar ? Infinity : 4;
  return html`<table class="factos"><tbody>${Object.keys(grupos).sort((a, b) => posicao(a) - posicao(b)).map((c) => {
    const certos = grupos[c].filter((f) => !f.conflito), divergentes = grupos[c].filter((f) => f.conflito);
    const recolher = certos.length > ver + 1;
    return html`<tr id="facto-${c}"><th>${CAMPOS[c] || c}</th><td>${(recolher ? certos.slice(0, ver) : certos).map(linha)}
      ${recolher ? html`<details class="mais-factos"><summary>mais ${certos.length - ver}</summary>${certos.slice(ver).map(linha)}</details>` : ''}
      ${divergentes.length ? html`<div class="conflito">${divergentes.map(linha)}</div>` : ''}</td></tr>`;
  })}</tbody></table>`;
}

const ICONE_TOCAR = raw('<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>');

export const dadosItem = (item) => esc(JSON.stringify(item));

/** Capa da Apple Music a 600×600: o mesmo ficheiro oficial, noutro tamanho (as de 100×100 ficavam esticadas no cartão). */
const capaApple = (u) => (u && /mzstatic\.com\/image\/thumb\//.test(u) ? u.replace(/\/\d+x\d+(\w*)\.(jpe?g|png|webp)$/, '/600x600$1.$2') : u);

/** Item do leitor a partir de um media curado (dados/media). Sem classificação é uma ligação externa («outro»): nunca
 *  se incorpora a plataforma escrita na ficha, só o que o classificar() reconhece. Leva o id da ficha (fonte no leitor). */
export function itemCurado(m) {
  const c = classificar(m.url) || { plataforma: 'outro', chave: m.url, url: enderecoSeguro(m.url) || '' };
  return { ...c, id: m.id, titulo: m.titulo, subtitulo: fmtData(m.data, true), origem: m.pessoas?.[0] ? `#/pessoa/${m.pessoas[0]}` : '',
    miniatura: capaApple(m.miniatura) || null, disponivel: m.disponivel };
}

const SELO_CATALOGADO = raw('<span class="selo-capa catalogado" title="Catalogado: identificado nas fichas, com fonte"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>');
const SELO_INDISPONIVEL = raw('<span class="selo-capa indisponivel" title="Link indisponível: o vídeo foi removido ou já não toca">indisponível</span>');
export const ondeVer = (it) => (String(it.plataforma || '').startsWith('rtp') ? 'no site da RTP' : 'no site original');

// uma capa que não carrega sai, e fica o fundo escuro da miniatura (sem atributos «onerror» no HTML)
if (typeof document !== 'undefined') document.addEventListener('error', (e) => { if (e.target?.matches?.('img.capa-media')) e.target.remove(); }, true);

/** Miniatura que toca no leitor; a capa só se pede quando se aproxima do ecrã. Sem imagem, desenha um cartaz com o título
 *  (nunca fica vazia; com `semTitulo`, quando o cartão já o mostra por baixo, só o nome da plataforma).
 *  O que não toca aqui (os programas da RTP) é uma ligação para o site original, sem passar pela fila. */
export function miniaturaMedia(item, opcoes = {}) {
  const capa = capaMedia(item);
  const morto = item.disponivel === false || item.disponivel === 0;
  const nome = NOME_PLATAFORMA[item.plataforma] || item.plataforma || '';
  const dentro = html`${capa ? html`<img class="capa-media" src="${capa}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : html`<span class="cartaz-titulo">${opcoes.semTitulo ? nome : item.titulo || nome}</span>`}
    <span class="plataforma">${nome}</span>
    ${opcoes.catalogado ? SELO_CATALOGADO : ''}${morto ? SELO_INDISPONIVEL : ''}`;
  if (!tocaAqui(item)) {
    const u = enderecoSeguro(item.url);
    return u ? html`<a class="miniatura externa ${capa ? '' : 'cartaz'}" href="${u}" target="_blank" rel="noopener"
      aria-label="Ver ${ondeVer(item)}: ${item.titulo || nome} (nova janela)">${dentro}<span class="ver-fora">Ver ${ondeVer(item)} ↗</span></a>`
      : html`<div class="miniatura externa ${capa ? '' : 'cartaz'}">${dentro}</div>`;
  }
  return html`<button class="miniatura ${capa ? '' : 'cartaz'} ${morto ? 'morta' : ''}" data-tocar="${raw(dadosItem(item))}"
    title="Tocar" aria-label="Tocar: ${item.titulo || nome} (${nome})">${dentro}<span class="tocar">${ICONE_TOCAR}</span></button>`;
}

/** Ligação ↗ para a página original do vídeo ou áudio (só endereços http/https). */
const ligacaoFora = (url, plataforma) => {
  const u = enderecoSeguro(url);
  return u ? html`<a class="botao peq" href="${u}" target="_blank" rel="noopener" title="Abrir no site original"
    aria-label="Abrir no ${NOME_PLATAFORMA[plataforma] || 'site original'} (nova janela)">↗</a>` : '';
};

/** Botão ▶ de um item (ou, se não toca aqui, ligação ao site original): faixas, discos, cartões com várias plataformas. */
export function botaoOuvir(it) {
  const nome = NOME_PLATAFORMA[it.plataforma] || '';
  if (tocaAqui(it)) return html`<button class="botao peq" data-tocar="${raw(dadosItem(it))}" aria-label="Tocar: ${it.titulo || ''} (${nome})">▶ ${nome || 'Ouvir'}</button>`;
  const u = enderecoSeguro(it.url);
  return u ? html`<a class="botao peq" href="${u}" target="_blank" rel="noopener" title="Abre ${ondeVer(it)}">${nome || 'Ver'} ↗</a>` : '';
}

// para ouvir em sequência: primeiro os leitores que avisam quando a faixa acaba; a Apple Music só na falta de outro
const PREFERIR = ['youtube', 'museu-do-fado', 'ficheiro', 'vimeo', 'soundcloud', 'dailymotion', 'blogger', 'internet-archive', 'facebook', 'spotify', 'apple-music'];
const ordemPlataforma = (p) => { const k = PREFERIR.indexOf(p); return k < 0 ? PREFERIR.length : k; };
const porPreferencia = (a, b) => ordemPlataforma(a.plataforma) - ordemPlataforma(b.plataforma);
const unicos = (itens) => { const vistos = new Set(); return itens.filter((it) => { const k = `${it.plataforma}|${it.chave}`; return !vistos.has(k) && vistos.add(k); }); };

/** Junta num grupo as fichas do mesmo vídeo ou áudio: só o mesmo endereço (uma ficha por disco). Dois media da mesma faixa
 *  (faixas[].media) ficam em cartões separados: podem ser atuações diferentes (a nota do agente diz, por exemplo, «não é a
 *  gravação do EP»). Só arruma a apresentação: nenhuma ficha muda. */
export function agruparMedia(lista) {
  const grupos = new Map(), ids = new Set();
  for (const m of lista) {
    if (!m || ids.has(m.id)) continue;
    ids.add(m.id);
    const k = chaveMedia(m);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(m);
  }
  return [...grupos.values()];
}

/** Grupos por data (a da ficha ou o ano do disco; num grupo, a mais antiga) e, sem data, no fim, por título. */
const dataGrupo = (g) => g.map(dataMedia).filter(Boolean).sort()[0] || '';
export function ordenarGrupos(grupos, sentido = 1) {
  return [...grupos].sort((a, b) => {
    const da = dataGrupo(a), db = dataGrupo(b);
    if (!da !== !db) return da ? -1 : 1;
    return (da && db && da !== db ? (da < db ? -sentido : sentido) : 0) || compararPt(a[0].titulo, b[0].titulo);
  });
}

/** Os media de uma faixa que tocam aqui, cada endereço uma só vez; primeiro os que avançam sozinhos (YouTube, Museu do
 *  Fado…). Entram todos: nada nos dados diz que dois media da mesma faixa são o mesmo som (há atuações de outro ano). */
export function itensDaFaixa(ids) {
  return unicos((ids || []).map((id) => E.por.media[id]).filter((m) => m && visivel(m)).map(itemCurado).filter(tocaAqui).sort(porPreferencia));
}
/** O primeiro item de um grupo de agruparMedia() (o mesmo endereço em várias fichas), para pôr na fila. */
export const itemDaFaixa = (ids) => itensDaFaixa(ids)[0] || null;
/** «Ouvir o disco»: as faixas por ordem e, em cada uma, os seus media distintos. */
export const itensDoDisco = (g) => unicos((g?.faixas || []).flatMap((f) => itensDaFaixa(f.media)));
/** «Comparar as interpretações» de uma obra: uma por endereço (o mesmo vídeo noutro disco não se repete). */
export function itensDaObra(id) {
  const lista = [...(E.mediaDeObra[id] || []),
    ...(E.faixasDeObra[id] || []).flatMap((f) => (f.faixa.media || []).map((x) => E.por.media[x]).filter((m) => m && visivel(m)))];
  return unicos(ordenarGrupos(agruparMedia(lista)).map((g) => g.map(itemCurado).filter(tocaAqui).sort(porPreferencia)[0]).filter(Boolean));
}

/** Discos onde está um grupo de media: o da ficha e os das faixas que o usam (outras edições do mesmo registo). */
function discosDe(grupo) {
  const ids = new Set();
  for (const m of grupo) {
    if (m.gravacao && E.por.gravacoes[m.gravacao]) ids.add(m.gravacao);
    for (const { gravacao } of E.faixasDeMedia?.[m.id] || []) ids.add(gravacao.id);
  }
  const ano = (g) => dataMedia({ gravacao: g.id }) || '9999';
  return [...ids].map((g) => E.por.gravacoes[g]).sort((a, b) => ano(a).localeCompare(ano(b)) || compararPt(a.titulo, b.titulo));
}
const comAno = (g, texto) => { const a = anoDoDisco(g); return `${texto}${a ? ` (${a})` : ''}`; };
// «EP Alvorada MEP 60054 (1957)»: o ano é o da edição em disco, nunca o do vídeo ou do áudio
const rotuloEdicao = (g) => comAno(g, [FORMATOS[g.formato] || g.formato, g.editora, g.referencia].filter(Boolean).join(' ') || `«${g.titulo}»`);

/** Nota do agente sobre a identificação («identificado pelo título na plataforma…»): não é facto. As compridas recolhem-se. */
const notaMedia = (n) => (n.length <= 140
  ? html`<p class="nota-agente nota-media" title="Nota do agente, não é facto">nota: ${n}</p>`
  : html`<details class="nota-media"><summary class="nota-agente" title="Nota do agente, não é facto">nota do agente</summary><p class="nota-agente">${n}</p></details>`);

/** Frase por cima das listas de media catalogado: as identificações são do agente e ninguém as reviu. */
export const AVISO_IDENTIFICACOES = 'Identificações feitas pelo agente, por rever, salvo as marcadas «revisto».';

/** Grelha de cartões de media catalogado, já agrupados e por data; `limite`: quantos se veem antes de «Mostrar os outros». */
export function cartoesMedia(lista, { limite = 0, aviso = true } = {}) {
  const grupos = ordenarGrupos(agruparMedia(lista));
  if (!grupos.length) return '';
  const visiveis = limite ? grupos.slice(0, limite) : grupos, resto = limite ? grupos.slice(limite) : [];
  return html`${aviso ? html`<p class="aviso-identificacoes">${AVISO_IDENTIFICACOES}</p>` : ''}
    <div class="grelha larga">${visiveis.map(cartaoMediaCurado)}</div>
    ${resto.length ? html`<details class="mais-media"><summary>Mostrar os outros ${resto.length}</summary>
      <div class="grelha larga">${resto.map(cartaoMediaCurado)}</div></details>` : ''}`;
}

/** Cartão de partitura (abre o MuseScore em ecrã grande). */
export function miniaturaPartitura(m) {
  return html`<button class="miniatura sem-imagem partitura" data-partitura="${partituraEmbed(m)}" data-ligacao="${m.url}" title="Abrir a partitura no MuseScore (separador novo)">
    <span class="plataforma">Partitura · MuseScore ↗</span>
    <span class="tocar"><svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13" style="fill:none;stroke:currentColor"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg></span></button>`;
}

const semEnderecos = (s) => String(s || '').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
const NOME_DOC = { pagina: 'Página', comentario: 'Comentário', post: 'Post' };

/** Cartão de media encontrado no arquivo dos blogues (linha da API /api/media). O título é o do próprio vídeo, quando o
 *  há (na plataforma ou na legenda), e o documento onde está vai por baixo; uma página sem data própria diz quando foi arquivada. */
export function cartaoMediaArquivo(m) {
  const it = itemDoArquivo(m);
  const partitura = m.tipo === 'partitura';
  const fichas = catalogadosDe(m).length ? catalogadosDe(m) : [catalogado(m)].filter(Boolean); // o mesmo vídeo pode estar em várias fichas
  const pessoas = [...new Set(fichas.flatMap((x) => x.pessoas || []))], obras = [...new Set(fichas.flatMap((x) => x.obras || []))];
  const doc = tituloDoc(m.titulo_doc);
  const proprio = m.titulo_externo || (m.tipo !== 'imagem' && m.legenda) || '';
  const outroTitulo = proprio && semEnderecos(proprio).toLowerCase() !== semEnderecos(String(m.titulo_doc || '').replace(/^~/, '')).toLowerCase();
  // numa página que é uma lista (canal, playlist, discografia), o texto à volta são os títulos dos vizinhos: não se mostra
  const lista = m.tipo_doc === 'pagina' && outroTitulo;
  const ctx = lista ? '' : [semEnderecos(m.contexto_antes).slice(-150), semEnderecos(m.contexto_depois).slice(0, 120)].filter(Boolean).join(' ▸ ');
  const quando = m.data ? fmtData(m.data, true) : m.obtido_em ? `página arquivada em ${fmtData(m.obtido_em, true)}` : '';
  return html`<article class="cartao cartao-media ${m.disponivel === 0 ? 'indisponivel' : ''}">
    ${partitura ? miniaturaPartitura(m) : miniaturaMedia(it, { catalogado: fichas.length > 0, semTitulo: true })}
    <div class="cartao-corpo">
      <p class="meta">${[quando, E.fontes[m.fonte]?.nome || m.fonte, m.n_posts > 1 && `em ${m.n_posts} documentos`].filter(Boolean).join(' · ')}</p>
      ${outroTitulo ? html`<h3 style="font-size:18px">${proprio}</h3>
        <p class="meta">${m.tipo_doc === 'pagina' ? 'na página' : m.tipo_doc === 'comentario' ? 'no comentário' : 'no post'}: <a href="#/doc/${m.doc_id}">${doc}</a></p>`
        : html`<h3 style="font-size:18px"><a href="#/doc/${m.doc_id}" style="color:inherit">${doc}</a></h3>`}
      ${pessoas.length || obras.length ? html`<p class="meta catalogado-em">Catalogado: ${[...pessoas.map((p) => html`<a href="#/pessoa/${p}">${E.por.pessoas[p]?.nome || p}</a>`),
        ...obras.map((o) => html`<a href="#/obra/${o}">${E.por.obras[o]?.titulo || o}</a>`)].map((x, i) => html`${i ? ', ' : ''}${x}`)}</p>` : ''}
      ${ctx && /\p{L}{3}/u.test(ctx) ? html`<p class="contexto">${ctx}</p>` : ''}
      <div class="acoes">
        ${partitura || !tocaAqui(it) ? '' : html`<button class="botao peq" data-fila="${raw(dadosItem(it))}">+ Fila</button>`}
        <a class="botao peq" href="#/doc/${m.doc_id}">${m.fonte === 'rtp-arquivos' ? 'Ficha' : NOME_DOC[m.tipo_doc] || 'Post'}</a>
        ${ligacaoFora(m.url, m.plataforma)}${botaoCatalogar(m)}
      </div>
    </div></article>`;
}

/** Cartão de media curado (com pessoas e obras identificadas e a fonte de cada identificação). Aceita uma ficha ou um
 *  grupo de agruparMedia(): o mesmo vídeo em vários discos fica num só cartão («Nas edições: …»). */
export function cartaoMediaCurado(m) {
  const grupo = [].concat(m).filter(Boolean);
  const vistos = new Set();
  const itens = grupo.filter((x) => { const k = chaveMedia(x); return !vistos.has(k) && vistos.add(k); }).map(itemCurado).sort(porPreferencia);
  const it = itens[0], p = grupo.find((x) => x.id === it.id) || grupo[0];
  const juntar = (f) => [...new Set(grupo.flatMap(f))];
  const pessoas = juntar((x) => x.pessoas || []), obras = juntar((x) => x.obras || []), notas = juntar((x) => (x.nota ? [x.nota] : []));
  const ja = new Set();
  const fontes = grupo.flatMap((x) => x.fontes || []).filter((c) => { const k = `${c.fonte}|${c.url}|${c.citacao || ''}`; return !ja.has(k) && ja.add(k); });
  const data = grupo.map((x) => x.data).filter(Boolean).sort()[0];
  const revisto = grupo.every((x) => x.estado_revisao === 'revisto');
  const discos = discosDe(grupo);
  const quem = [pessoas.length && html`${pessoas.map((x, i) => html`${i ? ', ' : ''}<a href="#/pessoa/${x}">${E.por.pessoas[x]?.nome || x}</a>`)}`,
    obras.length && html`${obras.map((o, i) => html`${i ? ', ' : ''}<a href="#/obra/${o}">${E.por.obras[o]?.titulo || o}</a>`)}`].filter(Boolean);
  return html`<article class="cartao cartao-media ${grupo.every((x) => x.disponivel === false) ? 'indisponivel' : ''}">
    ${miniaturaMedia(it, { catalogado: true, semTitulo: true })}
    <div class="cartao-corpo">
      ${data || revisto ? html`<p class="meta">${fmtData(data, true)} ${revisto ? html`<span class="selo verde">revisto</span>` : ''}</p>` : ''}
      <h3 style="font-size:18px">${p.titulo || it.url}</h3>
      ${quem.length || fontes.length ? html`<p class="contexto">${quem.map((x, i) => html`${i ? ' · ' : ''}${x}`)}${marcas(fontes)}</p>` : ''}
      ${discos.length === 1 ? html`<p class="meta disco-media">do disco <a href="#/gravacao/${discos[0].id}">${comAno(discos[0], `«${discos[0].titulo}»`)}</a></p>`
        : discos.length > 1 ? html`<p class="meta disco-media">Nas edições: ${discos.map((g, i) => html`${i ? ' · ' : ''}<a href="#/gravacao/${g.id}">${rotuloEdicao(g)}</a>`)}</p>` : ''}
      ${notas.map(notaMedia)}
      <div class="acoes">
        ${itens.length > 1 ? itens.map(botaoOuvir) : ''}
        ${tocaAqui(it) ? html`<button class="botao peq" data-fila="${raw(dadosItem(it))}">+ Fila</button>` : ''}
        ${ligacaoFora(it.url, it.plataforma)}
      </div>${acoesMedia(grupo)}
    </div></article>`;
}

export function figuraImagem(url, legenda, ligacao) {
  // a fotografia é um botão: amplia-se também com o teclado (Enter) e o leitor de ecrã diz o que faz
  return html`<figure data-lightbox="${url}" data-legenda="${legenda || ''}" data-ligacao="${ligacao || ''}">
    <button type="button" class="ampliar" aria-label="Ampliar${legenda ? `: ${legenda}` : ' a imagem'}"><img src="${miniatura(url, 400)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
      onerror="this.closest('figure').remove()"></button>
    ${legenda ? html`<figcaption>${legenda}</figcaption>` : ''}</figure>`;
}

/** Imagem de um cartão (retrato, capa, avatar): só se descarrega perto do ecrã; se falhar, sai e fica o fundo. */
export const imagemCartao = (url, { preguicosa = true, im = null } = {}) =>
  html`<img class="img-cartao" src="${url}" alt="" ${im?.recorte ? raw(`style="${estiloRecorte(im)}"`) : ''} ${preguicosa ? raw('loading="lazy"') : ''} decoding="async" onerror="this.remove()">`;

export function retrato(p, classe = 'retrato', opcoes = {}) {
  const im = p.imagens?.[0], img = im?.url;
  return img
    ? html`<div class="${classe}" role="img" aria-label="${p.nome}">${imagemCartao(miniatura(img, 600), { ...opcoes, im })}</div>`
    : html`<div class="${classe} sem-foto" aria-hidden="true">${iniciais(p.nome)}</div>`;
}

/** Retrato no topo da ficha: abre em grande, com a legenda e a ligação ao post, e diz de onde vem a fotografia.
 *  (Nas listas, dentro das ligações dos cartões, fica o retrato() simples.) */
export function retratoFicha(p, editar = false) {
  const im = p.imagens?.[0];
  if (!im?.url) return retrato(p);
  const legenda = im.editorial ? `${im.legenda ? im.legenda + ' ' : ''}(✎ ${nomeContribuidor(im.editorial.por)})` : im.legenda || '';
  const ligacao = im.editorial?.origem || ligacaoFonte(im.fontes?.[0]) || '';
  const origem = im.editorial ? `✎ ${nomeContribuidor(im.editorial.por)}` : im.fontes?.[0] ? fonteNome(im.fontes[0].fonte) : '';
  return html`<figure class="retrato-ficha"><button type="button" class="retrato" data-lightbox="${im.url}" data-legenda="${legenda}" data-ligacao="${ligacao}"
    aria-label="Ampliar a fotografia de ${p.nome}"><span class="iniciais" aria-hidden="true">${iniciais(p.nome)}</span><img src="${miniatura(im.url, 600)}"
    alt="" decoding="async" referrerpolicy="no-referrer" ${im.recorte ? raw(`style="${estiloRecorte(im)}"`) : ''} onerror="this.remove()"></button>
    ${origem ? html`<figcaption>Foto: ${ligacao ? html`<a href="${ligacao}" ${ligacao.startsWith('#') ? '' : raw('target="_blank" rel="noopener"')}>${origem}</a>` : origem}</figcaption>` : ''}
    ${editar ? html`<button type="button" class="botao peq" data-recortar data-id="${p.id}" data-url="${im.url}">Ajustar o retrato</button>` : ''}</figure>`;
}

export function cartaoPessoa(p) {
  const anos = vida(p);
  const par = parentescoDe(p); // familiares sem papel musical: «cônjuge de …», para distinguir os homónimos
  return html`<a class="cartao" href="#/pessoa/${p.id}">
    ${retrato(p)}
    <div class="cartao-corpo">
      <h3>${p.nome}</h3>
      ${anos ? html`<p class="meta">${anos}</p>` : ''}
      ${par ? html`<p class="meta parentesco">${par.texto}${par.editorial ? html` <span class="marca-editorial" title="Indicado por um contribuidor, sem fonte">✎</span>` : ''}</p>` : ''}
      ${!par && nomeAmbiguo(p) && relacaoDistintiva(p) ? html`<p class="meta parentesco">${relacaoDistintiva(p)}</p>` : ''}
      <div class="papeis">${(p.papeis || []).map(seloPapel)}
        ${p.estado_revisao === 'revisto' ? html`<span class="selo verde">revisto</span>` : ''}</div>
      ${p.biografia?.[0] ? html`<p class="resumo">${p.biografia[0].citacao}</p>` : ''}
    </div></a>`;
}

/** Lista ainda vazia. `feminino`: «catalogadas» (pessoas, obras, gravações); sem ele, tira-se da palavra. A dica do
 *  /investigar só aparece na cópia local, onde o agente trabalha. */
export function vazioCurado(o_que, feminino = /(as|ões)$/.test(o_que)) {
  return html`<div class="vazio">
    <h3>Ainda não há ${o_que} ${feminino ? 'catalogadas' : 'catalogados'}</h3>
    <p>Esta secção enche-se com o trabalho do agente <b>investigador</b>: ele lê o arquivo, extrai só o que as fontes dizem, com
    citação literal, e o validador confirma cada citação.${comArquivo() ? html` No Claude Code, escreva por exemplo
    <code>/investigar Flávio Rodrigues da Silva</code>.` : ''}</p>
    <p>Entretanto, o <a href="#/arquivo">arquivo dos blogues</a> e a <a href="#/mediateca">mediateca</a> já estão disponíveis.</p></div>`;
}

/** Ligação de uma imagem ou citação: o post no arquivo local, se existir; senão a página original. */
export const ligacaoFonte = (c) => (c?.doc && comArquivo() ? `#/doc/${c.doc}` : c?.url);

/** Separadores da entrada «Fontes e arquivo» do menu: o registo das fontes e a cópia pesquisável dos blogues. */
export const separadoresFontes = (ativo) => !comArquivo() ? '' : html`<nav class="separadores" aria-label="Fontes e arquivo">
  <a class="separador" href="#/fontes" ${ativo === 'fontes' ? raw('aria-current="page"') : ''}>Fontes e método</a>
  <a class="separador" href="#/arquivo" ${ativo === 'arquivo' ? raw('aria-current="page"') : ''}>Arquivo dos blogues</a></nav>`;

export function semServidor() {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
    return html`<div class="vazio"><h3>Só na cópia local do arquivo</h3>
      <p>A cópia dos blogues <i>Guitarra de Coimbra</i> é privada, para estudo, e não se publica: os textos pertencem aos seus autores.
      Nas fichas, cada citação leva ao post original.</p></div>`;
  }
  return html`<div class="vazio"><h3>Servidor local desligado</h3>
    <p>O arquivo pesquisável precisa do servidor local. Na pasta do projeto, corra <code>python scripts/servidor.py --abrir</code>.</p></div>`;
}
