// Arquivo dos blogues: pesquisa de texto integral e leitor de posts arquivados.
import { E, catalogado } from '../estado.js';
import { $, $$, html, api, esc, fmtData, tituloDoc, marcarExcerto, definirParams, classificar, plural, regexTermos, aviso, preferencias } from '../util.js';
import { miniaturaMedia, miniaturaPartitura, semServidor, separadoresFontes } from '../componentes.js';

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
      <select class="campo" name="fonte"><option value="">Todos os blogues</option>${NOMES_FONTE().map((f) => html`<option value="${f.id}">${f.nome}</option>`)}</select>
      <select class="campo" name="tipo"><option value="">Posts e comentários</option><option value="post">Só posts</option><option value="comentario">Só comentários</option><option value="pagina">Páginas guardadas</option></select>
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
  for (const k of ['fonte', 'tipo', 'ordem']) f[k].value = p[k];
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const qs = new URLSearchParams(Object.entries(d).filter(([, v]) => v)).toString();
    location.hash = `#/arquivo${qs ? '?' + qs : ''}`;
  };
  let r;
  try {
    const ordemApi = p.ordem === 'antigos' ? 'antigos' : p.ordem === 'data' ? 'data' : (p.q ? 'relevancia' : '');
    r = await api('pesquisa', { ...p, ordem: ordemApi });
  } catch (e) {
    $('#res').innerHTML = (/arquivo|fetch|Failed/i.test(e.message) ? semServidor() : html`<li class="vazio">Erro na pesquisa: ${e.message}</li>`).s;
    return;
  }
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

const RETIRAR = 'script,style,link,meta,form,input,button,textarea,select,noscript';
const ATRIBUTOS_FORA = ['style', 'color', 'face', 'size', 'bgcolor', 'background', 'class', 'id', 'width', 'height', 'align'];

/** Limpa o HTML do post: sem scripts nem estilos, media trocados por cartões que tocam no leitor. */
function limpar(htmlBruto) {
  const d = new DOMParser().parseFromString(htmlBruto || '', 'text/html');
  d.querySelectorAll(RETIRAR).forEach((n) => n.remove());
  d.querySelectorAll('*').forEach((n) => {
    for (const a of [...n.attributes]) {
      const nome = a.name.toLowerCase();
      if (nome.startsWith('on') || ATRIBUTOS_FORA.includes(nome)) n.removeAttribute(a.name);
      else if ((nome === 'href' || nome === 'src') && /^\s*(javascript|data):/i.test(a.value) && n.tagName !== 'IMG') n.removeAttribute(a.name);
    }
    if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); }
    if (n.tagName === 'IMG') { n.setAttribute('loading', 'lazy'); n.setAttribute('referrerpolicy', 'no-referrer'); }
  });
  // depois de limpar os atributos: trocar media incorporados por cartões que tocam no leitor
  d.querySelectorAll('object, iframe, embed, video, audio').forEach((n) => {
    if (n.closest('object') && n.closest('object') !== n) return; // embed dentro de object: trata o object
    const src = n.getAttribute('src') || n.getAttribute('data') || n.querySelector('param[name=movie], param[name=src]')?.getAttribute('value')
      || n.querySelector('embed')?.getAttribute('src') || n.querySelector('source')?.getAttribute('src') || '';
    const m = classificar(src);
    const ph = d.createElement('div');
    ph.className = 'media-embutido' + (m ? '' : ' indisponivel');
    if (m) ph.dataset.media = JSON.stringify(m); else ph.textContent = 'Conteúdo incorporado que já não está disponível.';
    n.replaceWith(ph);
  });
  return d.body.innerHTML;
}

function realcar(raiz, consulta) {
  const re = regexTermos(consulta);
  if (!re) return 0;
  const nos = [];
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) if (re.test(w.currentNode.data)) nos.push(w.currentNode);
  for (const n of nos) {
    re.lastIndex = 0;
    const frag = document.createElement('span');
    frag.innerHTML = esc(n.data).replace(re, '<mark>$1</mark>');
    n.replaceWith(...frag.childNodes);
  }
  return nos.length;
}

const HOSTS_BLOGUES = /(guitarradecoimbra\d?|guitarrasdecoimbra\d?|guitarracoimbra)\.blogspot\.[a-z.]+$/;

