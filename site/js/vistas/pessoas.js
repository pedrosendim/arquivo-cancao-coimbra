import { E, PAPEIS, REL, GRUPOS_REL, nomeDe, nomeContribuidor, comArquivo } from '../estado.js';
import { $, $$, html, api, norm, debounce, definirParams, tituloDoc, marcarExcerto, fmtData, plural, compararPt } from '../util.js';
import { marcas, blocoCitacao } from '../citacoes.js';
import { cartaoPessoa, cartaoMediaArquivo, cartaoMediaCurado, figuraImagem, vazioCurado, tabelaFactos, ligacaoFonte } from '../componentes.js';
import { editando } from '../edicao.js';
import { notasDaFicha } from '../notas.js';
import { caixaTopo, formNovaImagem, formNovaRelacao, marcaEditorial, formNotaEditor } from '../formularios.js';

import { seccaoMembros } from './grupos.js';
import { formVida, formFacto, seccaoReferencias, linhaVida, botaoNova, dobraDesambiguar } from '../fichas.js';
import { naoConfundir, seccaoDesambiguar } from '../desambiguar.js';
import { botaoHistorico } from '../historico.js';
import { barraRevisao } from '../revisao.js';
import { arvoreFamiliaDe } from './linhagens.js';
import { seccaoOuvir, alternarDocumentos } from '../ouvir.js';
// leitura da ficha: anos com divergências, selo, «Nesta ficha», partilhar, ordem das listas
import { anosVida, parentescoDe, anoGravacao } from '../estado.js';
import { compararPt as ordemPt } from '../util.js';
import { retratoFicha } from '../componentes.js';
import { seloRevisao, lugarIndice, desenharIndice, botoesPartilha, botaoOuvirTudo, anoGravacaoHtml, anoCurto } from '../leitura.js';
import { naLinhagem, centrarArvore } from './linhagens.js';
import { iconesPessoa, iconePapel } from '../icones.js';
import { nEventosDe } from './cronologia.js';
import { naoEncontrada, semResultados } from './procurar.js';
// lista de pessoas: procura sem acentos e por qualquer ordem, papéis numa lista que abre no telemóvel
import { riqueza } from '../estado.js';
import { raw, termosProcura, temTodas } from '../util.js';
import { filtroMultiplo, definirEscolhidos } from '../filtros.js';


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
  // os mesmos papéis em botões (computador) e numa lista que abre (telemóvel, onde os botões ocupavam meio ecrã)
  const opcoesPapel = [...Object.entries(contagem).filter(([k]) => k !== 'outro').sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ valor: k, nome: PAPEIS[k] || k, n })),
    ...(nFamiliares ? [{ valor: 'familiares', nome: 'Familiares', n: nFamiliares }] : [])];

  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Pessoas</h1>
      <p class="lead">Guitarras, violas, cantores, compositores, poetas e luthiers — cada ficha reúne os excertos e factos
        retirados das fontes aprovadas.</p>
      ${editando() ? html`<p class="acoes-lista">${botaoNova('pessoas')} ${botaoNova('pessoas', true)}</p>` : ''}</header>
    <div class="barra-filtros">
      <input class="campo" type="search" id="q" placeholder="Filtrar por nome" aria-label="Filtrar por nome" value="${q}">
      <select class="campo" id="ordem" aria-label="Ordem"><option value="nome">Ordem alfabética</option><option value="ricas">Mais documentadas primeiro</option><option value="nasc">Por ano de nascimento</option></select>
      <div class="filtro-telemovel">${filtroMultiplo({ id: 'papel-lista', todos: 'Todos os papéis', unidade: ['papel', 'papéis'], opcoes: opcoesPapel, escolhidos: [...papeis] })}</div>
    </div>
    <div class="fichas filtro-computador" id="papeis" style="margin:-8px 0 22px">
      <button class="ficha" data-papel="" aria-pressed="${String(!papeis.size)}" title="Todas as pessoas com papel musical">Música<span class="n">${todas.length - nFamiliares}</span></button>
      ${opcoesPapel.map((o) => html`<button class="ficha ficha-papel" data-papel="${o.valor}" aria-pressed="${String(papeis.has(o.valor))}"
        ${o.valor === 'familiares' ? raw('title="Familiares nomeados nas fontes, sem papel musical"') : ''}>${iconePapel(o.valor)} ${o.nome}<span class="n">${o.n}</span></button>`)}
    </div>
    <p class="mudo total-lista" id="total" aria-live="polite"></p>
    <p class="grupos-achados" id="grupos-achados" hidden></p>
    <h2 class="so-leitor">Lista de pessoas</h2>
    <div class="grelha" id="grelha"></div></div>`.s;
  $('#ordem').value = ordem;

  const desenhar = () => {
    const termos = termosProcura(q);
    // vários papéis escolhidos: quem tiver pelo menos um deles. Com um nome escrito e nenhum papel escolhido, procura em
    // todas as fichas (os familiares também), com as palavras por qualquer ordem e sem acentos
    const escolhida = (p) => [...papeis].some((x) => (x === 'familiares' ? !musical(p) : p.papeis?.includes(x)));
    const comNome = (p) => [p.nome, ...(p.nomes_alternativos || [])].some((n) => temTodas(n, termos));
    let lista = todas.filter((p) => (papeis.size ? escolhida(p) : termos.length || musical(p)) && (!termos.length || comNome(p)));
    // pelo ano de nascimento como número (anosVida); quem não tem ano fica no fim
    if (ordem === 'nasc') lista = [...lista].sort((a, b) => (anosVida(a).ano ?? 9999) - (anosVida(b).ano ?? 9999) || compararPt(a.nome, b.nome));
    if (ordem === 'ricas') lista = [...lista].sort((a, b) => riqueza(b) - riqueza(a));
    const familiares = termos.length && !papeis.size ? lista.filter((p) => !musical(p)) : [];
    if (familiares.length) lista = [...lista.filter(musical), ...familiares]; // primeiro os músicos
    // o nome escrito também pode ser o de um grupo (os grupos têm página própria)
    const grupos = termos.length ? E.base.pessoas.filter((g) => g.tipo === 'grupo' && [g.nome, ...(g.nomes_alternativos || [])].some((n) => temTodas(n, termos))) : [];
    // «com este nome» só quando um dos nomes de cada grupo é o que se escreveu; senão, «com «Coimbra» no nome»
    const nomeIgual = grupos.every((g) => [g.nome, ...(g.nomes_alternativos || [])].some((n) => termosProcura(n).join(' ') === termos.join(' ')));
    $('#total').textContent = `${plural(lista.length, 'pessoa', 'pessoas')}${termos.length ? ` com «${q.trim()}»` : ''}${familiares.length
      ? (familiares.length < lista.length ? ` · ${familiares.length} sem papel musical, no fim` : ` · ${lista.length > 1 ? 'todas ' : ''}sem papel musical`) : ''}`;
    $('#grupos-achados').hidden = !grupos.length;
    $('#grupos-achados').innerHTML = html`${grupos.length === 1 ? 'Também há um grupo' : `Também há ${grupos.length} grupos`} ${nomeIgual ? 'com este nome' : `com «${q.trim()}» no nome`}:
      ${grupos.slice(0, 4).map((g, i) => html`${i ? ', ' : ''}<a href="#/pessoa/${g.id}">${g.nome}</a>`)}${grupos.length > 4
        ? html` e <a href="#/grupos?q=${encodeURIComponent(q.trim())}">outros ${grupos.length - 4}</a>` : ''}.`.s;
    $('#grelha').innerHTML = (lista.length ? html`${lista.map((p) => cartaoPessoa(p))}` : semResultados(q, 'Nenhuma pessoa')).s;
    definirParams({ papel: [...papeis].join(','), q, ordem: ordem === 'nome' ? '' : ordem });
  };
  // os botões (computador) e a lista que abre (telemóvel) mostram sempre a mesma escolha
  const mostrarPapeis = () => {
    $$('#papeis [data-papel]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.papel ? papeis.has(x.dataset.papel) : !papeis.size));
    definirEscolhidos($('#papel-lista'), [...papeis]);
  };
  $('#q').oninput = debounce((e) => { q = e.target.value; desenhar(); }, 150);
  $('#ordem').onchange = (e) => { ordem = e.target.value; desenhar(); };
  $('#papeis').onclick = (e) => {
    const b = e.target.closest('[data-papel]'); if (!b) return;
    const k = b.dataset.papel;
    if (!k) papeis.clear(); else if (papeis.has(k)) papeis.delete(k); else papeis.add(k);
    mostrarPapeis();
    desenhar();
  };
  $('#papel-lista').addEventListener('filtro', (e) => { papeis = new Set(e.detail); mostrarPapeis(); desenhar(); });
  desenhar();
}

// ordem das relações na ficha: pais, cônjuges, filhos, irmãos…; mestres e alunos; «membro de» antes das outras parcerias
const ORDEM_RELACOES = ['filho_de:dir', 'conjuge_de:dir', 'conjuge_de:inv', 'filho_de:inv', 'irmao_de:dir', 'irmao_de:inv', 'neto_de:dir',
  'neto_de:inv', 'sobrinho_de:dir', 'sobrinho_de:inv', 'primo_de:dir', 'primo_de:inv', 'aluno_de:dir', 'aluno_de:inv', 'influenciado_por:dir',
  'influenciado_por:inv', 'membro_de:dir', 'membro_de:inv', 'tocou_com:dir', 'tocou_com:inv', 'acompanhou:dir', 'acompanhou:inv'];
const posicaoRelacao = (r) => { const k = ORDEM_RELACOES.indexOf(`${r.tipo}:${r.sentido}`); return k < 0 ? ORDEM_RELACOES.length : k; };

export async function pessoa(el, id) {
  const p = E.por.pessoas[id];
  if (!p && E.juntadas.pessoas?.[id]) { location.replace(`#/pessoa/${E.juntadas.pessoas[id]}`); return; }
  if (!p) { naoEncontrada(el, 'pessoas', id); return; }
  // num grupo, os membros têm secção própria e não se repetem nas relações
  // por ordem fixa (família, ensino, parcerias) e, em cada uma, pelo tipo de relação e pelo nome
  const rels = (E.relacoesDe[id] || []).filter((r) => !(p.tipo === 'grupo' && r.tipo === 'membro_de' && r.sentido === 'inv'))
    .sort((a, b) => posicaoRelacao(a) - posicaoRelacao(b) || ordemPt(nomeDe(a.outro), nomeDe(b.outro)));
  const porGrupo = {};
  for (const r of rels) (porGrupo[REL[r.tipo]?.grupo || 'musica'] ||= []).push(r);
  const instr = E.instrumentosDe[id] || [], gravs = E.gravacoesDe[id] || [], obras = E.obrasDe[id] || [], media = E.mediaDe[id] || [];
  const av = anosVida(p), par = parentescoDe(p), lugar = naLinhagem(id), nEventos = nEventosDe(id);
  // um disco por linha (com as funções juntas), por ano, os sem ano no fim; uma obra por linha («música e letra»)
  const discos = [...new Map(gravs.map((x) => [x.gravacao.id, x.gravacao])).values()]
    .map((g) => ({ g, ano: anoGravacao(g), funcoes: [...new Set(gravs.filter((x) => x.gravacao.id === g.id).map((x) => x.funcao).filter(Boolean))] }))
    .sort((a, b) => (a.ano?.ano ?? 9999) - (b.ano?.ano ?? 9999) || ordemPt(a.g.titulo, b.g.titulo));
  const minhasObras = [...new Map(obras.map((x) => [x.obra.id, x.obra])).values()]
    .map((o) => ({ o, papeis: [...new Set(obras.filter((x) => x.obra.id === o.id).map((x) => x.papel))] }))
    .sort((a, b) => ordemPt(a.o.titulo, b.o.titulo));
  // anos no topo: com fontes que divergem, os anos de cada versão e um «≠» que leva às versões na tabela de factos
  const parteAnos = (x, campo) => (!x ? '?' : x.diverge ? html`${x.anos.length ? x.anos.join('/') : '?'}<button type="button" class="diverge"
    data-saltar="facto-${campo}" title="As fontes divergem: ver as versões nos Factos" aria-label="as fontes divergem — ver as versões nos Factos">≠</button>` : x.texto);
  const ed = editando(), textos = E.blogueDe[id] || [];
  // fotografias acrescentadas por contribuidores: legenda assinada e ligação à página de origem
  const figura = (im) => figuraImagem(im.url, im.editorial ? `${im.legenda ? im.legenda + ' ' : ''}(✎ ${nomeContribuidor(im.editorial.por)})` : im.legenda,
    im.editorial?.origem || ligacaoFonte(im.fontes?.[0]));
  const editavel = (im, k) => html`<div class="imagem-editavel">${figura(im)}<div class="acoes">
    ${k ? html`<button class="botao peq" data-acao="retrato" data-id="${id}" data-url="${im.url}">Usar como retrato</button>` : html`<span class="selo verde">retrato</span>`}
    <button class="botao peq" type="button" data-recortar data-id="${id}" data-url="${im.url}">Recortar 1:1</button>
    <button class="botao peq" data-acao="ocultar-imagem" data-id="${id}" data-url="${im.url}"
      data-pedir="Porque esconde esta imagem? (ex.: não é esta pessoa, má qualidade). A imagem não se apaga: fica guardada e pode voltar.">Esconder</button></div></div>`;

  el.innerHTML = html`<div class="conteudo">${barraRevisao('pessoas', p)}
    <header class="ficha-topo">
      ${retratoFicha(p, ed)}
      <div>
        <p class="sobretitulo">${(p.papeis || []).map((x) => PAPEIS[x] || x).join(' · ') || (p.tipo === 'grupo' ? 'Agrupamento' : 'Pessoa')}</p>
        ${iconesPessoa(p, 'na-ficha')}
        <h1>${p.nome}</h1>
        ${par ? html`<p class="parentesco-topo">${par.rotulo} <a href="#/pessoa/${par.id}">${nomeDe(par.id)}</a>${par.editorial
          ? html` <span class="marca-editorial" title="Indicado por um contribuidor, sem fonte">✎</span>` : ''}</p>` : ''}
        ${av.texto ? html`<p class="anos">${parteAnos(av.nascimento, 'nascimento')} – ${av.morte ? parteAnos(av.morte, 'morte') : ''}</p>` : ''}
        ${linhaVida(p)}
        ${naoConfundir('pessoas', p)}
        ${p.nomes_alternativos?.length ? html`<p class="alt">Também referido/a como: ${p.nomes_alternativos.join('; ')}</p>` : ''}
        ${p.editorial ? html`<p class="alt">✎ Ficha criada por ${nomeContribuidor(p.editorial.por)} em ${fmtData(p.editorial.data)}, sem fonte própria.</p>` : ''}
        ${notasDaFicha(p, `pessoas/${id}`)}
        ${seloRevisao(p)}
        ${ed ? caixaTopo(p) : ''}
        <div class="acoes-topo">
          ${botaoOuvirTudo(media)}
          ${lugar.escola ? html`<a class="botao" href="#/linhagens?ver=escolas&pessoa=${id}">Mestres e alunos (${lugar.escola.ligacoes})</a>` : ''}
          ${nEventos ? html`<a class="botao" href="#/cronologia?pessoa=${id}">Cronologia (${nEventos})</a>` : ''}
          ${comArquivo() ? html`<a class="botao" href="#/arquivo?q=${encodeURIComponent('"' + p.nome + '"')}">Pesquisar no arquivo</a>` : ''}
          ${botaoHistorico('pessoas', id)}
          ${botoesPartilha(p.nome, p.estado_revisao)}
        </div>
      </div>
    </header>
    ${lugarIndice()}

    ${p.biografia?.length ? html`<section class="seccao biografia estreito" id="sec-fontes" data-indice="Nas fontes"><h2>Nas palavras das fontes <small>${plural(p.biografia.length, 'excerto', 'excertos')}</small></h2>
      ${p.biografia.map(blocoCitacao)}</section>` : ''}

    ${p.factos?.length || ed ? html`<section class="seccao" id="sec-factos" data-n="${p.factos?.length || 0}"><h2>Factos <small><span class="so-rato">clique nos números para ver a citação</span><span class="so-toque">toque em «fontes» para ver as citações</span>${ed ? ' · ✎ acrescenta uma nota assinada' : ''}</small></h2>
      ${tabelaFactos(p.factos, { editar: ed && `pessoas/${id}` })}
      ${ed ? html`${p.tipo !== 'grupo' ? html`<div class="formularios-lado">${formVida(p, 'nascimento')}${formVida(p, 'morte')}</div>` : ''}
        ${formFacto(`pessoas/${id}`)}${formNotaEditor(p)}` : ''}</section>` : ''}

    ${p.tipo === 'grupo' ? seccaoMembros(p, marcas) : ''}

    <section class="seccao" id="sec-familia" data-indice="Família" data-n="${lugar.familia?.pessoas || ''}" hidden><h2>Família</h2><div id="familia"></div></section>

    ${rels.length || ed ? html`<section class="seccao" id="sec-relacoes" data-n="${rels.length}"><h2>Relações ${rels.some((r) => r.editorial) ? html`<small>✎ indicada por um contribuidor, sem fonte</small>` : ''}</h2>
      ${Object.keys(GRUPOS_REL).filter((g) => porGrupo[g]).map((g) => html`<div class="grupo-relacoes" data-grupo="${g}"><h3 style="margin:18px 0 10px">${GRUPOS_REL[g]}</h3>
        <div class="relacoes">${porGrupo[g].map((r) => html`<div class="relacao"><span class="ponto ${g}"></span><div>
          <span class="tipo">${r.sentido === 'dir' ? REL[r.tipo]?.dir : REL[r.tipo]?.inv}${marcas(r.fontes)}${marcaEditorial(r.editorial)}</span>
          <a href="#/pessoa/${r.outro}">${nomeDe(r.outro)}</a>
          ${r.tipo === 'membro_de' && r.nota ? html`<span class="nota-relacao">${r.nota}</span>` : ''}
          ${ed && (r.editorial || (r.fontes?.length && r.fontes.every((c) => c.acrescentada))) ? html`<button class="botao-nota" data-acao="retirar-relacao" data-dono="${r.sentido === 'dir' ? id : r.outro}" data-tipo="${r.tipo}"
            data-alvo="${r.sentido === 'dir' ? r.outro : id}" data-confirmar="Retirar esta relação?" title="Retirar">×</button>` : ''}</div></div>`)}</div></div>`)}
      ${ed ? formNovaRelacao(p) : ''}
    </section>` : ''}

    ${instr.length ? html`<section class="seccao" id="sec-instrumentos" data-n="${instr.length}"><h2>Instrumentos</h2><ul class="lista-simples">
      ${instr.map(({ instrumento: i, papel }) => html`<li><a href="#/instrumento/${i.id}">${i.designacao}</a>
        <span class="mudo">${papel}${i.ano ? ' · ' + i.ano : ''}</span></li>`)}</ul></section>` : ''}

    ${discos.length ? html`<section class="seccao" id="sec-gravacoes" data-n="${discos.length}"><h2>Gravações <small>por ano; sem ano no fim</small></h2><ul class="lista-simples">
      ${discos.map(({ g, ano, funcoes }) => html`<li><span class="mono mudo">${anoCurto(g)}</span>
        <a href="#/gravacao/${g.id}">${g.titulo}</a><span class="mudo">${[g.formato, g.editora, ...funcoes].filter(Boolean).join(' · ')}${ano?.factos.length
          ? html`${g.formato || g.editora || funcoes.length ? ' · ' : ''}${anoGravacaoHtml(g)}` : ''}</span></li>`)}</ul></section>` : ''}

    ${minhasObras.length ? html`<section class="seccao" id="sec-obras" data-n="${minhasObras.length}"><h2>Obras</h2><ul class="lista-simples">
      ${minhasObras.map(({ o, papeis }) => html`<li><a href="#/obra/${o.id}">${o.titulo}</a><span class="mudo">${papeis.join(' e ')}${o.ano ? ' · ' + o.ano : ''}</span></li>`)}</ul></section>` : ''}

    ${seccaoOuvir(p)}

    ${p.imagens?.length || ed ? html`<section class="seccao" id="sec-imagens" data-n="${p.imagens?.length || 0}"><h2>Imagens ${ed ? html`<small>a primeira é o retrato da ficha</small>` : ''}</h2>
      <div class="galeria">${(p.imagens || []).map((im, k) => (ed ? editavel(im, k) : figura(im)))}</div>
      ${ed && p.imagens_ocultas?.length ? html`<h3 style="margin:22px 0 10px">Imagens escondidas <small class="mudo">não aparecem no site</small></h3>
        <div class="galeria">${p.imagens_ocultas.map((im) => html`<div class="imagem-editavel oculta">${figura(im)}
          <p class="mudo">Escondida por ${nomeContribuidor(im.oculta.por)} em ${fmtData(im.oculta.data)}${im.oculta.nota ? `: ${im.oculta.nota}` : ''}</p>
          <div class="acoes"><button class="botao peq" data-acao="mostrar-imagem" data-id="${id}" data-url="${im.url}">Voltar a mostrar</button></div></div>`)}</div>` : ''}
      ${ed ? formNovaImagem(id) : ''}</section>` : ''}

    ${seccaoReferencias(p, `pessoas/${id}`)}
    ${dobraDesambiguar(seccaoDesambiguar('pessoas', p))}

    ${textos.length ? html`<section class="seccao"><h2>No blogue do arquivo <small>textos assinados que falam desta ficha</small></h2>
      <ul class="lista-simples">${textos.map((t) => html`<li><span class="mono mudo">${fmtData(t.data, true)}</span>
        <a href="#/blogue/${t.id}">${t.titulo}</a><span class="mudo">${nomeContribuidor(t.autor)}</span></li>`)}</ul></section>` : ''}

    ${comArquivo() ? html`<section class="seccao"><h2>Vídeos no arquivo que referem ${p.nome} <small>pesquisa automática pelo nome — pode incluir homónimos; confirmar no post</small></h2>
      <div class="grelha larga" id="media-arquivo"><p class="carregando">A procurar</p></div></section>

    <section class="seccao"><h2>No arquivo dos blogues <small id="n-docs"></small></h2>
      <ul class="resultados" id="docs"><li class="carregando">A procurar</li></ul></section>` : ''}
  </div>`.s;

  desenharIndice(el);
  const caixaFamilia = $('#familia', el); // guardada já: se entretanto se abrir outra ficha, a árvore não cai nela
  arvoreFamiliaDe(id).then((arv) => {
    if (!arv || !el.isConnected || !caixaFamilia?.isConnected) return; // entretanto abriu-se outra ficha: a árvore não é desta
    caixaFamilia.innerHTML = arv.s;
    $('#sec-familia', el).hidden = false;
    centrarArvore($('.arvore-caixa', caixaFamilia), id);
    // a árvore não leva às citações: a lista de família passa para debaixo dela, recolhida, com as fontes
    const grupo = $('#sec-relacoes [data-grupo="familia"]', el), lista = grupo && $('.relacoes', grupo);
    if (lista) {
      const n = lista.children.length;
      caixaFamilia.insertAdjacentHTML('beforeend', html`<details class="relacoes-recolhidas"><summary>Relações de família e fontes (${n})</summary></details>`.s);
      $('.relacoes-recolhidas', caixaFamilia).append(lista);
      grupo.remove();
      const sec = $('#sec-relacoes', el);
      sec.dataset.n = Math.max(0, +sec.dataset.n - n);
      if (!ed && !$('[data-grupo]', sec)) sec.hidden = true;
    }
    desenharIndice(el);
  }).catch(() => { /* sem biblioteca de árvores: a ficha mostra as relações em lista */ });
  if (!comArquivo()) return; // online não há cópia dos blogues para pesquisar
  // só os nomes com duas ou mais palavras: «José» ou «Isabel» soltos trariam milhares de documentos de outras pessoas
  const nomes = [p.nome, ...(p.nomes_alternativos || [])].filter((n) => termosProcura(n).length >= 2);
  // guardados já: se entretanto se mudar de página, as respostas caem em elementos que já não estão à vista
  const caixaMedia = $('#media-arquivo'), caixaDocs = $('#docs'), nDocs = $('#n-docs');
  if (!nomes.length) {
    const curto = html`<p class="mudo">Nome demasiado curto para pesquisar automaticamente.
      <a href="#/arquivo?q=${encodeURIComponent('"' + p.nome + '"')}">Pesquisar no arquivo à mão →</a></p>`;
    caixaMedia.innerHTML = curto.s;
    caixaDocs.innerHTML = html`<li>${curto}</li>`.s;
    return;
  }
  try {
    // o nome inteiro (e as variantes), nunca as palavras soltas: evita homónimos e falsos positivos
    const r = await api('media', { q: nomes.join('|'), frase: 1, tipo: 'video' });
    // um documento de cada vez (o 1.º de cada um, depois o 2.º…): uma página de canal não enche a secção sozinha
    caixaMedia.innerHTML = r.resultados.length ? html`${alternarDocumentos(r.resultados, 6).map(cartaoMediaArquivo)}
      ${r.total > 6 ? html`<p class="mais-arquivo"><a class="botao peq" href="#/mediateca?q=${encodeURIComponent(p.nome)}">Procurar «${p.nome}» na mediateca</a></p>` : ''}`.s
      : '<p class="mudo">Nenhum vídeo com este nome no texto à volta.</p>';
  } catch { caixaMedia.innerHTML = '<p class="mudo">Servidor local desligado.</p>'; }
  try {
    const q = nomes.map((n) => `"${n.replace(/"/g, '')}"`).join(' OR ');
    const r = await api('pesquisa', { q });
    nDocs.textContent = `${plural(r.total, 'documento', 'documentos')} · pesquisa automática pelo nome, pode incluir homónimos`;
    caixaDocs.innerHTML = html`${r.resultados.slice(0, 8).map((d) => html`<li class="resultado">
      <h3><a href="#/doc/${d.doc_id}?realce=${encodeURIComponent(p.nome)}">${tituloDoc(d.titulo)}</a></h3>
      <p class="meta">${fmtData(d.data, true)} · ${E.fontes[d.fonte]?.nome || d.fonte}</p>
      <p class="excerto">${marcarExcerto(d.excerto)}</p></li>`)}
      ${r.total > 8 ? html`<li style="padding-top:14px"><a class="botao" href="#/arquivo?q=${encodeURIComponent(q)}">Ver os ${r.total} documentos</a></li>` : ''}`.s;
  } catch { caixaDocs.innerHTML = '<li class="mudo">Servidor local desligado.</li>'; }
  if (caixaDocs.isConnected) desenharIndice(el); // «Nesta ficha» com quantos documentos há no arquivo
}
