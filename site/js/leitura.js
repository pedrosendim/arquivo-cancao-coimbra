// Peças de leitura comuns às fichas (pessoas, grupos, discos, obras, instrumentos): o selo de revisão com a explicação,
// a linha «Nesta ficha» com os saltos para cada secção, «Partilhar» e «Citar esta ficha», o ano das gravações com as
// marcas de citação e o botão «Ouvir». Os saltos dentro da página não usam #âncoras: o # é a rota do site.
import { E, anoGravacao, dataMedia, nomeContribuidor } from './estado.js';
import { $, $$, html, raw, aviso, fmtData, compararPt } from './util.js';
import { marcas, estadoCitacao, abrirPainel } from './citacoes.js';
import { itemCurado, dadosItem } from './componentes.js';
import { tocaAqui } from './leitor.js';
import { marcaEditorial } from './formularios.js';

// ------------------------------------------------------------------ selo de revisão

/** Quantas citações literais tem a ficha e quantas estão confirmadas no arquivo (o mesmo estado que o painel mostra). */
function citacoesDe(f) {
  let n = 0, ok = 0;
  const ver = (x) => {
    if (Array.isArray(x)) x.forEach(ver);
    else if (x && typeof x === 'object') {
      if ('citacao' in x && 'fonte' in x && String(x.citacao || '').trim()) { n++; if (estadoCitacao(x) === 'verificada') ok++; }
      Object.values(x).forEach(ver);
    }
  };
  ver(f);
  return { n, ok };
}

/** Selo «Rascunho do agente — por rever», «Ficha de contribuidor — por rever» ou «Revisto por …», igual em todos os
 *  tipos de ficha. Tocar no selo explica o que quer dizer, e quantas citações estão confirmadas no arquivo. */
export function seloRevisao(f) {
  const revisto = f.estado_revisao === 'revisto';
  const doEditor = !f.revisto_por || E.contribuidores[f.revisto_por]?.papel === 'dono';
  const rotulo = revisto ? (doEditor ? 'Revisto pelo editor' : `Revisto por ${nomeContribuidor(f.revisto_por)}`)
    : `${f.editorial ? 'Ficha de contribuidor' : 'Rascunho do agente'} — por rever`;
  const { n, ok } = citacoesDe(f);
  const num = (x) => x.toLocaleString('pt-PT');
  // a concordância de cada caso: «a citação … ainda não está», «nenhuma das 2 …», «1 das 3 … está», «2 das 3 … estão»
  const provas = !n ? ''
    : ok === n ? (n === 1 ? 'A citação desta ficha existe, palavra por palavra, no documento arquivado'
      : `As ${num(n)} citações desta ficha existem, palavra por palavra, nos documentos arquivados`)
      : !ok ? (n === 1 ? 'A citação desta ficha ainda não está confirmada no arquivo'
        : `Nenhuma das ${num(n)} citações desta ficha está ainda confirmada no arquivo`)
        : `${num(ok)} das ${num(n)} citações desta ficha ${ok === 1 ? 'está confirmada' : 'estão confirmadas'}, palavra por palavra, nos documentos arquivados; ${n - ok === 1 ? 'a outra ainda não' : 'as outras ainda não'}`;
  const explicacao = revisto
    ? `${nomeContribuidor(f.revisto_por)} marcou esta ficha como revista${f.revisto_em ? ` em ${fmtData(f.revisto_em)}` : ''}.${provas ? ` ${provas}.` : ''}`
    : f.editorial
      ? `Ficha criada por ${nomeContribuidor(f.editorial.por)} e ainda não revista por um editor.${provas ? ` ${provas}.` : ''}`
      : `Rascunho: arrumado pelo agente a partir das fontes e ainda não revisto por uma pessoa.${provas
        ? ` ${provas}${ok === n ? '; falta' : '. Falta'} rever que facto se tirou ${n === 1 ? 'dela' : 'de cada uma'}.` : ''}`;
  return html`<details class="selo-revisao"><summary><span class="selo ${revisto ? 'verde' : 'ouro'}">${rotulo}</span>
    <span class="o-que-e">o que quer dizer?</span></summary><p>${explicacao}</p></details>`;
}

// ------------------------------------------------------------------ «Nesta ficha»: saltos para as secções

/** Lugar da linha «Nesta ficha»; desenharIndice() enche-a com as secções que a página tem. */
export const lugarIndice = () => html`<nav class="indice-ficha" data-indice-ficha aria-label="Nesta ficha"></nav>`;

// títulos longos das secções, em versão curta para a linha de saltos
const CURTOS = [['Nas palavras das fontes', 'Nas fontes'], ['Media catalogado', 'Media'], ['Vídeos no arquivo', 'Vídeos no arquivo'],
  ['No arquivo dos blogues', 'Arquivo'], ['Artigos e referências', 'Referências'], ['No blogue do arquivo', 'Blogue']];

