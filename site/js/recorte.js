// Ajustar uma fotografia a um quadrado (1:1), para se ver bem a cara: arrasta-se a imagem e aproxima-se com o cursor ou
// com a roda do rato. A fotografia continua no site de origem: guarda-se só o enquadramento (imagens[].recorte), que todos
// os retratos aplicam da mesma maneira (estiloRecorte, em util.js).
import { html, miniatura, estiloRecorte } from './util.js';

const MAXIMO = 5;
const entre = (v, a, b) => Math.min(b, Math.max(a, v));

export const corpoRecorte = (im, nome) => html`<p class="mudo">Arraste a fotografia até ver bem a cara de ${nome} e aproxime com o cursor.
  A fotografia não muda: fica guardado só este enquadramento.</p>
  <div class="recorte-caixa" data-recorte-caixa><img src="${miniatura(im.url, 1000)}" alt="" draggable="false" referrerpolicy="no-referrer"></div>
  <label class="recorte-zoom">Aproximar <input type="range" name="zoom" min="1" max="${MAXIMO}" step="0.01" value="1"></label>
  <input type="hidden" name="x"><input type="hidden" name="y">`;

/** Liga o arrastar e o cursor na janela `d`, a partir do enquadramento guardado (ou do de todos os retratos: mais perto do alto da fotografia, onde costuma estar a cara). */
export function ligarRecorte(d, { x = 50, y = 25, zoom = 1 } = {}) {
  const caixa = d.querySelector('[data-recorte-caixa]'), img = caixa.querySelector('img'), campos = d.querySelector('form').elements;
  const aplicar = () => {
    zoom = entre(zoom, 1, MAXIMO); x = entre(x, 0, 100); y = entre(y, 0, 100);
    img.style.cssText = estiloRecorte({ recorte: { x, y, zoom } });
    campos.x.value = x.toFixed(1); campos.y.value = y.toFixed(1); campos.zoom.value = zoom.toFixed(2);
  };
  // quanto a fotografia sobra do quadrado, em píxeis do ecrã, na horizontal e na vertical
  const sobra = () => {
    const lado = caixa.clientWidth, w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return [0, 0];
    const escala = lado / Math.min(w, h) * zoom;
    return [w * escala - lado, h * escala - lado];
  };
  let antes = null;
  caixa.onpointerdown = (e) => { antes = e; caixa.setPointerCapture(e.pointerId); caixa.classList.add('a-arrastar'); };
  caixa.onpointermove = (e) => {
    if (!antes) return;
    const [sx, sy] = sobra();
    if (sx > 0) x -= (e.clientX - antes.clientX) / sx * 100;
    if (sy > 0) y -= (e.clientY - antes.clientY) / sy * 100;
    antes = e;
    aplicar();
  };
  caixa.onpointerup = caixa.onpointercancel = () => { antes = null; caixa.classList.remove('a-arrastar'); };
  caixa.onwheel = (e) => { e.preventDefault(); zoom *= Math.exp(-e.deltaY / 600); aplicar(); };
  campos.zoom.oninput = () => { zoom = +campos.zoom.value; aplicar(); };
  img.onerror = () => { caixa.replaceWith(Object.assign(document.createElement('p'), { className: 'erro', textContent: 'Não consegui abrir esta fotografia.' })); };
  aplicar();
}
