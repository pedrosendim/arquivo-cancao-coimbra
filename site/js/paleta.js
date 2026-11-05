// Paleta de procura rápida (Ctrl+K ou /, o «Procurar…» do menu e a caixa da página inicial): as fichas arrumadas por
// tipo, cada uma com uma linha que a distingue, os vídeos e áudios catalogados (tocam no leitor) e atalhos para as listas.
// Os que não tocam aqui (os programas da RTP) levam ↗ e dizem que abrem no site original, numa janela nova.
import { procurarEntidades, agruparResultados, atalhosProcura, comArquivo } from './estado.js';
import { $, $$, html } from './util.js';
import { itemCurado, ondeVer } from './componentes.js';
import { tocar, tocaAqui } from './leitor.js';

const POR_GRUPO = 4; // em cada grupo; «Mostrar mais» abre os outros ali mesmo
let itens = [], sel = 0, abertos = new Set(), antes = null;
/** «no site da RTP» ou «no site original» para um vídeo ou áudio que não toca aqui; '' para os que tocam no leitor. */
const foraDaqui = (m) => { const it = itemCurado(m); return tocaAqui(it) ? '' : ondeVer(it); };

const opcao = (it, i) => html`<li role="option" id="paleta-o${i}" data-i="${i}" class="${it.classe || ''}" aria-selected="${String(i === sel)}">
  ${it.tocar ? html`<span class="tocar" aria-hidden="true">${it.fora ? '↗' : '▶'}</span>` : ''}
  <span class="rotulo"><span>${it.rotulo}</span>${it.detalhe || it.fora ? html`<small>${[it.detalhe, it.fora && `abre ${it.fora}, numa janela nova`].filter(Boolean).join(' · ')}</small>` : ''}</span>
  ${it.n ? html`<span class="n">${it.n.toLocaleString('pt-PT')}</span>` : ''}</li>`;

function desenhar() {
  const q = $('#paleta-input').value.trim();
  const arquivo = comArquivo(); // a pesquisa nos blogues só existe na cópia local do arquivo
  const grupos = []; // { titulo, n, itens }
  if (!q) {
    grupos.push({ titulo: 'Ir para', itens: [...(arquivo ? [['Arquivo dos blogues', '#/arquivo']] : []), ['Mediateca', '#/mediateca'],
      ['Linhagens', '#/linhagens'], ['Fontes e método', '#/fontes']].map(([rotulo, rota]) => ({ rotulo, rota })) });
  } else {
    const atalhos = atalhosProcura(q), todos = procurarEntidades(q, Infinity, { media: true });
    if (atalhos.length) grupos.push({ titulo: 'Listas', itens: atalhos.map((a) => ({ rotulo: `${a.lista} › ${a.rotulo}`, n: a.n, rota: a.rota, classe: 'atalho' })) });
    let mostrados = 0;
    for (const g of agruparResultados(todos)) {
      const ver = abertos.has(g.grupo) ? g.itens : g.itens.slice(0, POR_GRUPO);
      mostrados += ver.length;
      grupos.push({ titulo: g.titulo, n: g.itens.length, itens: [
        ...ver.map((r) => {
          if (r.grupo !== 'media') return { rotulo: r.nome, detalhe: r.detalhe.join(' · '), rota: r.rota };
          const fora = foraDaqui(r.x);
          return { rotulo: r.nome, detalhe: r.detalhe.join(' · '), tocar: r.x, fora, classe: fora ? 'media fora' : 'media' };
        }),
        ...(ver.length < g.itens.length ? [{ rotulo: `Mostrar mais ${g.itens.length - ver.length}`, mais: g.grupo, classe: 'mais' }] : [])] });
    }
    const e = encodeURIComponent(q);
    grupos.push({ titulo: todos.length || atalhos.length ? 'Procurar noutros sítios' : `Nenhuma ficha com «${q}»`, itens: [
      ...(mostrados < todos.length ? [{ rotulo: `Ver os ${todos.length} resultados numa página`, rota: `#/procurar?q=${e}` }] : []),
      ...(arquivo ? [{ rotulo: `Pesquisar «${q}» no arquivo dos blogues`, rota: `#/arquivo?q=${e}` }] : []),
      { rotulo: `Procurar «${q}» na mediateca`, rota: `#/mediateca?q=${e}` }] });
  }
  itens = grupos.flatMap((g) => g.itens);
  sel = Math.max(0, Math.min(sel, itens.length - 1));
  let i = 0;
  $('#paleta-lista').innerHTML = html`${grupos.map((g, k) => html`<li class="grupo" role="presentation">
    <div class="cabeca" id="paleta-g${k}" aria-hidden="true">${g.titulo}${g.n ? html` <span class="n">${g.n.toLocaleString('pt-PT')}</span>` : ''}</div>
    <ul role="group" aria-labelledby="paleta-g${k}">${g.itens.map((it) => opcao(it, i++))}</ul></li>`)}`.s;
  marcar();
}

