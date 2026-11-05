// Arquivo dos blogues: pesquisa de texto integral e leitor de posts arquivados.
import { E, catalogado } from '../estado.js';
import { $, $$, html, api, esc, fmtData, tituloDoc, marcarExcerto, definirParams, classificar, plural, regexTermos, aviso, preferencias } from '../util.js';
import { miniaturaMedia, miniaturaPartitura, semServidor, separadoresFontes } from '../componentes.js';
import { botaoCatalogar } from '../formularios.js';
import { filtroMultiplo } from '../filtros.js';
import { iniciarCitarSelecao } from '../citacoes.js';
// documento (P4): ligações a vídeos que tocam, frases citadas e fichas que citam o documento
import { raw, enderecoSeguro } from '../util.js';
import { dadosItem, itemCurado } from '../componentes.js';
import { tocaAqui } from '../leitor.js';
import { marcarFrase, limparFrases, fichasQueCitam, fraseCompleta } from '../frases.js';

const NOMES_FONTE = () => Object.values(E.fontes).filter((f) => f.tipo === 'blogue');

export async function arquivo(el, params) {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) { // a cópia dos blogues não se publica
    el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Fontes</p><h1>Arquivo dos blogues</h1></header>
      ${semServidor()}<p style="margin-top:18px"><a class="botao" href="#/fontes">Ver as fontes</a></p></div>`.s;
    return;
  }
  const p = { q: params.q || '', fonte: params.fonte || '', tipo: params.tipo || '', desde: params.desde || '', ate: params.ate || '',
    ordem: params.ordem || '', pagina: +params.pagina || 1 };
  el.innerHTML = html`<div class="conteudo estreito" style="max-width:920px">
    <header class="cabecalho"><p class="sobretitulo">Fontes</p><h1>Arquivo dos blogues</h1>
      <p class="lead">Cópia local integral dos blogues <i>Guitarra de Coimbra</i> I–V (2005–hoje), com posts e comentários.
        Pesquisa sem acentos nem maiúsculas.</p></header>
    ${separadoresFontes('arquivo')}
    <form id="f" class="barra-filtros">
      <input class="campo" type="search" name="q" placeholder='Ex.: "Artur Paredes" guitarra' value="${p.q}" autofocus>
      ${filtroMultiplo({ id: 'filtro-fonte', nome: 'fonte', todos: 'Todos os blogues', unidade: ['blogue', 'blogues'],
        opcoes: NOMES_FONTE().map((f) => ({ valor: f.id, nome: f.nome })), escolhidos: p.fonte.split(',').filter(Boolean) })}
      ${filtroMultiplo({ id: 'filtro-tipo', nome: 'tipo', todos: 'Todos os tipos', unidade: ['tipo', 'tipos'],
        opcoes: [{ valor: 'post', nome: 'Posts' }, { valor: 'comentario', nome: 'Comentários' }, { valor: 'pagina', nome: 'Páginas guardadas' }],
        escolhidos: p.tipo.split(',').filter(Boolean) })}
      <input class="campo" type="number" name="desde" placeholder="Desde" min="2005" max="2100" value="${p.desde}" title="Ano de publicação (desde)">
      <input class="campo" type="number" name="ate" placeholder="Até" min="2005" max="2100" value="${p.ate}" title="Ano de publicação (até)">
      <select class="campo" name="ordem"><option value="">${p.q ? 'Mais relevantes' : 'Mais recentes'}</option><option value="data">Mais recentes</option><option value="antigos">Mais antigos</option></select>
      <button class="botao primario">Pesquisar</button>
    </form>
    <p class="ajuda-pesquisa">Dicas: <code>"expressão exata"</code> · <code>Paredes OR Brojo</code> · <code>guitarr*</code> (prefixo) ·
      <code>Coimbra NOT Lisboa</code></p>
    <p class="mudo" id="total" style="font-size:13px"></p>
    <ul class="resultados" id="res"><li class="carregando">A pesquisar</li></ul>
    <div class="paginacao" id="pag"></div></div>`.s;
  const f = $('#f');
  f.ordem.value = p.ordem;
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const qs = new URLSearchParams(Object.entries(d).filter(([, v]) => v)).toString();
    location.hash = `#/arquivo${qs ? '?' + qs : ''}`;
  };
  // os seletores aplicam-se logo (as caixas de escolha múltipla, quando se fecha a lista)
  f.addEventListener('change', (e) => { if (e.target.matches('select, input[type=number]')) f.requestSubmit(); });
  f.addEventListener('filtro-fechado', () => f.requestSubmit());
  let r;
  try {
    const ordemApi = p.ordem === 'antigos' ? 'antigos' : p.ordem === 'data' ? 'data' : (p.q ? 'relevancia' : '');
    r = await api('pesquisa', { ...p, ordem: ordemApi });
  } catch (e) {
    if (!el.isConnected) return; // entretanto mudou-se de página
    $('#res').innerHTML = (/arquivo|fetch|Failed/i.test(e.message) ? semServidor() : html`<li class="vazio">Erro na pesquisa: ${e.message}</li>`).s;
    return;
  }
  if (!el.isConnected) return; // entretanto mudou-se de página: a resposta já não é para esta
  $('#total').textContent = `${plural(r.total, 'documento', 'documentos')}${p.q ? ` para «${p.q}»` : ''}`;
  const realce = p.q ? `?realce=${encodeURIComponent(p.q)}` : '';
  $('#res').innerHTML = r.resultados.length ? html`${r.resultados.map((d) => html`<li class="resultado">
    <h3><a href="#/doc/${d.doc_id}${realce}">${tituloDoc(d.titulo)}</a></h3>
    <p class="meta"><span>${fmtData(d.data)}</span><span>${E.fontes[d.fonte]?.nome || d.fonte}</span>
      ${d.tipo !== 'post' ? html`<span class="selo">${d.tipo === 'comentario' ? 'comentário' : 'página'}</span>` : ''}
      ${d.autor && d.autor !== 'Unknown' ? html`<span>${d.autor}</span>` : ''}
      ${d.n_comentarios ? html`<span>${plural(d.n_comentarios, 'comentário', 'comentários')}</span>` : ''}</p>
    <p class="excerto">${marcarExcerto(d.excerto || '')}</p></li>`)}`.s : '<li class="mudo">Sem resultados.</li>';
  const paginas = Math.ceil(r.total / r.por_pagina);
  if (paginas > 1) {
    const ir = (n) => { const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)), pagina: n }); return `#/arquivo?${q}`; };
    $('#pag').innerHTML = html`${p.pagina > 1 ? html`<a class="botao" href="${ir(p.pagina - 1)}">← Anterior</a>` : ''}
      <span>Página ${p.pagina} de ${paginas}</span>
      ${p.pagina < paginas ? html`<a class="botao" href="${ir(p.pagina + 1)}">Seguinte →</a>` : ''}`.s;
  }
}

