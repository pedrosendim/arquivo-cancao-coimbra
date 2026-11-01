// Grupos: agrupamentos da Canção de Coimbra e os seus membros (relação membro_de).
import { E, PAPEIS, vida, iniciais } from '../estado.js';
import { $, html, raw, esc, norm, debounce, definirParams, miniatura } from '../util.js';
import { retrato, vazioCurado } from '../componentes.js';

/** Membros de um grupo: quem tem `membro_de` a apontar para ele. */
export const membrosDe = (id) => (E.relacoesDe[id] || []).filter((r) => r.tipo === 'membro_de' && r.sentido === 'inv');

function avatar(p) {
  const img = p.imagens?.[0]?.url;
  return img
    ? html`<span class="avatar" style="background-image:url('${raw(esc(miniatura(img, 120)))}')" title="${p.nome}"></span>`
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
      <p class="lead">Grupos de fado, quintetos, trios e conjuntos — com as formações que as fontes documentam.</p></header>
    <div class="barra-filtros"><input class="campo" type="search" id="q" placeholder="Grupo ou membro" value="${q}"></div>
    <div class="grelha larga" id="grelha"></div></div>`.s;
  const desenhar = () => {
    const nq = norm(q);
    const lista = todos.filter((g) => !nq || norm([g.nome, ...membrosDe(g.id).map((m) => E.por.pessoas[m.outro]?.nome)].join(' ')).includes(nq));
    $('#grelha').innerHTML = html`${lista.map((g) => {
      const membros = membrosDe(g.id).map((m) => E.por.pessoas[m.outro]).filter(Boolean);
      return html`<a class="cartao" href="#/pessoa/${g.id}">${retrato(g)}
        <div class="cartao-corpo"><h3>${g.nome}</h3>
          ${vida(g) ? html`<p class="meta">${vida(g)}</p>` : ''}
          <p class="meta">${membros.length} ${membros.length === 1 ? 'membro' : 'membros'} nas fontes</p>
          <div class="avatares">${membros.slice(0, 10).map(avatar)}</div>
          ${g.biografia?.[0] ? html`<p class="resumo">${g.biografia[0].citacao}</p>` : ''}</div></a>`;
    })}`.s || '<p class="mudo">Nenhum grupo corresponde.</p>';
    definirParams({ q });
  };
  $('#q').oninput = debounce((e) => { q = e.target.value; desenhar(); }, 150);
  desenhar();
}

/** Secção «Membros» para a ficha de um grupo. */
export function seccaoMembros(g, marcas) {
  const membros = membrosDe(g.id);
  if (!membros.length) return '';
  return html`<section class="seccao"><h2>Membros <small>${membros.length}</small></h2>
    <div class="relacoes">${membros.map((r) => {
      const p = E.por.pessoas[r.outro];
      return html`<div class="relacao">${avatar(p)}<div>
        <a href="#/pessoa/${p.id}">${p.nome}</a>
        <span class="tipo">${(p.papeis || []).map((x) => PAPEIS[x] || x).join(' · ')}${r.nota ? ' · ' + r.nota : ''}${marcas(r.fontes)}</span></div></div>`;
    })}</div></section>`;
}