/** Mostra qual é a opção escolhida (setas), sem voltar a procurar. */
function marcar() {
  $$('#paleta-lista [role=option]').forEach((li) => li.setAttribute('aria-selected', String(+li.dataset.i === sel)));
  $('#paleta-input').setAttribute('aria-activedescendant', itens.length ? `paleta-o${sel}` : '');
  $(`#paleta-o${sel}`)?.scrollIntoView({ block: 'nearest' });
}

/** Abre a paleta, já com o texto escrito (ex.: o que se escreveu na caixa da página inicial). */
export function abrirPaleta(texto = '') {
  if (typeof texto !== 'string') texto = ''; // como tratador de um clique, recebe o evento
  if ($('#paleta').hidden) antes = document.activeElement;
  $('#paleta').hidden = false;
  const inp = $('#paleta-input');
  inp.placeholder = 'Pessoa, grupo, obra, disco…'; // curto: cabe no telemóvel
  inp.value = texto; sel = 0; abertos = new Set(); desenhar(); inp.focus();
  inp.setSelectionRange(texto.length, texto.length);
}

/** Fecha; sem ter mudado de página (Escape, tocar um vídeo), o foco volta para onde estava. */
function fechar(voltar = true) {
  $('#paleta').hidden = true;
  if (voltar && antes?.isConnected) antes.focus();
  antes = null;
}

function ir(i) {
  const it = itens[i];
  if (!it) return;
  if (it.mais) { abertos.add(it.mais); desenhar(); $('#paleta-input').focus(); return; } // continua na mesma opção, já com os outros
  // ao mudar de página, o encaminhador põe o foco no conteúdo novo; tocar (ou abrir no site da RTP) e escolher a página
  // onde já se está não mudam de página, e o foco volta para onde estava
  const mesma = !it.tocar && location.hash === it.rota;
  fechar(!!it.tocar || mesma);
  if (it.tocar) tocar(itemCurado(it.tocar));
  else if (!mesma) location.hash = it.rota;
}

export function iniciarPaleta() {
  $('#abrir-paleta').onclick = abrirPaleta;
  $('#paleta-input').oninput = () => { sel = 0; abertos = new Set(); desenhar(); };
  $('#paleta').onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
    if (e.key === 'Tab') { // o foco fica dentro da paleta
      const f = $$('.paleta-caixa input, .paleta-caixa button');
      const k = f.indexOf(document.activeElement), j = e.shiftKey ? (k <= 0 ? f.length - 1 : k - 1) : (k + 1) % f.length;
      e.preventDefault(); f[j]?.focus(); return;
    }
    if (e.target.id !== 'paleta-input' || !itens.length) return;
    if (e.key === 'ArrowDown') { sel = (sel + 1) % itens.length; marcar(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = (sel - 1 + itens.length) % itens.length; marcar(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); ir(sel); }
  };
  $('#paleta-lista').onclick = (e) => { const li = e.target.closest('li[data-i]'); if (li) ir(+li.dataset.i); };
  $('#paleta').onclick = (e) => { if (e.target.id === 'paleta' || e.target.closest('[data-fechar-paleta]')) fechar(); };
  document.addEventListener('keydown', (e) => {
    const escrever = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !escrever)) { e.preventDefault(); abrirPaleta(); }
  });
}
