// Peças de interface reutilizadas por várias vistas.
import { E, PAPEIS, CAMPOS, vida, iniciais, catalogado, comArquivo } from './estado.js';
import { html, raw, esc, miniatura, capaMedia, classificar, NOME_PLATAFORMA, fmtData, tituloDoc, partituraEmbed } from './util.js';
import { itemDoArquivo } from './leitor.js';
import { marcas } from './citacoes.js';
import { notaEditorial } from './formularios.js';

/** Tabela de factos agrupados por campo; só os factos em conflito ficam na caixa «As fontes divergem».
 *  Com `editar` (id da pessoa), cada facto ganha o botão ✎ para uma nota assinada. */
export function tabelaFactos(factos, { editar } = {}) {
  if (!factos?.length) return '';
  const grupos = {};
  for (const f of factos) (grupos[f.campo] ||= []).push(f);
  const ordem = Object.keys(CAMPOS);
  const posicao = (c) => { const k = ordem.indexOf(c); return k < 0 ? ordem.length : k; };
  const linha = (f) => html`<div>${f.valor}${marcas(f.fontes)}${f.nota ? html` <span class="nota-agente" title="Nota do agente, não é facto">nota: ${f.nota}</span>` : ''}${notaEditorial(f.nota_editorial)}
    ${editar ? html`<button class="botao-nota" data-acao="nota-facto" data-id="${editar}" data-indice="${factos.indexOf(f)}" data-pedir-campo="texto"
      data-valor="${f.nota_editorial?.texto || ''}" data-pedir="Nota sobre este facto (ex.: qual das versões lhe parece certa e porquê). Fica assinada; apague o texto para a retirar."
      title="Acrescentar uma nota assinada a este facto">✎</button>` : ''}</div>`;
  return html`<table class="factos"><tbody>${Object.keys(grupos).sort((a, b) => posicao(a) - posicao(b)).map((c) => {
    const certos = grupos[c].filter((f) => !f.conflito), divergentes = grupos[c].filter((f) => f.conflito);
    return html`<tr><th>${CAMPOS[c] || c}</th><td>${certos.map(linha)}
      ${divergentes.length ? html`<div class="conflito">${divergentes.map(linha)}</div>` : ''}</td></tr>`;
  })}</tbody></table>`;
}

const ICONE_TOCAR = raw('<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>');

export const dadosItem = (item) => esc(JSON.stringify(item));

/** Item do leitor a partir de um media curado (dados/media). */
export function itemCurado(m) {
  const c = classificar(m.url) || { plataforma: m.plataforma || 'outro', chave: m.url, url: m.url };
  return { ...c, titulo: m.titulo, subtitulo: fmtData(m.data, true), origem: m.pessoas?.[0] ? `#/pessoa/${m.pessoas[0]}` : '',
    miniatura: m.miniatura || null, disponivel: m.disponivel };
}

const SELO_CATALOGADO = raw('<span class="selo-capa catalogado" title="Catalogado: identificado nas fichas, com fonte"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>');
const SELO_INDISPONIVEL = raw('<span class="selo-capa indisponivel" title="Link indisponível: o vídeo foi removido ou já não toca">indisponível</span>');

/** Miniatura que toca no leitor. Sem imagem, desenha um cartaz com o título (nunca fica vazia). */
export function miniaturaMedia(item, opcoes = {}) {
  const capa = capaMedia(item);
  const morto = item.disponivel === false || item.disponivel === 0;
  return html`<button class="miniatura ${capa ? '' : 'cartaz'} ${morto ? 'morta' : ''}" ${capa ? raw(`style="background-image:url('${esc(capa)}')"`) : ''}
    data-tocar="${raw(dadosItem(item))}" title="Tocar">
    ${capa ? '' : html`<span class="cartaz-titulo">${item.titulo || NOME_PLATAFORMA[item.plataforma]}</span>`}
    <span class="plataforma">${NOME_PLATAFORMA[item.plataforma] || item.plataforma}</span>
    ${opcoes.catalogado ? SELO_CATALOGADO : ''}${morto ? SELO_INDISPONIVEL : ''}
    <span class="tocar">${ICONE_TOCAR}</span></button>`;
}

/** Cartão de partitura (abre o MuseScore em ecrã grande). */
export function miniaturaPartitura(m) {
  return html`<button class="miniatura sem-imagem partitura" data-partitura="${partituraEmbed(m)}" data-ligacao="${m.url}" title="Abrir a partitura no MuseScore (separador novo)">
    <span class="plataforma">Partitura · MuseScore ↗</span>
    <span class="tocar"><svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13" style="fill:none;stroke:currentColor"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg></span></button>`;
}

