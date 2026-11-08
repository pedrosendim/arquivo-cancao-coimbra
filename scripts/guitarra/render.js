// Render de estúdio da guitarra de Coimbra, em milímetros (origem no alto da lágrima, x para a direita, y para baixo).
// Medidas: comprimento total 81 cm, cabeça 20, braço 18, escala 14 sobre o tampo, caixa 43, largura 38 (Veiga de Oliveira, «modelo recente»);
// 22 trastos de aço, voluta lacrimal de aresta viva, chapa de leque num cavado triangular, atadilho com botões, cavalete de osso.
'use strict';

const NOTAS = {};
const lin = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map((v) => Math.pow(v, 2.2)); };
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const liso = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const rad = (g) => g * Math.PI / 180;
const mixC = (C, a, b, t) => { C[0] = mix(a[0], b[0], t); C[1] = mix(a[1], b[1], t); C[2] = mix(a[2], b[2], t); };

// ---- ruído
const N = 1024, P = new Uint16Array(N * 2), V = new Float32Array(N);
{
  let s = 1234567; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < N; i++) { V[i] = r(); P[i] = i; }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = P[i]; P[i] = P[j]; P[j] = t; }
  for (let i = 0; i < N; i++) P[i + N] = P[i];
}
const M = N - 1;
const H2 = (i, j) => V[P[(P[i & M] + j) & M]];
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = H2(xi, yi), b = H2(xi + 1, yi), c = H2(xi, yi + 1), d = H2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let a = 0.5, s = 0, t = 0; for (let k = 0; k < o; k++) { s += a * vn(x, y); t += a; x = x * 2.03 + 11.3; y = y * 2.03 + 7.7; a *= 0.5; } return s / t; }
const r1 = (i) => V[((Math.floor(i) % N) + N) % N];

// ---- geometria: silhueta medida na fotografia de estúdio enviada pelo utilizador, calibrada pela escala de 470 mm
const G = { NUT: 190, ESC: 470, BOCA: { x: 0, y: 550, r: 38 } };
G.PONTE = G.NUT + G.ESC;
G.traste = (n) => G.NUT + G.ESC * (1 - 2 ** (-n / 12));

