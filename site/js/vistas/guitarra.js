// A guitarra da página inicial: a câmara desce por uma guitarra de Coimbra (cabeça, braço, tampo) e entra pela boca até à
// etiqueta colada no fundo da caixa. As imagens são um render de estúdio feito à parte (scripts/guitarra/render.html,
// em site/img/guitarra/); as cordas, os dedos, o som e as memórias desenham-se aqui. Três guitarras (simples, madrepérola,
// flores), cada uma com rosácea, leque, lágrima, guarda-unhas e timbre próprios; a simples é a predefinida.
// Tudo pára quando a página deixa de estar à vista (o <main> é trocado em cada página).

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v), mix = (a, b, t) => a + (b - a) * t, suave = (t) => t * t * (3 - 2 * t);

// ---- geometria, em milímetros (igual à do render)
const NUT = 190, ESC = 470, PONTE = NUT + ESC, BOCA = { y: 550, r: 38 }, BOTAO_Y = 823.5, GANCHO_Y = 146.2;
const traste = (n) => NUT + ESC * (1 - 2 ** (-n / 12)), largEscala = (y) => 21.5 + (y - NUT) * 0.0268;
const JANELA_X = [-33.3, -27.6, -21.9, -16.2, -10.5, -4.8, 4.8, 10.5, 16.2, 21.9, 27.6, 33.3], janela = (i, y) => JANELA_X[i] * (330 - y) / 195;
const xNut = (i) => (Math.floor(i / 2) - 2.5) * 6.6 + (i % 2 ? 0.95 : -0.95), xPonte = (i) => (Math.floor(i / 2) - 2.5) * 11.4 + (i % 2 ? 1.5 : -1.5), xBotao = (i) => (i - 5.5) * 4.4;
const LADO = [[27.6, 421], [28.6, 438], [32.1, 446], [37.8, 454.5], [46.1, 463], [55.7, 471], [65.7, 479.5], [75.8, 488], [85.7, 496], [95.4, 504.6], [105, 513], [114.5, 521], [123.6, 529.6], [132, 538], [139.6, 546], [146.9, 554.6], [153.4, 563], [159.3, 571], [164.6, 579.6], [169.6, 588], [173.8, 596], [177.4, 604.6], [180.5, 613], [183, 621], [185.1, 629.7], [186.8, 638], [187.9, 646], [188.5, 654.7], [188.8, 663], [188.3, 671.4], [187.6, 679.7], [186.3, 688], [184.6, 696.4], [182.2, 704.7], [179.5, 713], [176.2, 721.4], [172.4, 729.8], [167.8, 738], [162.6, 746.4], [156.7, 754.8], [149.6, 763], [141.4, 771.4], [131.7, 779.8], [120.2, 788], [106.5, 796.5], [92.8, 807], [72.8, 816], [42.6, 824.8], [0, 829.1]];
const PECAS = [{ n: 'cabeca', x0: -62, y0: -6, x1: 62, y1: 196 }, { n: 'braco', x0: -36, y0: 190, x1: 36, y1: 432 }, { n: 'corpo1', x0: -198, y0: 405, x1: 198, y1: 620 }, { n: 'corpo2', x0: -198, y0: 616, x1: 198, y1: 836 }];
export const VARIANTES = ['simples', 'madreperola', 'flores'];

// ---- som: modelo modal de cordas de aço, duas cordas por ordem. Afinação nominal de Coimbra, do agudo para o grave:
// lá (3), sol (3), ré (3), lá (2), sol (2), dó (2) (post «Raúl Simões», Guitarra de Coimbra V, 2013), com Lá 3 = 440 Hz;
// nas três graves o bordão fica uma oitava abaixo. Índice 0 = 6.ª ordem (a mais grave).
const NOTAS = [[{ f: 130.81 }, { f: 65.41, b: 1 }], [{ f: 196 }, { f: 98, b: 1 }], [{ f: 220 }, { f: 110, b: 1 }], [{ f: 293.66 }, { f: 293.66 }], [{ f: 392 }, { f: 392 }], [{ f: 440 }, { f: 440 }]];
// cada guitarra soa à sua maneira: onde se ataca a corda, brilho, sustentação, desafinação dos pares e ressonâncias da caixa
const TIMBRES = {
  simples: { beta: 0.14, expoL: 1, expoB: 1.2, T: 1.2, fc: 2400, desafino: 1.0009, caixa: [128, 6, 270, 4.5, 540, 2.5, 2500, 3] },
  madreperola: { beta: 0.1, expoL: 0.95, expoB: 1.15, T: 0.9, fc: 3000, desafino: 1.0014, caixa: [140, 3.5, 295, 3, 620, 2, 3100, 4.5] },
  flores: { beta: 0.16, expoL: 1.15, expoB: 1.35, T: 1, fc: 1900, desafino: 1.0006, caixa: [135, 5, 280, 4, 560, 1.5, 2600, 1] },
};

/** Liga a guitarra a uma página já desenhada. `raiz` contém: canvas.g-palco, .g-nomes (com os nomes, por ordem dos trastes),
 *  .g-memorias, #g-seguinte, #g-som, .g-acorde (#g-tocar, #g-limpar), secções com data-y (data-y-fim, data-vis, data-larg,
 *  data-y-m e data-larg-m no telemóvel) e .g-etiqueta. `memorias(n)` devolve um elemento novo para mostrar, ou null. */
