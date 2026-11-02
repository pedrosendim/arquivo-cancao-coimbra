// Utilitários partilhados: modelos HTML com escape automático, datas, API, media.

export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// true/false dão '' (para ${cond && html`…`}); num atributo como aria-selected escreva-se ${String(cond)}
function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

/** Modelo HTML: tudo o que é interpolado é escapado, exceto valores Raw (incl. outros html``). */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const plural = (n, um, varios) => `${n.toLocaleString('pt-PT')} ${n === 1 ? um : varios}`;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function fmtData(d, curta = false) {
  if (!d) return '';
  const [a, m, dd] = String(d).slice(0, 10).split('-');
  const mes = m ? (curta ? MESES[+m - 1].slice(0, 3) : MESES[+m - 1]) : '';
  if (dd) return `${+dd} ${curta ? mes : 'de ' + mes + ' de'} ${a}`.replace(/ +/g, ' ');
  if (m) return curta ? `${mes} ${a}` : `${mes} de ${a}`;
  return a;
}

/** Preferências do visitante (guardadas no browser). */
export const preferencias = { mostrarIndisponiveis: false };
try { preferencias.mostrarIndisponiveis = JSON.parse(localStorage.getItem('mostrarIndisponiveis') || 'false'); } catch { /* sem armazenamento */ }

export async function api(rota, params = {}) {
  if (preferencias.mostrarIndisponiveis && (rota === 'media' || rota === 'estado')) params = { ...params, todos: 1 };
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  const r = await fetch(`/api/${rota}?${qs}`);
  const j = await r.json().catch(() => ({ erro: 'resposta inválida do servidor' }));
  if (!r.ok || j.erro) throw new Error(j.erro || r.statusText);
  return j;
}