function suavizar(p, sub = 12) {
  const o = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], d = p[i + 2] || c;
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      o.push([0.5 * (2 * b[0] + (c[0] - a[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (3 * b[0] - a[0] - 3 * c[0] + d[0]) * t3),
        0.5 * (2 * b[1] + (c[1] - a[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (3 * b[1] - a[1] - 3 * c[1] + d[1]) * t3)]);
    }
  }
  o.push(p[p.length - 1]);
  return o;
}
const espelho = (l) => [...l, ...[...l].reverse().map(([x, y]) => [-x, y])];
const caminho = (poly) => { const p = new Path2D(); poly.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; };
const tabela = (lado, n) => { const t = new Float32Array(n + 2); for (const [x, y] of lado) { const j = Math.round(y); if (j >= 0 && j <= n) t[j] = Math.max(t[j], x); } for (let j = 1; j <= n; j++) if (!t[j]) t[j] = t[j - 1]; return (y) => { const v = clamp(y, 0, n), a = Math.floor(v); return Math.max(0.3, mix(t[a], t[a + 1] || t[a], v - a)); }; };

// caixa: ombros côncavos a sair do braço, largura máxima de 377 mm a 2/3, fundo redondo
const LADO_MEDIDO = [[27.6, 421.2], [27.7, 429.5], [28.6, 437.8], [30.1, 442.0], [32.1, 446.2], [34.6, 450.4], [37.8, 454.5], [41.7, 458.7], [46.1, 462.9], [50.7, 467.0], [55.7, 471.2], [60.8, 475.4], [65.7, 479.5], [70.8, 483.7], [75.8, 487.9], [80.7, 492.1], [85.7, 496.2], [90.5, 500.4], [95.4, 504.6], [100.3, 508.7], [105.0, 512.9], [109.8, 517.1], [114.5, 521.2], [119.1, 525.4], [123.6, 529.6], [127.9, 533.8], [132.0, 537.9], [135.8, 542.1], [139.6, 546.3], [143.5, 550.4], [146.9, 554.6], [150.3, 558.8], [153.4, 562.9], [156.4, 567.1], [159.3, 571.3], [162.0, 575.5], [164.6, 579.6], [167.2, 583.8], [169.6, 588.0], [171.7, 592.1], [173.8, 596.3], [175.6, 600.5], [177.4, 604.6], [179.0, 608.8], [180.5, 613.0], [181.8, 617.2], [183.0, 621.3], [184.0, 625.5], [185.1, 629.7], [186.0, 633.8], [186.8, 638.0], [187.4, 642.2], [187.9, 646.3], [188.2, 650.5], [188.5, 654.7], [188.8, 658.9], [188.8, 663.0], [188.5, 667.2], [188.3, 671.4], [188.0, 675.5], [187.6, 679.7], [187.0, 683.9], [186.3, 688.0], [185.5, 692.2], [184.6, 696.4], [183.5, 700.6], [182.2, 704.7], [180.9, 708.9], [179.5, 713.1], [177.9, 717.2], [176.2, 721.4], [174.4, 725.6], [172.4, 729.8], [170.2, 733.9], [167.8, 738.1], [165.2, 742.3], [162.6, 746.4], [159.8, 750.6], [156.7, 754.8], [153.2, 758.9], [149.6, 763.1], [145.7, 767.3], [141.4, 771.4], [136.6, 775.6], [131.7, 779.8], [126.2, 784.0], [120.2, 788.1], [113.6, 792.3], [106.5, 796.5], [100.9, 802.8], [92.8, 807.2], [83.6, 811.6], [72.8, 816.0], [59.9, 820.4], [42.6, 824.8], [22, 827.9], [0.0, 829.1]];
const ELIPSE_FUNDO = Array.from({ length: 16 }, (_, i) => { const y = 742 + i * (829.1 - 742) / 15, d = (y - 659) / 170.1; return [Math.round(189 * Math.sqrt(Math.max(0, 1 - d * d)) * 10) / 10, y]; });
const ladoCorpo = suavizar([...LADO_MEDIDO.filter(([, y]) => y < 740), ...ELIPSE_FUNDO], 3);
const CORPO = espelho(ladoCorpo);

// cabeça: sino de madeira escura da pestana até à chapa; coluna atrás dos afinadores; lágrima de ponta para cima
const ladoSino = suavizar([[44.6, 116.5], [44.9, 122], [43, 130], [40, 138], [36.8, 146], [33.6, 154], [30.4, 162], [27.4, 170], [24.6, 178], [22.6, 185], [21.9, 190], [21.8, 196]], 6);
const SINO = espelho(ladoSino);
const ladoColuna = suavizar([[17.3, 46], [16.9, 58], [16.3, 70], [16.1, 82], [16.7, 92], [18.3, 102], [20.6, 110], [23.2, 117], [25, 122]], 6);
const colW = tabela(ladoColuna, 124);
const ladoLagrima = suavizar([[0, 0], [3.4, 5.5], [8.3, 11.5], [12.9, 18], [16.5, 25], [19, 32], [20.2, 39], [19.8, 46], [17.5, 52.5], [13.5, 57.8], [7.5, 61.3], [0, 62.4]], 8);
const LAGRIMA = espelho(ladoLagrima);
const lagW = tabela(ladoLagrima, 64);
// doze afinadores: fila de trás mais alta, fila da frente com o pino ao centro
const TARRAXAS = [
  { x: -38.5, y: 87, a: -12 }, { x: -23, y: 86, a: -7 }, { x: -7.8, y: 85.5, a: -2 }, { x: 7.8, y: 85.5, a: 2 }, { x: 23, y: 86, a: 7 }, { x: 38.5, y: 87, a: 12 },
  { x: -41.5, y: 104.5, a: -15, f: 1 }, { x: -28.5, y: 103, a: -10, f: 1 }, { x: -15.2, y: 102.5, a: -5, f: 1 }, { x: 15.2, y: 102.5, a: 5, f: 1 }, { x: 28.5, y: 103, a: 10, f: 1 }, { x: 41.5, y: 104.5, a: 15, f: 1 }];
// janelas da chapa (em leque a partir de um ponto abaixo): a corda prende no gancho ao fundo de cada janela
const JANELA_X = [-33.3, -27.6, -21.9, -16.2, -10.5, -4.8, 4.8, 10.5, 16.2, 21.9, 27.6, 33.3];
const F_LEQUE = 330;
const janela = (i, y) => JANELA_X[i] * (F_LEQUE - y) / (F_LEQUE - 135);
const GANCHO_Y = 146.2;

const larguraEscala = (y) => 21.5 + (y - G.NUT) * 0.0268;
const yFimEscala = (x) => { const b = G.BOCA, rr = 41.5; return b.y - Math.sqrt(rr * rr - Math.min(rr - 1, Math.abs(x)) ** 2) + liso(-12, 22, x) * 15; };
function formaEscala() {
  const w = larguraEscala(532), p = new Path2D();
  p.moveTo(-larguraEscala(G.NUT), G.NUT - 1); p.lineTo(larguraEscala(G.NUT), G.NUT - 1);
  p.lineTo(w + 0.3, yFimEscala(w) - 4); p.quadraticCurveTo(w + 0.2, yFimEscala(w), w - 4, yFimEscala(w - 4));
  for (let x = w - 4; x >= -w; x -= 0.5) p.lineTo(x, yFimEscala(x));
  p.closePath();
  return p;
}
const xNut = (i) => (Math.floor(i / 2) - 2.5) * 6.6 + (i % 2 ? 0.95 : -0.95);
const xPonte = (i) => (Math.floor(i / 2) - 2.5) * 11.4 + (i % 2 ? 1.5 : -1.5);
const xBotao = (i) => (i - 5.5) * 4.4;

// ---- estado do render
let R, X0, Y0, W, H, ar, ag, ab, al, hh, me, gl, ro, cm, cx;
const C = [0, 0, 0];

function iniciar(c) {
  R = c.R; X0 = c.x0; Y0 = c.y0; W = Math.round((c.x1 - c.x0) * R); H = Math.round((c.y1 - c.y0) * R);
  const n = W * H;
  ar = new Float32Array(n); ag = new Float32Array(n); ab = new Float32Array(n); al = new Float32Array(n); hh = new Float32Array(n); me = new Float32Array(n); gl = new Float32Array(n); ro = new Float32Array(n);
  ro.fill(0.3); gl.fill(0.5);
  cm = document.createElement('canvas'); cm.width = W; cm.height = H; cx = cm.getContext('2d', { willReadFrequently: true });
}

function borrar(m, w, h, r) {
  r = Math.max(1, Math.round(r));
  const t = new Float32Array(m.length), o = new Float32Array(m.length), f = 1 / (2 * r + 1);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass ? o : m;
    for (let y = 0; y < h; y++) {
      let s = 0; const l = y * w;
      for (let x = -r; x <= r; x++) s += src[l + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) { t[l + x] = s * f; s += src[l + Math.min(w - 1, x + r + 1)] - src[l + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += t[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) { o[y * w + x] = s * f; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; }
    }
  }
  return o;
}

// Uma camada: forma vetorial (com antialias) + cor/altura/material por pixel.
function camada(o) {
  const [a, b, c, d] = o.caixa;
  const ix0 = clamp(Math.floor((a - X0) * R), 0, W), iy0 = clamp(Math.floor((b - Y0) * R), 0, H), ix1 = clamp(Math.ceil((c - X0) * R), 0, W), iy1 = clamp(Math.ceil((d - Y0) * R), 0, H);
  const w = ix1 - ix0, h = iy1 - iy0; if (w <= 0 || h <= 0) return;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(ix0, iy0, w, h);
  cx.setTransform(R, 0, 0, R, -X0 * R, -Y0 * R); cx.fillStyle = '#fff'; cx.strokeStyle = '#fff'; cx.lineJoin = 'round'; cx.lineCap = o.lineCap || 'butt';
  cx.save(); o.forma(cx); cx.restore();
  const dados = cx.getImageData(ix0, iy0, w, h).data, m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = dados[i * 4 + 3] / 255;
  const mb = o.bisel ? borrar(m, w, h, o.bisel * R) : null;
  for (let j = 0; j < h; j++) {
    const y = Y0 + (iy0 + j + 0.5) / R;
    for (let i = 0; i < w; i++) {
      const k = i + j * w, mk = m[k]; if (mk <= 0.003) continue;
      const q = ix0 + i + (iy0 + j) * W, x = X0 + (ix0 + i + 0.5) / R;
      if (o.buraco) { al[q] *= 1 - mk; continue; }
      if (o.alfa) al[q] = Math.max(al[q], mk);
      const op = mk * (o.opacidade ?? 1);
      if (o.cor) {
        const res = typeof o.cor === 'function' ? o.cor(x, y, C, mk) : (C[0] = o.cor[0], C[1] = o.cor[1], C[2] = o.cor[2], 1);
        if (res !== false) { ar[q] = mix(ar[q], C[0], op); ag[q] = mix(ag[q], C[1], op); ab[q] = mix(ab[q], C[2], op); }
      }
      if (o.alt !== undefined) {
        const e = mb ? liso(0, 1, clamp((mb[k] - 0.5) * 2)) : 1;
        const z = typeof o.alt === 'function' ? o.alt(x, y, e, hh[q]) : hh[q] + o.alt * e;
        hh[q] = mix(hh[q], z, mk);
      }
      if (o.metal !== undefined) me[q] = mix(me[q], o.metal, op);
      if (o.brilho !== undefined) gl[q] = mix(gl[q], o.brilho, op);
      if (o.rugos !== undefined) ro[q] = mix(ro[q], o.rugos, op);
    }
  }
}

// ---- materiais
const c = {
  abetoA: lin('#e4c48c'), abetoB: lin('#a8763f'), nogA: lin('#2a170d'), nogB: lin('#5e3820'), ebA: lin('#1a110c'), ebB: lin('#402718'),
  santoA: lin('#2c130b'), santoB: lin('#5f2f1a'), ossoA: lin('#f4ecd9'), ossoB: lin('#dcc8a0'), aceA: lin('#ecdcb6'), aceB: lin('#cdb07a'),
  latao: lin('#caa05a'), latao2: lin('#9a7a3f'), aco: lin('#d4d6d8'), preto: lin('#0d0907'), fundo: lin('#1d140e'),
};

function abeto(x, y, C) {
  const ax = Math.abs(x) + 0.6;
  const w = 1.5 * (fbm(ax * 0.011, y * 0.0032, 3) - 0.5) + 0.3 * (fbm(ax * 0.09, y * 0.011, 2) - 0.5);
  const u = ax + w + 0.0045 * y + 2;
  const fase = Math.log(0.95 + 0.0078 * u) / 0.0078 + 2.2 * fbm(u * 0.03, 5.5, 3); // anéis irregulares, mais apertados ao centro
  const k = Math.floor(fase), f = fase - k;
  const forca = Math.pow(r1(k * 7), 1.6) * 0.9 + 0.1, tarde = Math.pow(f, 3.5 + 4 * r1(k * 13 + 5));
  const fibra = 0.5 * vn(ax * 2.3, y * 0.09) + 0.5 * vn(ax * 4.7, y * 0.17);
  const seda = Math.pow(vn(x * 0.17 + 9, y * 1.5), 3) * 0.13;
  const banda = fbm(ax * 0.045, y * 0.004, 3);
  const t = clamp(0.16 + tarde * forca * 0.62 + (fibra - 0.5) * 0.16 + (banda - 0.5) * 0.55 - seda * 0.6);
  mixC(C, c.abetoA, c.abetoB, t);
  const tom = 0.9 + 0.2 * fbm(ax * 0.022, y * 0.005, 3);
  C[0] *= tom; C[1] *= tom * 0.985; C[2] *= tom * 0.94;
}
function nogueira(x, y, C) {
  const u = x + 7 * (fbm(x * 0.018, y * 0.0055, 3) - 0.5);
  const v = fbm(u * 0.62, y * 0.024, 4), p = Math.pow(vn(u * 5.5, y * 0.31), 5);
  mixC(C, c.nogA, c.nogB, clamp(v * 1.7 - 0.38));
  const e = 1 - 0.6 * p; C[0] *= e; C[1] *= e; C[2] *= e;
}
function ebano(x, y, C) {
  const v = fbm(x * 0.7 + 5 + 3 * fbm(x * 0.03, y * 0.004, 2), y * 0.011, 5), p = Math.pow(vn(x * 8, y * 0.42), 6);
  mixC(C, c.ebA, c.ebB, clamp(v * 2.1 - 0.62));
  const e = 1 - 0.5 * p; C[0] *= e; C[1] *= e; C[2] *= e;
}
function corEscala(x, y, C) {
  ebano(x, y, C);
  const n = 12 * Math.log2(G.ESC / Math.max(10, G.ESC - (y - G.NUT))), f = n - Math.floor(n);
  const us = liso(0.3, 0.92, f) * (1 - liso(0.94, 1, f)) * (1 - liso(4, 13, n)) * (1 - liso(8, 26, Math.abs(x))) * (0.45 + 0.9 * fbm(x * 0.55, y * 0.08, 3));
  C[0] += 0.03 * us; C[1] += 0.021 * us; C[2] += 0.016 * us;
}
function santo(x, y, C) {
  const v = fbm(x * 0.5 + y * 0.2, y * 0.5 - x * 0.2, 4);
  mixC(C, c.santoA, c.santoB, clamp(v * 1.9 - 0.45));
}
function osso(x, y, C) {
  const v = fbm(x * 0.8, y * 0.16, 3), l = Math.pow(vn(x * 3.6 + 3, y * 0.3), 6);
  mixC(C, c.ossoA, c.ossoB, clamp(v * 1.2 - 0.3));
  const e = 1 - 0.22 * l; C[0] *= e; C[1] *= e; C[2] *= e * 0.985;
}
function nacar(x, y, C, forca = 0.1) {
  const h = fbm(x * 0.22 + 3, y * 0.22 + 9, 3) * 3.1, f = fbm(x * 0.9, y * 0.9 + 4, 2), b = 0.42 + 0.5 * f;
  C[0] = b * (0.92 + forca * 2.2 * Math.cos(6.283 * h)); C[1] = b * (0.98 + forca * 2.2 * Math.cos(6.283 * (h + 0.36))); C[2] = b * (0.96 + forca * 2.2 * Math.cos(6.283 * (h + 0.68)));
}
function lataoEscovado(x, y, C) {
  const v = 0.86 + 0.28 * fbm(x * 0.4, y * 0.4, 3);
  C[0] = c.latao[0] * v; C[1] = c.latao[1] * v; C[2] = c.latao[2] * v;
}

// ---- materiais da cabeça e da rosácea
const c2 = { mogA: lin('#331509'), mogB: lin('#7b3a1e'), escA: lin('#120b08'), escB: lin('#3a1d10'), laranja: lin('#d08a4a'), flor: lin('#a3341a'), florE: lin('#5e180b'), miolo: lin('#c9963e'), folha: lin('#4d4420'), preto: lin('#0b0909') };
function mogno(x, y, C) {
  const u = x + 3 * (fbm(x * 0.03, y * 0.01, 3) - 0.5), v = fbm(u * 0.9, y * 0.035, 4), p = Math.pow(vn(u * 6, y * 0.4), 6);
  mixC(C, c2.mogA, c2.mogB, clamp(v * 1.6 - 0.32));
  const e = 1 - 0.45 * p; C[0] *= e; C[1] *= e; C[2] *= e;
}
function escuro(x, y, C) { // pau-santo muito escuro
  const v = fbm(x * 0.5 + y * 0.05, y * 0.6 - x * 0.05, 4);
  mixC(C, c2.escA, c2.escB, clamp(v * 1.9 - 0.55));
}
function ebanoPreto(x, y, C) {
  const v = fbm(x * 1.4, y * 0.06, 3); C[0] = 0.008 + 0.012 * v; C[1] = 0.007 + 0.01 * v; C[2] = 0.006 + 0.009 * v;
}

// ---- passos do desenho
function corpo() {
  const pCorpo = caminho(CORPO);
  camada({ caixa: [-200, 400, 200, 836], forma: (k) => k.fill(pCorpo), alfa: true, cor: abeto, alt: (x, y, e) => 1.4 * e, bisel: 1.1, brilho: 1, rugos: 0.1, metal: 0 });
  const m = massaCorpo();
  for (let q = 0; q < al.length; q++) {
    const t = m[q]; if (t < 0) continue;
    const e = 1 - liso(0.45, 1, t), e2 = e * e;
    ar[q] *= mix(1, 0.62, e2) * 0.99; ag[q] *= mix(1, 0.46, e2) * 0.94; ab[q] *= mix(1, 0.3, e2) * 0.8;
  }
  // filete simples: pau-santo por fora, osso e ébano por dentro
  const anel = (largura, cor, extra = {}) => camada({ caixa: [-200, 400, 200, 836], forma: (k) => { k.clip(pCorpo); k.lineWidth = largura * 2; k.stroke(pCorpo); }, cor, ...extra });
  anel(3.7, c.preto); anel(3.1, c.ossoA); anel(2.5, santo, { rugos: 0.12 });
}
function massaCorpo() {
  const f = 4, w = Math.ceil(W / f), h = Math.ceil(H / f), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const k = cv.getContext('2d', { willReadFrequently: true }); k.setTransform(R / f, 0, 0, R / f, -X0 * R / f, -Y0 * R / f); k.fillStyle = '#fff'; k.fill(caminho(CORPO));
  const d = k.getImageData(0, 0, w, h).data; const m = new Float32Array(w * h); for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
  const b = borrar(m, w, h, 40 * R / f);
  const o = new Float32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = x / f, fy = y / f, ix = Math.min(w - 2, Math.floor(fx)), iy = Math.min(h - 2, Math.floor(fy)), ux = fx - ix, uy = fy - iy, i = ix + iy * w;
    if (m[i] < 0.5) continue;
    o[x + y * W] = mix(mix(b[i], b[i + 1], ux), mix(b[i + w], b[i + w + 1], ux), uy);
  }
  return o;
}
function deslocar(poly, d) {
  const o = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[Math.max(0, i - 1)], b = poly[Math.min(poly.length - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    o.push([poly[i][0] - ty / l * d, poly[i][1] + tx / l * d]);
  }
  return o;
}

// rosáceas: três guitarras diferentes
let VARIANTE = 'flores';
const BANDAS_V = {
  flores: [[38, 39.2, 'eb'], [39.2, 39.8, 'os'], [39.8, 40.4, 'eb'], [40.4, 41.1, 'sa'], [41.1, 41.7, 'eb'], [41.7, 55.3, 'fl'], [55.3, 55.9, 'eb'], [55.9, 56.5, 'os'], [56.5, 57.2, 'eb'], [57.2, 58.5, 'sa'], [58.5, 59.1, 'eb']],
  // simples: só filetes de ébano e osso sobre o abeto
  simples: [[38, 39.4, 'eb'], [39.4, 40, 'os'], [40, 40.6, 'eb'], [44.2, 44.7, 'eb'], [44.7, 45.2, 'os'], [45.2, 45.7, 'eb'], [45.7, 46.2, 'os'], [46.2, 46.7, 'eb'], [51.4, 52, 'eb'], [52, 52.5, 'os'], [52.5, 54, 'sa'], [54, 54.5, 'os'], [54.5, 55.1, 'eb']],
  // madrepérola: um anel de placas de nácar entre filetes
  madreperola: [[38, 39.2, 'eb'], [39.2, 39.8, 'os'], [39.8, 40.4, 'eb'], [40.4, 41, 'os'], [41, 41.6, 'eb'], [41.6, 47.4, 'na'], [47.4, 48, 'eb'], [48, 48.6, 'os'], [48.6, 49.2, 'eb'], [52.6, 53.2, 'eb'], [53.2, 53.8, 'os'], [53.8, 55.6, 'sa'], [55.6, 56.2, 'eb']],
};
const RAIO_ROSA = { flores: 59.1, simples: 55.1, madreperola: 56.2 };
function rosacea(x, y, C) {
  const dx = x - G.BOCA.x, dy = y - G.BOCA.y, ang = Math.atan2(dy, dx), r = Math.hypot(dx, dy) + 0.06 * (vn(ang * 5 + 8, 3.1) - 0.5);
  let t = null;
  for (const b of BANDAS_V[VARIANTE]) if (r >= b[0] && r < b[1]) { t = b[2]; break; }
  if (!t) return false; // abeto à vista
  if (t === 'eb') { ebano(x, y, C); return; }
  if (t === 'sa') { santo(x, y, C); return; }
  if (t === 'os') { osso(x, y, C); return; }
  if (t === 'na') { // placas de nácar com juntas finas
    const u = (ang / 6.2832 + 0.5) * 72, iu = Math.floor(u + 0.5 * vn(u * 0.4, 2)), fu = u + 0.5 * vn(u * 0.4, 2) - iu;
    nacar(x * 1.6 + iu * 7.3, y * 1.6 - iu * 3.1, C, 0.34); { const e = 0.62 + 0.38 * vn(x * 2 + iu, y * 2); C[0] *= e * 0.92; C[1] *= e; C[2] *= e * 1.04; }
    if (fu < 0.045) { C[0] *= 0.25; C[1] *= 0.22; C[2] *= 0.2; }
    return;
  }
  // fundo de ácer com flores e folhas
  const k0 = 0.8 + 0.2 * vn(x * 0.8, y * 0.8); C[0] = c.aceB[0] * k0 * 1.05; C[1] = c.aceB[1] * k0; C[2] = c.aceB[2] * k0 * 0.86;
  const NF = 14, rm = 48.5, passo = 6.2832 / NF, aa = ang + Math.PI, kf = Math.round(aa / passo), da = aa - kf * passo, s = da * rm, tr = r - rm;
  const rf = Math.hypot(s, tr), af = Math.atan2(tr, s) + kf * 0.7;
  if (rf < 5.4) {
    const pet = Math.cos(5 * af) * 0.5 + 0.5, borda = 2.1 + 3 * Math.pow(pet, 0.6);
    if (rf < 1.35) { const v = 0.8 + 0.3 * vn(x * 4, y * 4); C[0] = c2.miolo[0] * v; C[1] = c2.miolo[1] * v; C[2] = c2.miolo[2] * v; return; }
    if (rf < borda) { const e = liso(borda - 0.6, borda, rf); mixC(C, c2.flor, c2.florE, e * 0.8 + 0.2 * vn(x * 3, y * 3)); return; }
  }
  const ux = (da > 0 ? da - passo / 2 : da + passo / 2) * rm;
  for (const sgn of [1, -1]) {
    const cy2 = sgn * 2.6, rot = sgn * 0.75, qx = ux * Math.cos(rot) + (tr - cy2) * Math.sin(rot), qy = -ux * Math.sin(rot) + (tr - cy2) * Math.cos(rot);
    if ((qx / 2.4) ** 2 + (qy / 1.0) ** 2 < 1) { const v = 0.75 + 0.4 * vn(x * 3, y * 3); C[0] = c2.folha[0] * v; C[1] = c2.folha[1] * v; C[2] = c2.folha[2] * v; return; }
  }
  if (ux * ux + tr * tr < 0.55) { C[0] = c2.flor[0]; C[1] = c2.flor[1]; C[2] = c2.flor[2]; }
}
function boca() {
  const b = G.BOCA;
  camada({ caixa: [-62, 488, 62, 612], forma: (k) => { k.beginPath(); k.arc(b.x, b.y, RAIO_ROSA[VARIANTE], 0, 6.2832); k.fill(); }, cor: rosacea, brilho: 1, rugos: 0.09 });
  camada({ caixa: [-44, 506, 44, 594], forma: (k) => { k.beginPath(); k.arc(b.x, b.y, 39.2, 0, 6.2832); k.fill(); }, alt: (x, y, e, h) => h - 0.5 * (1 - liso(38, 39.2, Math.hypot(x, y - b.y))) });
  camada({ caixa: [-42, 508, 42, 592], forma: (k) => { k.beginPath(); k.arc(b.x, b.y, b.r, 0, 6.2832); k.fill(); }, buraco: true });
}
function escudo() {
  // flores: medido na fotografia de estúdio; simples: gota estreita e negra; madrepérola: folha larga em tartaruga
  const FORMAS = {
    flores: { topo: [47, 572.4], ponta: [48.2, 664.2], dir: [[55.6, 574.8], [64.6, 587.3], [68.6, 604], [68.3, 622.7], [61.4, 641.5], [50.7, 660.2]], esq: [[38.2, 574.8], [25.6, 587.3], [20.6, 605], [20.6, 622], [24.8, 641.5], [43, 660.2]] },
    simples: { topo: [45, 579], ponta: [46, 668], dir: [[52, 580.5], [59, 590], [62.5, 608], [60.5, 630], [54, 650], [48.5, 663]], esq: [[38, 580.5], [31.5, 590], [28.5, 608], [30.5, 630], [37, 650], [43.5, 663]] },
    madreperola: { topo: [48, 570], ponta: [50, 667], dir: [[57, 571.5], [67, 584], [72, 602], [71.5, 623], [64, 643], [53, 662]], esq: [[39, 571.5], [26, 584], [19, 603], [18.5, 623], [24, 643], [45, 663]] },
  };
  const f = FORMAS[VARIANTE] || FORMAS.flores;
  const contorno = suavizar([f.topo, ...f.dir, f.ponta, ...[...f.esq].reverse(), f.topo], 10), p = caminho(contorno);
  const negro = (x, y, C) => { const v = fbm(x * 0.6 + y * 0.1, y * 0.5, 3); C[0] = 0.006 + 0.01 * v; C[1] = 0.004 + 0.007 * v; C[2] = 0.003 + 0.005 * v; };
  const tartaruga = (x, y, C) => { const v = fbm(x * 0.21 + 3, y * 0.17, 4), m = liso(0.5, 0.72, v + 0.12 * (vn(x * 0.9, y * 0.9) - 0.5)) * 0.85; C[0] = mix(0.03, 0.22, m); C[1] = mix(0.011, 0.085, m); C[2] = mix(0.005, 0.02, m); };
  camada({ caixa: [12, 564, 78, 670], forma: (k) => k.fill(p), cor: VARIANTE === 'madreperola' ? tartaruga : negro, bisel: 0.6, alt: (x, y, e, h) => h + 0.8 * e, brilho: VARIANTE === 'madreperola' ? 0.4 : 0.22, rugos: 0.05, metal: 0 });
}
function braco() {
  const lado = [[22.1, 186], [23.6, 250], [25.4, 320], [27.4, 395], [28.2, 428]];
  camada({ caixa: [-34, 180, 34, 432], forma: (k) => k.fill(caminho(espelho(suavizar(lado, 6)))), alfa: true, cor: mogno, alt: (x) => 2 + 6 * Math.sqrt(clamp(1 - (x / 30) ** 2)), brilho: 0.8, rugos: 0.15, metal: 0 });
}
function escala() {
  const p = formaEscala(), zE = (x) => 8.2 - x * x / (2 * 170);
  camada({ caixa: [-40, 184, 40, 545], forma: (k) => k.fill(p), alfa: true, cor: corEscala, alt: (x, y, e, h) => mix(h, zE(x), e), bisel: 0.55, brilho: 0.3, rugos: 0.36, metal: 0 });
  for (let n = 1; n <= 22; n++) {
    const y = G.traste(n), w = larguraEscala(y) - 0.7, fw = 1.15;
    let ini = -w; for (let x = w; x >= -w; x -= 0.25) { if (yFimEscala(x) < y + 2.2) { ini = x + 0.25; break; } }
    if (w - ini < 4) continue;
    camada({ caixa: [-40, y - 3, 40, y + 3], forma: (k) => { k.lineCap = 'round'; k.lineWidth = fw * 2; k.beginPath(); k.moveTo(ini + 0.9, y); k.lineTo(w - 0.9, y); k.stroke(); }, lineCap: 'round', cor: c.aco, metal: 1, rugos: 0.16, alt: (x, yy) => zE(x) + 1.05 * Math.sqrt(clamp(1 - ((yy - y) / fw) ** 2)) });
  }
  const wN = larguraEscala(G.NUT) + 0.3;
  camada({ caixa: [-28, 182, 28, 198], forma: (k) => { k.beginPath(); k.roundRect(-wN, G.NUT - 3.6, 2 * wN, 5, 0.8); k.fill(); }, cor: osso, bisel: 0.5, alt: (x, y) => zE(x) + 2.6 * Math.sqrt(clamp(1 - ((y - (G.NUT - 1.1)) / 2.6) ** 2)), brilho: 0.8, rugos: 0.2, metal: 0 });
  for (let i = 0; i < 12; i++) { const x = xNut(i); camada({ caixa: [x - 2, G.NUT - 5, x + 2, G.NUT + 3], forma: (k) => k.fillRect(x - 0.28, G.NUT - 1.9, 0.56, 2.4), cor: lin('#7a6248'), alt: (xx, y, e, h) => h - 0.7 }); }
}
function cabeca() {
  const caixaC = [-62, -4, 62, 200];
  // sino de madeira escura com filetes laranja nos bordos
  camada({ caixa: caixaC, forma: (k) => k.fill(caminho(SINO)), alfa: true, cor: (x, y, C) => { escuro(x, y, C); C[0] *= 0.7; C[1] *= 0.66; C[2] *= 0.62; }, bisel: 1.1, alt: (x, y, e) => 1.5 + 4.5 * e, brilho: 0.28, rugos: 0.2, metal: 0 });
  for (const s of [1, -1]) camada({ caixa: caixaC, forma: (k) => { const l = deslocar(ladoSino, 1.6); k.lineWidth = 0.55; k.beginPath(); l.forEach(([x, y], i) => (i ? k.lineTo(s * x, y) : k.moveTo(s * x, y))); k.stroke(); }, cor: VARIANTE === 'flores' ? c2.laranja : c.ossoA, brilho: 0.6 });
  // coluna de mogno que sobe por trás dos afinadores
  camada({ caixa: caixaC, forma: (k) => k.fill(caminho(espelho(ladoColuna))), alfa: true, cor: mogno, alt: (x, y) => 4 + 9 * Math.sqrt(clamp(1 - (x / colW(y)) ** 2)), brilho: 0.7, rugos: 0.16, metal: 0 });
  // lágrima: a face da voluta, inclinada para trás, embutida em pau-santo com filete claro
  const zL = (x, y) => 9 + 0.12 * y + 2.2 * Math.sqrt(clamp(1 - (x / lagW(y)) ** 2));
  camada({ caixa: [-24, -3, 24, 66], forma: (k) => k.fill(caminho(LAGRIMA)), alfa: true, cor: mogno, alt: zL, bisel: 0.9, brilho: 0.7, rugos: 0.15, metal: 0 });
  const face = espelho(deslocar(ladoLagrima, 2.6));
  camada({ caixa: [-24, -3, 24, 66], forma: (k) => k.fill(caminho(face)), cor: (x, y, C) => { if (VARIANTE === 'simples') { ebano(x * 1.3, y * 0.6, C); C[0] *= 0.55; C[1] *= 0.55; C[2] *= 0.55; } else escuro(x * 1.3 + 7, y * 0.5, C); }, alt: (x, y, e, h) => h - 0.25, brilho: 0.75, rugos: 0.1 });
  if (VARIANTE === 'madreperola') { const gota = espelho(deslocar(ladoLagrima, 8.5)); camada({ caixa: [-24, -3, 24, 66], forma: (k) => k.fill(caminho(gota)), cor: (x, y, C) => { nacar(x * 0.9 + 5, y * 0.9, C, 0.12); C[0] = C[0] * 0.8 + 0.12; C[1] = C[1] * 0.8 + 0.12; C[2] = C[2] * 0.8 + 0.13; }, alt: (x, y, e, h) => h + 0.05, brilho: 1, rugos: 0.05 }); }
  const fil = espelho(deslocar(ladoLagrima, 4.4));
  camada({ caixa: [-24, -3, 24, 66], forma: (k) => { k.lineWidth = 0.5; k.stroke(caminho(fil)); }, cor: VARIANTE === 'flores' ? c2.laranja : c.ossoA, brilho: 0.6 });
  // chapa de latão gravada, com doze janelas
  const pChapa = new Path2D(); pChapa.moveTo(-43, 121.8); pChapa.quadraticCurveTo(0, 115.8, 43, 121.8);
  for (let y = 122; y <= 150; y += 2) pChapa.lineTo(Math.min(43, larguraEscalaSino(y) - 1.4), y);
  pChapa.quadraticCurveTo(0, 156.5, -(larguraEscalaSino(150) - 1.4), 150);
  for (let y = 150; y >= 122; y -= 2) pChapa.lineTo(-Math.min(43, larguraEscalaSino(y) - 1.4), y);
  pChapa.closePath();
  const niquel = (x, y, C) => { const v = 0.86 + 0.24 * fbm(x * 0.4, y * 0.4, 3); C[0] = 0.62 * v; C[1] = 0.63 * v; C[2] = 0.64 * v; };
  camada({ caixa: caixaC, forma: (k) => k.fill(pChapa), cor: VARIANTE === 'madreperola' ? niquel : lataoEscovado, bisel: 0.5, alt: (x, y, e) => 7 + 1.2 * e, metal: 1, rugos: VARIANTE === 'simples' ? 0.12 : 0.2 });
  const grav = (f) => camada({ caixa: caixaC, forma: (k) => { k.clip(pChapa); k.lineWidth = 0.26; k.lineCap = 'round'; f(k); }, cor: (x, y, C) => { C[0] = c.latao2[0] * 0.28; C[1] = c.latao2[1] * 0.26; C[2] = c.latao2[2] * 0.2; }, alt: (x, y, e, h) => h - 0.15, rugos: 0.5 });
  const espir = (k, x, y, r, voltas, sent, a0) => { k.beginPath(); for (let t = 0; t <= 1.0001; t += 0.03) { const an = a0 + sent * t * voltas * 6.2832, rr = r * (1 - t * 0.85); if (t) k.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); else k.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } k.stroke(); };
  grav((k) => {
    if (VARIANTE === 'simples') { k.beginPath(); k.moveTo(-41, 123.6); k.quadraticCurveTo(0, 117.8, 41, 123.6); k.stroke(); k.beginPath(); k.moveTo(-34, 151); k.quadraticCurveTo(0, 155.6, 34, 151); k.stroke(); return; }
    // orla e banda de volutas em cima
    k.beginPath(); k.moveTo(-41, 123.6); k.quadraticCurveTo(0, 117.8, 41, 123.6); k.stroke();
    for (let i = -6; i <= 6; i++) { const x = i * 6.6, y = 121.6 + 0.0034 * x * x; espir(k, x, y, 1.7, 1.2, i % 2 ? 1 : -1, i); k.beginPath(); k.moveTo(x + 1.6, y + 0.4); k.quadraticCurveTo(x + 3.3, y - 1.4, x + 5, y + 0.3); k.stroke(); }
    // figura ao centro: uma guitarra pequena gravada
    k.beginPath(); k.ellipse(0, 143.5, 2.4, 2.9, 0, 0, 6.2832); k.stroke(); k.beginPath(); k.moveTo(0, 140.6); k.lineTo(0, 128); k.stroke(); k.beginPath(); k.moveTo(-1.2, 127.5); k.lineTo(0, 125.8); k.lineTo(1.2, 127.5); k.stroke();
    k.beginPath(); k.arc(0, 143.5, 0.8, 0, 6.2832); k.stroke();
    // folhas de acanto entre as volutas e uma orla dupla
    for (let i = -6; i < 6; i++) { const x = i * 6.6 + 3.3, y = 120.6 + 0.0034 * x * x; k.beginPath(); k.moveTo(x - 1.4, y + 1.6); k.quadraticCurveTo(x, y - 1.2, x + 1.4, y + 1.6); k.stroke(); k.beginPath(); k.moveTo(x, y + 1.6); k.lineTo(x, y - 0.4); k.stroke(); }
    k.beginPath(); k.moveTo(-40.5, 125.2); k.quadraticCurveTo(0, 119.5, 40.5, 125.2); k.stroke();
    for (const s of [1, -1]) { espir(k, s * 2.6, 131, 1.6, 1.3, s, 0.5); espir(k, s * 2.4, 137.5, 1.4, 1.2, -s, 2); }
    // arabescos miúdos a encher a chapa (como nas chapas gravadas à mão)
    let sem = 7; const rnd = () => (sem = (sem * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 340; n++) {
      const x = -41 + rnd() * 82, y = 123 + rnd() * 30, j = Math.round((x + 36) / 5.7);
      const perto = JANELA_X.some((_, i) => Math.abs(x - janela(i, y)) < 2.1 && y > 125.5 && y < 147) || (Math.abs(x) < 3.4 && y > 124 && y < 148);
      if (perto) continue;
      espir(k, x, y, 0.6 + rnd() * 0.7, 0.9 + rnd() * 0.6, rnd() < 0.5 ? 1 : -1, rnd() * 6.28);
    }
    // banda de baixo
    for (let i = -5; i <= 5; i++) { const x = i * 5.8, y = 151.5 + 0.0028 * x * x; k.beginPath(); k.moveTo(x - 2.4, y); k.quadraticCurveTo(x, y - 1.8, x + 2.4, y); k.stroke(); }
  });
  // janelas: fundo escuro, parafuso sem-fim e o gancho onde prende a corda
  for (let i = 0; i < 12; i++) {
    const xa = janela(i, 126.5), xb = janela(i, 145.5);
    camada({ caixa: [Math.min(xa, xb) - 3, 123, Math.max(xa, xb) + 3, 149], forma: (k) => { k.lineCap = 'round'; k.lineWidth = 2.7; k.beginPath(); k.moveTo(xa, 126.5); k.lineTo(xb, 145.5); k.stroke(); }, lineCap: 'round', cor: c2.preto, alt: (x, y, e, h) => 5.8, brilho: 0.2, rugos: 0.6, metal: 0 });
    camada({ caixa: [Math.min(xa, xb) - 2, 123, Math.max(xa, xb) + 2, 149], forma: (k) => { k.lineWidth = 1.5; k.beginPath(); k.moveTo(xa, 125.5); k.lineTo(xb, 146); k.stroke(); }, cor: c.aco, metal: 1, rugos: 0.22,
      alt: (x, y) => { const u = (y - 125.5) / 20.5, xc = mix(xa, xb, u), d = Math.abs(x - xc) / 0.75; return 6 + 1.2 * Math.sqrt(clamp(1 - d * d)) * (0.85 + 0.15 * Math.sin(y * 9)); } });
    const xg = janela(i, GANCHO_Y);
    camada({ caixa: [xg - 3, GANCHO_Y - 3, xg + 3, GANCHO_Y + 3], forma: (k) => { k.lineWidth = 0.75; k.beginPath(); k.arc(xg, GANCHO_Y, 1.05, 0, 6.2832); k.stroke(); }, cor: c.aco, metal: 1, rugos: 0.15, alt: (x, y, e, h) => 9.6 });
  }
  // afinadores: haste de aço, anilha, botão preto cilíndrico e remate de osso
  const ponto = (t, u) => { const a = rad(t.a); return [t.x + Math.sin(a) * u, t.y - Math.cos(a) * u]; };
  for (const t of TARRAXAS) {
    const a = rad(t.a), base = t.f ? 22 : 16, [hx0, hy0] = ponto(t, -10), dyFim = 119.5 - t.y, [hx1, hy1] = [t.x - Math.sin(a) * (dyFim / Math.cos(a)), 119.5];
    const loc = (x, y) => { const dx = x - t.x, dy = y - t.y; return [dx * Math.sin(a) - dy * Math.cos(a), dx * Math.cos(a) + dy * Math.sin(a)]; }; // u ao longo do eixo (para cima), v de lado
    camada({ caixa: [Math.min(hx0, hx1) - 3, hy0 - 2, Math.max(hx0, hx1) + 3, 121], forma: (k) => { k.lineWidth = 2.7; k.beginPath(); k.moveTo(hx0, hy0); k.lineTo(hx1, hy1); k.stroke(); }, alfa: true, cor: c.aco, metal: 1, rugos: 0.18,
      alt: (x, y) => { const [, v] = loc(x, y); return base - 3 + 1.6 * Math.sqrt(clamp(1 - (v / 1.35) ** 2)); } });
    { const xn = t.x - Math.sin(a) * ((116 - t.y) / Math.cos(a)), yn = 116; camada({ caixa: [xn - 4, yn - 4, xn + 4, yn + 4], forma: (k) => { k.translate(xn, yn); k.rotate(a); k.beginPath(); for (let j = 0; j < 6; j++) { const q = j * Math.PI / 3 + Math.PI / 6; k.lineTo(Math.cos(q) * 2.4, Math.sin(q) * 1.5); } k.closePath(); k.fill(); }, alfa: true, cor: c.aco, metal: 1, rugos: 0.2, alt: (x, y) => base - 1 + 1.2 * clamp(1 - Math.hypot(x - xn, (y - yn) * 1.4) / 2.6) }); }
    camada({ caixa: [t.x - 10, t.y - 18, t.x + 10, t.y + 16], forma: (k) => { k.translate(t.x, t.y); k.rotate(a); k.beginPath(); k.roundRect(-3.3, 9.2, 6.6, 1.8, 0.6); k.fill(); }, alfa: true, cor: c.aco, metal: 1, rugos: 0.2, alt: (x, y) => { const [, v] = loc(x, y); return base + 0.5 + 2.4 * Math.sqrt(clamp(1 - (v / 3.3) ** 2)); } });
    camada({ caixa: [t.x - 10, t.y - 18, t.x + 10, t.y + 16], forma: (k) => { k.translate(t.x, t.y); k.rotate(a); k.beginPath(); k.roundRect(-4.9, -10.6, 9.8, 20.4, 1.8); k.fill(); }, alfa: true, cor: VARIANTE === 'simples' ? (x, y, C) => osso(x * 1.4, y * 0.4, C) : ebanoPreto, brilho: 0.9, rugos: 0.2, metal: 0,
      alt: (x, y) => { const [u, v] = loc(x, y); const s = clamp(1 - (v / 4.9) ** 2), canelura = Math.abs(u) < 9 ? 0.34 * Math.cos(v / 4.9 * Math.PI * 2.5) : 0, cinta = 1 - 0.06 * liso(0, 2.5, 3 - Math.abs(u + 2)); return base + (4.8 * Math.sqrt(s) + canelura * Math.sqrt(s)) * cinta; } });
    camada({ caixa: [t.x - 8, t.y - 20, t.x + 8, t.y], forma: (k) => { k.translate(t.x, t.y); k.rotate(a); k.beginPath(); k.moveTo(0, -18.4); k.bezierCurveTo(1.6, -17, 2.4, -15, 2.2, -13.2); k.quadraticCurveTo(2, -11.6, 0, -11.2); k.quadraticCurveTo(-2, -11.6, -2.2, -13.2); k.bezierCurveTo(-2.4, -15, -1.6, -17, 0, -18.4); k.fill(); k.beginPath(); k.rect(-1, -11.4, 2, 1.2); k.fill(); }, alfa: true, cor: VARIANTE === 'simples' ? ebanoPreto : VARIANTE === 'madreperola' ? (x, y, C) => nacar(x * 2, y * 2, C, 0.12) : osso, brilho: 1, rugos: 0.14, metal: 0,
      alt: (x, y) => { const [u, v] = loc(x, y); return base + 3 + 2 * Math.sqrt(clamp(1 - (v / 2.2) ** 2 - ((u - 14.4) / 3.6) ** 2)); } });
  }
  // pino cromado ao centro
  camada({ caixa: [-4, 92, 4, 121], forma: (k) => { k.fillRect(-1.1, 99, 2.2, 21); }, alfa: true, cor: c.aco, metal: 1, rugos: 0.12, alt: (x, y) => 15 + 1.1 * Math.sqrt(clamp(1 - (x / 1.1) ** 2)) * (0.9 + 0.1 * Math.sin(y * 7)) });
  camada({ caixa: [-4, 92, 4, 121], forma: (k) => { k.beginPath(); k.arc(0, 97.6, 2.1, 0, 6.2832); k.fill(); k.fillRect(-2, 111.5, 4, 2.4); }, alfa: true, cor: c.aco, metal: 1, rugos: 0.1, alt: (x, y) => 16 + 2 * Math.sqrt(clamp(1 - (x * x + (y - 97.6) ** 2) / 4.4)) });
}
const larguraEscalaSino = (() => { const t = tabela(ladoSino, 200); return (y) => t(y); })();
function cavalete() {
  const y = G.PONTE, w = 37.5;
  const alt = (x, yy) => { const d = Math.abs(yy - y), fim = liso(0, 5, w + 1.5 - Math.abs(x)), H = (9 - x * x / 400) * fim; return 1.4 + 1.2 * (1 - liso(2.9, 3.4, d)) + H * Math.pow(clamp(1 - d / 2.8), 0.85); };
  camada({ caixa: [-44, y - 6, 44, y + 6], forma: (k) => { k.beginPath(); k.roundRect(-w - 1.5, y - 3.4, 2 * w + 3, 6.8, 2); k.fill(); }, cor: (x, yy, C) => osso(yy * 1.5 + 2, x * 0.42 + 9, C), alt, brilho: 0.7, rugos: 0.2, metal: 0 });
  for (let i = 0; i < 12; i++) { const x = xPonte(i); camada({ caixa: [x - 2, y - 2, x + 2, y + 2], forma: (k) => k.fillRect(x - 0.28, y - 0.8, 0.56, 1.6), cor: lin('#8b7558'), alt: (a, b, e, h) => h - 0.9 }); }
}
function atadilho() {
  const fundo = (x) => 659 + 170.1 * Math.sqrt(Math.max(0, 1 - (x / 189) ** 2)), p = new Path2D();
  p.moveTo(-23, fundo(-23) - 6.2); p.quadraticCurveTo(0, fundo(0) - 8.6, 23, fundo(23) - 6.2);
  for (let x = 23; x >= -23; x -= 1) p.lineTo(x, fundo(x) + 1.2);
  p.closePath();
  camada({ caixa: [-28, 812, 28, 834], forma: (k) => k.fill(p), alfa: true, cor: lataoEscovado, bisel: 0.5, alt: (x, y, e) => 1.4 + 1.1 * e, metal: 1, rugos: 0.22 });
  for (let i = 0; i < 12; i++) { const x = xBotao(i), y = fundo(x) - 3.4; camada({ caixa: [x - 3, y - 3, x + 3, y + 3], forma: (k) => { k.beginPath(); k.arc(x, y, 1.35, 0, 6.2832); k.fill(); }, cor: osso, brilho: 1, rugos: 0.12, metal: 0, alt: (a, b, e, h) => 2.5 + 1.9 * Math.sqrt(clamp(1 - ((a - x) ** 2 + (b - y) ** 2) / 1.82)) }); }
}

// ---- luz
const L = (() => { const v = [-0.42, -0.58, 0.7], l = Math.hypot(...v); return v.map((a) => a / l); })();
function sombras() {
  const D = Math.max(1, Math.round(R / 3)), w = Math.ceil(W / D), h = Math.ceil(H / D), hs = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = -9; for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) { const q = Math.min(W - 1, x * D + i) + Math.min(H - 1, y * D + j) * W; if (al[q] > 0.5 && hh[q] > m) m = hh[q]; } hs[x + y * w] = m; }
  const lxy = Math.hypot(L[0], L[1]), dx = L[0] / lxy, dy = L[1] / lxy, tg = L[2] / lxy, passo = 1.1, n = Math.ceil(17 * R / D / passo), mm = D / R;
  const s = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const z0 = hs[x + y * w]; if (z0 < -8) continue; let oc = 0;
    for (let t = 1; t <= n; t++) {
      const a = Math.round(x + dx * t * passo), b = Math.round(y + dy * t * passo); if (a < 0 || b < 0 || a >= w || b >= h) break;
      const d = hs[a + b * w] - (z0 + t * passo * mm * tg + 0.06); if (d > oc) oc = d;
    }
    s[x + y * w] = clamp(oc / 0.55);
  }
  const b = borrar(s, w, h, Math.max(1, 0.35 * R / D));
  return { b, w, h, D };
}
function renderizar() {
  // micro-ondulação do verniz, oclusão e sombras
  const blur1 = borrar(hh, W, H, 0.8 * R), blur2 = borrar(hh, W, H, 3.2 * R), S = sombras();
  const camZ = 1500, camY = 420;
  const saida = new ImageData(W, H), o = saida.data;
  const env = (rx, ry, r) => {
    const m = 0.03 + r * 0.42;
    const a = liso(-0.8 - m, -0.8 + m, rx) * (1 - liso(0.03 - m, 0.03 + m, rx)) * liso(-0.95 - m, -0.95 + m, ry) * (1 - liso(0.16 - m, 0.16 + m, ry));
    const b = liso(0.34 - m, 0.34 + m, rx) * (1 - liso(0.55 - m, 0.55 + m, rx)) * (1 - liso(0.4 - m, 0.9 + m, Math.abs(ry)));
    return 0.13 + 0.3 * clamp(0.5 - ry * 0.5) + a * 4.2 + b * 1.7;
  };
  for (let y = 0; y < H; y++) {
    const my = Y0 + (y + 0.5) / R;
    for (let x = 0; x < W; x++) {
      const q = x + y * W, A = al[q]; if (A <= 0.002) continue;
      const mx = X0 + (x + 0.5) / R;
      const xl = Math.max(0, x - 1), xr = Math.min(W - 1, x + 1), yu = Math.max(0, y - 1) * W, yd = Math.min(H - 1, y + 1) * W;
      let nx = -(hh[xr + y * W] - hh[xl + y * W]) * R * 0.5, ny = -(hh[x + yd] - hh[x + yu]) * R * 0.5;
      const gr = Math.hypot(nx, ny); if (gr > 1.5) { nx *= 1.5 / gr; ny *= 1.5 / gr; }
      if (me[q] > 0.5) { nx += 0.1 * (fbm(mx * 0.035 + 3, my * 0.035, 2) - 0.5) + mx * 0.0016; ny += 0.1 * (fbm(mx * 0.035, my * 0.035 + 8, 2) - 0.5) + (my - 120) * 0.0012; }
      const rg = ro[q];
      if (rg < 0.15) { nx += 0.012 * (fbm(mx * 0.09, my * 0.09, 2) - 0.5); ny += 0.012 * (fbm(mx * 0.09 + 40, my * 0.09, 2) - 0.5); }
      const il = 1 / Math.hypot(nx, ny, 1); nx *= il; ny *= il; const nz = il;
      const ndl = clamp(nx * L[0] + ny * L[1] + nz * L[2]) / L[2];
      const sx = x / S.D, sy = y / S.D, si = Math.min(S.w - 2, Math.floor(sx)), sj = Math.min(S.h - 2, Math.floor(sy)), ux = sx - si, uy = sy - sj, t0 = si + sj * S.w;
      const sombra = mix(mix(S.b[t0], S.b[t0 + 1], ux), mix(S.b[t0 + S.w], S.b[t0 + S.w + 1], ux), uy);
      const ao = (1 - clamp((blur1[q] - hh[q]) * 0.55) * 0.55) * (1 - clamp((blur2[q] - hh[q]) * 0.14) * 0.45);
      const key = mix(1, 0.3, sombra);
      // reflexo do estúdio
      let vx = -mx, vy = camY - my, vz = camZ; const iv = 1 / Math.hypot(vx, vy, vz); vx *= iv; vy *= iv; vz *= iv;
      const dn = nx * vx + ny * vy + nz * vz, rx = 2 * dn * nx - vx, ry = 2 * dn * ny - vy;
      const e = env(rx, ry, rg), F = 0.045 + 0.955 * Math.pow(1 - clamp(dn), 5);
      const m = me[q], gb = gl[q];
      const ad = 0.56 + 0.62 * ndl * key;
      let r = ar[q] * ad * ao, g = ag[q] * ad * ao, b = ab[q] * ad * ao;
      const spec = F * e * gb * ao * mix(1, 0.55, sombra);
      r += spec; g += spec * 0.97; b += spec * 0.92;
      if (m > 0) {
        const pe = 0.37 * e * mix(1, 0.5, sombra) * ao + 0.08 * ndl * key * ao;
        r = mix(r, ar[q] * pe, m); g = mix(g, ag[q] * pe, m); b = mix(b, ab[q] * pe, m);
      }
      const k = 4 * q;
      o[k] = 255 * Math.pow(clamp(r / (1 + r * 0.12)), 1 / 2.2); o[k + 1] = 255 * Math.pow(clamp(g / (1 + g * 0.12)), 1 / 2.2); o[k + 2] = 255 * Math.pow(clamp(b / (1 + b * 0.12)), 1 / 2.2); o[k + 3] = 255 * clamp(A);
    }
  }
  const cv = document.getElementById('saida'); cv.width = W; cv.height = H; cv.getContext('2d').putImageData(saida, 0, 0);
  return cv;
}