// ------------------------------------------------------------- leitor de documentos

// o HTML arquivado vem de páginas de outros sites e de comentários escritos por qualquer pessoa: o que não está nestas
// listas de permissões sai (elementos que correm código ou mudam a página, atributos, protocolos dos endereços)
const RETIRAR = 'script,style,link,meta,form,input,button,textarea,select,noscript,svg,math,base,template,frame,frameset,applet';
const ATRIBUTOS = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'start', 'dir', 'lang', 'cite', 'datetime']);
const ENDERECOS = new Set(['href', 'src', 'cite']);
const PROTOCOLOS = new Set(['http:', 'https:', 'mailto:']);

/** O endereço de um atributo, se for permitido: http(s) ou mailto (os relativos e os «#…» também, que dão http), e
 *  data: só nas imagens. O browser lê «java&#9;script:» como «javascript:»; new URL lê-o da mesma maneira. */
function enderecoPermitido(valor, img) {
  try {
    const p = new URL(valor, location.href).protocol;
    return PROTOCOLOS.has(p) || (img && p === 'data:');
  } catch { return false; }
}

/** Limpa o HTML do post: sem scripts nem estilos, media trocados por cartões que tocam no leitor. */
function limpar(htmlBruto) {
  const d = new DOMParser().parseFromString(htmlBruto || '', 'text/html');
  d.querySelectorAll(RETIRAR).forEach((n) => n.remove());
  // primeiro, trocar os media incorporados por cartões que tocam no leitor (o endereço já normalizado: só http/https)
  const cartoes = [];
  d.querySelectorAll('object, iframe, embed, video, audio').forEach((n) => {
    if (!n.isConnected || (n.closest('object') && n.closest('object') !== n)) return; // embed dentro de object: trata o object
    const src = n.getAttribute('src') || n.getAttribute('data') || n.querySelector('param[name=movie], param[name=src]')?.getAttribute('value')
      || n.querySelector('embed')?.getAttribute('src') || n.querySelector('source')?.getAttribute('src') || '';
    const ph = d.createElement('div');
    cartoes.push([ph, classificar(enderecoSeguro(src))]);
    n.replaceWith(ph);
  });
  d.querySelectorAll('*').forEach((n) => {
    for (const a of [...n.attributes]) {
      const nome = a.name.toLowerCase();
      if (!ATRIBUTOS.has(nome) || (ENDERECOS.has(nome) && !enderecoPermitido(a.value, n.tagName === 'IMG' && nome === 'src'))) n.removeAttribute(a.name);
    }
    if (n.hasAttribute('href')) { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); }
    if (n.tagName === 'IMG') { n.setAttribute('loading', 'lazy'); n.setAttribute('referrerpolicy', 'no-referrer'); }
  });
  for (const [ph, m] of cartoes) {
    ph.className = 'media-embutido' + (m ? '' : ' indisponivel');
    if (m) ph.dataset.media = JSON.stringify(m); else ph.textContent = 'Conteúdo incorporado que já não está disponível.';
  }
  return d.body.innerHTML;
}

