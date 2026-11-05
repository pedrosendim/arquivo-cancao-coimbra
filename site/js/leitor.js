// Leitor persistente (continua a tocar enquanto se navega) com fila de audição.
// Só toca pelos leitores oficiais de cada plataforma; o que não se pode ver aqui (os programas da RTP) abre no site original.
import { $, html, raw, esc, aviso, guardar, ler, NOME_PLATAFORMA, enderecoSeguro, capaMedia, fundo } from './util.js';
import { E } from './estado.js';
import { marcas } from './citacoes.js';
import { mostrarLetraDe, iniciarFolhaLetra } from './letras.js';

/** Plataformas que não tocam aqui: os programas da RTP veem-se no site da RTP, «outro» é só uma ligação,
 *  as partituras abrem no MuseScore. */
const EXTERNOS = new Set(['rtp-arquivos', 'rtp-play', 'outro', 'musescore']);
export const tocaAqui = (item) => !!item?.plataforma && !EXTERNOS.has(item.plataforma);
const AUDIO_DIRETO = new Set(['ficheiro', 'museu-do-fado']); // um ficheiro de áudio: comandos e barra de tempo do próprio leitor
const FAIXA = new Set(['apple-music', 'spotify']); // leitores só de áudio, largos e baixos
const ICONE_TOCAR = '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>';
const ICONE_PAUSA = '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

const valido = (it) => tocaAqui(it) && !!enderecoSeguro(it.url);
let fila = (() => { const f = ler('fila', []); return Array.isArray(f) ? f.filter(valido) : []; })(); // visitas anteriores: só o que toca aqui
const guardado = ler('leitorEstado', {}) || {};
let atual = -1;            // posição na fila do item mostrado no leitor
let montado = false;       // há um item carregado (a tocar ou em pausa); falso quando só se mostra o «Retomar»
let fechado = !!guardado.fechado;
let montagem = 0;          // cada item novo invalida o anterior: a API do YouTube pode chegar depois de outro clique
let avisaOFim = false;     // o leitor desta plataforma diz quando acaba (a fila avança sozinha)
let ytPlayer = null, controlo = null, temporizador = null;
let ytPronto = null;
const apis = {};
const audio = () => $('#leitor-audio');

const guardarEstado = () => guardar('leitorEstado', { atual, fechado });