// O interior: fundo em ácer por envernizar, junta ao centro, duas barras e o contra-aro, tal como se veem pela boca.
window.pintarInterior = function (cfg) {
  iniciar(cfg);
  const cru = (x, y, C) => {
    const ax = Math.abs(x), u = ax + 6 * (fbm(ax * 0.012, y * 0.0035, 3) - 0.5), v = fbm(u * 0.32, y * 0.018, 4), o = fbm(u * 0.05 + y * 0.09, y * 0.02, 3);
    mixC(C, c.aceA, c.aceB, clamp(v * 1.7 - 0.45 + (o - 0.5) * 0.7));
    const p = 1 - 0.3 * Math.pow(vn(u * 3, y * 0.28), 5), f = (Math.sin(y * 0.21 + 6 * o) * 0.5 + 0.5) * 0.09 + 0.91; C[0] *= p * f; C[1] *= p * f * 0.92; C[2] *= p * f * 0.76;
  };
  const tudo = [cfg.x0, cfg.y0, cfg.x1, cfg.y1];
  camada({ caixa: tudo, forma: (k) => k.fillRect(cfg.x0, cfg.y0, cfg.x1 - cfg.x0, cfg.y1 - cfg.y0), alfa: true, cor: cru, alt: 0, brilho: 0.05, rugos: 0.6, metal: 0 });
  camada({ caixa: tudo, forma: (k) => k.fillRect(-0.6, cfg.y0, 1.2, cfg.y1 - cfg.y0), cor: lin('#6f5433'), alt: (x, y, e, h) => h - 0.2 });
  for (const y of [470, 735]) camada({ caixa: tudo, forma: (k) => k.fillRect(cfg.x0, y - 9, cfg.x1 - cfg.x0, 18), cor: (x, yy, C) => { cru(yy * 3, x * 0.4 + 90, C); C[0] *= 0.8; C[1] *= 0.76; C[2] *= 0.68; }, alt: (x, yy) => 13 * Math.sqrt(clamp(1 - ((yy - y) / 9) ** 2)) });
  const anel = caminho(CORPO);
  camada({ caixa: tudo, forma: (k) => { k.lineWidth = 26; k.stroke(anel); }, cor: (x, y, C) => { nogueira(x, y, C); C[0] *= 1.3; C[1] *= 1.2; C[2] *= 1.1; }, alt: 11, bisel: 2 });
  camada({ caixa: tudo, forma: (k) => { k.lineWidth = 7; k.stroke(anel); }, cor: c.preto, alt: 20 });
  renderizar();
  return { w: W, h: H };
};

