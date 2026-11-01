// Blogue do arquivo: textos assinados por quem contribui. Ligam às fichas, mas nunca servem de fonte.
import { E, nomeContribuidor } from '../estado.js';
import { $, html, fmtData, debounce } from '../util.js';
import { editando, sessao, podeAprovar } from '../edicao.js';
import { textoRico, resumoTexto, ficha } from '../texto.js';

const podeMexer = (post) => editando() && (post.autor === sessao()?.id || podeAprovar());

const cabecalho = html`<header class="cabecalho"><p class="sobretitulo">Sobre o arquivo</p><h1>Blogue</h1>
  <p class="lead">Textos assinados por quem contribui para o arquivo: novidades, pedidos de ajuda, memórias e histórias.
    São opiniões e testemunhos dos seus autores: ligam às fichas, mas não são fontes delas.</p></header>`;

function cartaoTexto(post) {
  return html`<article class="cartao-texto">
    <p class="meta">${fmtData(post.data)} · ${nomeContribuidor(post.autor)}${post.estado === 'rascunho' ? html` <span class="selo ouro">rascunho</span>` : ''}</p>
    <h2><a href="#/blogue/${post.id}">${post.titulo}</a></h2>
    <p>${resumoTexto(post.texto)}</p></article>`;
}

export function blogue(el) {
  const publicados = E.base.blogue.filter((p) => p.estado === 'publicado');
  const rascunhos = editando() ? E.base.blogue.filter((p) => p.estado === 'rascunho' && podeMexer(p)) : [];
  el.innerHTML = html`<div class="conteudo estreito">${cabecalho}
    ${editando() ? html`<p><a class="botao primario" href="#/blogue/novo">Escrever um texto</a></p>` : ''}
    ${rascunhos.length ? html`<section class="seccao"><h2>Rascunhos <small>só visíveis no modo de edição</small></h2>${rascunhos.map(cartaoTexto)}</section>` : ''}
    ${publicados.length ? html`<section class="seccao">${publicados.map(cartaoTexto)}</section>`
      : html`<div class="vazio"><h3>Ainda não há textos publicados</h3>
        <p>Os contribuidores convidados escrevem aqui, no modo de edição. Veja <a href="#/contribuir">como contribuir</a>.</p></div>`}
  </div>`.s;
}

export function artigo(el, id) {
  const post = E.base.blogue.find((p) => p.id === id);
  if (!post || (post.estado !== 'publicado' && !podeMexer(post))) {
    el.innerHTML = '<div class="conteudo"><h1>Texto não encontrado</h1><p><a href="#/blogue">Voltar ao blogue</a></p></div>';
    return;
  }
  const fichas = (post.mencoes || []).map((m) => ({ ...m, ...ficha(m.id) })).filter((m) => m.rota);
  el.innerHTML = html`<div class="conteudo estreito"><article class="artigo">
    <p class="sobretitulo"><a href="#/blogue">Blogue</a>${post.estado === 'rascunho' ? html` · <span class="selo ouro">rascunho</span>` : ''}</p>
    <h1>${post.titulo}</h1>
    <p class="meta">${fmtData(post.data)} · <a href="#/contribuidores?quem=${post.autor}">${nomeContribuidor(post.autor)}</a></p>
    ${podeMexer(post) ? html`<div class="acoes-topo"><a class="botao peq" href="#/blogue/${post.id}/editar">Editar</a>
      <button class="botao peq" data-acao="apagar-texto" data-id="${post.id}" data-confirmar="Apagar este texto do blogue?">Apagar</button></div>` : ''}
    <div class="texto-rico">${textoRico(post.texto)}</div>
    <p class="aviso-texto">Texto assinado por ${nomeContribuidor(post.autor)}. As opiniões e memórias são do autor e não servem de fonte às fichas do arquivo.</p>
    ${fichas.length ? html`<section class="seccao"><h2>Fichas mencionadas</h2><div class="fichas">
      ${fichas.map((f) => html`<a class="ficha" href="${f.rota}">${f.nome}</a>`)}</div></section>` : ''}
  </article></div>`.s;
}