export function carregarYT() {
  ytPronto ||= new Promise((res, rej) => {
    if (window.YT?.Player) return res(window.YT);
    window.onYouTubeIframeAPIReady = () => res(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = rej;
    document.head.append(s);
    setTimeout(() => rej(new Error('tempo esgotado')), 8000);
  }).catch((e) => { ytPronto = null; throw e; }); // sem rede agora: volta a tentar no vídeo seguinte
  return ytPronto;
}

/** API oficial de um leitor, carregada do domínio da própria plataforma (como a do YouTube). */
function carregarApi(src, global) {
  apis[src] ||= new Promise((res, rej) => {
    if (global()) return res(global());
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => (global() ? res(global()) : rej(new Error('API indisponível')));
    s.onerror = rej;
    document.head.append(s);
    setTimeout(() => rej(new Error('tempo esgotado')), 8000);
  }).catch((e) => { delete apis[src]; throw e; });
  return apis[src];
}

/** O vídeo do Blogger só se incorpora a partir do próprio Blogger (https://www.blogger.com/video.g?token=…). */
function bloggerOficial(u) {
  try {
    const x = new URL(u);
    return ['https:', 'http:'].includes(x.protocol) && ['www.blogger.com', 'blogger.com'].includes(x.host) && x.pathname === '/video.g'
      ? `https://www.blogger.com/video.g${x.search}` : null;
  } catch { return null; }
}

// cada endereço é montado sobre o domínio do leitor oficial; nada do que vem dos dados passa a ser o endereço do iframe
function urlIncorporado(it) {
  const c = encodeURIComponent;
  switch (it.plataforma) {
    case 'youtube': return `https://www.youtube-nocookie.com/embed/${c(it.chave)}?autoplay=1&rel=0`;
    case 'vimeo': return `https://player.vimeo.com/video/${c(it.chave)}?autoplay=1`;
    case 'spotify': return `https://open.spotify.com/embed/${it.chave}`;
    case 'blogger': return bloggerOficial(it.url);
    case 'soundcloud': return `https://w.soundcloud.com/player/?url=${c(it.url)}&auto_play=true&visual=true`;
    case 'internet-archive': return `https://archive.org/embed/${c(it.chave)}?autoplay=1`;
    case 'dailymotion': return `https://www.dailymotion.com/embed/video/${c(it.chave)}?autoplay=1`;
    case 'apple-music': return `https://embed.music.apple.com/${it.chave}`;
    case 'facebook': return `https://www.facebook.com/plugins/video.php?href=${c(it.url)}&autoplay=true`;
    default: return null;
  }
}

const modoDe = (it) => (AUDIO_DIRETO.has(it.plataforma) ? 'audio' : FAIXA.has(it.plataforma) ? 'faixa' : 'video');

/** Pára e tira do ecrã o item atual (leitores, áudio, temporizadores, comandos do sistema). */
function desmontar() {
  clearTimeout(temporizador);
  try { ytPlayer?.destroy?.(); } catch { /* já tinha saído */ }
  ytPlayer = null; controlo = null; avisaOFim = false; montado = false;
  const a = audio();
  if (a?.getAttribute('src')) { a.pause(); a.removeAttribute('src'); a.load(); }
  $('#leitor-ecra').innerHTML = '';
  mostrarProgresso(false);
  semSessaoMedia();
  estadoTocar(false);
}

async function montar(it) {
  const este = ++montagem;
  const aqui = () => este === montagem; // as respostas que chegam tarde (API, eventos) só contam para o item atual
  desmontar();
  montado = true;
  const ecra = $('#leitor-ecra');
  ecra.dataset.plataforma = it.plataforma; // Apple Music e Spotify pedem um ecrã largo e baixo (estilo.css)
  $('#leitor').dataset.modo = modoDe(it);
  mostrarPausa(false);
  if (!tocaAqui(it)) return indisponivel(it, `${NOME_PLATAFORMA[it.plataforma] || 'Este conteúdo'} só pode ser visto no site original.`);
  if (AUDIO_DIRETO.has(it.plataforma)) return montarAudio(it);
  if (it.plataforma === 'youtube') {
    try {
      const YT = await carregarYT();
      if (!aqui()) return; // entretanto pediu-se outro item
      ecra.innerHTML = '<div id="yt-alvo"></div>';
      ytPlayer = new YT.Player('yt-alvo', {
        videoId: it.chave, host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => { e.target.getIframe?.()?.setAttribute('title', `Leitor: ${it.titulo || 'YouTube'}`); e.target.playVideo(); }, // começa logo, mesmo quando o browser ignora «autoplay»
          onStateChange: (e) => { if (!aqui()) return; if (e.data === 0) seguinte(true); estadoTocar(e.data === 1 || e.data === 3); },
          onError: () => { if (aqui()) indisponivel(it, 'Este vídeo não pode ser reproduzido aqui (removido ou com incorporação desativada).'); },
        },
      });
      controlo = { alternar: () => (ytPlayer?.getPlayerState?.() === 1 ? ytPlayer.pauseVideo() : ytPlayer?.playVideo?.()) };
      avisaOFim = true; mostrarPausa(true); desenharNota();
      return;
    } catch { if (!aqui()) return; /* sem API: usa iframe simples */ }
  }
  const src = urlIncorporado(it);
  if (!src) return indisponivel(it, `${NOME_PLATAFORMA[it.plataforma] || 'Este conteúdo'} só pode ser visto no site original.`);
  ecra.innerHTML = html`<iframe src="${src}" title="Leitor: ${it.titulo || NOME_PLATAFORMA[it.plataforma] || ''}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>`.s;
  if (it.plataforma === 'vimeo') ligarVimeo($('iframe', ecra), aqui);
  if (it.plataforma === 'soundcloud') ligarSoundcloud($('iframe', ecra), aqui);
  desenharNota();
}

