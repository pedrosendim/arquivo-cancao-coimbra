// Mediateca: vídeos, áudios e imagens — curados e encontrados no arquivo dos blogues.
import { E, visivel, comArquivo } from '../estado.js';
import { $, $$, html, api, debounce, definirParams, NOME_PLATAFORMA, plural, norm, classificar, aviso } from '../util.js';
import { cartaoMediaArquivo, cartaoMediaCurado, figuraImagem, semServidor, itemCurado } from '../componentes.js';
import { enfileirar, itemDoArquivo, carregarYT } from '../leitor.js';

const SEPARADORES = { videos: 'Vídeos', ineditos: 'Inéditos do blogue', audio: 'Áudio', partituras: 'Partituras', imagens: 'Imagens', playlists: 'Playlists' };
const TIPO = { videos: 'video', ineditos: 'video', audio: 'audio', partituras: 'partitura', imagens: 'imagem' };
const FIXA = { ineditos: 'blogger' };
const PLATAFORMAS = {
  videos: ['youtube', 'rtp-arquivos', 'blogger', 'vimeo', 'facebook', 'dailymotion', 'rtp-play'], ineditos: [],
  audio: ['soundcloud', 'ficheiro', 'internet-archive', 'spotify'], partituras: [], imagens: [],
};
const EXPLICACAO = {
  ineditos: 'Vídeos carregados diretamente no Blogger pelos autores do blogue — não estão publicados no YouTube nem noutras plataformas. Tocam aqui, a partir do próprio Blogger.',
  partituras: 'Partituras interativas (MuseScore) publicadas nos posts. O MuseScore não permite mostrá-las dentro de outros sites, por isso abrem no próprio MuseScore, num separador novo, com reprodução e leitura compasso a compasso.',
  videos: 'Inclui as fichas do RTP Arquivos (abrem no site da RTP).',
};