/** Cartão de media encontrado no arquivo dos blogues (linha da API /api/media). */
export function cartaoMediaArquivo(m) {
  const it = itemDoArquivo(m);
  const ctx = [m.contexto_antes?.slice(-150), m.contexto_depois?.slice(0, 120)].filter(Boolean).join(' ▸ ');
  const partitura = m.tipo === 'partitura';
  const cat = catalogado(m);
  return html`<article class="cartao cartao-media ${m.disponivel === 0 ? 'indisponivel' : ''}">
    ${partitura ? miniaturaPartitura(m) : miniaturaMedia(it, { catalogado: !!cat })}
    <div class="cartao-corpo">
      <p class="meta">${fmtData(m.data, true)} · ${E.fontes[m.fonte]?.nome || m.fonte}${m.n_posts > 1 ? ` · em ${m.n_posts} posts` : ''}</p>
      <h3 style="font-size:18px"><a href="#/doc/${m.doc_id}" style="color:inherit">${tituloDoc(m.titulo_doc)}</a></h3>
      ${cat ? html`<p class="meta catalogado-em">Catalogado: ${[...(cat.pessoas || []).map((p) => html`<a href="#/pessoa/${p}">${E.por.pessoas[p]?.nome || p}</a>`),
        ...(cat.obras || []).map((o) => html`<a href="#/obra/${o}">${E.por.obras[o]?.titulo || o}</a>`)].map((x, i) => html`${i ? ', ' : ''}${x}`)}</p>` : ''}
      ${m.titulo_externo ? html`<p class="meta" title="Título do vídeo no YouTube">▶ ${m.titulo_externo}</p>` : ''}
      ${ctx ? html`<p class="contexto">${ctx}</p>` : ''}
      <div class="acoes">
        ${partitura ? '' : html`<button class="botao peq" data-fila="${raw(dadosItem(it))}">+ Fila</button>`}
        <a class="botao peq" href="#/doc/${m.doc_id}">${m.fonte === 'rtp-arquivos' ? 'Ficha' : 'Post'}</a>
        <a class="botao peq" href="${m.url}" target="_blank" rel="noopener">↗</a>
      </div>
    </div></article>`;
}

/** Cartão de media curado (com pessoas e obras identificadas). */
export function cartaoMediaCurado(m) {
  const it = itemCurado(m);
  return html`<article class="cartao cartao-media ${m.disponivel === false ? 'indisponivel' : ''}">
    ${miniaturaMedia(it, { catalogado: true })}
    <div class="cartao-corpo">
      <p class="meta">${fmtData(m.data, true)} ${m.estado_revisao === 'revisto' ? html`<span class="selo verde">revisto</span>` : ''}</p>
      <h3 style="font-size:18px">${m.titulo || it.url}</h3>
      <p class="contexto">${(m.pessoas || []).map((p, i) => html`${i ? ', ' : ''}<a href="#/pessoa/${p}">${E.por.pessoas[p]?.nome || p}</a>`)}
        ${(m.obras || []).length ? html` · ${(m.obras).map((o) => html`<a href="#/obra/${o}">${E.por.obras[o]?.titulo || o}</a>`)}` : ''}</p>
      <div class="acoes"><button class="botao peq" data-fila="${raw(dadosItem(it))}">+ Fila</button>
        <a class="botao peq" href="${m.url}" target="_blank" rel="noopener">↗</a></div>
    </div></article>`;
}

export function figuraImagem(url, legenda, ligacao) {
  return html`<figure data-lightbox="${url}" data-legenda="${legenda || ''}" data-ligacao="${ligacao || ''}">
    <img src="${miniatura(url, 400)}" alt="${legenda || ''}" loading="lazy" referrerpolicy="no-referrer"
      onerror="this.closest('figure').remove()">
    ${legenda ? html`<figcaption>${legenda}</figcaption>` : ''}</figure>`;
}

export function retrato(p, classe = 'retrato') {
  const img = p.imagens?.[0]?.url;
  return img
    ? html`<div class="${classe}" style="background-image:url('${raw(esc(miniatura(img, 600)))}')" role="img" aria-label="${p.nome}"></div>`
    : html`<div class="${classe} sem-foto" aria-hidden="true">${iniciais(p.nome)}</div>`;
}

export function cartaoPessoa(p) {
  const anos = vida(p);
  return html`<a class="cartao" href="#/pessoa/${p.id}">
    ${retrato(p)}
    <div class="cartao-corpo">
      <h3>${p.nome}</h3>
      ${anos ? html`<p class="meta">${anos}</p>` : ''}
      <div class="papeis">${(p.papeis || []).map((x) => html`<span class="selo">${PAPEIS[x] || x}</span>`)}
        ${p.estado_revisao === 'revisto' ? html`<span class="selo verde">revisto</span>` : ''}</div>
      ${p.biografia?.[0] ? html`<p class="resumo">${p.biografia[0].citacao}</p>` : ''}
    </div></a>`;
}

export function vazioCurado(o_que) {
  return html`<div class="vazio">
    <h3>Ainda não há ${o_que} catalogados</h3>
    <p>Esta secção enche-se com o trabalho do agente <b>investigador</b>: ele lê o arquivo, extrai só o que as fontes dizem, com
    citação literal, e o validador confirma cada citação. No Claude Code, escreva por exemplo
    <code>/investigar Flávio Rodrigues da Silva</code>.</p>
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