export async function documento(el, id, params) {
  el.innerHTML = '<div class="conteudo estreito"><p class="carregando">A abrir</p></div>';
  let d;
  try { d = await api('doc', { id }); } catch { el.innerHTML = html`<div class="conteudo estreito">${semServidor()}</div>`.s; return; }
  const f = E.fontes[d.fonte] || {};
  el.innerHTML = html`<div class="conteudo estreito">
    <article class="documento">
      <p class="sobretitulo">${f.nome || d.fonte} · ${d.tipo === 'comentario' ? 'comentário' : d.tipo}</p>
      <h1>${tituloDoc(d.titulo)}</h1>
      <p class="mudo" style="font:13.5px var(--f-ui)">${fmtData(d.data)}${d.autor && d.autor !== 'Unknown' ? ' · ' + d.autor : ''}
        ${d.etiquetas ? html` · ${d.etiquetas}` : ''}</p>
      <div class="acoes-topo">
        <a class="botao" href="${d.url}" target="_blank" rel="noopener">Abrir original ↗</a>
        ${d.post_url ? html`<button class="botao" data-post="${d.post_url}">Ver o post comentado</button>` : ''}
        <button class="botao" id="copiar-ref" title="Referência para usar nas fichas">Copiar referência</button>
        ${d.media.length ? html`<span class="selo ouro" style="align-self:center">${plural(d.media.filter((m) => m.tipo !== 'imagem').length, 'vídeo/áudio', 'vídeos/áudios')} · ${plural(d.media.filter((m) => m.tipo === 'imagem').length, 'imagem', 'imagens')}</span>` : ''}
      </div>
      <div class="corpo" id="corpo"></div>
    </article>
    ${d.comentarios.length ? html`<section class="comentarios"><h2>Comentários <small class="mudo">${d.comentarios.length}</small></h2>
      ${d.comentarios.map((c) => html`<div class="comentario"><p class="meta">${c.autor} · ${fmtData(c.data)}</p><div data-html="${c.html}"></div></div>`)}</section>` : ''}
    <p class="citacao-rodape" style="margin-top:40px">Dica: selecione um trecho do texto para o copiar como citação pronta a usar numa ficha
      (formato <span class="mono">{fonte, url, doc, citacao}</span>).</p>
  </div>`.s;

  const corpo = $('#corpo');
  corpo.innerHTML = limpar(d.html);
  $$('[data-html]', el).forEach((n) => { n.innerHTML = limpar(n.dataset.html); n.removeAttribute('data-html'); });
  const estadoMedia = new Map(d.media.map((m) => [`${m.plataforma}|${m.chave}`, m]));
  const primeiraImagem = d.media.find((m) => m.tipo === 'imagem')?.url;
  $$('.media-embutido[data-media]', el).forEach((n) => {
    const m = JSON.parse(n.dataset.media);
    const info = estadoMedia.get(`${m.plataforma}|${m.chave}`) || {};
    if (info.disponivel === 0 && !preferencias.mostrarIndisponiveis) { n.remove(); return; } // link morto: escondido por omissão
    n.innerHTML = (m.tipo === 'partitura' ? miniaturaPartitura(m) : miniaturaMedia({
      ...m, titulo: tituloDoc(d.titulo).toString().replace(/<[^>]+>/g, ''), subtitulo: d.data.slice(0, 10), origem: `#/doc/${d.doc_id}`,
      miniatura: info.miniatura, imagem_post: primeiraImagem, disponivel: info.disponivel, catalogado: undefined,
    }, { catalogado: !!catalogado(m) })).s;
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
  $('#copiar-ref').onclick = () => {
    navigator.clipboard?.writeText(JSON.stringify({ fonte: d.fonte, url: d.url, doc: d.doc_id }, null, 2)).then(() => aviso('Referência copiada'));
  };
  if (params.realce) {
    const n = realcar(el.querySelector('.documento'), params.realce);
    if (n) setTimeout(() => el.querySelector('mark')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  }
  iniciarCitarSelecao(el, d);
}

let esconderRegistado = false;

function iniciarCitarSelecao(el, d) {
  const botao = $('#citar-selecao');
  const esconder = () => { botao.hidden = true; };
  if (!esconderRegistado) {
    esconderRegistado = true;
    document.addEventListener('mousedown', (e) => { if (e.target !== botao) esconder(); });
    window.addEventListener('hashchange', esconder);
  }
  const artigo = el.querySelector('.documento');
  artigo.addEventListener('mouseup', () => setTimeout(() => {
    const s = getSelection();
    const texto = s.toString().replace(/\s+/g, ' ').trim();
    if (!texto || texto.length < 8 || !artigo.contains(s.anchorNode)) return esconder();
    const rect = s.getRangeAt(0).getBoundingClientRect();
    botao.style.left = `${rect.left + window.scrollX + rect.width / 2 - 70}px`;
    botao.style.top = `${rect.top + window.scrollY - 40}px`;
    botao.hidden = false;
    botao.onclick = () => {
      const cit = { fonte: d.fonte, url: d.url, doc: d.doc_id, citacao: texto };
      navigator.clipboard?.writeText(JSON.stringify(cit, null, 2)).then(() => aviso('Citação copiada'));
      esconder(); s.removeAllRanges();
    };
  }, 10));
}