/** Separador «Playlists»: importar uma playlist do YouTube (lida no browser pelo leitor oficial) e ouvir as guardadas. */
async function playlists(caixa) {
  caixa.innerHTML = html`<section class="vazio" style="margin-bottom:24px">
      <h3>Importar uma playlist do YouTube</h3>
      <p>Cole o endereço de uma playlist pública. O leitor oficial do YouTube lê a lista aqui no browser, o servidor local
        vai buscar o título de cada vídeo e guarda tudo no arquivo: os vídeos passam a aparecer na mediateca e nas pesquisas.</p>
      <form id="f-lista" class="barra-filtros" style="margin:10px 0 0">
        <input class="campo" name="url" type="url" required placeholder="https://www.youtube.com/watch?v=…&list=PL…">
        <button class="botao primario">Importar</button></form>
      <p id="estado-lista" class="mudo" style="margin:8px 0 0;font-size:13px"></p>
      <div id="leitor-lista" style="position:absolute;width:1px;height:1px;overflow:hidden;opacity:0"></div>
    </section>
    <div id="listas"><p class="carregando">A carregar</p></div>`.s;

  const desenharListas = async () => {
    let r;
    try { r = await api('playlists'); } catch { $('#listas').innerHTML = semServidor().s; return; }
    $('#listas').innerHTML = r.resultados.length ? html`<div class="grelha larga">${r.resultados.map((p) => html`<article class="cartao">
        <div class="cartao-corpo"><p class="meta">YouTube · ${plural(p.n, 'vídeo', 'vídeos')}</p><h3>${p.titulo}</h3>
          <div class="acoes" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            <button class="botao peq primario" data-tocar-lista="${p.doc_id}">▶ Ouvir tudo</button>
            <button class="botao peq" data-ver-lista="${p.doc_id}">Ver vídeos</button>
            <a class="botao peq" href="${p.url}" target="_blank" rel="noopener">↗</a></div></div></article>`)}</div>
      <div id="videos-lista" style="margin-top:24px"></div>`.s : '<p class="mudo">Ainda não há playlists importadas.</p>';
  };
  const videosDe = async (doc) => (await api('media', { doc, tipo: 'video', ordem: 'antigos' })).resultados;

  caixa.onclick = async (e) => {
    const t = e.target.closest('[data-tocar-lista]'), v = e.target.closest('[data-ver-lista]');
    if (t) enfileirar((await videosDe(t.dataset.tocarLista)).map(itemDoArquivo));
    if (v) $('#videos-lista').innerHTML = html`<div class="grelha larga">${(await videosDe(v.dataset.verLista)).map(cartaoMediaArquivo)}</div>`.s;
  };

  $('#f-lista').onsubmit = async (e) => {
    e.preventDefault();
    const estado = $('#estado-lista');
    let lista = '';
    try { lista = new URL(e.target.url.value).searchParams.get('list') || ''; } catch { /* endereço inválido */ }
    if (!lista) { estado.textContent = 'O endereço não tem «list=…».'; return; }
    estado.textContent = 'A ler a playlist no leitor do YouTube…';
    const YT = await carregarYT();
    const ids = await new Promise((res) => {
      let feito = false, n = 0;
      const p = new YT.Player('leitor-lista', { width: 200, height: 120, playerVars: { autoplay: 0 }, events: {
        onReady: () => { p.cuePlaylist({ listType: 'playlist', list: lista }); ler(); },
        onError: () => { if (!feito) { feito = true; res([]); } },
      } });
      const ler = () => {
        if (feito) return;
        const l = (p.getPlaylist && p.getPlaylist()) || [];
        if (l.length || ++n > 60) { feito = true; res(l); p.destroy(); } else setTimeout(ler, 300);
      };
    });
    if (!ids.length) { estado.textContent = 'Não foi possível ler a playlist (é privada?).'; return; }
    estado.textContent = `${ids.length} vídeos encontrados. A guardar e a ir buscar os títulos (pode demorar um minuto)…`;
    try {
      const r = await fetch('/api/playlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lista, ids }) })
        .then((x) => x.json());
      if (r.erro) throw new Error(r.erro);
      estado.textContent = `Guardada: «${r.titulo}», ${r.n} vídeos${r.indisponiveis ? ` (${r.indisponiveis} indisponíveis)` : ''}.`;
      aviso('Playlist importada');
      desenharListas();
    } catch (err) { estado.textContent = `Erro ao guardar: ${err.message}`; }
  };
  desenharListas();
}

/** Media catalogados nas fichas que correspondem ao separador e aos filtros. */
function catalogadosFiltrados(sep, q, plataforma) {
  const nq = norm(q);
  return E.base.media.filter((m) => {
    const c = classificar(m.url) || { tipo: m.tipo, plataforma: m.plataforma };
    if ((m.tipo || c.tipo) !== TIPO[sep] || (FIXA[sep] && c.plataforma !== FIXA[sep]) || (plataforma && c.plataforma !== plataforma)) return false;
    if (!visivel(m)) return false;
    return !nq || norm([m.titulo, ...(m.pessoas || []).map((p) => E.por.pessoas[p]?.nome), ...(m.obras || []).map((o) => E.por.obras[o]?.titulo)].join(' ')).includes(nq);
  });
}

export function mediateca(el, params) {
  // online não há a cópia dos blogues: só o media catalogado nas fichas (sem imagens, partituras nem playlists importadas)
  const arquivo = comArquivo();
  const separadores = arquivo ? SEPARADORES : { videos: SEPARADORES.videos, ineditos: SEPARADORES.ineditos, audio: SEPARADORES.audio };
  let sep = separadores[params.separador] ? params.separador : 'videos';
  let q = params.q || '', plataforma = params.plataforma || '', ordem = params.ordem || '', pagina = 1, ultimos = [];
  let estado = arquivo ? params.estado || '' : 'catalogados';

  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Música</p><h1>Mediateca</h1>
      <p class="lead">${arquivo ? 'Tudo o que os blogues incorporaram ou ligaram — vídeos, áudios e fotografias — com o texto que os acompanha.'
        : 'Os vídeos e áudios identificados nas fichas, com as pessoas e obras de cada um.'}
        Os vídeos tocam no leitor em baixo e continuam enquanto navega.</p></header>
    <div class="separadores" role="tablist">${Object.entries(separadores).map(([k, n]) =>
      html`<button role="tab" data-sep="${k}" aria-selected="${k === sep}">${n}</button>`)}</div>
    <div class="barra-filtros">
      <input class="campo" type="search" id="q" placeholder="Nome, obra, local… (procura no título do post e no texto à volta)" value="${q}">
      <select class="campo" id="estado" title="Catalogado = identificado nas fichas, com fonte"><option value="">Todos</option><option value="catalogados">✓ Só catalogados</option></select>
      <select class="campo" id="plataforma"></select>
      <select class="campo" id="ordem"><option value="">Mais recentes</option><option value="antigos">Mais antigos</option><option value="aleatorio">Ao acaso</option></select>
      <button class="botao" id="tudo-fila" title="Juntar os resultados visíveis à fila">+ Fila (todos)</button>
    </div>
    <p class="mudo" id="explicacao" style="margin:-8px 0 18px;font-size:14px"></p>
    <p class="mudo" id="total" style="font-size:13px"></p>
    <div id="lista"></div>
    <div class="paginacao"><button class="botao" id="mais" hidden>Carregar mais</button></div>
  </div>`.s;
  $('#ordem').value = ordem;
  $('#estado').value = estado;

  const opcoesPlataforma = () => {
    $('#plataforma').innerHTML = html`<option value="">Todas as origens</option>${PLATAFORMAS[sep].map((p) => html`<option value="${p}">${NOME_PLATAFORMA[p]}</option>`)}`.s;
    $('#plataforma').value = plataforma;
    $('#plataforma').hidden = !PLATAFORMAS[sep].length;
    $('#tudo-fila').hidden = sep === 'imagens' || sep === 'partituras';
    $('#estado').hidden = !arquivo || sep === 'imagens' || sep === 'partituras';
    $('#explicacao').textContent = EXPLICACAO[sep] || '';
  };

  const carregar = async (acrescentar = false) => {
    const filtros = $('.barra-filtros', el);
    filtros.hidden = sep === 'playlists';
    if (sep === 'playlists') {
      $('#total').textContent = ''; $('#mais').hidden = true; $('#explicacao').textContent = '';
      definirParams({ separador: sep });
      return playlists($('#lista'));
    }
    if (!acrescentar) { pagina = 1; ultimos = []; $('#lista').innerHTML = '<p class="carregando">A carregar</p>'; }
    if (estado === 'catalogados' && !['imagens', 'partituras'].includes(sep)) {
      const lista = catalogadosFiltrados(sep, q, plataforma);
      ultimos = lista.map(itemCurado);
      $('#total').textContent = `${plural(lista.length, 'item catalogado', 'itens catalogados')} nas fichas${q ? ` com «${q}»` : ''}`;
      $('#lista').innerHTML = lista.length ? html`<div class="grelha larga">${lista.map(cartaoMediaCurado)}</div>`.s
        : '<p class="mudo">Ainda não há media catalogado aqui. Os agentes de investigação vão acrescentando.</p>';
      $('#mais').hidden = true;
      definirParams({ separador: sep === 'videos' ? '' : sep, q, plataforma, estado });
      return;
    }
    let r;
    try {
      r = await api('media', { tipo: TIPO[sep], plataforma: FIXA[sep] || plataforma, q, ordem, pagina });
    } catch { $('#lista').innerHTML = semServidor().s; return; }
    ultimos = acrescentar ? ultimos.concat(r.resultados) : r.resultados;
    ultimos = ultimos.map((m) => ({ ...m, _item: itemDoArquivo(m) }));
    $('#total').textContent = `${plural(r.total, 'item', 'itens')} no arquivo${q ? ` com «${q}»` : ''}`;
    const conteudo = sep === 'imagens'
      ? html`<div class="galeria">${ultimos.map((m) => figuraImagem(m.url, m.legenda || [m.contexto_antes?.slice(-90), m.contexto_depois?.slice(0, 90)].filter(Boolean).join(' ▸ '), '#/doc/' + m.doc_id))}</div>`
      : html`<div class="grelha larga">${ultimos.map(cartaoMediaArquivo)}</div>`;
    $('#lista').innerHTML = ultimos.length ? conteudo.s : '<p class="mudo">Nada encontrado.</p>';
    $('#mais').hidden = ultimos.length >= r.total || ordem === 'aleatorio';
    definirParams({ separador: sep === 'videos' ? '' : sep, q, plataforma, ordem, estado });
  };

  $('[role=tablist]').onclick = (e) => {
    const b = e.target.closest('[data-sep]'); if (!b) return;
    sep = b.dataset.sep; plataforma = '';
    $$('[data-sep]').forEach((x) => x.setAttribute('aria-selected', x === b));
    opcoesPlataforma(); carregar();
  };
  $('#q').oninput = debounce((e) => { q = e.target.value.trim(); carregar(); }, 300);
  $('#plataforma').onchange = (e) => { plataforma = e.target.value; carregar(); };
  $('#ordem').onchange = (e) => { ordem = e.target.value; carregar(); };
  $('#estado').onchange = (e) => { estado = e.target.value; carregar(); };
  $('#mais').onclick = () => { pagina++; carregar(true); };
  $('#tudo-fila').onclick = () => enfileirar(ultimos.map((m) => m._item || m)
    .filter((m) => !['rtp-arquivos', 'rtp-play', 'musescore'].includes(m.plataforma)));
  opcoesPlataforma();
  carregar();
}