export function montarGuitarra(raiz, { memorias: novaMemoria } = {}) {
  const $ = (s) => raiz.querySelector(s), $$ = (s) => [...raiz.querySelectorAll(s)];
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fim = new AbortController(), sinal = { signal: fim.signal, passive: true };
  const cv = $('.g-palco'), ctx = cv.getContext('2d', { alpha: false }), etiqueta = $('.g-etiqueta'), dentro = $('.g-dentro');
  const nomes = $$('.g-nomes .g-nome');
  const CORDAS = Array.from({ length: 12 }, (_, i) => { const o = Math.floor(i / 2), bordao = o < 3 && i % 2 === 1; return { i, o, bordao, g: bordao ? [0.8, 0.72, 0.66][o] : [0.3, 0.3, 0.32, 0.36, 0.3, 0.26][o], a: 0, fase: i * 1.3 }; });
  const TAMPO = new Path2D(); { const q = [...LADO, ...[...LADO].reverse().map(([x, y]) => [-x, y])]; q.forEach(([x, y], i) => (i ? TAMPO.lineTo(x, y) : TAMPO.moveTo(x, y))); TAMPO.closePath(); TAMPO.moveTo(BOCA.r, BOCA.y); TAMPO.arc(0, BOCA.y, BOCA.r, 0, Math.PI * 2); }

  // ---- cores do tema (papel ou noite)
  let COR = {};
  const lerCores = () => { const cs = getComputedStyle(document.documentElement); COR = { fundo: cs.getPropertyValue('--fundo').trim() || '#f3ede1', ouro: cs.getPropertyValue('--ouro').trim() || '#93691d' }; sujo = true; };

  // ---- imagens: a guitarra escolhida primeiro, as outras só quando se pedem (ou mais tarde, sem pressa)
  let variante = 'simples', sujo = true;
  const I = {}, pedidas = new Set();
  const peca = (n) => (n === 'braco' ? n : `${n}-${variante}`);
  const carregar = (n) => { if (pedidas.has(n)) return; pedidas.add(n); const im = new Image(); im.decoding = 'async'; im.onload = () => { I[n.replace(/\.\w+$/, '')] = im; sujo = true; }; im.src = `img/guitarra/${n}`; };
  const carregarVariante = (v) => { for (const n of ['inteira', 'cabeca', 'corpo1', 'corpo2']) carregar(`${n}-${v}.webp`); };
  ['sombra.png', 'braco.webp', 'dentro.webp'].forEach(carregar); carregarVariante('simples');
  setTimeout(() => { if (raiz.isConnected) VARIANTES.forEach(carregarVariante); }, 6000);

  let W = 0, H = 0, DPR = 1, CX = 0.57, movel = false, alvo = scrollY, atual = scrollY, vel = 0, ancoras = [], kDescida = 1, centroDentro = 0, esquerda = 0;
  function medir() {
    const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; esquerda = r.left; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    movel = W < 760; CX = movel ? 0.5 : 0.57; raiz.style.setProperty('--g-cx', CX); // a guitarra nunca se mexe para os lados
    const fator = (vis, larg) => Math.min(H / vis, W / larg), lista = [];
    for (const el of $$('[data-y]')) {
      const q = el.getBoundingClientRect(), topo = q.top + scrollY, a = el.dataset, larg = +((movel && a.largM) || a.larg), k = fator(+a.vis, larg), y0 = +((movel && a.yM) || a.y);
      if (el.classList.contains('g-mergulho')) lista.push({ s: topo - H * 0.1, y: +a.y, k, d: 0 }, { s: topo + (q.height - H) * 0.86, y: +a.y, k, d: 1 });
      else if (a.yFim) { const corpo = el.classList.contains('g-corpo'); lista.push({ s: topo + (corpo ? 0 : -H * 0.3), y: y0, k, d: 0 }, { s: topo + q.height - H * (corpo ? 0.6 : 1.1), y: +a.yFim, k: fator(+(a.visFim || a.vis), larg), d: 0 }); if (!corpo) kDescida = k; }
      else lista.push({ s: 0, y: y0, k, d: 0 });
    }
    ancoras = lista;
    const rd = dentro.getBoundingClientRect(); centroDentro = rd.left + rd.width / 2;
    sujo = true;
  }
  function camara(s) {
    const a = ancoras;
    if (s <= a[0].s) return a[0];
    for (let i = 0; i < a.length - 1; i++) {
      const p = a[i], q = a[i + 1];
      if (s <= q.s) { const u = clamp((s - p.s) / Math.max(1, q.s - p.s)), t = suave(u); return { y: mix(p.y, q.y, t), d: mix(p.d, q.d, u), k: Math.exp(mix(Math.log(p.k), Math.log(q.k), t)) }; }
    }
    return a[a.length - 1];
  }

  // ---- cordas: uma corda a vibrar vê-se como um fuso desfocado
  const dedos = [0, 0, 0, 0, 0, 0]; let sobre = null, toques = 0;
  const dedilhar = (o, forca = 1) => { for (const c of CORDAS) { if (c.o === o) c.a = Math.max(c.a, 3.4 * forca * (c.bordao ? 1 : 0.82)); else if (Math.abs(c.o - o) === 1) c.a = Math.max(c.a, 0.16 * forca); } toques = performance.now(); tocar(o, forca); sujo = true; };
  function fio(c, ox, cy, k, tempo, sombra) {
    const X = (x) => ox + x * k, Y = (y) => cy + y * k, hx = janela(c.i, GANCHO_Y), xn = xNut(c.i), xp = xPonte(c.i), xb = xBotao(c.i), fr = dedos[c.o], yF = fr ? traste(fr) - 0.32 * (traste(fr) - traste(fr - 1)) : NUT, uF = (yF - NUT) / ESC;
    const des = sombra ? (u) => [(0.8 + u * 2.6) * k, (1 + u * 3.4) * k] : () => [0, 0];
    const caminho = (am, sinal) => {
      ctx.beginPath(); ctx.moveTo(X(hx), Y(GANCHO_Y));
      if (am < 0.02) { const [a, b] = des(0), [e, f] = des(1); ctx.lineTo(X(xn) + a, Y(NUT) + b); ctx.lineTo(X(xp) + e, Y(PONTE) + f); }
      else { const [a0, b0] = des(0); ctx.lineTo(X(xn) + a0, Y(NUT) + b0); for (let n = 0; n <= 26; n++) { const u = uF + (1 - uF) * n / 26, [a, b] = des(u); ctx.lineTo(X(mix(xn, xp, u) + am * sinal * Math.sin(Math.PI * (u - uF) / (1 - uF))) + a, Y(mix(NUT, PONTE, u)) + b); } }
      ctx.lineTo(X(xb), Y(BOTAO_Y)); ctx.stroke();
    };
    if (c.a < 0.06) { caminho(0, 0); return; }
    const al0 = ctx.globalAlpha;
    for (let j = 0; j < 5; j++) { ctx.globalAlpha = al0 * 0.42; caminho(c.a, Math.sin(tempo * 0.031 * (1 + c.i * 0.07) + c.fase + j * 1.257)); }
    ctx.globalAlpha = al0;
  }
  function desenharCordas(ox, cy, k, tempo) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(30,18,10,.32)';
    for (const c of CORDAS) { ctx.lineWidth = Math.max(0.8, c.g * k * 1.5); fio(c, ox, cy, k, tempo, true); }
    for (const c of CORDAS) {
      const px = Math.max(0.75, c.g * k);
      ctx.strokeStyle = 'rgba(24,18,12,.75)'; ctx.lineWidth = px + 0.7; fio(c, ox, cy, k, tempo, false);
      ctx.strokeStyle = c.bordao ? '#bb9163' : '#dfe3e4'; ctx.lineWidth = px; fio(c, ox, cy, k, tempo, false);
      if (c.a > 0.15) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * clamp(c.a / 2.4) * 0.8; ctx.strokeStyle = COR.ouro; ctx.lineWidth = px + 0.5; fio(c, ox, cy, k, tempo, false); ctx.globalAlpha = ga; }
      if (c.bordao && px > 1.8) { ctx.setLineDash([0.45 * k * 0.4, 0.45 * k * 0.5]); ctx.strokeStyle = 'rgba(60,38,18,.55)'; ctx.lineWidth = px; ctx.lineCap = 'butt'; fio(c, ox, cy, k, tempo, false); ctx.setLineDash([]); ctx.lineCap = 'round'; }
      else if (!c.bordao && px > 1.1) { ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = px * 0.4; fio(c, ox, cy, k, tempo, false); }
    }
    // a ponta torcida de cada corda à volta do gancho
    if (k > 2) { ctx.strokeStyle = 'rgba(238,238,234,.92)'; ctx.lineWidth = Math.max(0.6, 0.28 * k); for (const c of CORDAS) { const hx = janela(c.i, GANCHO_Y), xn = xNut(c.i); for (const lado of [1, -1]) { ctx.beginPath(); for (let n = 0; n <= 12; n++) { const v = n / 12, yy = GANCHO_Y + v * 9, xx = mix(hx, mix(hx, xn, 9 / (NUT - GANCHO_Y)), v) + lado * 0.9 * Math.cos(v * Math.PI * 3) * (1 - v * 0.7); if (n) ctx.lineTo(ox + xx * k, cy + yy * k); else ctx.moveTo(ox + xx * k, cy + yy * k); } ctx.stroke(); } } }
    // dedos nos trastes (e a sombra de um dedo onde está o rato)
    const dedo = (o, f, alfa) => { const yF = traste(f) - 0.32 * (traste(f) - traste(f - 1)), u = (yF - NUT) / ESC, x = ox + (mix(xNut(2 * o), xPonte(2 * o), u) + mix(xNut(2 * o + 1), xPonte(2 * o + 1), u)) / 2 * k, y = cy + yF * k, r = Math.max(5.5, 3.1 * k);
      ctx.globalAlpha = alfa; ctx.fillStyle = 'rgba(10,6,3,.45)'; ctx.beginPath(); ctx.arc(x + 0.5 * k, y + 0.8 * k, r, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#f1e7cf'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.strokeStyle = COR.ouro; ctx.lineWidth = Math.max(1.2, 0.5 * k); ctx.stroke(); ctx.globalAlpha = 1; };
    dedos.forEach((f, o) => { if (f) dedo(o, f, 1); });
    if (sobre && sobre.f && dedos[sobre.o] !== sobre.f) dedo(sobre.o, sobre.f, 0.4);
  }

  // ---- a etiqueta existe também no fundo da caixa: vê-se ao longe pela boca, atrás das cordas
  let folha = null, EW = 1, EH = 1;
  function prepararEtiqueta() {
    const e = etiqueta, f = 2; EW = e.offsetWidth; EH = e.offsetHeight;
    if (!EW || !EH) return;
    folha = document.createElement('canvas'); folha.width = EW * f; folha.height = EH * f;
    const q = folha.getContext('2d'); q.scale(f, f); q.fillStyle = '#f1e7cf'; q.fillRect(0, 0, EW, EH);
    q.strokeStyle = '#8a7648'; q.strokeRect(7.5, 7.5, EW - 15, EH - 15); q.strokeStyle = '#b7a67f'; q.strokeRect(10.5, 10.5, EW - 21, EH - 21);
    // posições pela cadeia de offsetParent: não mudam com a rotação nem com a escala da etiqueta
    const pos = (el) => { let x = 0, y = 0; for (let n = el; n && n !== e; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return [x, y]; };
    for (const el of e.querySelectorAll('.g-rotulo, .g-numeros b, .g-numeros span')) {
      const cs = getComputedStyle(el), ls = parseFloat(cs.letterSpacing) || 0, altura = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3, [x, y] = pos(el), w = el.offsetWidth;
      let tx = el.textContent + (el.matches('.g-numeros span') ? ' →' : ''); if (cs.textTransform === 'uppercase') tx = tx.toUpperCase();
      q.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; if ('letterSpacing' in q) q.letterSpacing = `${ls}px`;
      q.fillStyle = cs.color; q.textBaseline = 'middle'; const centro = cs.textAlign === 'center'; q.textAlign = centro ? 'center' : 'left';
      q.fillText(tx, centro ? x + w / 2 : x, y + altura / 2);
    }
  }
  const POEIRA = Array.from({ length: 34 }, (_, i) => ({ x: (i * 37.7) % 1, y: (i * 91.3) % 1, v: 0.3 + (i * 13.1) % 1, r: 0.5 + (i % 3) * 0.5 }));
  function interior(ox, cyMM, kb, kbFim, tempo) {
    if (I.dentro) ctx.drawImage(I.dentro, ox - 200 * kb, H / 2 + (400 - cyMM) * kb, 400 * kb, 436 * kb);
    else { ctx.fillStyle = '#2a1c12'; ctx.fillRect(0, 0, W, H); }
    const lx = ox, ly = H / 2 + (BOCA.y - cyMM) * kb, s = kb / kbFim;
    if (folha) { ctx.save(); ctx.translate(lx, ly); ctx.rotate(-1.4 * Math.PI / 180); ctx.scale(s, s); ctx.fillStyle = 'rgba(10,5,2,.5)'; ctx.fillRect(-EW / 2 + 3, -EH / 2 + 7, EW, EH); ctx.drawImage(folha, -EW / 2, -EH / 2, EW, EH); ctx.restore(); }
    // a luz que entra pela boca, centrada na etiqueta, e a sombra das cordas no fundo
    const r = 54 * kb;
    ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createRadialGradient(lx, ly, r * 0.25, lx, ly, r * 2.1);
    g.addColorStop(0, '#fff2dc'); g.addColorStop(0.45, '#e2b884'); g.addColorStop(0.62, '#6d4a2e'); g.addColorStop(1, '#170e08');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const gs = ctx.createLinearGradient(0, ly - r * 1.6, 0, ly + r * 1.6); gs.addColorStop(0, '#fff'); gs.addColorStop(0.3, 'rgb(128,98,74)'); gs.addColorStop(0.7, 'rgb(128,98,74)'); gs.addColorStop(1, '#fff');
    ctx.strokeStyle = gs; ctx.lineCap = 'butt';
    for (const c of CORDAS) { const u = (BOCA.y - NUT) / ESC, x = lx + (mix(xNut(c.i), xPonte(c.i), u) + (c.a > 0.05 ? c.a * Math.sin(tempo * 0.03 + c.fase) : 0)) * kb * 1.15; ctx.lineWidth = Math.max(0.8, (0.9 + c.a * 0.8) * kb * 0.5); ctx.beginPath(); ctx.moveTo(x, ly - r * 1.6); ctx.lineTo(x, ly + r * 1.6); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
  }
  function poeira(alfa, tempo) {
    ctx.fillStyle = '#ffe6bd';
    for (const p of POEIRA) { const y = ((p.y + tempo * 0.000012 * p.v) % 1) * H, x = (p.x + 0.02 * Math.sin(tempo * 0.0002 * p.v + p.y * 9)) * W; ctx.globalAlpha = alfa * 0.34 * (0.4 + 0.6 * Math.sin(tempo * 0.0007 * p.v + p.x * 20) ** 2); ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.2832); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function desenhar(c, tempo) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const d = reduzir ? 0 : c.d, dDentro = reduzir ? (c.d > 0.5 ? 1 : 0) : d, k0 = c.k, Z = Math.hypot(W, H) / 2 / (BOCA.r * k0) * 1.25, zoom = Math.exp(Math.log(Z) * d * d), k = k0 * zoom;
    // o zoom faz-se sobre a boca: ox não muda, a boca fica no mesmo ponto do ecrã
    const ox = CX * W, cy = H / 2 - c.y * k, kbFim = Math.max(W, H) / 250, kb = k0 * 0.8 * Math.exp(Math.log(kbFim / (k0 * 0.8)) * dDentro), R = BOCA.r * k, fora = R > Math.hypot(W, H) * 0.62 || (reduzir && dDentro === 1);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = fora ? '#120c08' : COR.fundo; ctx.fillRect(0, 0, W, H);
    if (fora) { interior(ox, c.y, kb, kbFim, tempo); poeira(clamp((d - 0.8) * 6), tempo); }
    else {
      if (I.sombra) { ctx.globalAlpha = 0.32; ctx.drawImage(I.sombra, ox + (-260 + 9) * k, cy + (-66 + 14) * k, 520 * k, 962 * k); ctx.globalAlpha = 1; }
      const by = cy + BOCA.y * k;
      if (by + R > 0 && by - R < H) { ctx.save(); ctx.beginPath(); ctx.arc(ox, by, R + 1, 0, 6.2832); ctx.clip(); ctx.fillStyle = '#120c08'; ctx.fillRect(0, 0, W, H); interior(ox, c.y, kb, kbFim, tempo); ctx.strokeStyle = '#2e1d10'; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.arc(ox, by, R - 1.2 * k, 0, 6.2832); ctx.stroke(); ctx.restore(); }
      const nitida = k * DPR >= 2.3 && PECAS.every((p) => I[peca(p.n)]);
      if (nitida) for (const p of PECAS) { const y0 = cy + p.y0 * k, y1 = cy + p.y1 * k; if (y1 < 0 || y0 > H) continue; ctx.drawImage(I[peca(p.n)], ox + p.x0 * k, y0, (p.x1 - p.x0) * k, y1 - y0); }
      else if (I[peca('inteira')]) ctx.drawImage(I[peca('inteira')], ox - 200 * k, cy - 6 * k, 400 * k, 842 * k);
      if (!reduzir && !movel && d === 0) { // o verniz apanha a luz quando se desce
        const b = (c.y - 560) * 1.5;
        ctx.save(); ctx.translate(ox, cy); ctx.scale(k, k); ctx.clip(TAMPO, 'evenodd'); ctx.globalCompositeOperation = 'soft-light';
        const g = ctx.createLinearGradient(-240 + b, 380, 120 + b, 800); g.addColorStop(0.2, 'rgba(255,240,215,0)'); g.addColorStop(0.5, 'rgba(255,240,215,.5)'); g.addColorStop(0.8, 'rgba(255,240,215,0)');
        ctx.fillStyle = g; ctx.fillRect(-200, 400, 168, 440); ctx.fillRect(32, 400, 168, 440); ctx.fillRect(-32, 540, 64, 300); ctx.restore();
      }
      if (d < 0.9) { const ks = k * (1 + d * d * 1.5), cs = H / 2 - c.y * ks; ctx.globalAlpha = clamp((0.9 - d) * 8); desenharCordas(ox, cs, ks, tempo); ctx.globalAlpha = 1; }
      if (!reduzir && d === 0 && k > 2.4 && vel > 1) { // um brilho a correr nos trastes, só em movimento
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,250,235,${Math.min(0.5, vel * 0.03).toFixed(3)})`; ctx.lineCap = 'round';
        for (let n = 1; n <= 22; n++) { const y = traste(n), sy = cy + y * k; if (sy < -4 || sy > H + 4) continue; const w = largEscala(y), m = Math.sin(y * 0.031 + c.y * 0.022) * w * 0.8; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(ox + (m - 3.5) * k, sy); ctx.lineTo(ox + (m + 3.5) * k, sy); ctx.stroke(); }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // nomes nos trastes, só durante a descida pelo braço (no telemóvel, um de cada vez, em baixo)
    const noBraco = d === 0 && atual > H * 0.45 ? clamp(1 - Math.abs(k0 / kDescida - 1) * 3.4) : 0;
    let perto = -1, melhor = 1e9; if (movel) nomes.forEach((e, i) => { const dd = Math.abs(cy + traste(i + 1) * k - H * 0.5); if (dd < melhor) { melhor = dd; perto = i; } });
    nomes.forEach((e, i) => {
      if (movel) { e.classList.add('g-ticker'); const o = i === perto ? noBraco : 0; e.style.visibility = o > 0.02 ? 'visible' : 'hidden'; e.style.opacity = o; e.style.pointerEvents = o > 0.5 ? 'auto' : 'none'; e.style.transform = `translate3d(${((W - e.offsetWidth) / 2).toFixed(1)}px,${(H * 0.78).toFixed(1)}px,0)`; return; }
      e.classList.remove('g-ticker');
      const y = traste(i + 1), sy = cy + y * k, foco = 1 - clamp(Math.abs(sy - H * 0.52) / (H * 0.5)), o = noBraco * clamp(foco * 3);
      if (o < 0.02) { e.style.visibility = 'hidden'; return; }
      e.style.visibility = 'visible'; e.style.opacity = o; e.style.pointerEvents = o > 0.5 ? 'auto' : 'none'; e.style.transform = `translate3d(${ox + (largEscala(y) + 2) * k}px,${sy}px,0)`;
    });
    // a etiqueta de papel: no fim, exatamente onde está a desenhada (a boca não se desloca)
    const s = clamp(kb / kbFim), o = reduzir ? (dDentro ? 1 : 0) : clamp((dDentro - 0.93) * 16);
    $('#g-seguinte').hidden = dDentro > 0.5;
    $('.g-controlos').classList.toggle('g-longe', movel && atual < H * 0.4); // no telemóvel, não tapam o primeiro ecrã
    etiqueta.style.opacity = o; etiqueta.style.visibility = o > 0 ? 'visible' : 'hidden';
    etiqueta.style.transform = `translate(${(esquerda + ox - centroDentro).toFixed(1)}px, 0) scale(${reduzir ? 1 : s.toFixed(4)}) rotate(-1.4deg)`;
  }

  // ---- memórias: cartões que aparecem e desaparecem do lado esquerdo durante a descida
  const camadaMem = $('.g-memorias'), vivas = [];
  let proxima = 0;
  function nova(agora) {
    const e = novaMemoria?.(); if (!e) return;
    camadaMem.append(e);
    const larg = movel ? W - 32 : Math.max(220, W * CX - 150), lim = movel ? [12, 12 + 200] : [H * 0.04, H * 0.95];
    let x = 16, y = lim[0], tentativas = 0;
    const r = e.getBoundingClientRect();
    do { x = movel ? 16 : 16 + Math.random() * Math.max(0, larg - r.width); y = movel ? lim[0] + (vivas.length % 2) * (r.height + 8) : lim[0] + Math.random() * Math.max(0, lim[1] - lim[0] - r.height); tentativas++; }
    while (tentativas < 40 && vivas.some((v) => x < v.x + v.w + 6 && x + r.width + 6 > v.x && y < v.y + v.h + 6 && y + r.height + 6 > v.y));
    if (tentativas >= 40) { e.remove(); return; }
    const v = { e, x, y, w: r.width, h: r.height, nasce: agora, vida: 3600 + Math.random() * 2800, deriva: (Math.random() - 0.5) * 0.012, parado: false };
    e.addEventListener('pointerenter', () => { v.parado = true; }); e.addEventListener('pointerleave', () => { v.parado = false; v.nasce = performance.now() - 1500; });
    e.addEventListener('focus', () => { v.parado = true; }); e.addEventListener('blur', () => { v.parado = false; });
    e.style.transform = `translate3d(${x}px,${y}px,0)`;
    requestAnimationFrame(() => e.classList.add('ver'));
    vivas.push(v);
  }
  function memorias(agora, ativo, dScroll) {
    const max = movel ? 2 : 14;
    if (ativo && agora > proxima && vivas.length < max) { nova(agora); proxima = agora + (movel ? 1400 : 140 + Math.random() * 220); }
    for (let i = vivas.length - 1; i >= 0; i--) {
      const v = vivas[i];
      if (!reduzir && !movel) { v.y -= dScroll * 0.18; v.x += v.deriva * 16; }
      const acabou = !ativo || (!v.parado && agora - v.nasce > v.vida) || v.y < -v.h || v.y > H;
      if (acabou) { v.e.classList.remove('ver'); const e = v.e; setTimeout(() => e.remove(), 900); vivas.splice(i, 1); continue; }
      v.e.style.transform = `translate3d(${v.x.toFixed(1)}px,${v.y.toFixed(1)}px,0)`;
    }
  }

  // ---- som (só depois de o ligar ou de pôr um dedo: os browsers não deixam tocar sem um gesto)
  let audio = null, saida = null, somLigado = false, eq = []; const memoria = {};
  const aplicarTimbre = () => { const c = TIMBRES[variante].caixa; eq.forEach((f, i) => { f.frequency.value = c[i * 2]; f.gain.value = c[i * 2 + 1]; }); };
  function corda(sr, f0, dur, bordao, Tm) {
    const n = Math.round(sr * dur), o = new Float32Array(n), B = bordao ? 5e-6 : 2.6e-5 * (f0 / 440), beta = Tm.beta, expo = bordao ? Tm.expoB : Tm.expoL, T0 = (bordao ? 7 : 4.4 * Math.pow(440 / f0, 0.3)) * Tm.T, fc = bordao ? Tm.fc * 0.55 : Tm.fc;
    for (let k = 1; k <= 64; k++) {
      const fk = k * f0 * Math.sqrt(1 + B * k * k); if (fk > sr * 0.42) break;
      const a = Math.sin(k * Math.PI * beta) / Math.pow(k, expo); if (Math.abs(a) < 1e-4) continue;
      for (const [df, ganho, lent] of [[1, 1, 1], [1.00035, 0.35, 1.35]]) { // duas polarizações: batimento lento e decaimento duplo
        const t60 = T0 * lent / (1 + Math.pow(fk / fc, 1.6)), r = Math.exp(-6.9078 / (t60 * sr)), w = 2 * Math.PI * fk * df / sr, cr = Math.cos(w) * r, ci = Math.sin(w) * r;
        let zr = 0, zi = a * ganho; const m = Math.min(n, Math.ceil(t60 * sr * 1.1));
        for (let i = 0; i < m; i++) { o[i] += zi; const t = zr * cr - zi * ci; zi = zr * ci + zi * cr; zr = t; }
      }
    }
    // ataque da unha: ruído curto e brilhante, e uma rampa de 1,5 ms para não estalar
    const at = Math.round(sr * 0.0015), ru = Math.round(sr * 0.004); let p = 0;
    for (let i = 0; i < ru; i++) { const nz = Math.random() * 2 - 1; o[i] += (nz - p) * 0.12 * (1 - i / ru); p = nz; }
    for (let i = 0; i < at; i++) o[i] *= i / at;
    return o;
  }
  function amostra(o) {
    const chave = `${variante}|${o}`, Tm = TIMBRES[variante];
    if (memoria[chave]) return memoria[chave];
    const sr = audio.sampleRate, dur = 4.2, n = Math.round(sr * dur), buf = audio.createBuffer(2, n, sr), L = buf.getChannelData(0), Rc = buf.getChannelData(1);
    const [s1, s2] = NOTAS[o], f2 = !s1.b && !s2.b ? s1.f * Tm.desafino : s2.f, a = corda(sr, s1.f, dur, !!s1.b, Tm), b = corda(sr, f2, dur, !!s2.b, Tm), atraso = Math.round(sr * 0.011);
    let pico = 0;
    for (let i = 0; i < n; i++) { const y = i >= atraso ? b[i - atraso] : 0; L[i] = a[i] * 0.6 + y * 0.5; Rc[i] = a[i] * 0.5 + y * 0.6; pico = Math.max(pico, Math.abs(L[i]), Math.abs(Rc[i])); }
    const g = 0.9 / (pico || 1); for (let i = 0; i < n; i++) { L[i] *= g; Rc[i] *= g; }
    return (memoria[chave] = buf);
  }
  function montarAudio() {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    const pico = (f, q, g, t = 'peaking') => { const x = audio.createBiquadFilter(); x.type = t; x.frequency.value = f; x.Q.value = q; x.gain.value = g; return x; };
    const a = pico(135, 4, 5), b = pico(280, 3, 4), c = pico(560, 2, 2), e = pico(2600, 0.8, 2.5, 'highshelf'); eq = [a, b, c, e]; aplicarTimbre();
    saida = audio.createGain(); saida.gain.value = 0.6; saida.connect(a); a.connect(b); b.connect(c); c.connect(e); e.connect(audio.destination);
    const sr = audio.sampleRate, ir = audio.createBuffer(2, Math.round(sr * 1.1), sr);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.25)); }
    const sala = audio.createConvolver(); sala.buffer = ir; const ml = audio.createGain(); ml.gain.value = 0.08; e.connect(sala); sala.connect(ml); ml.connect(audio.destination);
    [5, 4, 3, 2, 1, 0].forEach((o, i) => setTimeout(() => { if (audio) amostra(o); }, 30 + i * 60));
  }
  function tocar(o, forca) {
    if (!somLigado || !audio) return;
    const f = audio.createBufferSource(), g = audio.createGain(), p = audio.createStereoPanner(); f.buffer = amostra(o); f.playbackRate.value = 2 ** (dedos[o] / 12); g.gain.value = Math.min(0.9, 0.55 * forca); p.pan.value = (o - 2.5) * 0.08;
    f.connect(g); g.connect(p); p.connect(saida); f.start();
  }
  const botaoSom = $('#g-som');
  const ligarSom = (v = true) => { somLigado = v; if (somLigado && !audio) montarAudio(); if (audio?.state === 'suspended') audio.resume(); botaoSom.setAttribute('aria-pressed', String(somLigado)); botaoSom.textContent = somLigado ? 'Som ligado' : 'Som desligado'; };
  botaoSom.onclick = () => ligarSom(!somLigado);
  $('#g-seguinte').onclick = () => {
    variante = VARIANTES[(VARIANTES.indexOf(variante) + 1) % VARIANTES.length];
    carregarVariante(variante);
    $('#g-n').textContent = `${VARIANTES.indexOf(variante) + 1}/${VARIANTES.length}`;
    aplicarTimbre(); sujo = true;
  };

  // ---- acordes: tocar nos trastes põe ou tira um dedo nessa ordem; «Tocar o acorde» (ou o tampo) rasga as seis ordens
  function emMilimetros(cx0, cy0) { const c = camara(atual); return { c, x: (cx0 - esquerda - CX * W) / c.k, y: c.y + (cy0 - cv.getBoundingClientRect().top - H / 2) / c.k }; }
  function alvoTraste(cx0, cy0) {
    const { c, x, y } = emMilimetros(cx0, cy0); if (c.d > 0.02) return null;
    if (y < NUT - 4 || y > traste(17)) return null;
    if (Math.abs(x) > largEscala(Math.max(NUT, y)) + 1.5) return null;
    let f = 0; if (y > NUT) { f = 1; while (f < 17 && traste(f) < y) f++; }
    const u = (Math.max(NUT, y) - NUT) / ESC; let o = 0, melhor = 1e9;
    for (let q = 0; q < 6; q++) { const xc = (mix(xNut(2 * q), xPonte(2 * q), u) + mix(xNut(2 * q + 1), xPonte(2 * q + 1), u)) / 2, dd = Math.abs(xc - x); if (dd < melhor) { melhor = dd; o = q; } }
    return { o, f };
  }
  function alvoTampo(cx0, cy0) { const { c, x, y } = emMilimetros(cx0, cy0); return c.d <= 0.02 && y > BOCA.y + BOCA.r && y < PONTE + 6 && Math.abs(x) < 34; }
  const rasgar = () => { ligarSom(true); for (let o = 0; o < 6; o++) setTimeout(() => dedilhar(o, 0.85), o * 30); };
  const acorde = $('.g-acorde'), atualizarAcorde = () => { acorde.hidden = !dedos.some(Boolean); };
  $('#g-tocar').onclick = rasgar;
  $('#g-limpar').onclick = () => { dedos.fill(0); atualizarAcorde(); sujo = true; };
  const fora = (e) => e.target.closest('a, button, input, form, .g-mem, .lateral, .leitor, #painel') || !raiz.isConnected;
  addEventListener('click', (e) => {
    if (fora(e)) return;
    const p = alvoTraste(e.clientX, e.clientY);
    if (p) { ligarSom(true); dedos[p.o] = dedos[p.o] === p.f ? 0 : p.f; dedilhar(p.o, 0.8); atualizarAcorde(); sujo = true; return; }
    if (alvoTampo(e.clientX, e.clientY)) rasgar();
  }, { signal: fim.signal });

  // ---- passar o rato pelas cordas, por cima da boca e do tampo
  let xAntes = null, tocada = 0;
  addEventListener('pointermove', (e) => {
    if (fora(e)) { xAntes = null; if (sobre) { sobre = null; sujo = true; } cv.style.cursor = ''; return; }
    const { c, y: yMM } = emMilimetros(e.clientX, e.clientY); if (c.d > 0.3) { xAntes = null; return; }
    const x = e.clientX - esquerda, pt = alvoTraste(e.clientX, e.clientY);
    if (JSON.stringify(pt) !== JSON.stringify(sobre)) { sobre = pt; sujo = true; }
    document.documentElement.classList.toggle('g-apontar', !!(pt || alvoTampo(e.clientX, e.clientY)));
    if (yMM < BOCA.y - BOCA.r || yMM > PONTE) { xAntes = null; return; }
    const u = (yMM - NUT) / ESC, ox = CX * W;
    if (xAntes !== null) for (let o = 0; o < 6; o++) { const sx = ox + (mix(xNut(o * 2), xPonte(o * 2), u) + 1) * c.k; if ((xAntes - sx) * (x - sx) < 0 && performance.now() - tocada > 70) { dedilhar(o, 0.5 + Math.min(0.6, Math.abs(x - xAntes) * 0.03)); tocada = performance.now(); } }
    xAntes = x;
  }, sinal);

  addEventListener('scroll', () => { alvo = scrollY; sujo = true; }, sinal);
  addEventListener('resize', () => { medir(); prepararEtiqueta(); }, sinal);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', lerCores, { signal: fim.signal });
  const tema = new MutationObserver(lerCores); tema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  const tamanho = new ResizeObserver(() => { medir(); prepararEtiqueta(); }); tamanho.observe(raiz);
  document.fonts?.ready.then(() => { if (raiz.isConnected) { medir(); prepararEtiqueta(); } });

  // quando se muda de página, desliga-se tudo (ouvintes, observadores e som)
  const parar = () => { fim.abort(); tema.disconnect(); tamanho.disconnect(); audio?.close(); audio = null; document.documentElement.classList.remove('g-apontar'); };
  let tAntes = 0;
  function quadro(ms) {
    if (!raiz.isConnected) { parar(); return; }
    const dt = Math.min(50, ms - tAntes); tAntes = ms;
    if (!document.hidden && ancoras.length) {
      const prev = atual; atual = reduzir ? alvo : atual + (alvo - atual) * 0.13; if (Math.abs(alvo - atual) < 0.1) atual = alvo;
      vel = Math.abs(atual - prev);
      let vibrar = false;
      for (const c of CORDAS) { if (c.a > 0.01) { c.a *= Math.exp(-dt / (c.bordao ? 1500 : 1200)); vibrar = true; } else c.a = 0; }
      const c = camara(atual);
      if (sujo || vibrar || prev !== atual || c.d > 0.8 || ms - toques < 200) { desenhar(c, ms); sujo = false; }
      memorias(ms, c.d < 0.45 && c.y > 160 && atual > H * 0.35, atual - prev);
    }
    requestAnimationFrame(quadro);
  }
  lerCores(); medir(); prepararEtiqueta();
  requestAnimationFrame(quadro);
}