/** Enche a linha «Nesta ficha» a partir das secções já desenhadas: o rótulo (data-indice, ou o título da secção) e,
 *  quando se sabe, quantos há (data-n, ou o número com que começa o pequeno texto do título). Volta a correr quando
 *  chegam secções desenhadas depois (a árvore da família, as pesquisas no arquivo). */
export function desenharIndice(vista = document) {
  const nav = $('[data-indice-ficha]', vista);
  if (!nav) return;
  const seccoes = $$(':scope > section', nav.parentElement).filter((s) => !s.hidden && $(':scope > h2', s));
  const entradas = seccoes.map((s, i) => {
    s.id ||= `seccao-${i + 1}`;
    const h2 = $(':scope > h2', s);
    const titulo = [...h2.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim();
    const rotulo = s.dataset.indice || CURTOS.find(([k]) => titulo.startsWith(k))?.[1] || titulo;
    const n = s.dataset.n ?? (/^\s*(\d[\d\s.]*)/.exec($(':scope > small', h2)?.textContent || '')?.[1] || '').replace(/\D/g, '');
    return { id: s.id, rotulo, n: n === '' || n === '0' ? '' : n };
  });
  nav.hidden = entradas.length < 3;
  nav.innerHTML = html`<span class="indice-rotulo">Nesta ficha</span>${entradas.map((x) => html`<button type="button" class="indice-salto"
    data-saltar="${x.id}">${x.rotulo}${x.n ? html` <span class="n">${Number(x.n).toLocaleString('pt-PT')}</span>` : ''}</button>`)}`.s;
  // no computador a linha fica presa ao topo: os saltos param por baixo dela, seja qual for a sua altura
  const medir = () => nav.parentElement?.style.setProperty('--indice-h', `${Math.ceil(nav.getBoundingClientRect().height)}px`);
  medir();
  if (!nav.dataset.medida && 'ResizeObserver' in window) { nav.dataset.medida = '1'; new ResizeObserver(medir).observe(nav); }
}

/** Leva à secção (ou à linha da tabela de factos) com esse id, abrindo o que a esconda, e põe-lhe o foco. */
export function saltar(id) {
  const alvo = document.getElementById(id);
  if (!alvo) return;
  for (let d = alvo.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) d.open = true;
  alvo.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
  alvo.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ partilhar e citar

// o endereço da ficha sem parâmetros: os de fora (?fbclid=…, ?utm_…) vêm antes do #, os da vista depois da rota
const enderecoFicha = () => location.origin + location.pathname + location.hash.split('?')[0];

function hojeCurto() {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return fmtData(iso, true).replace(/^(\d+) (\S+) /, '$1 $2. '); // «3 nov. 2026»
}

/** Copia; se o browser não deixar, mostra o texto no painel para se copiar à mão. */
function copiar(texto, feito) {
  const mostrar = () => abrirPainel(html`<p class="sobretitulo">Copiar</p><p>O browser não deixou copiar. Selecione o texto e copie-o à mão:</p>
    <textarea class="campo texto-copiar" rows="5" readonly>${texto}</textarea>`);
  if (!navigator.clipboard) { mostrar(); return; }
  navigator.clipboard.writeText(texto).then(() => aviso(feito)).catch(mostrar);
}

/** «Partilhar» e «Citar esta ficha», no topo de cada ficha. `estado`: o estado_revisao da ficha. */
export const botoesPartilha = (titulo, estado) => html`<button type="button" class="botao" data-partilhar="${titulo}">Partilhar</button>
  <button type="button" class="botao" data-citar-ficha="${titulo}" data-revista="${String(estado === 'revisto')}">Citar esta ficha</button>`;

async function partilhar(titulo) {
  const url = enderecoFicha();
  // no telemóvel, a janela de partilha do sistema; no computador, a ligação copiada
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: `${titulo} — Arquivo da Canção de Coimbra`, url }); } catch { /* fechou a janela */ }
    return;
  }
  copiar(url, 'Ligação copiada');
}

function citarFicha(titulo, revista) {
  const texto = `«${titulo}». In Arquivo da Canção de Coimbra (ficha ${revista ? 'revista' : 'em rascunho'}). Consultado a ${hojeCurto()}. Disponível em: ${enderecoFicha()}`;
  abrirPainel(html`<p class="sobretitulo">Citar esta ficha</p><h2>${titulo}</h2>
    <p class="mudo">Para um trabalho ou um artigo. A ficha pode mudar: a data de consulta diz que versão leu.</p>
    <blockquote class="texto-citar">${texto}</blockquote>
    <div class="acoes"><button type="button" class="botao primario peq" data-copiar-referencia-ficha>Copiar</button></div>`);
  $('[data-copiar-referencia-ficha]', $('#painel')).onclick = () => copiar(texto, 'Referência da ficha copiada');
}