// Vimeo e SoundCloud: as APIs oficiais dizem quando o vídeo ou o som acaba, e deixam pôr em pausa
async function ligarVimeo(iframe, aqui) {
  try {
    const V = await carregarApi('https://player.vimeo.com/api/player.js', () => window.Vimeo?.Player && window.Vimeo);
    if (!aqui()) return;
    const p = new V.Player(iframe);
    p.on('ended', () => aqui() && seguinte(true));
    p.on('play', () => aqui() && estadoTocar(true));
    p.on('pause', () => aqui() && estadoTocar(false));
    controlo = { alternar: () => p.getPaused().then((x) => (x ? p.play() : p.pause())).catch(() => {}) };
    avisaOFim = true; mostrarPausa(true); desenharNota();
  } catch { /* sem a API: o vídeo toca, mas a fila não avança sozinha */ }
}

async function ligarSoundcloud(iframe, aqui) {
  try {
    const SC = await carregarApi('https://w.soundcloud.com/player/api.js', () => window.SC?.Widget && window.SC);
    if (!aqui()) return;
    const w = SC.Widget(iframe);
    w.bind(SC.Widget.Events.FINISH, () => aqui() && seguinte(true));
    w.bind(SC.Widget.Events.PLAY, () => aqui() && estadoTocar(true));
    w.bind(SC.Widget.Events.PAUSE, () => aqui() && estadoTocar(false));
    controlo = { alternar: () => w.toggle() };
    avisaOFim = true; mostrarPausa(true); desenharNota();
  } catch { /* sem a API: o som toca, mas a fila não avança sozinha */ }
}

/** Ficheiro de áudio (Arquivo Sonoro do Museu do Fado): o mesmo elemento <audio> serve a fila toda, com ⏯ e barra de
 *  tempo próprios e os comandos do sistema (ecrã bloqueado, auscultadores) ligados à fila. */
function montarAudio(it) {
  const capa = it.miniatura ? `background:#000 center/contain no-repeat url('${fundo(it.miniatura)}')` : '';
  $('#leitor-ecra').innerHTML = html`<div class="leitor-externo leitor-capa" style="${raw(capa)}"><div>${it.miniatura ? '' : (it.plataforma === 'museu-do-fado' ? 'Arquivo Sonoro do Museu do Fado' : 'Áudio')}</div></div>`.s;
  const a = audio();
  a.src = enderecoSeguro(it.url);
  controlo = { alternar: () => (a.paused ? a.play().catch(() => {}) : a.pause()) };
  avisaOFim = true; mostrarPausa(true); mostrarProgresso(true); desenharNota();
  sessaoMedia(it);
  // criado depois do clique, o «autoplay» não chega: pedir para tocar
  a.play().catch((e) => { if (e.name === 'NotAllowedError') aviso('Carregue no ▶ para ouvir'); });
}

/** Um item que não toca: diz porquê e, havendo mais na fila, passa ao seguinte ao fim de 3 s. */
function indisponivel(it, texto) {
  const ha = atual + 1 < fila.length, u = enderecoSeguro(it.url);
  $('#leitor-ecra').innerHTML = html`<div class="leitor-externo"><div>${texto}
    ${u ? html`<br><a href="${u}" target="_blank" rel="noopener">Abrir no site original ↗</a>` : ''}
    ${ha ? html`<br><b>Indisponível — passa ao seguinte</b>` : ''}</div></div>`.s;
  mostrarPausa(false); mostrarProgresso(false);
  if (!ha) return;
  const este = montagem;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { if (este === montagem) { aviso('Indisponível — passou ao seguinte'); seguinte(true); } }, 3000);
}

// ---- comandos: ⏯, barra de tempo do áudio, comandos do sistema (Media Session)

function mostrarPausa(visivel) { const b = $('#leitor-pausa'); if (b) b.hidden = !visivel; }
function estadoTocar(aTocar) {
  const b = $('#leitor-pausa');
  if (b) { b.innerHTML = aTocar ? ICONE_PAUSA : ICONE_TOCAR; b.setAttribute('aria-label', aTocar ? 'Pausa' : 'Tocar'); b.title = aTocar ? 'Pausa' : 'Tocar'; }
  try { if ('mediaSession' in navigator && audio()?.getAttribute('src')) navigator.mediaSession.playbackState = aTocar ? 'playing' : 'paused'; } catch { /* sem Media Session */ }
}
function mostrarProgresso(visivel) { const p = $('#leitor-progresso'); if (p) p.hidden = !visivel; if (visivel) progresso(); }
const tempo = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');
function progresso() {
  const a = audio(), p = $('#leitor-progresso');
  if (!a || !p || p.hidden) return;
  const r = $('input', p);
  if (document.activeElement !== r) r.value = a.duration ? Math.round((a.currentTime / a.duration) * 1000) : 0;
  $('.tempo', p).textContent = `${tempo(a.currentTime)} / ${tempo(a.duration)}`;
}

