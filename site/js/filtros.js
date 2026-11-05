// Filtros de escolha múltipla: um botão que abre uma lista de opções com caixas de seleção.
// Nada escolhido = tudo. Cada alteração aplica-se logo: a vista ouve o evento «filtro» no elemento
// (detail: lista dos valores escolhidos). Num formulário, o campo escondido leva «a,b,c».
import { $, $$, html, norm } from './util.js';

/**
 * @param {object} o
 * @param {string} o.id          id do elemento (onde se ouve o evento «filtro»)
 * @param {string} o.todos       texto quando nada está escolhido («Todas as origens»)
 * @param {string[]} o.unidade   [singular, plural] para o resumo («3 origens»)
 * @param {{valor:string, nome:string, n?:number}[]} o.opcoes
 * @param {string[]} [o.escolhidos]
 * @param {string} [o.nome]      nome do campo escondido, para formulários
 */
export function filtroMultiplo({ id, todos, unidade, opcoes, escolhidos = [], nome = '' }) {
  const sel = new Set(escolhidos);
  const procurar = opcoes.length > 12;
  return html`<div class="filtro-multiplo${sel.size ? ' ativo' : ''}" id="${id}" data-filtro data-todos="${todos}" data-unidade="${unidade.join('|')}">
    <button type="button" class="campo filtro-botao" aria-haspopup="true" aria-expanded="false">${resumo(opcoes, sel, todos, unidade)}</button>
    ${nome ? html`<input type="hidden" name="${nome}" value="${[...sel].join(',')}">` : ''}
    <div class="filtro-painel" hidden>
      ${procurar ? html`<input class="campo filtro-procurar" type="search" placeholder="Procurar na lista…" aria-label="Procurar na lista">` : ''}
      <div class="filtro-opcoes" role="group" aria-label="${todos}">${opcoesHtml(opcoes, sel)}</div>
      <div class="filtro-rodape">
        <button type="button" class="botao peq" data-limpar>Limpar</button>
        <button type="button" class="botao peq primario" data-fechar>Fechar</button>
      </div>
    </div></div>`;
}

const opcoesHtml = (opcoes, sel) => html`${opcoes.map((o) => html`<label class="filtro-opcao">
  <input type="checkbox" value="${o.valor}" data-nome="${o.nome}" ${sel.has(o.valor) ? 'checked' : ''}>
  <span>${o.nome}</span>${o.n != null ? html`<span class="n">${o.n}</span>` : ''}</label>`)}`;

function resumo(opcoes, sel, todos, [um, varios]) {
  const nomes = opcoes.filter((o) => sel.has(o.valor)).map((o) => o.nome);
  if (!nomes.length) return todos;
  if (nomes.length === 1) return nomes[0];
  return nomes.length === 2 && nomes.join(', ').length <= 26 ? nomes.join(', ') : `${nomes.length} ${varios || um}`;
}

/** Valores escolhidos num filtro. */
export const valoresFiltro = (caixa) => $$('.filtro-opcoes input:checked', caixa).map((c) => c.value);

/** Marca estas opções (e só estas), sem avisar a vista: para acertar o filtro com outro controlo da mesma lista. */
export function definirEscolhidos(caixa, valores) {
  if (!caixa) return;
  const sel = new Set(valores);
  $$('.filtro-opcoes input', caixa).forEach((c) => { c.checked = sel.has(c.value); });
  atualizarResumo(caixa);
}

/** Troca as opções (por exemplo, contagens novas) sem fechar a lista nem perder o que está escolhido. */
export function atualizarFiltro(caixa, opcoes) {
  if (!caixa) return;
  const sel = new Set(valoresFiltro(caixa));
  const atuais = $$('.filtro-opcao', caixa).map((l) => `${$('input', l).value}${$('.n', l) ? '#' : ''}`).join('|');
  if (atuais === opcoes.map((o) => `${o.valor}${o.n != null ? '#' : ''}`).join('|')) { // as mesmas opções: só os números mudam
    $$('.filtro-opcao', caixa).forEach((l, i) => { if (opcoes[i].n != null) $('.n', l).textContent = opcoes[i].n; });
  } else {
    $('.filtro-opcoes', caixa).innerHTML = opcoesHtml(opcoes, sel).s;
    filtrarOpcoes(caixa);
  }
  atualizarResumo(caixa);
}