window.GEOM = { xNut, xPonte, xBotao, G };
window.pintarGuitarra = function (cfg) {
  const t0 = performance.now();
  VARIANTE = cfg.variante || 'flores';
  if (VARIANTE === 'simples') { c.abetoA = lin('#d8a65e'); c.abetoB = lin('#8d5426'); } else { c.abetoA = lin('#e4c48c'); c.abetoB = lin('#a8763f'); }
  iniciar(cfg);
  corpo(); boca(); escudo(); braco(); cabeca(); escala(); cavalete(); atadilho();
  const t1 = performance.now();
  renderizar();
  return { w: W, h: H, camadas: Math.round(t1 - t0), luz: Math.round(performance.now() - t1) };
};
window.recorte = function (x0, y0, x1, y1, escala = 1, tipo = 'image/png', q = 0.9, fundo = null) {
  const s = document.getElementById('saida'), f = (v) => Math.round(v), sx = f((x0 - X0) * R), sy = f((y0 - Y0) * R), sw = f((x1 - x0) * R), sh = f((y1 - y0) * R);
  const cv = document.createElement('canvas'); cv.width = Math.round(sw * escala); cv.height = Math.round(sh * escala);
  const k = cv.getContext('2d'); k.imageSmoothingQuality = 'high';
  if (fundo) { k.fillStyle = fundo; k.fillRect(0, 0, cv.width, cv.height); }
  k.drawImage(s, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  return cv.toDataURL(tipo, q);
};