export function editarArtigo(el, id) {
  if (!editando()) { location.hash = id === 'novo' ? '#/blogue' : `#/blogue/${id}`; return; }
  const post = id === 'novo' ? { id: '', titulo: '', texto: '', estado: 'rascunho' } : E.base.blogue.find((p) => p.id === id);
  if (!post || (id !== 'novo' && !podeMexer(post))) { el.innerHTML = '<div class="conteudo"><h1>Texto não encontrado</h1></div>'; return; }

  el.innerHTML = html`<div class="conteudo estreito">
    <header class="cabecalho"><p class="sobretitulo"><a href="#/blogue">Blogue</a></p><h1>${id === 'novo' ? 'Escrever um texto' : 'Editar o texto'}</h1></header>
    <form class="caixa-edicao editor-texto" data-acao="guardar-texto">
      <input type="hidden" name="id" value="${post.id}">
      <label>Título <input class="campo titulo" name="titulo" required value="${post.titulo}"></label>
      <div class="ferramentas-texto">
        <button type="button" class="botao peq" data-marca="**|**" title="Negrito"><b>N</b></button>
        <button type="button" class="botao peq" data-marca="*|*" title="Itálico"><i>I</i></button>
        <button type="button" class="botao peq" data-marca="## |" title="Título de secção">Título</button>
        <button type="button" class="botao peq" data-marca="> |" title="Citação">Citação</button>
        <button type="button" class="botao peq" data-marca="- |" title="Lista">Lista</button>
        <button type="button" class="botao peq" data-ligacao title="Ligação a um site">Ligação</button>
        <span class="ligar-ficha"><input class="campo" id="procurar-ficha" list="lista-fichas" placeholder="Ligar a uma ficha: escreva um nome…" autocomplete="off">
          <datalist id="lista-fichas">${[...E.base.pessoas.map((p) => [p.id, p.nome]), ...E.base.obras.map((o) => [o.id, o.titulo]),
            ...E.base.gravacoes.map((g) => [g.id, g.titulo])].map(([i, n]) => html`<option value="${n} — ${i}"></option>`)}</datalist></span>
      </div>
      <textarea class="campo" name="texto" id="texto" rows="18" placeholder="Escreva aqui. Deixe uma linha em branco entre parágrafos.">${post.texto}</textarea>
      <div class="linha-campos">
        <label class="opcao"><input type="radio" name="estado" value="rascunho" ${post.estado !== 'publicado' ? 'checked' : ''}> Guardar como rascunho</label>
        <label class="opcao"><input type="radio" name="estado" value="publicado" ${post.estado === 'publicado' ? 'checked' : ''}> Publicar</label>
        <button class="botao primario">Guardar</button>
      </div>
      <details class="ajuda-texto"><summary>Como formatar</summary>
        <p><code>**negrito**</code> · <code>*itálico*</code> · <code>## Título</code> numa linha própria · <code>- </code> no início de cada linha de uma lista ·
          <code>&gt; </code> para citar · <code>[texto](https://…)</code> para uma ligação · <code>![legenda](https://…/imagem.jpg)</code> numa linha própria para uma imagem ·
          <code>[[carlos-paredes]]</code> ou <code>[[carlos-paredes|o mestre]]</code> para ligar a uma ficha (use a caixa «Ligar a uma ficha»).</p></details>
    </form>
    <section class="seccao"><h2>Pré-visualização</h2><article class="artigo"><h1 id="pre-titulo"></h1><div class="texto-rico" id="pre-texto"></div></article></section>
  </div>`.s;

  const area = $('#texto');
  const previsualizar = () => {
    $('#pre-titulo').textContent = $('[name=titulo]').value;
    $('#pre-texto').innerHTML = textoRico(area.value).s;
  };
  const inserir = (antes, depois = '') => {
    const { selectionStart: i, selectionEnd: f, value: v } = area;
    area.value = v.slice(0, i) + antes + v.slice(i, f) + depois + v.slice(f);
    area.focus();
    area.selectionStart = i + antes.length; area.selectionEnd = f + antes.length;
    previsualizar();
  };
  el.querySelectorAll('[data-marca]').forEach((b) => { b.onclick = () => inserir(...b.dataset.marca.split('|')); });
  el.querySelector('[data-ligacao]').onclick = () => {
    const url = prompt('Endereço da ligação (https://…)');
    if (url && /^https?:\/\//.test(url)) inserir('[', `](${url.trim()})`);
  };
  $('#procurar-ficha').onchange = (e) => {
    const fid = e.target.value.split(' — ').pop();
    if (!ficha(fid)) return;
    const { selectionStart: i, selectionEnd: f, value: v } = area;
    const texto = v.slice(i, f);
    area.value = v.slice(0, i) + `[[${fid}${texto ? '|' + texto : ''}]]` + v.slice(f);
    e.target.value = '';
    area.focus();
    previsualizar();
  };
  area.oninput = debounce(previsualizar, 200);
  $('[name=titulo]').oninput = previsualizar;
  previsualizar();
}
