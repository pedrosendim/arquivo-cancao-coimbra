// Cronologia: todos os factos datados, agrupados por década.
import { E, CAMPOS, nomeDe, parentescoDe } from '../estado.js';
import { $, $$, html, fmtData, definirParams, compararPt } from '../util.js';
import { marcas, limparRegisto } from '../citacoes.js';
import { vazioCurado } from '../componentes.js';
import { filtroMultiplo } from '../filtros.js';
import { marcaEditorial } from '../formularios.js'; // um facto dado por testemunho leva o ✎ de quem o deu

// campos de resposta única: quando as fontes divergem, cada versão diz qual é a outra
const UNICOS = new Set(['nascimento', 'morte', 'naturalidade', 'nome_completo']);
const chaveCitacoes = (fontes) => (fontes || []).map((c) => `${c.fonte}|${c.url}|${(c.citacao || '').trim()}`).sort().join('\n');

/** Todos os acontecimentos datados das fichas, por ordem de data. O mesmo facto registado em duas fichas (a mesma data
 *  e as mesmas citações, como um casamento) aparece uma só vez, com «também na ficha de …». */
export function eventos() {
  const ev = [];
  for (const p of E.base.pessoas) {
    // familiares sem papel musical: o parentesco distingue as várias «Maria»
    const par = parentescoDe(p);
    const quem = html`<a href="#/pessoa/${p.id}">${p.nome}</a>${par ? html` <span class="mudo">(${par.texto})</span>` : ''}`;
    for (const f of p.factos || []) {
      if (!f.data) continue;
      const outras = f.conflito && UNICOS.has(f.campo) ? p.factos.filter((x) => x !== f && x.campo === f.campo) : [];
      ev.push({ data: f.data, tipo: ['nascimento', 'morte'].includes(f.campo) ? f.campo : 'pessoa', pessoas: [p.id], ficha: p.id, campo: f.campo,
        texto: html`${quem} — ${(CAMPOS[f.campo] || f.campo).toLowerCase()}: ${f.valor}`, fontes: f.fontes, editorial: f.editorial, conflito: f.conflito,
        outras: outras.length ? html`<span class="outra-versao">${outras.length === 1 ? 'outra versão' : 'outras versões'}: ${outras.map((x, i) => html`${i ? ' · ' : ''}${x.valor}${x.editorial ? ' ✎' : ''}${x.data ? '' : ' (sem data)'}`)}
          · <a href="#/pessoa/${p.id}">ver na ficha</a></span>` : '' });
    }
  }
  for (const g of E.base.gravacoes) {
    const quem = (g.interpretes || []).map((i) => i.pessoa);
    const nomes = quem.length ? ' — ' + quem.map(nomeDe).join(', ') : '';
    if (/^\d{4}/.test(g.ano || '')) ev.push({ data: g.ano, tipo: 'gravacao', pessoas: quem, texto: html`Gravação: <a href="#/gravacao/${g.id}">${g.titulo}</a>${nomes}`, fontes: g.fontes });
    // sem ano: os factos datados da própria gravação, nas palavras da fonte (nada se escreve no campo «ano»)
    else for (const f of g.factos || []) if (/^\d{4}/.test(f.data || '')) ev.push({ data: f.data, tipo: 'gravacao', pessoas: quem,
      texto: html`Gravação: <a href="#/gravacao/${g.id}">${g.titulo}</a>${nomes} — ${f.valor}`, fontes: f.fontes, editorial: f.editorial, conflito: f.conflito });
  }
  for (const o of E.base.obras) {
    if (/^\d{4}/.test(o.ano || '')) ev.push({ data: o.ano, tipo: 'obra', pessoas: [...(o.musica || []), ...(o.letra || [])],
      texto: html`Obra: <a href="#/obra/${o.id}">${o.titulo}</a>`, fontes: o.fontes });
    for (const f of o.factos || []) if (f.data) ev.push({ data: f.data, tipo: 'obra', pessoas: o.musica || [],
      texto: html`<a href="#/obra/${o.id}">${o.titulo}</a> — ${f.valor}`, fontes: f.fontes, editorial: f.editorial });
  }
  for (const i of E.base.instrumentos) if (/^\d{4}/.test(i.ano || '')) {
    ev.push({ data: i.ano, tipo: 'instrumento', pessoas: [i.construtor, ...(i.proprietarios || []).map((p) => p.pessoa)].filter(Boolean),
      texto: html`Instrumento: <a href="#/instrumento/${i.id}">${i.designacao}</a>${i.construtor ? ' — ' + nomeDe(i.construtor) : ''}`, fontes: i.fontes });
  }
  // o mesmo facto (data e citações iguais) em fichas de pessoas diferentes: fica o primeiro, tal como está escrito
  const vistos = new Map(), lista = [];
  for (const e of ev) {
    // (o mesmo campo: o nascimento do filho, numa ficha, e «nascimento do primeiro filho», na do pai, ficam os dois)
    const k = e.ficha && e.fontes?.length ? `${e.campo}|${e.data}|${chaveCitacoes(e.fontes)}` : '';
    const ja = k && vistos.get(k);
    if (ja && !ja.pessoas.includes(e.ficha)) { ja.pessoas.push(e.ficha); (ja.tambem ||= []).push(e.ficha); ja.conflito ||= e.conflito; continue; }
    if (k && !ja) vistos.set(k, e);
    lista.push(e);
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

// quantos acontecimentos tem cada pessoa, calculado uma vez por versão dos dados (o E.base muda depois de cada gravação)
let contagem = { base: null, n: {} };
/** Quantos acontecimentos datados tem uma pessoa na Cronologia: a ficha só mostra o botão quando há algum. */
export function nEventosDe(id) {
  if (contagem.base !== E.base) {
    const n = {};
    for (const e of eventos()) for (const x of new Set(e.pessoas)) n[x] = (n[x] || 0) + 1;
    contagem = { base: E.base, n };
  }
  return contagem.n[id] || 0;
}

let observador = null; // marca na barra das décadas a década que está à vista

const TIPOS = { nascimento: 'Nascimentos', morte: 'Mortes', pessoa: 'Vida e carreira', gravacao: 'Gravações', obra: 'Obras', instrumento: 'Instrumentos' };

export function cronologia(el, params) {
  const todos = eventos();
  if (!todos.length) {
    el.innerHTML = html`<div class="conteudo"><header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Cronologia</h1></header>${vazioCurado('factos datados')}</div>`.s;
    return;
  }
  let pessoas = (params.pessoa || '').split(',').filter(Boolean);
  // como nas outras listas: nenhum tipo escolhido = todos; cada toque escolhe (vários somam). Os endereços antigos
  // com ?tipos= continuam a dar o mesmo; com os seis, é o mesmo que nenhum
  let tipos = new Set((params.tipos || '').split(',').filter((k) => k in TIPOS));
  if (tipos.size === Object.keys(TIPOS).length) tipos.clear();
  const nEventos = {};
  for (const e of todos) for (const id of new Set(e.pessoas)) if (E.por.pessoas[id]) nEventos[id] = (nEventos[id] || 0) + 1;
  // quem foi pedido e não tem acontecimentos também entra na lista (com 0), para o filtro dizer o nome escolhido
  const pedidasSem = pessoas.filter((id) => E.por.pessoas[id] && !nEventos[id]);
  const opcoesPessoas = [...Object.keys(nEventos), ...pedidasSem].sort((a, b) => compararPt(nomeDe(a), nomeDe(b)))
    .map((id) => ({ valor: id, nome: nomeDe(id), n: nEventos[id] || 0 }));

  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Cronologia</h1>
      <p class="lead">Todos os factos com data, de todas as fichas, numa só linha do tempo.</p></header>
    <div class="barra-filtros">
      ${filtroMultiplo({ id: 'pessoa', todos: 'Todas as pessoas', unidade: ['pessoa', 'pessoas'], opcoes: opcoesPessoas, escolhidos: pessoas })}
      <div class="fichas" id="tipos"><button class="ficha" data-t="" aria-pressed="${String(!tipos.size)}">Tudo</button>${Object.entries(TIPOS).map(([k, n]) => html`<button class="ficha" data-t="${k}" aria-pressed="${String(tipos.has(k))}">${n}</button>`)}</div>
    </div>
    <nav class="decadas" id="decadas"></nav>
    <div id="linha"></div></div>`.s;

  const desenhar = () => {
    limparRegisto();
    const lista = todos.filter((e) => (!tipos.size || tipos.has(e.tipo)) && (!pessoas.length || e.pessoas.some((id) => pessoas.includes(id))));
    const decadas = {};
    for (const e of lista) (decadas[e.data.slice(0, 3) + '0'] ||= []).push(e);
    $('#decadas').innerHTML = html`${Object.keys(decadas).map((d) => html`<button type="button" data-ir="${d}">${d}s <span class="n">${decadas[d].length}</span></button>`)}`.s;
    $('#decadas').hidden = !lista.length;
    // pessoas escolhidas sem nenhum facto datado: diz-se o que o arquivo tem (nunca o que as fontes dizem)
    const sem = pessoas.filter((id) => E.por.pessoas[id] && !nEventos[id]);
    const aviso = sem.length ? html`<div class="vazio aviso-cronologia">${sem.map((id) => html`<p>${nomeDe(id)} ainda não tem factos datados no arquivo.
      <a href="#/pessoa/${id}">Voltar à ficha de ${nomeDe(id)}</a></p>`)}</div>` : '';
    const tambem = (e) => (e.tambem ? html` <span class="tambem">também na ficha de ${e.tambem.map((id, i) => html`${i ? ', ' : ''}<a href="#/pessoa/${id}">${nomeDe(id)}</a>`)}</span>` : '');
    $('#linha').innerHTML = html`${aviso}${lista.length ? html`${Object.entries(decadas).map(([d, evs]) => html`<section class="decada" id="d-${d}">
      <h2>${d}</h2><ol class="eventos">${evs.map((e) => html`<li class="evento ${e.tipo}">
        <div class="quando">${fmtData(e.data)}</div>
        <div class="oque ${e.conflito ? 'conflito' : ''}">${e.texto}${marcas(e.fontes)}${marcaEditorial(e.editorial, 'Testemunho dado')}${e.outras || ''}${tambem(e)}</div></li>`)}</ol></section>`)}`
      : sem.length === pessoas.length && sem.length ? '' : html`<p class="mudo">Sem eventos para estes filtros.</p>`}`.s;
    definirParams({ pessoa: pessoas.join(','), tipos: [...tipos].join(',') });
    // a década à vista fica marcada na barra, e a barra (uma só linha, a rolar de lado) acompanha-a
    observador?.disconnect();
    if ('IntersectionObserver' in window) {
      const barra = $('#decadas');
      observador = new IntersectionObserver((vistas) => {
        const v = vistas.find((x) => x.isIntersecting);
        if (!v) return;
        const d = v.target.id.slice(2);
        $$('[data-ir]', barra).forEach((b) => (b.dataset.ir === d ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
        const b = $(`[data-ir="${d}"]`, barra);
        if (b && barra.scrollWidth > barra.clientWidth) barra.scrollLeft = b.offsetLeft - barra.clientWidth / 2 + b.offsetWidth / 2;
      }, { rootMargin: '-25% 0px -70% 0px' });
      $$('.decada', el).forEach((s) => observador.observe(s));
    }
  };
  $('#decadas').onclick = (e) => { const a = e.target.closest('[data-ir]'); if (a) document.getElementById('d-' + a.dataset.ir)?.scrollIntoView(); }; // sem deslizar: as décadas por desenhar ainda não têm a altura certa
  $('#pessoa').addEventListener('filtro', (e) => { pessoas = e.detail; desenhar(); });
  $('#tipos').onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const k = b.dataset.t;
    if (!k) tipos.clear(); else if (tipos.has(k)) tipos.delete(k); else tipos.add(k);
    $$('#tipos [data-t]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.t ? tipos.has(x.dataset.t) : !tipos.size));
    desenhar();
  };
  desenhar();
}