function sessaoMedia(it) {
  if (!('mediaSession' in navigator)) return;
  try {
    const m = it.id && E.por.media[it.id];
    const capa = capaMedia(it);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: it.titulo || '', artist: (m?.pessoas || []).map((p) => E.por.pessoas[p]?.nome || p).join(', ') || NOME_PLATAFORMA[it.plataforma] || '',
      album: (m?.gravacao && E.por.gravacoes[m.gravacao]?.titulo) || '', artwork: capa ? [{ src: capa }] : [],
    });
    const acao = (nome, f) => { try { navigator.mediaSession.setActionHandler(nome, f); } catch { /* ação não suportada */ } };
    acao('play', () => audio().play().catch(() => {}));
    acao('pause', () => audio().pause());
    acao('nexttrack', () => seguinte());
    acao('previoustrack', () => tocarIndice(atual - 1));
  } catch { /* browser sem estas funções */ }
}
function semSessaoMedia() {
  if (!('mediaSession' in navigator)) return;
  try { navigator.mediaSession.metadata = null; } catch { /* sem Media Session */ }
  for (const nome of ['play', 'pause', 'nexttrack', 'previoustrack']) try { navigator.mediaSession.setActionHandler(nome, null); } catch { /* idem */ }
}

// ---- informação do item e fila

/** Abre a citação de uma ficha no painel de fontes (o registo das marcas é o da página aberta; o leitor continua entre páginas). */
function abrirFonte(c) {
  const t = document.createElement('span');
  t.hidden = true;
  t.innerHTML = marcas([c]).toString();
  document.body.append(t);
  t.querySelector('.marca')?.click();
  t.remove();
}

function desenharNota() {
  const n = $('#leitor-nota');
  if (!n) return;
  // sem aviso do fim (Apple Music, Blogger…), a fila não avança sozinha
  n.hidden = !(montado && !avisaOFim && atual + 1 < fila.length);
  n.textContent = 'Esta plataforma não avisa quando acaba: ⏭ para a seguinte';
}

function desenharInfo() {
  const it = fila[atual];
  if (!it) return;
  $('#leitor-titulo').textContent = it.titulo || NOME_PLATAFORMA[it.plataforma] || 'Media';
  const m = it.id && E.por.media[it.id]; // media catalogado: quem toca e de onde vem a identificação
  const fontes = m?.fontes || [];
  const pessoas = (m?.pessoas || []).slice(0, 2);
  const partes = [
    NOME_PLATAFORMA[it.plataforma] || '',
    it.subtitulo || '',
    pessoas.length ? html`${pessoas.map((p, k) => html`${k ? ', ' : ''}<a href="#/pessoa/${p}">${E.por.pessoas[p]?.nome || p}</a>`)}` : '',
    !m && it.origem?.startsWith('#/') ? html`<a href="${it.origem}">ver no arquivo</a>` : '',
  ].filter(Boolean);
  // as marcas da fonte ficam fora do texto que se corta com «…»: no telemóvel também se veem e se tocam
  const marcasFonte = fontes.length ? html`<span class="leitor-fontes">${fontes.length > 1 ? 'fontes' : 'fonte'}${fontes.map((c, k) =>
    html`<button class="marca" data-fonte-leitor="${k}" title="${E.fontes[c.fonte]?.nome || c.fonte}"
      aria-label="Fonte ${k + 1}: ${E.fontes[c.fonte]?.nome || c.fonte}">${k + 1}</button>`)}</span>` : '';
  const sub = $('#leitor-sub');
  sub.innerHTML = html`<span class="leitor-sub-texto">${partes.map((p, k) => html`${k ? ' · ' : ''}${p}`)}</span>${marcasFonte}`.s;
  sub.onclick = (e) => { const b = e.target.closest('[data-fonte-leitor]'); if (b) abrirFonte(fontes[+b.dataset.fonteLeitor]); };
  $('#leitor-n').textContent = fila.length > 1 ? `${atual + 1}/${fila.length}` : '';
  $('#leitor-fila-btn').setAttribute('aria-label', fila.length > 1 ? `Fila de audição, ${atual + 1} de ${fila.length}` : 'Fila de audição');
  desenharNota();
  desenharFila();
  mostrarLetraDe(it); // o botão «Letra» só aparece se o que toca tem letra (letras.js)
}

