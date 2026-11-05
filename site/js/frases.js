// Frases citadas nos documentos do arquivo: realçar no texto a citação inteira (e só ela) e saber que fichas citam
// cada documento. Tudo a partir do texto arquivado e das citações que já estão no base.json: nada se escreve.
import { E } from './estado.js';

// as mesmas regras de normalizar() em scripts/comum.py (e ainda sem acentos): maiúsculas, aspas, travessões e espaços não contam
function normCar(ch) {
  if (/\s/.test(ch) || ch === ' ') return ' ';
  if (ch === '​' || ch === '­') return '';
  if ('“”«»„"'.includes(ch)) return '"';
  if ('‘’`´\''.includes(ch)) return "'";
  if ('–—‒−'.includes(ch)) return '-';
  return ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
export const normFrase = (s) => [...String(s || '')].map(normCar).join('').replace(/ +/g, ' ').trim();

/** Troços de uma citação, separados por «…», «...» ou «[…]», sem as aspas e os espaços das pontas (como trocos() em comum.py). */
const trocos = (citacao) => normFrase(citacao).split(/\.\.\.|…|\[\s*\.\.\.\s*\]|\[…\]/).map((p) => p.trim().replace(/^["' ]+|["' ]+$/g, '')).filter(Boolean);

const BLOCOS = /^(P|DIV|BR|LI|TR|TD|TH|H[1-6]|BLOCKQUOTE|TABLE|HR|UL|OL|DL|DT|DD|PRE|SECTION|ARTICLE|FIGURE|FIGCAPTION)$/;

// o que o site acrescenta ao texto arquivado (o ▶ das ligações, «indisponível», os cartões dos vídeos incorporados)
const IGNORAR = 'script, style, button, .ligacao-morta, .media-embutido';

/** O texto visível de `raizes` (um elemento ou uma lista: o corpo e os comentários), normalizado, com a origem (nó de
 *  texto e posição) de cada carácter; entre blocos, um espaço. */
function textoComOrigens(raizes) {
  let texto = '';
  const origem = [];
  // vários espaços seguidos contam como um; o espaço entre dois blocos não tem carácter de origem (null)
  const espaco = (de = null) => { if (texto && !texto.endsWith(' ')) { texto += ' '; origem.push(de); } };
  const filtro = { acceptNode: (n) => {
    if (n.nodeType !== 1 || !n.matches(IGNORAR)) return NodeFilter.FILTER_ACCEPT;
    if (BLOCOS.test(n.tagName)) espaco(); // um vídeo incorporado separa o texto de antes e o de depois
    return NodeFilter.FILTER_REJECT;
  } };
  for (const raiz of [].concat(raizes).filter(Boolean)) {
    espaco();
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, filtro);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.nodeType === 1) { if (BLOCOS.test(n.tagName)) espaco(); continue; }
      for (let i = 0; i < n.data.length; i++) {
        for (const c of normCar(n.data[i])) {
          if (c === ' ') espaco([n, i]);
          else { texto += c; origem.push([n, i]); }
        }
      }
    }
  }
  return { texto, origem };
}

/** Tira as marcas de frase deixadas antes (para realçar outra). */
export function limparFrases(raiz) {
  for (const m of raiz.querySelectorAll('mark.frase')) m.replaceWith(...m.childNodes);
  raiz.normalize();
}

/** Marca no texto a citação inteira: cada troço pela ordem, só esse trecho. `raiz`: um elemento ou uma lista (só o texto
 *  arquivado, nunca a lista «Citado em», que repete as frases). Devolve as marcas (vazio se não a encontrou). */
export function marcarFrase(raiz, frase) {
  const partes = trocos(frase);
  if (!partes.length) return [];
  const { texto, origem } = textoComOrigens(raiz);
  const intervalos = [];
  let pos = 0;
  for (const p of partes) {
    const i = texto.indexOf(p, pos);
    if (i < 0) return []; // um troço que não está no texto: não se marca nada a meio
    intervalos.push([i, i + p.length]);
    pos = i + p.length;
  }
  // pedaços contíguos dentro do mesmo nó de texto; marcam-se do fim para o princípio, para as posições não mudarem
  const pedacos = [];
  for (const [a, b] of intervalos) {
    let atual = null;
    for (let k = a; k < b; k++) {
      const o = origem[k];
      if (!o) continue;
      if (atual && atual.no === o[0] && o[1] >= atual.fim) atual.fim = o[1] + 1; // no mesmo nó, os espaços repetidos entram
      else { atual = { no: o[0], inicio: o[1], fim: o[1] + 1 }; pedacos.push(atual); }
    }
  }
  const marcas = [];
  for (const p of pedacos.reverse()) {
    try {
      const r = document.createRange();
      r.setStart(p.no, p.inicio); r.setEnd(p.no, p.fim);
      const m = document.createElement('mark');
      m.className = 'frase';
      r.surroundContents(m);
      marcas.unshift(m);
    } catch { /* o nó mudou entretanto */ }
  }
  return marcas;
}

// ------------------------------------------------------------------ que fichas citam cada documento

const TIPOS = { pessoas: ['Pessoa', 'pessoa'], obras: ['Obra', 'obra'], gravacoes: ['Disco', 'gravacao'], instrumentos: ['Instrumento', 'instrumento'], media: ['Vídeo ou áudio', ''] };
let indice = null, indiceDe = null;

function indiceCitacoes() {
  if (indiceDe === E.base) return indice;
  indice = new Map();
  for (const [t, [tipo, rota]] of Object.entries(TIPOS)) {
    for (const x of E.base?.[t] || []) {
      const percorrer = (v) => {
        if (Array.isArray(v)) v.forEach(percorrer);
        else if (v && typeof v === 'object') {
          if (v.doc && typeof v.citacao === 'string' && v.citacao.trim()) {
            if (!indice.has(v.doc)) indice.set(v.doc, []);
            indice.get(v.doc).push({ c: v, tipo, t, x, rota: rota ? `#/${rota}/${x.id}` : '', nome: x.nome || x.titulo || x.designacao || x.id });
          }
          Object.values(v).forEach(percorrer);
        }
      };
      percorrer(x);
    }
  }
  indiceDe = E.base;
  return indice;
}

/** As citações de um ou mais documentos (o post e os seus comentários), arrumadas por ficha: [{ tipo, nome, rota, x, frases }]. */
export function fichasQueCitam(docs) {
  const porFicha = new Map();
  for (const doc of [].concat(docs)) {
    for (const e of indiceCitacoes().get(doc) || []) {
      const k = `${e.t}/${e.x.id}`;
      if (!porFicha.has(k)) porFicha.set(k, { ...e, frases: [] });
      const f = porFicha.get(k);
      if (!f.frases.some((c) => c.citacao === e.c.citacao)) f.frases.push(e.c);
    }
  }
  return [...porFicha.values()];
}

/** A citação inteira de que `inicio` é o princípio (o painel da citação manda os primeiros 80 caracteres), neste documento. */
export function fraseCompleta(docs, inicio) {
  const n = normFrase(inicio);
  if (!n) return null;
  for (const f of fichasQueCitam(docs)) for (const c of f.frases) if (normFrase(c.citacao).startsWith(n)) return c.citacao;
  return null;
}
