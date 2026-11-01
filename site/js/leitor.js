// Leitor persistente (continua a tocar enquanto se navega) com fila de audição.
import { $, html, raw, esc, aviso, guardar, ler, NOME_PLATAFORMA } from './util.js';

const EXTERNOS = new Set(['rtp-arquivos', 'rtp-play', 'outro']);
let fila = ler('fila', []);
let atual = -1;
let ytPlayer = null;
let ytPronto = null;

export function carregarYT() {
  ytPronto ||= new Promise((res, rej) => {
    window.onYouTubeIframeAPIReady = () => res(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = rej;
    document.head.append(s);
    setTimeout(() => rej(new Error('tempo esgotado')), 8000);
  });
  return ytPronto;
}

function urlIncorporado(it) {
  switch (it.plataforma) {
    case 'youtube': return `https://www.youtube-nocookie.com/embed/${it.chave}?autoplay=1&rel=0`;
    case 'vimeo': return `https://player.vimeo.com/video/${it.chave}?autoplay=1`;
    case 'spotify': return `https://open.spotify.com/embed/${it.chave}`;
    case 'blogger': return it.url;
    case 'soundcloud': return `https://w.soundcloud.com/player/?url=${encodeURIComponent(it.url)}&auto_play=true&visual=true`;
    case 'internet-archive': return `https://archive.org/embed/${it.chave}?autoplay=1`;
    case 'dailymotion': return `https://www.dailymotion.com/embed/video/${it.chave}?autoplay=1`;
    case 'apple-music': return `https://embed.music.apple.com/${it.chave}`;
    case 'facebook': return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(it.url)}&autoplay=true`;
    default: return null;
  }
}

async function montar(it) {
  const ecra = $('#leitor-ecra');
  ytPlayer?.destroy?.();
  ytPlayer = null;
  ecra.innerHTML = '';
  ecra.dataset.plataforma = it.plataforma; // Apple Music e Spotify pedem um ecrã largo e baixo (estilo.css)
  if (EXTERNOS.has(it.plataforma)) {
    ecra.innerHTML = html`<div class="leitor-externo"><div>${NOME_PLATAFORMA[it.plataforma] || 'Conteúdo externo'} só pode ser visto no site original.<br>
      <a href="${it.url}" target="_blank" rel="noopener">Abrir ↗</a></div></div>`.s;
    return;
  }
  if (it.plataforma === 'ficheiro' || it.plataforma === 'museu-do-fado') {
    const capa = it.miniatura ? `background:#000 center/contain no-repeat url('${esc(it.miniatura)}')` : '';
    ecra.innerHTML = html`<div class="leitor-externo" style="${raw(capa)}"><div>${it.miniatura ? '' : (it.plataforma === 'museu-do-fado' ? 'Arquivo Sonoro do Museu do Fado' : 'Áudio')}</div></div>
      <audio controls autoplay src="${it.url}"></audio>`.s;
    const audio = $('audio', ecra);
    audio.addEventListener('ended', () => seguinte(true));
    audio.addEventListener('error', () => aviso('Ficheiro de áudio indisponível'));
    // o atributo «autoplay» não chega quando o elemento é criado depois do clique: pedir para tocar
    audio.play().catch((e) => { if (e.name === 'NotAllowedError') aviso('Carregue no ▶ para ouvir'); });
    return;
  }
  if (it.plataforma === 'youtube') {
    try {
      const YT = await carregarYT();
      ecra.innerHTML = '<div id="yt-alvo"></div>';
      ytPlayer = new YT.Player('yt-alvo', {
        videoId: it.chave, host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => e.target.playVideo(), // começa logo, mesmo quando o browser ignora «autoplay»
          onStateChange: (e) => { if (e.data === 0) seguinte(true); },
          onError: () => {
            ecra.innerHTML = html`<div class="leitor-externo"><div>Este vídeo não pode ser reproduzido aqui
              (removido ou com incorporação desativada).<br><a href="${it.url}" target="_blank" rel="noopener">Tentar no YouTube ↗</a></div></div>`.s;
          },
        },
      });
      return;
    } catch { /* sem API: usa iframe simples */ }
  }
  const src = urlIncorporado(it);
  ecra.innerHTML = `<iframe src="${esc(src)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

function desenharInfo() {
  const it = fila[atual];
  if (!it) return;
  $('#leitor-titulo').textContent = it.titulo || NOME_PLATAFORMA[it.plataforma] || 'Media';
  const sub = $('#leitor-sub');
  sub.innerHTML = html`${NOME_PLATAFORMA[it.plataforma] || ''}${it.subtitulo ? ' · ' + it.subtitulo : ''}${it.origem ? html` · <a href="${it.origem}">ver origem</a>` : ''}`.s;
  $('#leitor-n').textContent = fila.length > 1 ? `${atual + 1}/${fila.length}` : '';
  desenharFila();
}

function desenharFila() {
  const caixa = $('#leitor-fila');
  if (caixa.hidden) return;
  caixa.innerHTML = html`<h3>Fila de audição <button class="botao peq" data-limpar>Limpar</button></h3>
    <ol>${fila.map((it, i) => html`<li class="${i === atual ? 'atual' : ''}" data-i="${i}">
      <span>${it.titulo || it.url}</span><small class="mudo">${NOME_PLATAFORMA[it.plataforma] || ''}</small>
      <button data-remover="${i}" title="Remover">×</button></li>`)}</ol>`.s;
}

function mostrar() {
  const l = $('#leitor');
  l.hidden = false;
  requestAnimationFrame(() => document.documentElement.style.setProperty('--leitor-h', l.offsetHeight + 'px'));
}

function tocarIndice(i) {
  if (i < 0 || i >= fila.length) return;
  atual = i;
  mostrar();
  montar(fila[i]);
  desenharInfo();
}

export function tocar(item) {
  const i = fila.findIndex((x) => x.plataforma === item.plataforma && x.chave === item.chave);
  if (i >= 0) return tocarIndice(i);
  fila.splice(atual + 1, 0, item);
  guardar('fila', fila);
  tocarIndice(atual + 1);
}

export function enfileirar(itens, avisar = true) {
  let n = 0;
  for (const item of [].concat(itens)) {
    if (fila.some((x) => x.plataforma === item.plataforma && x.chave === item.chave)) continue;
    fila.push(item); n++;
  }
  guardar('fila', fila);
  if (avisar) aviso(n ? `${n} ${n === 1 ? 'item adicionado' : 'itens adicionados'} à fila` : 'Já estava na fila');
  if (atual < 0 && fila.length) tocarIndice(0); else desenharInfo();
}

function seguinte(automatico = false) {
  if (atual + 1 < fila.length) tocarIndice(atual + 1);
  else if (!automatico) aviso('Fim da fila');
}

export function iniciarLeitor() {
  $('#leitor-seg').onclick = () => seguinte();
  $('#leitor-ant').onclick = () => tocarIndice(atual - 1);
  $('#leitor-fechar').onclick = () => {
    ytPlayer?.destroy?.(); ytPlayer = null;
    $('#leitor-ecra').innerHTML = '';
    $('#leitor').hidden = true;
    atual = -1;
    document.documentElement.style.setProperty('--leitor-h', '0px');
  };
  $('#leitor-expandir').onclick = () => {
    $('#leitor').classList.toggle('expandido');
    requestAnimationFrame(() => document.documentElement.style.setProperty('--leitor-h', $('#leitor').offsetHeight + 'px'));
  };
  $('#leitor-fila-btn').onclick = () => { const c = $('#leitor-fila'); c.hidden = !c.hidden; desenharFila(); };
  $('#leitor-fila').addEventListener('click', (e) => {
    const rem = e.target.closest('[data-remover]');
    if (rem) {
      const i = +rem.dataset.remover;
      fila.splice(i, 1);
      if (i < atual) atual--;
      else if (i === atual) { atual = Math.min(atual, fila.length - 1); if (atual >= 0) montar(fila[atual]); }
      guardar('fila', fila); desenharInfo(); desenharFila(); return;
    }
    if (e.target.closest('[data-limpar]')) {
      fila = atual >= 0 ? [fila[atual]] : []; atual = fila.length ? 0 : -1;
      guardar('fila', fila); desenharInfo(); desenharFila(); return;
    }
    const li = e.target.closest('li[data-i]');
    if (li) tocarIndice(+li.dataset.i);
  });
  if (fila.length) { // retoma a fila guardada sem começar a tocar
    atual = 0; mostrar(); desenharInfo();
    $('#leitor-ecra').innerHTML = html`<button class="miniatura sem-imagem" data-retomar><span class="tocar"><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg></span></button>`.s;
    $('[data-retomar]').onclick = () => tocarIndice(0);
  }
}

/** Converte uma linha de media do arquivo (API) num item do leitor. */
export const itemDoArquivo = (m) => ({
  plataforma: m.plataforma, chave: m.chave, url: m.url, miniatura: m.miniatura || null, imagem_post: m.imagem_post || null,
  disponivel: m.disponivel,
  titulo: m.legenda || (m.titulo_doc?.startsWith('~') ? m.titulo_doc.slice(1) : m.titulo_doc) || m.url,
  subtitulo: (m.data || '').slice(0, 10), origem: m.doc_id ? `#/doc/${m.doc_id}` : '',
});