function desenharFila() {
  const caixa = $('#leitor-fila');
  if (caixa.hidden) return;
  caixa.innerHTML = html`<h3>Fila de audição <small class="mudo">${fila.length}</small></h3>
    <div class="fila-acoes">
      <button class="botao peq so-movel" data-anterior ${atual > 0 ? '' : raw('disabled')}>⏮ Anterior</button>
      <button class="botao peq" data-limpar title="Tira da fila tudo menos o que está no leitor">Limpar</button>
      <button class="botao peq" data-fechar-limpar title="Fecha o leitor e esvazia a fila">Fechar e limpar</button>
      <button class="botao peq so-movel" data-fechar-leitor title="Fecha o leitor; a fila fica guardada">Fechar o leitor</button></div>
    <ol>${fila.map((it, i) => html`<li class="${i === atual ? 'atual' : ''}" data-i="${i}">
      <button class="fila-titulo" data-i="${i}">${it.titulo || it.url}</button><small class="mudo">${NOME_PLATAFORMA[it.plataforma] || ''}</small>
      <button data-remover="${i}" title="Retirar da fila" aria-label="Retirar da fila: ${it.titulo || ''}">×</button></li>`)}</ol>`.s;
}

function abrirFila(abrir) {
  const c = $('#leitor-fila');
  c.hidden = !abrir;
  $('#leitor-fila-btn').setAttribute('aria-expanded', String(abrir));
  if (abrir) desenharFila();
}

/** Botão discreto «Retomar» quando o leitor está fechado e a fila guardada. */
function desenharRetomar() {
  const b = $('#leitor-retomar');
  if (!b) return;
  b.hidden = !(fechado && fila.length);
  if (!b.hidden) b.innerHTML = html`${raw(ICONE_TOCAR)}<span>Retomar${fila.length > 1 ? ` (${Math.max(atual, 0) + 1} de ${fila.length})` : ''}</span>`.s;
}

function mostrar() {
  fechado = false;
  $('#leitor').hidden = false;
  $('#leitor-retomar').hidden = true;
  medir();
}

/** O leitor mostra o item da fila sem o tocar (visita seguinte, ou depois de esvaziar o ecrã). */
function semTocar() {
  const it = fila[atual];
  if (!it) return;
  const capa = capaMedia(it);
  $('#leitor').dataset.modo = 'vazio';
  $('#leitor-ecra').dataset.plataforma = '';
  $('#leitor-ecra').innerHTML = html`<button class="miniatura ${capa ? '' : 'sem-imagem'}" ${capa ? raw(`style="background-image:url('${fundo(capa)}')"`) : ''}
    data-retomar aria-label="Tocar: ${it.titulo || NOME_PLATAFORMA[it.plataforma] || ''}"><span class="tocar">${raw(ICONE_TOCAR)}</span></button>`.s;
  $('[data-retomar]').onclick = () => tocarIndice(atual);
  mostrarPausa(true); estadoTocar(false);
}

// a altura do leitor (para a página não ficar tapada): medida sempre que muda (vídeo, Apple Music, ecrã grande, rotação)
function medir() {
  const l = $('#leitor');
  document.documentElement.style.setProperty('--leitor-h', l.hidden ? '0px' : `${l.offsetHeight}px`);
}

function tocarIndice(i) {
  if (i < 0 || i >= fila.length) return;
  atual = i;
  mostrar(); // deixa de estar fechado (e fica assim guardado)
  guardarEstado();
  montar(fila[i]);
  desenharInfo();
}

/** O que não toca aqui (RTP) abre no site original, num separador novo. */
function abrirFora(item) {
  const u = enderecoSeguro(item?.url);
  if (u) window.open(u, '_blank', 'noopener');
  aviso(String(item?.plataforma || '').startsWith('rtp') ? 'Os programas da RTP abrem no site da RTP' : 'Abre no site original');
}

