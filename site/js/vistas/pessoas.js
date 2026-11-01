import { E, PAPEIS, REL, GRUPOS_REL, vida, nomeDe, nomeContribuidor, comArquivo } from '../estado.js';
import { $, $$, html, api, norm, debounce, definirParams, tituloDoc, marcarExcerto, fmtData, plural } from '../util.js';
import { marcas, blocoCitacao } from '../citacoes.js';
import { cartaoPessoa, cartaoMediaArquivo, cartaoMediaCurado, figuraImagem, retrato, vazioCurado, tabelaFactos, ligacaoFonte } from '../componentes.js';
import { editando } from '../edicao.js';
import { caixaTopo, formNovaImagem, formNovaRelacao, marcaEditorial } from '../formularios.js';

import { seccaoMembros } from './grupos.js';
import { arvoreFamiliaDe } from './linhagens.js';

const riqueza = (p) => (p.biografia?.length || 0) * 3 + (p.factos?.length || 0) + (p.relacoes?.length || 0) + (p.imagens?.length || 0) * 2;

export function listaPessoas(el, params) {
  const todas = E.base.pessoas.filter((p) => p.tipo !== 'grupo');
  if (!todas.length) {
    el.innerHTML = html`<div class="conteudo"><header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Pessoas</h1></header>${vazioCurado('pessoas')}</div>`.s;
    return;
  }
  // familiares sem papel musical (mães, cônjuges, filhos…) ficam num filtro próprio, para não encherem a lista
  const musical = (p) => (p.papeis || []).some((x) => x !== 'outro');
  const contagem = {};
  todas.forEach((p) => (p.papeis || []).forEach((x) => { contagem[x] = (contagem[x] || 0) + 1; }));
  const nFamiliares = todas.filter((p) => !musical(p)).length;
  let papeis = new Set((params.papel || '').split(',').filter(Boolean)), q = params.q || '', ordem = params.ordem || 'nome';

  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Pessoas</h1>
      <p class="lead">Guitarras, violas, cantores, compositores, poetas e luthiers — cada ficha reúne os excertos e factos
        retirados das fontes aprovadas.</p></header>
    <div class="barra-filtros">
      <input class="campo" type="search" id="q" placeholder="Filtrar por nome" value="${q}">
      <select class="campo" id="ordem"><option value="nome">Ordem alfabética</option><option value="ricas">Mais documentadas primeiro</option><option value="nasc">Por ano de nascimento</option></select>
    </div>
    <div class="fichas" id="papeis" style="margin:-8px 0 22px">
      <button class="ficha" data-papel="" aria-pressed="${!papeis.size}" title="Todas as pessoas com papel musical">Música<span class="n">${todas.length - nFamiliares}</span></button>
      ${Object.entries(contagem).filter(([k]) => k !== 'outro').sort((a, b) => b[1] - a[1]).map(([k, n]) =>
        html`<button class="ficha" data-papel="${k}" aria-pressed="${papeis.has(k)}">${PAPEIS[k] || k}<span class="n">${n}</span></button>`)}
      ${nFamiliares ? html`<button class="ficha" data-papel="familiares" aria-pressed="${papeis.has('familiares')}" title="Familiares nomeados nas fontes, sem papel musical">Familiares<span class="n">${nFamiliares}</span></button>` : ''}
    </div>
    <div class="grelha" id="grelha"></div></div>`.s;
  $('#ordem').value = ordem;

  const desenhar = () => {
    const nq = norm(q);
    // vários papéis escolhidos: quem tiver pelo menos um deles
    const escolhida = (p) => [...papeis].some((x) => (x === 'familiares' ? !musical(p) : p.papeis?.includes(x)));
    let lista = todas.filter((p) => (papeis.size ? escolhida(p) : musical(p))
      && (!nq || norm([p.nome, ...(p.nomes_alternativos || [])].join(' ')).includes(nq)));
    if (ordem === 'nasc') lista = [...lista].sort((a, b) => (vida(a) || '9999').localeCompare(vida(b) || '9999'));
    if (ordem === 'ricas') lista = [...lista].sort((a, b) => riqueza(b) - riqueza(a));
    $('#grelha').innerHTML = lista.length ? html`${lista.map(cartaoPessoa)}`.s : '<p class="mudo">Nenhuma pessoa corresponde ao filtro.</p>';
    definirParams({ papel: [...papeis].join(','), q, ordem: ordem === 'nome' ? '' : ordem });
  };
  $('#q').oninput = debounce((e) => { q = e.target.value; desenhar(); }, 150);
  $('#ordem').onchange = (e) => { ordem = e.target.value; desenhar(); };
  $('#papeis').onclick = (e) => {
    const b = e.target.closest('[data-papel]'); if (!b) return;
    const k = b.dataset.papel;
    if (!k) papeis.clear(); else if (papeis.has(k)) papeis.delete(k); else papeis.add(k);
    $$('[data-papel]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.papel ? papeis.has(x.dataset.papel) : !papeis.size));
    desenhar();
  };
  desenhar();
}

export async function pessoa(el, id) {
  const p = E.por.pessoas[id];
  if (!p) { el.innerHTML = '<div class="conteudo"><h1>Pessoa não encontrada</h1></div>'; return; }
  // num grupo, os membros têm secção própria e não se repetem nas relações
  const rels = (E.relacoesDe[id] || []).filter((r) => !(p.tipo === 'grupo' && r.tipo === 'membro_de' && r.sentido === 'inv'));
  const porGrupo = {};
  for (const r of rels) (porGrupo[REL[r.tipo]?.grupo || 'musica'] ||= []).push(r);
  const instr = E.instrumentosDe[id] || [], gravs = E.gravacoesDe[id] || [], obras = E.obrasDe[id] || [], media = E.mediaDe[id] || [];
  const anos = vida(p);
  const ed = editando(), textos = E.blogueDe[id] || [];
  const dono = (por) => !por || E.contribuidores[por]?.papel === 'dono';
  // fotografias acrescentadas por contribuidores: legenda assinada e ligação à página de origem
  const figura = (im) => figuraImagem(im.url, im.editorial ? `${im.legenda ? im.legenda + ' ' : ''}(✎ ${nomeContribuidor(im.editorial.por)})` : im.legenda,
    im.editorial?.origem || ligacaoFonte(im.fontes?.[0]));
  const editavel = (im, k) => html`<div class="imagem-editavel">${figura(im)}<div class="acoes">
    ${k ? html`<button class="botao peq" data-acao="retrato" data-id="${id}" data-url="${im.url}">Usar como retrato</button>` : html`<span class="selo verde">retrato</span>`}
    <button class="botao peq" data-acao="ocultar-imagem" data-id="${id}" data-url="${im.url}"
      data-pedir="Porque esconde esta imagem? (ex.: não é esta pessoa, má qualidade). A imagem não se apaga: fica guardada e pode voltar.">Esconder</button></div></div>`;

  el.innerHTML = html`<div class="conteudo">
    <header class="ficha-topo">
      ${retrato(p)}
      <div>
        <p class="sobretitulo">${(p.papeis || []).map((x) => PAPEIS[x] || x).join(' · ') || (p.tipo === 'grupo' ? 'Agrupamento' : 'Pessoa')}</p>
        <h1>${p.nome}</h1>
        ${anos ? html`<p class="anos">${anos}</p>` : ''}
        ${p.nomes_alternativos?.length ? html`<p class="alt">Também referido/a como: ${p.nomes_alternativos.join('; ')}</p>` : ''}
        ${p.editorial ? html`<p class="alt">✎ Ficha criada por ${nomeContribuidor(p.editorial.por)} em ${fmtData(p.editorial.data)}, sem fonte própria.</p>` : ''}
        ${p.nota_editor && !ed ? html`<p class="alt" title="Decisão de quem edita o arquivo, não de uma fonte">✎ ${dono(p.nota_editor_por) ? 'Nota do editor' : `Nota de ${nomeContribuidor(p.nota_editor_por)}`}: ${p.nota_editor}</p>` : ''}
        <p>${p.estado_revisao === 'revisto' ? html`<span class="selo verde">${p.revisto_por && !dono(p.revisto_por) ? `Revisto por ${nomeContribuidor(p.revisto_por)}` : 'Revisto pelo editor'}</span>`
          : html`<span class="selo ouro">${p.editorial ? 'Ficha de contribuidor' : 'Rascunho do agente'} — por rever</span>`}</p>
        ${ed ? caixaTopo(p) : ''}
        <div class="acoes-topo">
          ${rels.length ? html`<a class="botao" href="#/linhagens?pessoa=${id}">Ver nas linhagens</a>` : ''}
          ${comArquivo() ? html`<a class="botao" href="#/arquivo?q=${encodeURIComponent('"' + p.nome + '"')}">Pesquisar no arquivo</a>` : ''}
          <a class="botao" href="#/cronologia?pessoa=${id}">Cronologia</a>
        </div>
      </div>
    </header>

    ${p.biografia?.length ? html`<section class="seccao biografia estreito"><h2>Nas palavras das fontes <small>${plural(p.biografia.length, 'excerto', 'excertos')}</small></h2>
      ${p.biografia.map(blocoCitacao)}</section>` : ''}

    ${p.factos?.length ? html`<section class="seccao"><h2>Factos <small>clique nos números para ver a citação${ed ? ' · ✎ acrescenta uma nota assinada' : ''}</small></h2>
      ${tabelaFactos(p.factos, { editar: ed && id })}</section>` : ''}

    ${p.tipo === 'grupo' ? seccaoMembros(p, marcas) : ''}

    <section class="seccao" id="sec-familia" hidden><h2>Família</h2><div id="familia"></div></section>

    ${rels.length || ed ? html`<section class="seccao"><h2>Relações ${rels.some((r) => r.editorial) ? html`<small>✎ indicada por um contribuidor, sem fonte</small>` : ''}</h2>
      ${Object.entries(porGrupo).map(([g, lista]) => html`<h3 style="margin:18px 0 10px">${GRUPOS_REL[g]}</h3>
        <div class="relacoes">${lista.map((r) => html`<div class="relacao"><span class="ponto ${g}"></span><div>
          <span class="tipo">${r.sentido === 'dir' ? REL[r.tipo]?.dir : REL[r.tipo]?.inv}${marcas(r.fontes)}${marcaEditorial(r.editorial)}</span>
          <a href="#/pessoa/${r.outro}">${nomeDe(r.outro)}</a>
          ${ed && (r.editorial || (r.fontes?.length && r.fontes.every((c) => c.acrescentada))) ? html`<button class="botao-nota" data-acao="retirar-relacao" data-dono="${r.sentido === 'dir' ? id : r.outro}" data-tipo="${r.tipo}"
            data-alvo="${r.sentido === 'dir' ? r.outro : id}" data-confirmar="Retirar esta relação?" title="Retirar">×</button>` : ''}</div></div>`)}</div>`)}
      ${ed ? formNovaRelacao(p) : ''}
    </section>` : ''}

    ${instr.length ? html`<section class="seccao"><h2>Instrumentos</h2><ul class="lista-simples">
      ${instr.map(({ instrumento: i, papel }) => html`<li><a href="#/instrumento/${i.id}">${i.designacao}</a>
        <span class="mudo">${papel}${i.ano ? ' · ' + i.ano : ''}</span></li>`)}</ul></section>` : ''}

    ${gravs.length ? html`<section class="seccao"><h2>Gravações</h2><ul class="lista-simples">
      ${gravs.map(({ gravacao: g, funcao }) => html`<li><span class="mono mudo">${g.ano || '—'}</span>
        <a href="#/gravacao/${g.id}">${g.titulo}</a><span class="mudo">${[g.formato, g.editora, funcao].filter(Boolean).join(' · ')}</span></li>`)}</ul></section>` : ''}

    ${obras.length ? html`<section class="seccao"><h2>Obras</h2><ul class="lista-simples">
      ${obras.map(({ obra: o, papel }) => html`<li><a href="#/obra/${o.id}">${o.titulo}</a><span class="mudo">${papel}${o.ano ? ' · ' + o.ano : ''}</span></li>`)}</ul></section>` : ''}

    ${media.length ? html`<section class="seccao"><h2>Media catalogado</h2><div class="grelha larga">${media.map(cartaoMediaCurado)}</div></section>` : ''}

    ${p.imagens?.length || ed ? html`<section class="seccao"><h2>Imagens ${ed ? html`<small>a primeira é o retrato da ficha</small>` : ''}</h2>
      <div class="galeria">${(p.imagens || []).map((im, k) => (ed ? editavel(im, k) : figura(im)))}</div>
      ${ed && p.imagens_ocultas?.length ? html`<h3 style="margin:22px 0 10px">Imagens escondidas <small class="mudo">não aparecem no site</small></h3>
        <div class="galeria">${p.imagens_ocultas.map((im) => html`<div class="imagem-editavel oculta">${figura(im)}
          <p class="mudo">Escondida por ${nomeContribuidor(im.oculta.por)} em ${fmtData(im.oculta.data)}${im.oculta.nota ? `: ${im.oculta.nota}` : ''}</p>
          <div class="acoes"><button class="botao peq" data-acao="mostrar-imagem" data-id="${id}" data-url="${im.url}">Voltar a mostrar</button></div></div>`)}</div>` : ''}
      ${ed ? formNovaImagem(id) : ''}</section>` : ''}

    ${textos.length ? html`<section class="seccao"><h2>No blogue do arquivo <small>textos assinados que falam desta ficha</small></h2>
      <ul class="lista-simples">${textos.map((t) => html`<li><span class="mono mudo">${fmtData(t.data, true)}</span>
        <a href="#/blogue/${t.id}">${t.titulo}</a><span class="mudo">${nomeContribuidor(t.autor)}</span></li>`)}</ul></section>` : ''}

    ${comArquivo() ? html`<section class="seccao"><h2>Vídeos no arquivo que referem ${p.nome} <small>pesquisa automática pelo nome — pode incluir homónimos; confirmar no post</small></h2>
      <div class="grelha larga" id="media-arquivo"><p class="carregando">A procurar</p></div></section>

    <section class="seccao"><h2>No arquivo dos blogues <small id="n-docs"></small></h2>
      <ul class="resultados" id="docs"><li class="carregando">A procurar</li></ul></section>` : ''}
  </div>`.s;

  arvoreFamiliaDe(id).then((arv) => {
    if (!arv || !$('#familia')) return;
    $('#familia').innerHTML = arv.s;
    $('#sec-familia').hidden = false;
  }).catch(() => { /* sem biblioteca de árvores: a ficha mostra as relações em lista */ });
  if (!comArquivo()) return; // online não há cópia dos blogues para pesquisar
  const nomes = [p.nome, ...(p.nomes_alternativos || [])];
  // guardados já: se entretanto se mudar de página, as respostas caem em elementos que já não estão à vista
  const caixaMedia = $('#media-arquivo'), caixaDocs = $('#docs'), nDocs = $('#n-docs');
  try {
    // o nome inteiro (e as variantes), nunca as palavras soltas: evita homónimos e falsos positivos
    const r = await api('media', { q: nomes.join('|'), frase: 1, tipo: 'video' });
    caixaMedia.innerHTML = r.resultados.length ? html`${r.resultados.slice(0, 6).map(cartaoMediaArquivo)}`.s
      : '<p class="mudo">Nenhum vídeo com este nome no texto à volta.</p>';
  } catch { caixaMedia.innerHTML = '<p class="mudo">Servidor local desligado.</p>'; }
  try {
    const q = nomes.map((n) => `"${n.replace(/"/g, '')}"`).join(' OR ');
    const r = await api('pesquisa', { q });
    nDocs.textContent = plural(r.total, 'documento', 'documentos');
    caixaDocs.innerHTML = html`${r.resultados.slice(0, 8).map((d) => html`<li class="resultado">
      <h3><a href="#/doc/${d.doc_id}?realce=${encodeURIComponent(p.nome)}">${tituloDoc(d.titulo)}</a></h3>
      <p class="meta">${fmtData(d.data, true)} · ${E.fontes[d.fonte]?.nome || d.fonte}</p>
      <p class="excerto">${marcarExcerto(d.excerto)}</p></li>`)}
      ${r.total > 8 ? html`<li style="padding-top:14px"><a class="botao" href="#/arquivo?q=${encodeURIComponent(q)}">Ver os ${r.total} documentos</a></li>` : ''}`.s;
  } catch { caixaDocs.innerHTML = '<li class="mudo">Servidor local desligado.</li>'; }
}
