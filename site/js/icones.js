// Ícones dos atributos de uma pessoa (os «papeis» da ficha): uma guitarra, uma viola, um cantor, uma pena, uma nota…
// Uma pessoa pode ter vários ou nenhum; «outro» não tem ícone. Tudo em SVG próprio, numa só cor (currentColor).
import { PAPEIS } from './estado.js';
import { html, raw } from './util.js';

const DESENHOS = {
  // guitarra de Coimbra: corpo em pera e cabeça em lágrima
  guitarrista: `<g transform="rotate(38 12 12)"><path d="M12 .6c1.5 0 2.5 1.1 2.5 2.4 0 1.1-.7 1.9-1.4 2.5v4.6c1.5 1.6 5 2.7 5 7 0 3.5-2.7 5.7-6.1 5.7s-6.1-2.2-6.1-5.7c0-4.3 3.5-5.4 5-7V5.500c-.7-.6-1.4-1.400-1.400-2.500C9.500 1.700 10.500.6 12 .6zm0 15a2.100 2.100 0 1 0 0 4.200 2.100 2.100 0 0 0 0-4.200z" fill-rule="evenodd"/></g>`,
  // viola: corpo em oito, com cintura, e cabeça direita
  violista: `<g transform="rotate(38 12 12)"><path d="M10.200.6h3.600v4.800h-.800v3.400c1.900.3 3.100 1.500 3.100 3.300 0 1.400-.8 2.100-.8 2.900 0 .9 1.800 1.600 1.800 3.900 0 2.700-2.300 4.100-5.100 4.100s-5.100-1.400-5.100-4.100c0-2.300 1.800-3 1.800-3.900 0-.8-.8-1.500-.8-2.900 0-1.800 1.200-3 3.100-3.300V5.400h-.800zM12 13.400a1.800 1.800 0 1 0 0 3.600 1.800 1.800 0 0 0 0-3.600z" fill-rule="evenodd"/></g>`,
  // cantor: uma pessoa e o som que sai dela
  cantor: `<circle cx="9" cy="8" r="4.600"/><path d="M1.400 22.500c.5-5.700 3.500-8.300 7.600-8.300s7.100 2.600 7.600 8.300z"/><path d="M15.700 5.200a4.800 4.800 0 0 1 0 5.600M18.800 2.700a9.200 9.200 0 0 1 0 10.600" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  // compositor: duas notas
  compositor: `<path d="M9.200 18.700a3.300 3.300 0 1 1-2.200-3.100V5.100L20 2.500v13.700a3.300 3.300 0 1 1-2.200-3.100V7.300L9.200 9z"/>`,
  // poeta: uma pena
  poeta: `<path d="M21.500 2.500c-7.500.2-12.700 2.700-15.300 7.700-1.400 2.700-1.500 5.300-1.100 7.900L2.500 20.700l.9.900 2.600-2.600c2.600.5 5.200 0 7.700-1.500 2-1.200 3.200-2.600 3.900-4.100l-3.800-.5 4.800-1.700c1-1.600 1.500-3.500 1.900-5.400l-3.700.5 4.300-2.200c.200-.6.300-1 .4-1.600z"/>`,
  // letrista: uma folha escrita
  letrista: `<path fill-rule="evenodd" d="M4.500 1.500h11l4 4v17h-15zM8 9v1.700h8V9zm0 4v1.700h8V13zm0 4v1.700h5.500V17z"/>`,
  // luthier: um formão
  luthier: `<g transform="rotate(42 12 12)"><rect x="9.800" y=".5" width="4.400" height="9.500" rx="1.600"/><rect x="11.100" y="9.600" width="1.800" height="3"/><path d="M9.700 12.200h4.600v8.300L9.700 23.500z"/></g>`,
  // professor: um barrete de quem ensina
  professor: `<path d="M12 3.500 1 9l11 5.500L21 10v6.500h2V9zM5.500 13.200v3.900C7 18.900 9.400 20 12 20s5-1.100 6.500-2.900v-3.900L12 16.500z"/>`,
  // investigador: uma lupa
  investigador: `<path fill-rule="evenodd" d="M10 1.800a8.200 8.200 0 1 0 4.900 14.800l5.600 5.600 1.700-1.700-5.600-5.600A8.200 8.200 0 0 0 10 1.800zm0 2.500a5.700 5.700 0 1 1 0 11.400 5.700 5.700 0 0 1 0-11.400z"/>`,
  // colecionador: uma caixa de arquivo
  colecionador: `<path fill-rule="evenodd" d="M2.500 3h19v5.500h-19zM4 10h16v11H4zm5 2.500v2h6v-2z"/>`,
  // editor: um livro
  editor: `<path d="M6.500 1.500H20v15.700H7a3 3 0 0 0-2.900 2V3.900a2.400 2.400 0 0 1 2.400-2.400zM7 18.700h13v3.800H7a1.900 1.900 0 0 1 0-3.800z"/>`,
  // agrupamento: várias pessoas
  agrupamento: `<circle cx="12" cy="7" r="3.700"/><circle cx="4.700" cy="9.500" r="2.700"/><circle cx="19.300" cy="9.500" r="2.700"/><path d="M6 21.500c.3-5.500 2.700-8.400 6-8.400s5.700 2.900 6 8.400zM4.300 20H.5c.2-3.700 1.700-6 4.200-6 .6 0 1.200.1 1.700.4-1.200 1.400-1.900 3.200-2.100 5.600zM19.700 20h3.800c-.2-3.700-1.700-6-4.200-6-.6 0-1.200.1-1.700.4 1.200 1.400 1.900 3.200 2.100 5.600z"/>`,
};

// números com zeros à direita eram só para alinhar os desenhos acima
const svg = (papel) => raw(`<svg class="icone-papel" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${DESENHOS[papel].replace(/(\.\d)00\b/g, '$1')}</svg>`);

export const temIcone = (papel) => !!DESENHOS[papel];

/** O ícone de um atributo, sem texto (''quando não tem: «outro», ou um valor que não se conhece). */
export const iconePapel = (papel) => (DESENHOS[papel] ? svg(papel) : '');

/** Os ícones de uma pessoa, lado a lado; cada um diz o que é ao passar o rato e ao leitor de ecrã. Sem atributos, nada. */
export function iconesPessoa(p, classe = '') {
  const lista = (p?.papeis || []).filter(temIcone);
  if (!lista.length) return '';
  return html`<span class="icones-papel ${classe}" role="img" aria-label="${lista.map((x) => PAPEIS[x] || x).join(', ')}">${lista.map((x) => html`<i title="${PAPEIS[x] || x}">${svg(x)}</i>`)}</span>`;
}

/** Selo com ícone e nome: nas listas e nas fichas. */
export const seloPapel = (papel) => html`<span class="selo selo-papel">${iconePapel(papel)}${PAPEIS[papel] || papel}</span>`;

/** A legenda dos ícones, só com os que aparecem nestas pessoas. */
export function legendaPapeis(pessoas) {
  const presentes = new Set(pessoas.flatMap((p) => p?.papeis || []));
  const lista = Object.keys(PAPEIS).filter((k) => temIcone(k) && presentes.has(k));
  return lista.length ? html`<span class="legenda-papeis">${lista.map((k) => html`<span>${svg(k)} ${PAPEIS[k]}</span>`)}</span>` : '';
}