function atualizarResumo(caixa) {
  const sel = new Set(valoresFiltro(caixa));
  const opcoes = $$('.filtro-opcoes input', caixa).map((c) => ({ valor: c.value, nome: c.dataset.nome }));
  $('.filtro-botao', caixa).textContent = resumo(opcoes, sel, caixa.dataset.todos, caixa.dataset.unidade.split('|'));
  caixa.classList.toggle('ativo', sel.size > 0);
  const escondido = $('input[type=hidden]', caixa);
  if (escondido) escondido.value = [...sel].join(',');
}

function mudou(caixa) {
  atualizarResumo(caixa);
  caixa.dispatchEvent(new CustomEvent('filtro', { bubbles: true, detail: valoresFiltro(caixa) }));
}

function filtrarOpcoes(caixa) {
  const q = norm($('.filtro-procurar', caixa)?.value || '').trim();
  $$('.filtro-opcao', caixa).forEach((l) => { l.hidden = !!q && !norm(l.textContent).includes(q); });
}

function abrir(caixa) {
  $$('[data-filtro].aberto').forEach((c) => c !== caixa && fechar(c));
  caixa.classList.add('aberto');
  caixa.dataset.aoAbrir = valoresFiltro(caixa).join(',');
  const painel = $('.filtro-painel', caixa);
  painel.hidden = false;
  painel.classList.remove('a-direita'); // junto à margem direita, a lista abre para a esquerda
  if (painel.getBoundingClientRect().right > document.documentElement.clientWidth - 8) painel.classList.add('a-direita');
  $('.filtro-botao', caixa).setAttribute('aria-expanded', 'true');
}

/** Fecha a lista; se a escolha mudou desde que abriu, avisa com o evento «filtro-fechado». */
function fechar(caixa, focar = false) {
  caixa.classList.remove('aberto');
  $('.filtro-painel', caixa).hidden = true;
  $('.filtro-botao', caixa).setAttribute('aria-expanded', 'false');
  if (focar) $('.filtro-botao', caixa).focus();
  if (caixa.dataset.aoAbrir !== valoresFiltro(caixa).join(',')) {
    caixa.dataset.aoAbrir = valoresFiltro(caixa).join(',');
    caixa.dispatchEvent(new CustomEvent('filtro-fechado', { bubbles: true, detail: valoresFiltro(caixa) }));
  }
}

const focaveis = (caixa) => $$('.filtro-procurar, .filtro-opcao:not([hidden]) input', caixa);

export function iniciarFiltros() {
  document.addEventListener('click', (e) => {
    const caixa = e.target.closest('[data-filtro]');
    if (!caixa) { $$('[data-filtro].aberto').forEach((c) => fechar(c)); return; }
    if (e.target.closest('.filtro-botao')) caixa.classList.contains('aberto') ? fechar(caixa) : abrir(caixa);
    else if (e.target.closest('[data-fechar]')) fechar(caixa, true);
    else if (e.target.closest('[data-limpar]')) {
      $$('.filtro-opcoes input:checked', caixa).forEach((c) => { c.checked = false; });
      mudou(caixa);
    }
  });
  document.addEventListener('change', (e) => {
    const caixa = e.target.closest('[data-filtro]');
    if (caixa && e.target.matches('.filtro-opcoes input')) mudou(caixa);
  });
  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-filtro] .filtro-procurar')) filtrarOpcoes(e.target.closest('[data-filtro]'));
  });
  // sair com o teclado (Tab) fecha a lista
  document.addEventListener('focusin', (e) => {
    $$('[data-filtro].aberto').forEach((c) => { if (!c.contains(e.target)) fechar(c); });
  });
  document.addEventListener('keydown', (e) => {
    const caixa = e.target.closest('[data-filtro]');
    if (!caixa) return;
    if (e.key === 'Escape' && caixa.classList.contains('aberto')) { e.preventDefault(); fechar(caixa, true); return; }
    if (e.key === 'Enter' && e.target.matches('.filtro-opcoes input, .filtro-procurar')) {
      e.preventDefault(); // não envia o formulário: numa opção, Enter marca-a como o espaço
      if (e.target.type === 'checkbox') e.target.click();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!caixa.classList.contains('aberto')) abrir(caixa);
    const lista = focaveis(caixa), i = lista.indexOf(document.activeElement);
    lista[Math.max(0, Math.min(lista.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  });
}
