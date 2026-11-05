// Página «Procurar» (#/procurar?q=): todos os resultados da procura rápida, arrumados por tipo, cada um com a linha que
// o distingue. A paleta mostra os primeiros de cada tipo; esta página mostra todos e pode guardar-se ou partilhar-se.
// Também aqui: a página de uma ficha que não existe, com as fichas mais parecidas, e a saída das listas sem resultados.
import { procurarEntidades, agruparResultados, atalhosProcura, comArquivo } from '../estado.js';
import { $, html, raw, debounce, definirParams, plural, enderecoSeguro } from '../util.js';
import { itemCurado, dadosItem, ondeVer } from '../componentes.js';
import { tocaAqui } from '../leitor.js';

const POR_GRUPO = 12; // em cada tipo; «Mostrar os outros» abre o resto

/** ▶ de um vídeo ou áudio que toca no leitor; o que não toca aqui (os programas da RTP) é uma ligação ↗ para o site
 *  original, numa janela nova (sem endereço http(s) válido, nenhuma). */
function botaoMedia(r) {
  const it = itemCurado(r.x);
  if (tocaAqui(it)) return html`<button class="botao peq" data-tocar="${raw(dadosItem(it))}" aria-label="Tocar «${r.nome}»">▶</button>`;
  const u = enderecoSeguro(it.url);
  return u ? html`<a class="botao peq" href="${u}" target="_blank" rel="noopener" title="Abre ${ondeVer(it)}"
    aria-label="Ver ${ondeVer(it)}: «${r.nome}» (nova janela)">↗</a>` : '';
}

/** Lista de resultados de procurarEntidades: ligação à ficha (ou ▶ / ↗ para os vídeos e áudios) e a linha que a distingue;
 *  com `comTipo` (listas que misturam tipos), a linha começa pelo tipo («Gravação · 2003 · CD…»). */
export function listaResultados(resultados, { comTipo = false } = {}) {
  const linha = (r) => [comTipo && r.tipo, ...r.detalhe].filter(Boolean).join(' · ');
  return html`<ul class="lista-simples resultados-procura">${resultados.map((r) => (r.grupo === 'media'
    ? html`<li>${botaoMedia(r)}<span>${r.nome}</span><span class="mudo">${linha(r)}</span></li>`
    : html`<li><a href="${r.rota}">${r.nome}</a><span class="mudo">${linha(r)}</span></li>`))}</ul>`;
}

/** Saída de uma lista filtrada sem resultados: «Nada com “X” aqui. Procurar em todo o arquivo →». */
export const semResultados = (q, aqui = 'Nada') => html`<p class="mudo sem-resultados">${q.trim()
  ? html`${aqui} com «${q.trim()}» aqui. <a href="#/procurar?q=${encodeURIComponent(q.trim())}">Procurar em todo o arquivo →</a>`
  : `${aqui} com estes filtros.`}</p>`;