export function tocar(item) {
  if (!tocaAqui(item)) return abrirFora(item);
  if (!valido(item)) return aviso('Endereço inválido');
  const i = fila.findIndex((x) => x.plataforma === item.plataforma && x.chave === item.chave);
  if (i >= 0) { fila[i] = { ...fila[i], ...item }; return tocarIndice(i); }
  fila.splice(atual + 1, 0, item);
  guardar('fila', fila);
  tocarIndice(atual + 1);
}

export function enfileirar(itens, avisar = true) {
  let n = 0, fora = 0, mortos = 0, primeiro = -1;
  for (const item of [].concat(itens)) {
    if (!valido(item)) { fora++; continue; } // RTP e ligações externas: abrem no site original
    if (item.disponivel === false || item.disponivel === 0) { mortos++; continue; } // link morto: não pára a fila
    if (fila.some((x) => x.plataforma === item.plataforma && x.chave === item.chave)) continue;
    if (primeiro < 0) primeiro = fila.length;
    fila.push(item); n++;
  }
  guardar('fila', fila);
  if (avisar) {
    aviso([n ? `${n} ${n === 1 ? 'item adicionado' : 'itens adicionados'} à fila` : (fora || mortos ? 'Nada para juntar à fila' : 'Já estava na fila'),
      fora ? `${fora} ${fora === 1 ? 'abre' : 'abrem'} no site original` : '', mortos ? `${mortos} sem link a funcionar` : ''].filter(Boolean).join(' · '));
  }
  if (!montado && primeiro >= 0) tocarIndice(primeiro); // nada a tocar: começa pelo primeiro que entrou
  else desenharInfo();
}

function seguinte(automatico = false) {
  if (atual + 1 < fila.length) tocarIndice(atual + 1);
  else if (!automatico) aviso('Fim da fila');
}

function fecharLeitor(limpar = false) {
  desmontar();
  montagem++;
  $('#leitor').hidden = true;
  $('#leitor').classList.remove('expandido');
  abrirFila(false);
  if (limpar) { fila = []; atual = -1; guardar('fila', fila); }
  mostrarLetraDe(null);
  fechado = true;
  guardarEstado();
  medir();
  desenharRetomar();
}