/** Títulos de posts sem título vêm do índice começados por "~" (primeira linha do texto). */
export const tituloDoc = (t) => (t && t.startsWith('~') ? html`<i>${t.slice(1)}</i>` : (t || '(sem título)'));
export const marcarExcerto = (s) => raw(esc(s).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>'));

/** Versão reduzida de uma imagem do Blogger. */
export function miniatura(url, tam = 400) {
  if (!url) return url;
  url = url.replace(/\/s(\d+)-h\//, '/s$1/'); // «s1600-h» do Blogger antigo serve uma página HTML, não a imagem
  if (/googleusercontent\.com\/img\/[ab]\//.test(url) && /=[swh]\d+/.test(url)) return url.replace(/=[swh]\d+[^/]*$/, `=s${tam}`);
  return url.replace(/\/(s\d+(-[a-z]+)?|w\d+-h\d+(-[a-z-]+)?)\/(?=[^/]+$)/, `/s${tam}/`);
}

// ---- reconhecimento de media (espelha scripts/comum.py)
const RE_YT = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?(?:[^"'\s]*&(?:amp;)?)?v=|shorts\/)|youtube\.googleapis\.com\/v\/|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const RE_MUSESCORE = /musescore\.com\/(?:user\/(\d+)\/)?scores\/(\d+)/;
const RE_DAILYMOTION = /dailymotion\.com\/(?:embed\/)?video\/([a-z0-9]+)/i;
const RE_FACEBOOK = /facebook\.com\/(?:video\.php\?v=(\d+)|[^/?]+\/videos\/(?:[^/?]+\/)?(\d+)|watch\/?\?v=(\d+))/;
const RE_VIMEO = /vimeo\.com\/(?:video\/)?(\d{5,})/;
const RE_SPOTIFY = /open\.spotify\.com\/(?:embed\/)?(track|album|playlist|artist|episode)\/([A-Za-z0-9]{22})/;
export function classificar(url) {
  if (!url) return null;
  if (url.startsWith('//')) url = 'https:' + url;
  let m;
  if ((m = url.match(RE_YT))) return { tipo: 'video', plataforma: 'youtube', chave: m[1], url: `https://www.youtube.com/watch?v=${m[1]}` };
  if ((m = url.match(RE_VIMEO))) return { tipo: 'video', plataforma: 'vimeo', chave: m[1], url: `https://vimeo.com/${m[1]}` };
  if ((m = url.match(RE_SPOTIFY))) return { tipo: 'audio', plataforma: 'spotify', chave: `${m[1]}/${m[2]}`, url: `https://open.spotify.com/${m[1]}/${m[2]}` };
  if ((m = url.match(RE_MUSESCORE))) return { tipo: 'partitura', plataforma: 'musescore', chave: m[2], url: m[1] ? `https://musescore.com/user/${m[1]}/scores/${m[2]}` : `https://musescore.com/score/${m[2]}` };
  if ((m = url.match(RE_DAILYMOTION))) return { tipo: 'video', plataforma: 'dailymotion', chave: m[1].split('_')[0], url: `https://www.dailymotion.com/video/${m[1].split('_')[0]}` };
  if ((m = url.match(RE_FACEBOOK))) { const v = m[1] || m[2] || m[3]; return { tipo: 'video', plataforma: 'facebook', chave: v, url: `https://www.facebook.com/watch/?v=${v}` }; }
  let host = '';
  try { host = new URL(url).host; } catch { return null; }
  if (host.endsWith('arquivosonoro.museudofado.pt') && /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(url)) return { tipo: 'audio', plataforma: 'museu-do-fado', chave: url.split('/').pop().split('?')[0], url };
  if (host.endsWith('music.apple.com')) {
    const u = new URL(url); const i = u.searchParams.get('i');
    return { tipo: 'audio', plataforma: 'apple-music', chave: u.pathname.replace(/^\/|\/$/g, '') + (i ? `?i=${i}` : ''), url: url.split('#')[0] };
  }
  if (host.includes('blogger.com') && url.includes('video.g')) return { tipo: 'video', plataforma: 'blogger', chave: url, url };
  if (host.endsWith('arquivos.rtp.pt') && url.includes('/conteudos/')) return { tipo: 'video', plataforma: 'rtp-arquivos', chave: url.split('?')[0], url: url.split('?')[0] };
  if (host.endsWith('rtp.pt') && url.includes('/play/')) return { tipo: 'video', plataforma: 'rtp-play', chave: url.split('?')[0], url: url.split('?')[0] };
  if (host.endsWith('soundcloud.com')) {
    const alvo = host.startsWith('w.') ? decodeURIComponent((url.match(/[?&]url=([^&]+)/) || [])[1] || url) : url;
    return { tipo: 'audio', plataforma: 'soundcloud', chave: alvo.split('?')[0], url: alvo };
  }
  if (host.endsWith('archive.org') && /\/(details|embed)\//.test(url)) {
    const id = url.split(/\/(?:details|embed)\//)[1].split(/[/?]/)[0];
    return { tipo: 'audio', plataforma: 'internet-archive', chave: id, url: `https://archive.org/details/${id}` };
  }
  if (/\.(mp3|ogg|wav|m4a)(\?|$)/i.test(url)) return { tipo: 'audio', plataforma: 'ficheiro', chave: url, url };
  return null;
}

export const NOME_PLATAFORMA = {
  youtube: 'YouTube', vimeo: 'Vimeo', spotify: 'Spotify', blogger: 'Vídeo Blogger', soundcloud: 'SoundCloud',
  'rtp-arquivos': 'RTP Arquivos', 'rtp-play': 'RTP Play', 'internet-archive': 'Internet Archive', ficheiro: 'Áudio', outro: 'Outro',
  musescore: 'Partitura', dailymotion: 'Dailymotion', facebook: 'Facebook', 'museu-do-fado': 'Museu do Fado', 'apple-music': 'Apple Music',
};

/** URL incorporável de uma partitura do MuseScore. */
export const partituraEmbed = (m) => (m.url.includes('/user/') ? `${m.url}/embed` : `https://musescore.com/user/0/scores/${m.chave}/embed`);

/** Capa de um vídeo/áudio: miniatura oficial da plataforma; senão uma fotografia do mesmo post; senão nenhuma (cartaz). */
export function capaMedia(m) {
  if (m.miniatura) return m.miniatura;
  if (m.plataforma === 'youtube') return `https://i.ytimg.com/vi/${m.chave}/hqdefault.jpg`;
  if (m.plataforma === 'dailymotion') return `https://www.dailymotion.com/thumbnail/video/${m.chave}`;
  if (m.plataforma === 'internet-archive') return `https://archive.org/services/img/${m.chave}`;
  if (m.imagem_post) return miniatura(m.imagem_post, 480);
  return null;
}

export function aviso(texto) {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.classList.add('visivel');
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => el.classList.remove('visivel'), 2600);
}

export function guardar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ } }
export function ler(chave, omissao) { try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : omissao; } catch { return omissao; } }

/** Atualiza os parâmetros da rota atual sem voltar a desenhar a página. */
export function definirParams(params) {
  const caminho = location.hash.replace(/^#\/?/, '').split('?')[0];
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== false)).toString();
  history.replaceState(null, '', `#/${caminho}${qs ? '?' + qs : ''}`);
}

/** Expressão regular que ignora acentos, para realçar termos no texto. */
export function regexTermos(consulta) {
  const termos = (consulta || '').replace(/\b(AND|OR|NOT|NEAR)\b/g, ' ').replace(/["*()^:]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
  if (!termos.length) return null;
  const classes = { a: '[aàáâãä]', e: '[eèéêë]', i: '[iìíîï]', o: '[oòóôõö]', u: '[uùúûü]', c: '[cç]' };
  const pad = termos.map((t) => [...norm(t)].map((ch) => classes[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(''));
  return new RegExp(`(${pad.join('|')})`, 'gi');
}