export function procurar(el, params) {
  let q = params.q || '';
  const abertos = new Set();
  el.innerHTML = html`<div class="conteudo estreito">
    <header class="cabecalho"><p class="sobretitulo">Procurar</p><h1>Procurar no arquivo</h1>
      <p class="lead">Pessoas, grupos, obras, discos, instrumentos e os vídeos e áudios catalogados nas fichas — pelo nome ou
        por outro nome por que as fontes os referem, com as palavras por qualquer ordem.</p></header>
    <div class="barra-filtros" role="search"><input class="campo" type="search" id="q" value="${q}" autocomplete="off"
      placeholder="Pessoa, grupo, obra, disco…" aria-label="Procurar no arquivo"></div>
    <p class="mudo" id="total" style="font-size:13px" aria-live="polite"></p>
    <div id="resultados"></div></div>`.s;

  const desenhar = () => {
    const t = q.trim();
    const atalhos = atalhosProcura(t), todos = procurarEntidades(t, Infinity, { media: true });
    $('#total').textContent = t && todos.length ? `${plural(todos.length, 'resultado', 'resultados')} para «${t}»` : '';
    const e = encodeURIComponent(t);
    $('#resultados').innerHTML = (t ? html`
      ${atalhos.length ? html`<p class="fichas atalhos-procura">${atalhos.map((a) => html`<a class="ficha" href="${a.rota}">${a.lista} › ${a.rotulo}<span class="n">${a.n}</span></a>`)}</p>` : ''}
      ${!todos.length ? html`<p class="mudo">Nenhuma ficha com «${t}».</p>` : ''}
      ${agruparResultados(todos).map((g) => {
        const ver = abertos.has(g.grupo) ? g.itens : g.itens.slice(0, POR_GRUPO);
        return html`<section class="seccao"><h2>${g.titulo} <small>${g.itens.length}</small></h2>${listaResultados(ver)}
          ${ver.length < g.itens.length ? html`<p style="margin-top:12px"><button class="botao peq" data-abrir="${g.grupo}">Mostrar os outros ${g.itens.length - ver.length}</button></p>` : ''}</section>`;
      })}
      <p class="acoes-topo procurar-fim" style="margin-top:32px">
        ${comArquivo() ? html`<a class="botao" href="#/arquivo?q=${e}">Pesquisar «${t}» no arquivo dos blogues</a>` : ''}
        <a class="botao" href="#/mediateca?q=${e}">Procurar «${t}» na mediateca</a></p>`
      : html`<p class="mudo">Escreva um nome, um título ou outra palavra. Também pode usar a procura rápida em qualquer página (Ctrl K ou /).</p>`).s;
    definirParams({ q: t });
  };
  $('#q').oninput = debounce((ev) => { q = ev.target.value; abertos.clear(); desenhar(); }, 150);
  $('#resultados').onclick = (ev) => { const b = ev.target.closest('[data-abrir]'); if (b) { abertos.add(b.dataset.abrir); desenhar(); } };
  desenhar();
}

const NAO_ENCONTRADA = {
  pessoas: ['Pessoa não encontrada', 'Ver a lista de pessoas', '#/pessoas', ['pessoas', 'grupos']],
  gravacoes: ['Gravação não encontrada', 'Ver a discografia', '#/discografia', ['gravacoes']],
  obras: ['Obra não encontrada', 'Ver as obras', '#/obras', ['obras']],
  instrumentos: ['Instrumento não encontrado', 'Ver os instrumentos', '#/instrumentos', ['instrumentos']],
};

/** Página de uma ficha que não existe (um endereço antigo ou mal escrito): as 3 fichas mais parecidas com as palavras
 *  do endereço (as do mesmo tipo primeiro), a caixa de procura já preenchida e as ligações para a lista e o início. */
export function naoEncontrada(el, tipo, id) {
  const [titulo, lista, rota, grupos] = NAO_ENCONTRADA[tipo] || ['Ficha não encontrada', 'Procurar no arquivo', '#/procurar', []];
  let palavras = String(id || '').split(/[-_\s]+/).filter((p) => p && !/^\d+$/.test(p)); // os anos no fim do endereço não ajudam
  let achados = [];
  while (palavras.length && !(achados = procurarEntidades(palavras.join(' '), Infinity)).length) palavras = palavras.slice(0, -1);
  const sugestoes = [...achados.filter((r) => grupos.includes(r.grupo)), ...achados.filter((r) => !grupos.includes(r.grupo))].slice(0, 3);
  const texto = String(id || '').split(/[-_\s]+/).filter((p) => p && !/^\d+$/.test(p)).join(' ');
  el.innerHTML = html`<div class="conteudo estreito">
    <header class="cabecalho"><h1>${titulo}</h1>
      <p class="lead">Nenhuma ficha tem o endereço «${id}». Pode estar incompleto ou mal escrito.</p></header>
    ${sugestoes.length ? html`<section class="seccao"><h2>Fichas parecidas</h2>${listaResultados(sugestoes, { comTipo: true })}</section>` : ''}
    <form class="barra-filtros" id="f-nao-encontrada" role="search" style="margin-top:28px">
      <input class="campo" type="search" name="q" value="${texto}" aria-label="Procurar no arquivo" autocomplete="off">
      <button class="botao primario">Procurar</button></form>
    <p class="acoes-topo"><a class="botao" href="${rota}">${lista}</a><a class="botao" href="#/">Voltar ao início</a></p></div>`.s;
  $('#f-nao-encontrada').onsubmit = (e) => { e.preventDefault(); location.hash = `#/procurar?q=${encodeURIComponent(e.target.q.value.trim())}`; };
}