function realcar(raiz, consulta) {
  const re = regexTermos(consulta);
  if (!re) return 0;
  const nos = [];
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  // a expressão tem a bandeira g: sem voltar ao princípio, o test() seguinte começava a meio e saltava ocorrências
  while (w.nextNode()) { re.lastIndex = 0; if (re.test(w.currentNode.data)) nos.push(w.currentNode); }
  for (const n of nos) {
    re.lastIndex = 0;
    const frag = document.createElement('span');
    frag.innerHTML = esc(n.data).replace(re, '<mark>$1</mark>');
    n.replaceWith(...frag.childNodes);
  }
  return nos.length;
}

const HOSTS_BLOGUES = /(guitarradecoimbra\d?|guitarrasdecoimbra\d?|guitarracoimbra)\.blogspot\.[a-z.]+$/;
const NOME_TIPO_DOC = { post: 'post', comentario: 'comentário', pagina: 'página' };

/** As imagens e ligações relativas de uma página guardada («Images/x.jpg») com o endereço completo, a partir do da
 *  própria página (senão o site local pedia-as a si mesmo e ficavam partidas). O <template> não carrega nada. */
function enderecosCompletos(htmlLimpo, base) {
  if (!/^https?:\/\//i.test(base || '')) return htmlLimpo;
  const t = document.createElement('template');
  t.innerHTML = htmlLimpo;
  for (const n of t.content.querySelectorAll('[src], [href]')) {
    for (const a of ['src', 'href']) {
      const v = n.getAttribute(a);
      if (v && !/^\s*([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(v)) { try { n.setAttribute(a, new URL(v.trim(), base).href); } catch { /* endereço estranho: fica */ } }
    }
  }
  return t.innerHTML;
}

/** Ligações estragadas pelo programa de correio com que alguns posts foram escritos («wlmailhtml:{…}mid://…!x-usc:http://…»,
 *  337 em 63 documentos): fica o endereço verdadeiro, que está lá dentro; senão a ligação não abria e o vídeo não tocava aqui. */
const repararLigacoes = (h) => String(h || '').replace(/(\bhref\s*=\s*)(["'])[^"']*?x-usc:(https?:\/\/[^"']+)\2/gi, '$1$2$3$2');

/** Item do leitor para um vídeo ou áudio do documento (incorporado ou só ligado). */
const itemDoDocumento = (m, d, titulo, primeiraImagem) => ({
  plataforma: m.plataforma, chave: m.chave, url: m.url, titulo: titulo || m.titulo_externo || m.legenda || String(d.titulo || '').replace(/^~/, ''),
  subtitulo: (d.data || '').slice(0, 10), origem: `#/doc/${d.doc_id}`, miniatura: m.miniatura || null, imagem_post: primeiraImagem || null, disponivel: m.disponivel,
});

/** Junta um ▶ a cada ligação para um vídeo ou áudio que toca aqui (num post que é uma lista de gravações, a única forma de
 *  ouvir era abrir cada uma no YouTube). Uma ligação morta fica marcada «indisponível»; partituras e RTP ficam como estão. */
function ligacoesQueTocam(raiz, d, estadoMedia, primeiraImagem) {
  for (const a of raiz.querySelectorAll('a[href]')) {
    if (a.closest('.media-embutido')) continue;
    // alguns posts trazem ligações estragadas pelo programa de correio («wlmailhtml:…x-usc:http://www.youtube.com/…»): vale o endereço lá dentro
    const href = a.getAttribute('href') || '';
    const m = classificar(href) || classificar((href.match(/https?:\/\/[^\s"'<>]+/) || [])[0]);
    if (!m || m.tipo === 'partitura' || !tocaAqui(m)) continue;
    const info = estadoMedia.get(`${m.plataforma}|${m.chave}`) || {};
    // sem espaço de texto à frente (a margem está no CSS): uma frase citada que continua logo a seguir à ligação bate certo
    if (info.disponivel === 0) { a.insertAdjacentHTML('afterend', '<span class="selo vinho ligacao-morta" title="O vídeo foi removido ou já não toca">indisponível</span>'); continue; }
    // o título oficial do vídeo; senão o texto da ligação, se disser alguma coisa («YouTube», «aqui» ou um endereço não dizem)
    const texto = a.textContent.replace(/\s+/g, ' ').trim();
    const diz = texto.length > 3 && !/^(https?:|www\.)/i.test(texto) && !/^(youtube|vimeo|soundcloud|spotify|v[ií]deo|link|liga[cç][aã]o|aqui|ver|ouvir|clique aqui)$/i.test(texto);
    const titulo = info.titulo_externo || (diz ? texto : '');
    const it = itemDoDocumento({ ...m, ...info, url: m.url }, d, titulo, primeiraImagem);
    a.insertAdjacentHTML('afterend', html`<button type="button" class="tocar-ligacao" data-tocar="${raw(dadosItem(it))}" title="Tocar aqui"
      aria-label="Tocar: ${it.titulo} (${m.plataforma === 'youtube' ? 'YouTube' : m.plataforma})">▶</button>`.s);
  }
}

/** «Citado em N fichas»: as fichas que tiram frases deste documento (ou dos seus comentários), com «mostrar no texto». */
function seccaoCitadoEm(fichas) {
  if (!fichas.length) return '';
  let k = 0;
  return html`<section class="seccao citado-em" id="citado-em"><h2>Citado em ${plural(fichas.length, 'ficha', 'fichas')}
      <small>${plural(fichas.reduce((n, f) => n + f.frases.length, 0), 'frase tirada daqui', 'frases tiradas daqui')}</small></h2>
    <ul class="lista-simples">${fichas.map((f) => html`<li><div class="ficha-que-cita">
      <span class="selo">${f.tipo}</span> ${f.rota ? html`<a href="${f.rota}">${f.nome}</a>` : f.t === 'media' ? html`<button type="button" class="ligacao" data-tocar="${raw(dadosItem(itemCurado(f.x)))}">▶ ${f.nome}</button>` : f.nome}
      <ul class="frases-citadas">${f.frases.map((c) => html`<li><q>${c.citacao.length > 220 ? c.citacao.slice(0, 220).replace(/\s+\S*$/, '') + '…' : c.citacao}</q>
        <button type="button" class="botao peq" data-mostrar-frase="${k++}">mostrar no texto</button></li>`)}</ul></div></li>`)}</ul></section>`;
}

export async function documento(el, id, params) {
  el.innerHTML = '<div class="conteudo estreito"><p class="carregando">A abrir</p></div>';
  let d;
  try { d = await api('doc', { id }); } catch (e) {
    if (!el.isConnected) return;
    // o servidor responde 404 «documento não encontrado no arquivo»; qualquer outra falha é o servidor desligado
    el.innerHTML = html`<div class="conteudo estreito">${/não encontrado/i.test(e.message)
      ? html`<div class="vazio"><h3>Documento não encontrado no arquivo</h3><p>Não há nenhum documento arquivado com o endereço
        <span class="mono">${id}</span>. <a href="#/arquivo">Pesquisar no arquivo</a></p></div>` : semServidor()}</div>`.s;
    return;
  }
  if (!el.isConnected) return; // entretanto mudou-se de página
  const f = E.fontes[d.fonte] || {};
  const primeiraImagem = d.media.find((m) => m.tipo === 'imagem')?.url;
  // «Ouvir os N por ordem»: incorporados e ligados, pela ordem do documento, sem partituras, RTP, repetidos nem links mortos
  const vistos = new Set();
  const ouvirTudo = d.media.filter((m) => m.tipo !== 'imagem' && m.tipo !== 'partitura' && m.disponivel !== 0 && tocaAqui(m)
    && !vistos.has(`${m.plataforma}|${m.chave}`) && vistos.add(`${m.plataforma}|${m.chave}`)).map((m) => itemDoDocumento(m, d, '', primeiraImagem));
  const docsDoPost = [d.doc_id, ...d.comentarios.map((c) => c.doc_id)];
  const citam = fichasQueCitam(docsDoPost);
  el.innerHTML = html`<div class="conteudo estreito">
    <article class="documento">
      <p class="sobretitulo">${f.nome || d.fonte} · ${NOME_TIPO_DOC[d.tipo] || d.tipo}</p>
      <h1>${tituloDoc(d.titulo)}</h1>
      <p class="mudo" style="font:13.5px var(--f-ui)">${d.data ? fmtData(d.data) : d.obtido_em ? html`<span title="A página não tem data própria: esta é a data em que foi guardada no arquivo">página arquivada em ${fmtData(d.obtido_em)}</span>` : ''}${d.autor && d.autor !== 'Unknown' ? ' · ' + d.autor : ''}
        ${d.etiquetas ? html` · ${d.etiquetas}` : ''}</p>
      <div class="acoes-topo">
        ${enderecoSeguro(d.url) ? html`<a class="botao" href="${enderecoSeguro(d.url)}" target="_blank" rel="noopener">Abrir original ↗</a>` : ''}
        ${d.post_url ? html`<button class="botao" data-post="${d.post_url}">Ver o post comentado</button>` : ''}
        <button class="botao" id="copiar-ref" title="O endereço deste documento, para colar no formulário de uma ficha">Copiar o endereço</button>
        ${ouvirTudo.length > 1 ? html`<button class="botao primario" data-fila="${raw(dadosItem(ouvirTudo))}"
          title="Põe na fila, pela ordem do documento, os vídeos e áudios que tocam aqui (sem repetidos nem links mortos)">▶ Ouvir os ${ouvirTudo.length} por ordem</button>` : ''}
        ${d.media.length ? html`<span class="selo ouro" style="align-self:center">${plural(d.media.filter((m) => m.tipo !== 'imagem').length, 'vídeo/áudio', 'vídeos/áudios')} · ${plural(d.media.filter((m) => m.tipo === 'imagem').length, 'imagem', 'imagens')}</span>` : ''}
        ${citam.length ? html`<a class="botao" href="#citado-em" data-saltar-citado>Citado em ${plural(citam.length, 'ficha', 'fichas')}</a>` : ''}
      </div>
      <div class="corpo" id="corpo"></div>
    </article>
    ${d.comentarios.length ? html`<section class="comentarios"><h2>Comentários <small class="mudo">${d.comentarios.length}</small></h2>
      ${d.comentarios.map((c) => html`<div class="comentario"><p class="meta">${c.autor} · ${fmtData(c.data)}</p><div data-html="${c.html}"></div></div>`)}</section>` : ''}
    ${seccaoCitadoEm(citam)}
    <p class="citacao-rodape" style="margin-top:40px">Dica: selecione um trecho do texto para copiar a frase, copiar o endereço ou, no modo de
      edição, usá-la como prova numa ficha (abre a ficha com o endereço e a frase já no formulário).
      «Para o agente» copia a citação no formato das fichas (<span class="mono">{fonte, url, doc, citacao}</span>).</p>
  </div>`.s;

  const corpo = $('#corpo');
  corpo.innerHTML = enderecosCompletos(limpar(repararLigacoes(d.html)), d.url);
  $$('[data-html]', el).forEach((n) => { n.innerHTML = enderecosCompletos(limpar(repararLigacoes(n.dataset.html)), d.url); n.removeAttribute('data-html'); });
  const estadoMedia = new Map(d.media.map((m) => [`${m.plataforma}|${m.chave}`, m]));
  ligacoesQueTocam(corpo, d, estadoMedia, primeiraImagem);
  $$('.comentario', el).forEach((n) => ligacoesQueTocam(n, d, estadoMedia, primeiraImagem));
  $$('.media-embutido[data-media]', el).forEach((n) => {
    const m = JSON.parse(n.dataset.media);
    const info = estadoMedia.get(`${m.plataforma}|${m.chave}`) || {};
    if (info.disponivel === 0 && !preferencias.mostrarIndisponiveis) { n.remove(); return; } // link morto: escondido por omissão
    n.innerHTML = (m.tipo === 'partitura' ? miniaturaPartitura(m) : miniaturaMedia({
      ...m, titulo: tituloDoc(d.titulo).toString().replace(/<[^>]+>/g, ''), subtitulo: d.data.slice(0, 10), origem: `#/doc/${d.doc_id}`,
      miniatura: info.miniatura, imagem_post: primeiraImagem, disponivel: info.disponivel, catalogado: undefined,
    }, { catalogado: !!catalogado(m) })).s;
    // no modo de edição: «+ Catalogar» com este post como fonte (ou «✎ Corrigir a ficha», se já estiver catalogado) (P5a)
    const catalogar = String(m.tipo === 'partitura' ? '' : botaoCatalogar({ ...m, titulo_externo: info.titulo_externo, url_doc: d.url }));
    if (catalogar) n.insertAdjacentHTML('beforeend', `<div class="acoes acoes-edicao-media">${catalogar}</div>`);
  });
  // liga entre posts dos blogues dentro do arquivo
  corpo.addEventListener('click', async (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    let u; try { u = new URL(a.href); } catch { return; }
    if (!HOSTS_BLOGUES.test(u.host) || !/\.html$/.test(u.pathname)) return;
    e.preventDefault();
    try { const alvo = await api('doc', { url: a.href }); location.hash = `#/doc/${alvo.doc_id}`; }
    catch { window.open(a.href, '_blank', 'noopener'); }
  });
  $('[data-post]', el)?.addEventListener('click', async (e) => {
    try { const alvo = await api('doc', { url: e.currentTarget.dataset.post }); location.hash = `#/doc/${alvo.doc_id}`; }
    catch { aviso('Post não encontrado no arquivo'); }
  });
  // realce: a frase citada inteira (o painel da citação manda o princípio dela; ?frase= manda-a toda); senão, as palavras
  const texto = el.querySelector('.conteudo');
  const zonas = [corpo, ...$$('.comentario > div', el)]; // a frase procura-se só no texto arquivado (nunca em «Citado em»)
  const irPara = (m) => {
    if (!m) return;
    let mexeu = false; // quem rola a página à mão manda
    for (const ev of ['wheel', 'touchmove', 'keydown']) window.addEventListener(ev, () => { mexeu = true; }, { once: true, passive: true });
    const centrar = () => { if (!mexeu && m.isConnected) m.scrollIntoView({ block: 'center' }); };
    setTimeout(centrar, 120);
    // as imagens acima que acabam de carregar empurram o texto para baixo: volta a centrar a frase
    for (const img of texto.querySelectorAll('img')) if (!img.complete) img.addEventListener('load', centrar, { once: true });
  };
  const pedida = params.frase || (params.realce && (fraseCompleta(docsDoPost, params.realce) || (params.realce.split(/\s+/).length >= 5 ? params.realce : '')));
  const marcas = pedida ? marcarFrase(zonas, pedida) : [];
  if (marcas.length) irPara(marcas[0]);
  else if (params.realce && realcar(el.querySelector('.documento'), params.realce)) irPara(el.querySelector('mark'));
  // «mostrar no texto» de cada frase em «Citado em»
  const frases = citam.flatMap((x) => x.frases);
  $('#citado-em', el)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mostrar-frase]');
    if (!b) return;
    limparFrases(texto);
    const m = marcarFrase(zonas, frases[+b.dataset.mostrarFrase].citacao);
    if (m.length) irPara(m[0]); else aviso('Esta frase não se encontrou no texto arquivado (pode estar numa versão diferente da página)');
  });
  $('[data-saltar-citado]', el)?.addEventListener('click', (e) => { e.preventDefault(); $('#citado-em', el)?.scrollIntoView({ behavior: 'smooth' }); });
  iniciarCitarSelecao(el, d); // copiar a frase ou o endereço, ou usá-la numa ficha (citacoes.js)
}