document.addEventListener('click', (e) => {
  const s = e.target.closest('[data-saltar]');
  if (s) { e.preventDefault(); saltar(s.dataset.saltar); return; }
  const p = e.target.closest('[data-partilhar]');
  if (p) { partilhar(p.dataset.partilhar); return; }
  const c = e.target.closest('[data-citar-ficha]');
  if (c) citarFicha(c.dataset.citarFicha, c.dataset.revista === 'true');
});

// ------------------------------------------------------------------ imprimir

// um <details> fechado não sai no papel: os factos em «mais N», a lista de família e as ligações das árvores abrem-se
// antes de imprimir (as notas numeradas de app.js contam também as marcas que lá estão) e voltam a fechar-se depois
let abertosParaImprimir = [];
window.addEventListener('beforeprint', () => {
  abertosParaImprimir = $$('details.mais-factos:not([open]), details.relacoes-recolhidas:not([open]), details.ligacoes-arvore:not([open])');
  abertosParaImprimir.forEach((d) => { d.open = true; });
});
window.addEventListener('afterprint', () => {
  abertosParaImprimir.forEach((d) => { d.open = false; });
  abertosParaImprimir = [];
});

// ------------------------------------------------------------------ gravações e media

/** O ano de uma gravação em forma curta, para a coluna de anos das listas: «1957», «1928», «1964/1967≠» quando as
 *  fontes divergem, «—» sem nenhum. O pormenor (gravado, editado, com as marcas) dá-o anoGravacaoHtml. */
export function anoCurto(g) {
  const a = g && anoGravacao(g);
  if (!a) return '—';
  if (!a.factos.length) return a.texto;
  const com = (k) => `${k}${a.testemunho.has(+k) ? ' ✎' : ''}`; // ano que só vem de testemunhos: contribuição assinada
  return a.diverge ? `${[...new Set(a.factos.map((f) => f.data.slice(0, 4)))].sort().map(com).join('/')}≠` : com(a.ano);
}

/** Ano de uma gravação com as marcas de citação dos factos de onde vem: «gravado em 1928 [1]», «1964 [1] ou 1967 [1]
 *  — as fontes divergem»; o de um testemunho leva o ✎ de quem o deu. Só o texto (sem marcas) dentro de ligações e
 *  cartões: anoGravacao(g).texto. */
export function anoGravacaoHtml(g) {
  const a = g && anoGravacao(g);
  if (!a) return '';
  if (!a.factos.length) return a.texto;
  const porAno = new Map();
  for (const f of a.factos) { const k = f.data.slice(0, 4); porAno.set(k, [...(porAno.get(k) || []), f]); }
  // ao lado de cada ano, as marcas das citações e o ✎ de cada testemunho (quem, quando e porquê, no título)
  const sinais = (k) => html`${marcas(porAno.get(k).flatMap((f) => f.fontes || []))}${porAno.get(k).map((f) => marcaEditorial(f.editorial, 'Testemunho dado'))}`;
  const anos = [...porAno.keys()].sort();
  if (anos.length === 1) return html`${a.rotulo}${anos[0]}${sinais(anos[0])}${a.diverge ? ' — as fontes divergem' : ''}`;
  const partes = anos.map((k) => html`${k}${sinais(k)}`);
  if (!a.diverge) return html`${partes.map((x, i) => html`${i ? ' · ' : ''}${x}`)}`;
  return html`${partes.map((x, i) => html`${i ? (i === partes.length - 1 ? ' ou ' : ', ') : ''}${x}`)} — as fontes divergem`;
}

/** «▶ Ouvir (N)» no topo da ficha: põe na fila do leitor, por data (a do media ou o ano do disco), o que toca no próprio
 *  site; os programas da RTP e as partituras abrem no site original e ficam de fora. O mesmo vídeo em dois discos vai uma vez. */
export function botaoOuvirTudo(media) {
  const data = (m) => dataMedia(m) || '9999';
  const vistos = new Set();
  const itens = [...media].sort((a, b) => data(a).localeCompare(data(b)) || compararPt(a.titulo, b.titulo)).map(itemCurado)
    .filter((it) => tocaAqui(it) && it.tipo !== 'partitura' && it.disponivel !== false && it.disponivel !== 0
      && !vistos.has(`${it.plataforma}|${it.chave}`) && vistos.add(`${it.plataforma}|${it.chave}`));
  return itens.length ? html`<button type="button" class="botao primario" data-fila="${raw(dadosItem(itens))}"
    title="Põe na fila do leitor, por data, o que se ouve no próprio site">▶ Ouvir (${itens.length})</button>` : '';
}
