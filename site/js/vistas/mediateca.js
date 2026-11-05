// Mediateca: vídeos, áudios e imagens — curados e encontrados no arquivo dos blogues.
import { E, visivel, comArquivo } from '../estado.js';
import { $, $$, html, raw, api, debounce, definirParams, NOME_PLATAFORMA, plural, classificar, aviso, termosProcura, temTodas, compararPt, preferencias } from '../util.js';
import { cartaoMediaArquivo, cartaoMediaCurado, figuraImagem, semServidor, itemCurado, agruparMedia, ordenarGrupos, itemDaFaixa, AVISO_IDENTIFICACOES } from '../componentes.js';
import { enfileirar, itemDoArquivo, carregarYT, tocaAqui } from '../leitor.js';
import { filtroMultiplo, atualizarFiltro } from '../filtros.js';
import { editando } from '../edicao.js';
import { botaoNova } from '../fichas.js';
import { alternarMortos, botaoMortos } from '../ouvir.js';

const SEPARADORES = { videos: 'Vídeos', ineditos: 'Inéditos do blogue', audio: 'Áudio', partituras: 'Partituras', imagens: 'Imagens', playlists: 'Playlists' };
const TIPO = { videos: 'video', ineditos: 'video', audio: 'audio', partituras: 'partitura', imagens: 'imagem' };
const FIXA = { ineditos: 'blogger' };
const SEM_ORIGENS = ['imagens', 'partituras', 'playlists']; // separadores sem o seletor de origens
const POR_VEZ = 60; // cartões de media catalogado desenhados de cada vez («Mostrar mais»)
const PLATAFORMAS = {
  videos: ['youtube', 'rtp-arquivos', 'blogger', 'vimeo', 'facebook', 'dailymotion', 'rtp-play'], ineditos: [],
  audio: ['soundcloud', 'ficheiro', 'internet-archive', 'spotify'], partituras: [], imagens: [], playlists: [],
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
    try { r = await api('playlists'); } catch { if (caixa.isConnected) $('#listas').innerHTML = semServidor().s; return; }
    if (!caixa.isConnected) return; // entretanto mudou-se de página
    $('#listas').innerHTML = r.resultados.length ? html`<div class="grelha larga">${r.resultados.map((p) => html`<article class="cartao">
        <div class="cartao-corpo"><p class="meta">YouTube · ${plural(p.n, 'vídeo', 'vídeos')}</p><h3>${p.titulo}</h3>
          <div class="acoes" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            <button class="botao peq primario" data-tocar-lista="${p.doc_id}">▶ Ouvir tudo</button>
            <button class="botao peq" data-ver-lista="${p.doc_id}">Ver vídeos</button>
            <a class="botao peq" href="${p.url}" target="_blank" rel="noopener" aria-label="Abrir a playlist no YouTube (nova janela)">↗</a></div></div></article>`)}</div>
      <div id="videos-lista" style="margin-top:24px"></div>`.s : '<p class="mudo">Ainda não há playlists importadas.</p>';
  };
  const videosDe = async (doc) => (await api('media', { doc, tipo: 'video', ordem: 'antigos' })).resultados;

  caixa.onclick = async (e) => {
    const t = e.target.closest('[data-tocar-lista]'), v = e.target.closest('[data-ver-lista]');
    if (!t && !v) return;
    try {
      if (t) enfileirar((await videosDe(t.dataset.tocarLista)).map(itemDoArquivo));
      if (v) $('#videos-lista').innerHTML = html`<div class="grelha larga">${(await videosDe(v.dataset.verLista)).map(cartaoMediaArquivo)}</div>`.s;
    } catch { aviso('Não foi possível ler a playlist (servidor local desligado?)'); }
  };

  $('#f-lista').onsubmit = async (e) => {
    e.preventDefault();
    const estado = $('#estado-lista');
    let lista = '';
    try { lista = new URL(e.target.url.value).searchParams.get('list') || ''; } catch { /* endereço inválido */ }
    if (!lista) { estado.textContent = 'O endereço não tem «list=…».'; return; }
    estado.textContent = 'A ler a playlist no leitor do YouTube…';
    let YT;
    try { YT = await carregarYT(); } catch { estado.textContent = 'Não foi possível ler a playlist (sem ligação ao YouTube?).'; return; }
    let ids = [];
    try {
      ids = await new Promise((res) => {
        let feito = false, n = 0;
        const acabar = (l) => { if (!feito) { feito = true; res(l); } };
        setTimeout(() => acabar([]), 25000); // o leitor do YouTube não respondeu: não fica «A ler…» para sempre
        const p = new YT.Player('leitor-lista', { width: 200, height: 120, playerVars: { autoplay: 0 }, events: {
          onReady: () => { p.cuePlaylist({ listType: 'playlist', list: lista }); ler(); },
          onError: () => acabar([]),
        } });
        const ler = () => {
          if (feito) return;
          const l = (p.getPlaylist && p.getPlaylist()) || [];
          if (l.length || ++n > 60) { acabar(l); p.destroy(); } else setTimeout(ler, 300);
        };
      });
    } catch { /* o leitor do YouTube não arrancou */ }
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

const plataformaDe = (m) => (classificar(m.url) || { plataforma: 'outro' }).plataforma;
const morto = (m) => m.disponivel === false || m.disponivel === 0;

/** Media catalogados nas fichas deste separador que correspondem à procura: todas as palavras, por qualquer ordem e sem
 *  acentos, no título, nas pessoas (também os outros nomes, como «Zeca»), nas obras, no disco (editora, referência, ano)
 *  e na data. Com `mortos`, os que têm o link morto (para os contar). */
function catalogadosDoSeparador(sep, q, { mortos = false } = {}) {
  const termos = termosProcura(q);
  return E.base.media.filter((m) => {
    const c = classificar(m.url) || { tipo: m.tipo, plataforma: 'outro' };
    if ((m.tipo || c.tipo) !== TIPO[sep] || (FIXA[sep] && c.plataforma !== FIXA[sep])) return false;
    if (mortos ? !morto(m) : !visivel(m)) return false;
    return !termos.length || temTodas(E.textoMedia?.[m.id] || m.titulo || '', termos);
  });
}

/** Grupos de agruparMedia() pela ordem escolhida: por data (a da ficha ou o ano do disco; sem data, no fim) ou ao acaso. */
function ordenarCatalogados(grupos, ordem) {
  if (ordem !== 'aleatorio') return ordenarGrupos(grupos, ordem === 'antigos' ? 1 : -1);
  const l = [...grupos];
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
  return l;
}

/** Opções do seletor de origens: as que têm resultados (mais primeiro) e as já escolhidas. */
function opcoesOrigem(contagem, escolhidas) {
  const nomes = { ...contagem };
  for (const p of escolhidas) nomes[p] ??= 0;
  return Object.entries(nomes).sort((a, b) => b[1] - a[1] || compararPt(NOME_PLATAFORMA[a[0]] || a[0], NOME_PLATAFORMA[b[0]] || b[0]))
    .map(([p, n]) => ({ valor: p, nome: NOME_PLATAFORMA[p] || p, n }));
}

/** Os cartões do arquivo, com os vídeos seguidos do mesmo documento juntos: os 2 primeiros e «+N deste documento»
 *  (uma página de canal com 30 vídeos não enche o ecrã sozinha). `abertos`: documentos já mostrados por inteiro. */
function cartoesPorDocumento(lista, abertos) {
  const blocos = [];
  for (const m of lista) { const b = blocos.at(-1); if (b && b.doc === m.doc_id) b.itens.push(m); else blocos.push({ doc: m.doc_id, itens: [m] }); }
  return html`${blocos.map((b) => (b.itens.length <= 3 || abertos.has(b.doc) ? b.itens.map(cartaoMediaArquivo)
    : html`${b.itens.slice(0, 2).map(cartaoMediaArquivo)}<button type="button" class="cartao mais-documento" data-abrir-doc="${b.doc}">
      <b>+${b.itens.length - 2} deste documento</b><span>${String(b.itens[0].titulo_doc || '').replace(/^~/, '')}</span></button>`))}`;
}

export function mediateca(el, params) {
  // online não há a cópia dos blogues: só o media catalogado nas fichas (sem imagens, partituras nem playlists importadas)
  const arquivo = comArquivo();
  const separadores = arquivo ? SEPARADORES : { videos: SEPARADORES.videos, ineditos: SEPARADORES.ineditos, audio: SEPARADORES.audio };
  let sep = separadores[params.separador] ? params.separador : 'videos';
  let q = params.q || '', plataformas = (params.plataforma || '').split(',').filter(Boolean), ordem = params.ordem || '', pagina = 1, ultimos = [];
  let estado = arquivo ? params.estado || '' : 'catalogados';
  let grupos = [], mostrados = 0, paraOuvir = []; // «Só catalogados»: os grupos filtrados, quantos já estão desenhados e os que tocam aqui
  const abertos = new Set();

  el.innerHTML = html`<div class="conteudo mediateca">
    <header class="cabecalho"><p class="sobretitulo">Música</p><h1>Mediateca</h1>
      <p class="lead">${arquivo ? 'Tudo o que os blogues incorporaram ou ligaram — vídeos, áudios e fotografias — com o texto que os acompanha.'
        : 'Os vídeos e áudios identificados nas fichas, com as pessoas e obras de cada um.'}
        <span class="so-largo">Os vídeos tocam no leitor em baixo e continuam enquanto navega.</span></p>
      ${editando() ? html`<p class="acoes-lista">${botaoNova('media')}</p>` : ''}</header>
    <div class="separadores" role="tablist">${Object.entries(separadores).map(([k, n]) =>
      html`<button role="tab" data-sep="${k}" aria-selected="${String(k === sep)}">${n}</button>`)}</div>
    <div class="barra-filtros filtros-mediateca">
      <input class="campo" type="search" id="q" placeholder="Nome, obra, local…" aria-label="Procurar na mediateca" value="${q}">
      <button type="button" class="botao abrir-filtros" id="abrir-filtros" aria-expanded="false" aria-controls="filtros-extra">Filtros</button>
      <div class="filtros-extra" id="filtros-extra">
        <div class="alternar-estado" id="estado" role="group" aria-label="Que media mostrar">
          <button type="button" class="botao" data-estado="" title="Tudo o que está no arquivo (ainda por triar)">Todos <span class="n" id="n-todos"></span></button>
          <button type="button" class="botao" data-estado="catalogados" title="Catalogado = identificado nas fichas, com fonte">✓ Só catalogados <span class="n" id="n-cat"></span></button></div>
        <div id="origens"></div>
        <select class="campo" id="ordem" aria-label="Ordenar"><option value="">Mais recentes</option><option value="antigos">Mais antigos</option><option value="aleatorio">Ao acaso</option></select>
        <button class="botao" id="tudo-fila">+ Fila</button>
      </div>
    </div>
    <p class="mudo" id="explicacao" style="margin:-8px 0 18px;font-size:14px"></p>
    <p class="mudo" id="total" style="font-size:13px"></p>
    <h2 class="so-leitor">Resultados</h2>
    <div id="lista"></div>
    <div class="paginacao"><button class="botao" id="mais" hidden>Carregar mais</button></div>
  </div>`.s;
  $('#ordem').value = ordem;

  const comOrigens = () => !FIXA[sep] && !SEM_ORIGENS.includes(sep);
  const catalogadosAqui = () => estado === 'catalogados' && !['imagens', 'partituras'].includes(sep);
  const desenharEstado = () => {
    $$('[data-estado]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.estado === estado)));
    const n = (estado === 'catalogados' && arquivo ? 1 : 0) + (plataformas.length ? 1 : 0) + (ordem ? 1 : 0);
    $('#abrir-filtros').textContent = n ? `Filtros (${n})` : 'Filtros';
  };
  const opcoesPlataforma = () => {
    $('#origens').innerHTML = comOrigens() ? filtroMultiplo({ id: 'plataforma', todos: 'Todas as origens', unidade: ['origem', 'origens'],
      opcoes: opcoesOrigem(Object.fromEntries(PLATAFORMAS[sep].map((p) => [p, null])), plataformas).map((o) => ({ ...o, n: undefined })),
      escolhidos: plataformas }).s : '';
    $('#tudo-fila').hidden = sep === 'imagens' || sep === 'partituras';
    $('#estado').hidden = !arquivo || sep === 'imagens' || sep === 'partituras';
    $('#explicacao').textContent = EXPLICACAO[sep] || '';
    desenharEstado();
  };
  /** Total e, se houver, «+ N com link morto» (redesenha sem recarregar a página). */
  const total = (texto, mortos) => { $('#total').innerHTML = html`${texto} ${botaoMortos(mortos)}`.s; };

  const desenharMaisCatalogados = () => {
    const resto = grupos.length - mostrados;
    $('#mais').hidden = resto <= 0;
    $('#mais').textContent = `Mostrar mais (${resto.toLocaleString('pt-PT')} ${resto === 1 ? 'restante' : 'restantes'})`;
  };

  let pedidos = 0; // só conta a resposta do último pedido (escolhas rápidas não se atropelam)
  const carregar = async (acrescentar = false) => {
    const este = ++pedidos;
    const filtros = $('.barra-filtros', el);
    filtros.hidden = sep === 'playlists';
    desenharEstado();
    if (sep === 'playlists') {
      $('#total').textContent = ''; $('#mais').hidden = true; $('#explicacao').textContent = '';
      definirParams({ separador: sep });
      return playlists($('#lista'));
    }
    if (!acrescentar) { pagina = 1; ultimos = []; $('#lista').innerHTML = '<p class="carregando">A carregar</p>'; }
    if (catalogadosAqui() || (arquivo && !['imagens', 'partituras'].includes(sep))) { // contagem para «✓ Só catalogados»
      $('#n-cat').textContent = agruparMedia(catalogadosDoSeparador(sep, q)).length.toLocaleString('pt-PT');
    }
    if (catalogadosAqui()) {
      if (acrescentar) { // «Mostrar mais»: acrescenta os grupos seguintes, sem redesenhar os que já estão
        $('#lista .grelha')?.insertAdjacentHTML('beforeend', html`${grupos.slice(mostrados, mostrados + POR_VEZ).map(cartaoMediaCurado)}`.s);
        mostrados += POR_VEZ; desenharMaisCatalogados();
        return;
      }
      // contagem para «Todos» (com a mesma procura e as mesmas origens), também quando a página abre em «Só catalogados»
      if (arquivo) api('media', { tipo: TIPO[sep], plataforma: FIXA[sep] || plataformas.join(','), q, pagina: 1 })
        .then((r) => { if (este === pedidos && el.isConnected) $('#n-todos').textContent = r.total.toLocaleString('pt-PT'); })
        .catch(() => { /* sem servidor: «Todos» fica sem número */ });
      const doSeparador = catalogadosDoSeparador(sep, q), contagem = {};
      for (const m of doSeparador) contagem[plataformaDe(m)] = (contagem[plataformaDe(m)] || 0) + 1;
      atualizarFiltro($('#plataforma'), opcoesOrigem(contagem, plataformas));
      const daOrigem = (m) => !plataformas.length || plataformas.includes(plataformaDe(m));
      grupos = ordenarCatalogados(agruparMedia(doSeparador.filter(daOrigem)), ordem); // o mesmo vídeo em várias fichas: um só cartão
      paraOuvir = grupos.map((g) => itemDaFaixa(g.map((m) => m.id))).filter(Boolean);
      mostrados = POR_VEZ;
      const mortos = catalogadosDoSeparador(sep, q, { mortos: true }).filter(daOrigem).length;
      total(`${plural(grupos.length, 'item catalogado', 'itens catalogados')} nas fichas${q ? ` com «${q}»` : ''}`, mortos);
      $('#tudo-fila').textContent = `▶ Ouvir ${paraOuvir.length > 1 ? `os ${paraOuvir.length.toLocaleString('pt-PT')}` : ''}`.trim();
      $('#tudo-fila').disabled = !paraOuvir.length;
      $('#tudo-fila').title = 'Põe na fila, por esta ordem, um de cada (o que toca aqui; os da RTP abrem no site da RTP)';
      $('#lista').innerHTML = grupos.length ? html`<p class="aviso-identificacoes">${AVISO_IDENTIFICACOES}</p>
        <div class="grelha larga">${grupos.slice(0, mostrados).map(cartaoMediaCurado)}</div>`.s
        : html`<p class="mudo">${q ? `Nada catalogado com «${q}».` : 'Ainda não há media catalogado aqui. Os agentes de investigação vão acrescentando.'}</p>`.s;
      desenharMaisCatalogados();
      definirParams({ separador: sep === 'videos' ? '' : sep, q, plataforma: plataformas.join(','), ordem, estado });
      return;
    }
    let r;
    try {
      r = await api('media', { tipo: TIPO[sep], plataforma: FIXA[sep] || plataformas.join(','), q, ordem, pagina });
      if (este !== pedidos || !el.isConnected) return; // outro pedido mais recente, ou já se mudou de página
    } catch { if (el.isConnected) $('#lista').innerHTML = semServidor().s; return; }
    if (comOrigens()) atualizarFiltro($('#plataforma'), opcoesOrigem(r.por_plataforma || {}, plataformas));
    ultimos = acrescentar ? ultimos.concat(r.resultados) : r.resultados;
    ultimos = ultimos.map((m) => ({ ...m, _item: itemDoArquivo(m) }));
    $('#n-todos').textContent = r.total.toLocaleString('pt-PT');
    total(`${plural(r.total, 'item', 'itens')} no arquivo${q ? ` com «${q}»` : ''}`, r.indisponiveis || 0);
    const tocam = ultimos.filter((m) => m.tipo !== 'partitura' && tocaAqui(m._item)).length;
    $('#tudo-fila').textContent = `+ Fila (${tocam.toLocaleString('pt-PT')} ${tocam === 1 ? 'visível' : 'visíveis'})`;
    $('#tudo-fila').disabled = !tocam;
    $('#tudo-fila').title = 'Junta à fila os resultados já carregados que tocam aqui (os da RTP abrem no site da RTP)';
    const conteudo = sep === 'imagens'
      ? html`<div class="galeria">${ultimos.map((m) => figuraImagem(m.url, m.legenda || [m.contexto_antes?.slice(-90), m.contexto_depois?.slice(0, 90)].filter(Boolean).join(' ▸ '), '#/doc/' + m.doc_id))}</div>`
      : html`<div class="grelha larga">${cartoesPorDocumento(ultimos, abertos)}</div>`;
    $('#lista').innerHTML = ultimos.length ? conteudo.s : '<p class="mudo">Nada encontrado.</p>';
    $('#mais').textContent = 'Carregar mais';
    $('#mais').hidden = ultimos.length >= r.total || ordem === 'aleatorio';
    definirParams({ separador: sep === 'videos' ? '' : sep, q, plataforma: plataformas.join(','), ordem, estado });
  };

  $('[role=tablist]').onclick = (e) => {
    const b = e.target.closest('[data-sep]'); if (!b) return;
    sep = b.dataset.sep; plataformas = [];
    $$('[data-sep]').forEach((x) => x.setAttribute('aria-selected', x === b));
    opcoesPlataforma(); carregar();
  };
  $('#q').oninput = debounce((e) => { q = e.target.value.trim(); carregar(); }, 300);
  $('.barra-filtros', el).addEventListener('filtro', (e) => { plataformas = e.detail; carregar(); });
  $('#ordem').onchange = (e) => { ordem = e.target.value; carregar(); };
  $('#estado').onclick = (e) => { const b = e.target.closest('[data-estado]'); if (b && b.dataset.estado !== estado) { estado = b.dataset.estado; carregar(); } };
  // no telemóvel, os filtros (menos a procura) ficam atrás de um botão, para os vídeos aparecerem no primeiro ecrã
  $('#abrir-filtros').onclick = (e) => { const f = $('.barra-filtros', el); f.classList.toggle('abertos'); e.currentTarget.setAttribute('aria-expanded', String(f.classList.contains('abertos'))); };
  $('#total').onclick = (e) => { if (e.target.closest('[data-mostrar-mortos]')) { alternarMortos(); carregar(); } };
  $('#lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-abrir-doc]');
    if (!b) return;
    abertos.add(b.dataset.abrirDoc);
    $('#lista .grelha').innerHTML = cartoesPorDocumento(ultimos, abertos).s;
  });
  $('#mais').onclick = () => { if (catalogadosAqui()) carregar(true); else { pagina++; carregar(true); } };
  $('#tudo-fila').onclick = () => {
    if (catalogadosAqui()) return enfileirar(paraOuvir);
    enfileirar(ultimos.filter((m) => m.tipo !== 'partitura').map((m) => m._item).filter(tocaAqui));
  };
  opcoesPlataforma();
  carregar();
}
