// Cronologia: todos os factos datados, agrupados por década.
import { E, CAMPOS, nomeDe } from '../estado.js';
import { $, $$, html, fmtData, definirParams } from '../util.js';
import { marcas, limparRegisto } from '../citacoes.js';
import { vazioCurado } from '../componentes.js';
import { filtroMultiplo } from '../filtros.js';

function eventos() {
  const ev = [];
  for (const p of E.base.pessoas) for (const f of p.factos || []) {
    if (!f.data) continue;
    ev.push({ data: f.data, tipo: ['nascimento', 'morte'].includes(f.campo) ? f.campo : 'pessoa', pessoas: [p.id],
      texto: html`<a href="#/pessoa/${p.id}">${p.nome}</a> — ${(CAMPOS[f.campo] || f.campo).toLowerCase()}: ${f.valor}`, fontes: f.fontes, conflito: f.conflito });
  }
  for (const g of E.base.gravacoes) if (/^\d{4}/.test(g.ano || '')) {
    ev.push({ data: g.ano, tipo: 'gravacao', pessoas: (g.interpretes || []).map((i) => i.pessoa),
      texto: html`Gravação: <a href="#/gravacao/${g.id}">${g.titulo}</a>${g.interpretes?.length ? ' — ' + g.interpretes.map((i) => nomeDe(i.pessoa)).join(', ') : ''}`, fontes: g.fontes });
  }
  for (const o of E.base.obras) {
    if (/^\d{4}/.test(o.ano || '')) ev.push({ data: o.ano, tipo: 'obra', pessoas: [...(o.musica || []), ...(o.letra || [])],
      texto: html`Obra: <a href="#/obra/${o.id}">${o.titulo}</a>`, fontes: o.fontes });
    for (const f of o.factos || []) if (f.data) ev.push({ data: f.data, tipo: 'obra', pessoas: o.musica || [],
      texto: html`<a href="#/obra/${o.id}">${o.titulo}</a> — ${f.valor}`, fontes: f.fontes });
  }
  for (const i of E.base.instrumentos) if (/^\d{4}/.test(i.ano || '')) {
    ev.push({ data: i.ano, tipo: 'instrumento', pessoas: [i.construtor, ...(i.proprietarios || []).map((p) => p.pessoa)].filter(Boolean),
      texto: html`Instrumento: <a href="#/instrumento/${i.id}">${i.designacao}</a>${i.construtor ? ' — ' + nomeDe(i.construtor) : ''}`, fontes: i.fontes });
  }
  return ev.sort((a, b) => a.data.localeCompare(b.data));
}

const TIPOS = { nascimento: 'Nascimentos', morte: 'Mortes', pessoa: 'Vida e carreira', gravacao: 'Gravações', obra: 'Obras', instrumento: 'Instrumentos' };

export function cronologia(el, params) {
  const todos = eventos();
  if (!todos.length) {
    el.innerHTML = html`<div class="conteudo"><header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Cronologia</h1></header>${vazioCurado('factos datados')}</div>`.s;
    return;
  }
  let pessoas = (params.pessoa || '').split(',').filter(Boolean);
  let tipos = new Set(params.tipos ? params.tipos.split(',') : Object.keys(TIPOS));
  const nEventos = {};
  for (const e of todos) for (const id of new Set(e.pessoas)) if (E.por.pessoas[id]) nEventos[id] = (nEventos[id] || 0) + 1;
  const opcoesPessoas = Object.keys(nEventos).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b)))
    .map((id) => ({ valor: id, nome: nomeDe(id), n: nEventos[id] }));

  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Cronologia</h1>
      <p class="lead">Todos os factos com data, de todas as fichas, numa só linha do tempo.</p></header>
    <div class="barra-filtros">
      ${filtroMultiplo({ id: 'pessoa', todos: 'Todas as pessoas', unidade: ['pessoa', 'pessoas'], opcoes: opcoesPessoas, escolhidos: pessoas })}
      <div class="fichas" id="tipos">${Object.entries(TIPOS).map(([k, n]) => html`<button class="ficha" data-t="${k}" aria-pressed="${tipos.has(k)}">${n}</button>`)}</div>
    </div>
    <nav class="decadas" id="decadas"></nav>
    <div id="linha"></div></div>`.s;

  const desenhar = () => {
    limparRegisto();
    const lista = todos.filter((e) => tipos.has(e.tipo) && (!pessoas.length || e.pessoas.some((id) => pessoas.includes(id))));
    const decadas = {};
    for (const e of lista) (decadas[e.data.slice(0, 3) + '0'] ||= []).push(e);
    $('#decadas').innerHTML = html`${Object.keys(decadas).map((d) => html`<a href="javascript:void 0" data-ir="${d}">${d}s</a>`)}`.s;
    $('#linha').innerHTML = lista.length ? html`${Object.entries(decadas).map(([d, evs]) => html`<section class="decada" id="d-${d}">
      <h2>${d}</h2><ol class="eventos">${evs.map((e) => html`<li class="evento ${e.tipo}">
        <div class="quando">${fmtData(e.data)}</div>
        <div class="oque ${e.conflito ? 'conflito' : ''}">${e.texto}${marcas(e.fontes)}</div></li>`)}</ol></section>`)}`.s
      : '<p class="mudo">Sem eventos para estes filtros.</p>';
    definirParams({ pessoa: pessoas.join(','), tipos: tipos.size === Object.keys(TIPOS).length ? '' : [...tipos].join(',') });
  };
  $('#decadas').onclick = (e) => { const a = e.target.closest('[data-ir]'); if (a) document.getElementById('d-' + a.dataset.ir)?.scrollIntoView({ behavior: 'smooth' }); };
  $('#pessoa').addEventListener('filtro', (e) => { pessoas = e.detail; desenhar(); });
  $('#tipos').onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    tipos.has(b.dataset.t) ? tipos.delete(b.dataset.t) : tipos.add(b.dataset.t);
    b.setAttribute('aria-pressed', tipos.has(b.dataset.t));
    desenhar();
  };
  desenhar();
}