export function iniciarLeitor() {
  // comandos que o index.html não tem: ⏯, barra de tempo, aviso de fim, o áudio e o «Retomar»
  $('#leitor-ant').insertAdjacentHTML('afterend', `<button id="leitor-pausa" title="Tocar" aria-label="Tocar" hidden>${ICONE_TOCAR}</button>`);
  $('#leitor-sub').insertAdjacentHTML('afterend', `<p class="leitor-nota" id="leitor-nota" hidden></p>
    <div class="leitor-progresso" id="leitor-progresso" hidden><input type="range" min="0" max="1000" value="0" aria-label="Posição na faixa"><span class="tempo"></span></div>`);
  $('#leitor').insertAdjacentHTML('beforeend', '<audio id="leitor-audio" preload="auto" hidden></audio>');
  document.body.insertAdjacentHTML('beforeend', '<button id="leitor-retomar" class="leitor-retomar" type="button" hidden></button>');
  // a letra: o mesmo botão para vídeo e áudio, e uma folha que fica acima do leitor, sem tapar os comandos nem parar a música
  $('#leitor-fila-btn').insertAdjacentHTML('beforebegin', '<button id="leitor-letra" type="button" title="Ler a letra" aria-expanded="false" aria-controls="folha-letra" hidden>Letra</button>');
  document.body.insertAdjacentHTML('beforeend', '<aside id="folha-letra" class="folha-letra" aria-labelledby="folha-letra-titulo" tabindex="-1" hidden></aside>');
  iniciarFolhaLetra();

  const a = audio();
  const doAudio = () => montado && AUDIO_DIRETO.has(fila[atual]?.plataforma) && a.getAttribute('src');
  a.addEventListener('ended', () => { if (doAudio()) seguinte(true); });
  a.addEventListener('error', () => { if (doAudio()) indisponivel(fila[atual], 'Ficheiro de áudio indisponível.'); });
  a.addEventListener('play', () => doAudio() && estadoTocar(true));
  a.addEventListener('pause', () => doAudio() && estadoTocar(false));
  for (const ev of ['timeupdate', 'loadedmetadata', 'durationchange']) a.addEventListener(ev, progresso);
  $('#leitor-progresso input').addEventListener('input', (e) => { if (a.duration) a.currentTime = (e.target.value / 1000) * a.duration; });

  $('#leitor-seg').onclick = () => seguinte();
  $('#leitor-ant').onclick = () => tocarIndice(atual - 1);
  $('#leitor-pausa').onclick = () => (montado ? controlo?.alternar() : tocarIndice(Math.max(atual, 0)));
  $('#leitor-fechar').onclick = () => fecharLeitor();
  $('#leitor-expandir').onclick = () => $('#leitor').classList.toggle('expandido');
  // no telemóvel, tocar na capa do áudio abre o ecrã grande (o botão «expandir» fica escondido)
  $('#leitor-ecra').addEventListener('click', (e) => {
    if ($('#leitor').dataset.modo === 'audio' && !e.target.closest('button, a')) $('#leitor').classList.toggle('expandido');
  });
  $('#leitor-retomar').onclick = () => tocarIndice(Math.min(Math.max(atual, 0), fila.length - 1));
  $('#leitor-fila-btn').setAttribute('aria-expanded', 'false');
  $('#leitor-fila-btn').onclick = () => abrirFila($('#leitor-fila').hidden);
  $('#leitor-fila').addEventListener('click', (e) => {
    const rem = e.target.closest('[data-remover]');
    if (rem) {
      const i = +rem.dataset.remover;
      fila.splice(i, 1);
      if (i < atual) atual--;
      else if (i === atual) {
        atual = Math.min(atual, fila.length - 1);
        if (atual >= 0 && montado) montar(fila[atual]); else if (atual >= 0) semTocar(); else fecharLeitor(true);
      }
      guardar('fila', fila); guardarEstado(); desenharInfo(); desenharFila(); return;
    }
    if (e.target.closest('[data-limpar]')) {
      fila = atual >= 0 ? [fila[atual]] : []; atual = fila.length ? 0 : -1;
      guardar('fila', fila); guardarEstado(); desenharInfo(); desenharFila(); return;
    }
    if (e.target.closest('[data-fechar-limpar]')) return fecharLeitor(true);
    if (e.target.closest('[data-fechar-leitor]')) return fecharLeitor();
    if (e.target.closest('[data-anterior]')) return tocarIndice(atual - 1);
    const li = e.target.closest('[data-i]');
    if (li) tocarIndice(+li.dataset.i);
  });
  // a fila não fica aberta por cima da página: fecha ao mudar de página, ao tocar fora e com Escape
  window.addEventListener('hashchange', () => abrirFila(false));
  document.addEventListener('click', (e) => {
    if ($('#leitor-fila').hidden) return;
    if (!e.composedPath().some((n) => n.id === 'leitor-fila' || n.id === 'leitor-fila-btn')) abrirFila(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#leitor-fila').hidden) abrirFila(false); });
  if (window.ResizeObserver) new ResizeObserver(medir).observe($('#leitor'));
  else window.addEventListener('resize', medir);

  if (fila.length) { // retoma a fila guardada no sítio onde ficou, sem começar a tocar
    atual = Math.min(Math.max(0, +guardado.atual || 0), fila.length - 1);
    if (fechado) desenharRetomar();
    else { mostrar(); semTocar(); desenharInfo(); }
  }
}

/** Converte uma linha de media do arquivo (API) num item do leitor. */
export const itemDoArquivo = (m) => ({
  plataforma: m.plataforma, chave: m.chave, url: m.url, miniatura: m.miniatura || null, imagem_post: m.imagem_post || null,
  disponivel: m.disponivel,
  // o título do próprio vídeo (na plataforma ou na legenda) diz mais do que o do post ou da página que o lista
  titulo: m.titulo_externo || m.legenda || (m.titulo_doc?.startsWith('~') ? m.titulo_doc.slice(1) : m.titulo_doc) || m.url,
  subtitulo: (m.data || '').slice(0, 10), origem: m.doc_id ? `#/doc/${m.doc_id}` : '',
});
