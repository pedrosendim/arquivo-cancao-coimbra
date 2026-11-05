// Grupos: agrupamentos da Canção de Coimbra e os seus membros (relação membro_de).
import { E, PAPEIS, vida, iniciais } from '../estado.js';
import { $, html, raw, esc, norm, debounce, definirParams, miniatura } from '../util.js';
import { retrato, vazioCurado, imagemCartao } from '../componentes.js';
import { editando } from '../edicao.js';
import { botaoNova } from '../fichas.js';
import { termosProcura, temTodas, plural } from '../util.js';
import { semResultados } from './procurar.js';
import { coincideCampos } from '../estado.js'; // P1: a mesma procura por campos das outras listas
import { compararPt as ordemNomes } from '../util.js';

/** Membros de um grupo: quem tem `membro_de` a apontar para ele. */
export const membrosDe = (id) => (E.relacoesDe[id] || []).filter((r) => r.tipo === 'membro_de' && r.sentido === 'inv');

/** No cartão de um grupo, quando se formou, nas palavras da fonte: o ano do facto de formação datado mais antigo (sem
 *  conflito) e o começo do que a fonte diz («1954 · nasceu em 1954, quando…»), com «≠» se há versões que divergem;
 *  se todas divergem, só os anos e «≠». Nenhum intervalo se tira do texto. */
function formacaoCurta(g) {
  const todos = (g.factos || []).filter((f) => f.campo === 'formacao');
  const datados = todos.filter((f) => /^\d{4}/.test(f.data || '')).sort((a, b) => a.data.localeCompare(b.data));
  if (!datados.length) return '';
  const certo = datados.find((f) => !f.conflito);
  if (!certo) return `${[...new Set(datados.map((f) => f.data.slice(0, 4)))].join('/')}≠`;
  const palavras = String(certo.valor).split(/\s+/);
  return `${certo.data.slice(0, 4)} · ${palavras.slice(0, 7).join(' ')}${palavras.length > 7 ? '…' : ''}${todos.some((f) => f.conflito) ? ' ≠' : ''}`;
}

function avatar(p) {
  const img = p.imagens?.[0]?.url;
  return img
    ? html`<span class="avatar" title="${p.nome}">${imagemCartao(miniatura(img, 120))}</span>`
    : html`<span class="avatar" title="${p.nome}">${iniciais(p.nome)}</span>`;
}

export function grupos(el, params) {
  const todos = E.base.pessoas.filter((p) => p.tipo === 'grupo');
  if (!todos.length) {
    el.innerHTML = html`<div class="conteudo"><header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Grupos</h1></header>${vazioCurado('grupos')}</div>`.s;
    return;
  }
  let q = params.q || '';
  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Grupos</h1>
      <p class="lead">Grupos de fado, quintetos, trios e conjuntos — com as formações que as fontes documentam.</p>
      ${editando() ? html`<p class="acoes-lista">${botaoNova('pessoas', true)}</p>` : ''}</header>
    <div class="barra-filtros"><input class="campo" type="search" id="q" placeholder="Grupo ou membro" aria-label="Procurar nos grupos" value="${q}"></div>
    <p class="mudo total-lista" id="total" aria-live="polite"></p>
    <h2 class="so-leitor">Lista de grupos</h2>
    <div class="grelha larga" id="grelha"></div></div>`.s;
  const desenhar = () => {
    const termos = termosProcura(q); // também pelos outros nomes do grupo, por qualquer ordem e sem acentos
    const lista = todos.filter((g) => coincideCampos([g.nome, ...(g.nomes_alternativos || []), ...membrosDe(g.id).map((m) => E.por.pessoas[m.outro]?.nome)], termos));
    $('#total').textContent = `${plural(lista.length, 'grupo', 'grupos')}${q.trim() ? ` com «${q.trim()}»` : ''}`;
    $('#grelha').innerHTML = html`${lista.map((g) => {
      const membros = membrosDe(g.id).map((m) => E.por.pessoas[m.outro]).filter(Boolean);
      return html`<a class="cartao" href="#/pessoa/${g.id}">${retrato(g)}
        <div class="cartao-corpo"><h3>${g.nome}</h3>
          ${vida(g) ? html`<p class="meta">${vida(g)}</p>` : ''}
          ${formacaoCurta(g) ? html`<p class="meta formacao" title="Formação, nas palavras da fonte">${formacaoCurta(g)}</p>` : ''}
          <p class="meta">${membros.length} ${membros.length === 1 ? 'membro' : 'membros'} nas fontes</p>
          <div class="avatares">${membros.slice(0, 10).map(avatar)}</div>
          ${g.biografia?.[0] ? html`<p class="resumo">${g.biografia[0].citacao}</p>` : ''}</div></a>`;
    })}`.s || semResultados(q, 'Nenhum grupo').s;
    definirParams({ q });
  };
  $('#q').oninput = debounce((e) => { q = e.target.value; desenhar(); }, 150);
  desenhar();
}

/** Secção «Membros» para a ficha de um grupo. */
export function seccaoMembros(g, marcas) {
  // por ordem alfabética; em destaque o que a relação diz (instrumento e época), e os papéis gerais só quando não diz nada
  const membros = membrosDe(g.id).filter((r) => E.por.pessoas[r.outro])
    .sort((a, b) => ordemNomes(E.por.pessoas[a.outro].nome, E.por.pessoas[b.outro].nome));
  if (!membros.length) return '';
  return html`<section class="seccao" id="sec-membros" data-n="${membros.length}"><h2>Membros <small>${membros.length}</small></h2>
    <div class="relacoes">${membros.map((r) => {
      const p = E.por.pessoas[r.outro];
      return html`<div class="relacao">${avatar(p)}<div>
        <a href="#/pessoa/${p.id}">${p.nome}</a>
        ${r.nota ? html`<span class="nota-membro">${r.nota}${marcas(r.fontes)}</span>`
          : html`<span class="tipo">${(p.papeis || []).map((x) => PAPEIS[x] || x).join(' · ')}${marcas(r.fontes)}</span>`}</div></div>`;
    })}</div></section>`;
}
