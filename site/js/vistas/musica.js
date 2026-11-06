// Discografia (gravações) e Obras (peças, letras e interpretações comparadas).
import { E, nomeDe, visivel, comArquivo, FORMATOS, GENEROS, nomeContribuidor } from '../estado.js';
import { $, html, raw, esc, norm, debounce, definirParams, classificar, miniatura, plural, NOME_PLATAFORMA, fmtData } from '../util.js';
import { marcas, blocoCitacao } from '../citacoes.js';
import { cartaoMediaCurado, itemCurado, dadosItem, figuraImagem, vazioCurado, tabelaFactos, ligacaoFonte, imagemCartao } from '../componentes.js';
import { filtroMultiplo } from '../filtros.js';
import { editando } from '../edicao.js';
import { botaoNova, botaoCorrigir, formFacto, seccaoReferencias, botaoNovoMedia, dobraDesambiguar } from '../fichas.js';
import { naoConfundir, seccaoDesambiguar } from '../desambiguar.js';
import { botaoHistorico } from '../historico.js';
import { botaoRevisao, barraRevisao } from '../revisao.js';
import { naoEncontrada, semResultados } from './procurar.js';
// leitura das fichas de disco, obra e instrumento: selo de revisão, partilhar e citar, ano dos discos a partir dos factos
import { seloRevisao, botoesPartilha, anoGravacaoHtml } from '../leitura.js';
import { anoGravacao as anoDeDisco } from '../estado.js';
// listas: procura sem acentos e por qualquer ordem, filtros com os valores que existem nos dados
import { opcoesDosDados, rotuloDe, tiposInstrumento, coincideCampos } from '../estado.js';
import { $$, termosProcura, temTodas, compararPt } from '../util.js';
import { definirEscolhidos } from '../filtros.js';
// media (P4): ouvir um disco ou comparar interpretações sem repetidos; cartões agrupados
import { botaoOuvir, itensDoDisco, itensDaObra, cartoesMedia } from '../componentes.js';
// letras: as versões da letra de uma obra e a mesma música em todos os sites
import { seccaoLetra, seccaoInterpretacoes, versoesDe } from '../letras.js';

const factosSimples = tabelaFactos;

/** Opções de um filtro com os valores que existem nos dados, com quantas há de cada; os que o dicionário de nomes não
 *  tem também entram, com o próprio valor por nome (ex.: «Valsa»), para nenhuma ficha ficar fora dos filtros. */
const opcoesCom = (nomes, lista, campo) => opcoesDosDados(lista, campo, nomes);
const textoTotal = (n, [um, varios], q) => `${plural(n, um, varios)}${q.trim() ? ` com «${q.trim()}»` : ''}`;
const lerLista = (v) => (v || '').split(',').filter(Boolean);

function botoesMedia(ids) {
  const itens = (ids || []).map((id) => E.por.media[id]).filter((m) => m && visivel(m)).map(itemCurado);
  return itens.map(botaoOuvir); // P4: o que não toca aqui (RTP) é uma ligação para o site original
}

const NOME_LIGACAO = { spotify: 'Spotify', youtube: 'YouTube', discogs: 'Discogs', musicbrainz: 'MusicBrainz', soundcloud: 'SoundCloud', 'apple-music': 'Apple Music' };
// plataformas onde se pode procurar uma faixa: a pesquisa abre lá, e o resultado é a própria plataforma que o dá
const PROCURAR = [
  ['spotify', 'Spotify', (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`],
  ['apple-music', 'Apple Music', (q) => `https://music.apple.com/pt/search?term=${encodeURIComponent(q)}`],
  ['youtube-music', 'YouTube Music', (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`],
  ['soundcloud', 'SoundCloud', (q) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}`],
];

/** Onde se pode procurar uma faixa nas plataformas em que ainda não há ligação direta. Diz «procurar»: o arquivo não sabe se lá está. */
function procurarFaixa(f, g) {
  const tem = new Set((f.media || []).map((id) => E.por.media[id]?.plataforma));
  const faltam = PROCURAR.filter(([k]) => !tem.has(k === 'youtube-music' ? 'youtube' : k));
  if (!faltam.length) return '';
  const titulo = f.titulo || E.por.obras[f.obra]?.titulo || '';
  const quem = (g.interpretes || []).map((i) => nomeDe(i.pessoa)).filter(Boolean)[0] || '';
  const q = `${titulo} ${quem}`.trim();
  return html`<details class="procurar-faixa"><summary title="Abre a pesquisa da plataforma; o arquivo ainda não confirmou se a faixa lá está">Procurar</summary>
    <div>${faltam.map(([, nome, url]) => html`<a href="${url(q)}" target="_blank" rel="noopener">${nome} ↗</a>`)}</div></details>`;
}

function capaGravacao(g, preguicosa = true) { // na lista, a capa só se descarrega perto do ecrã; no topo do disco, logo
  const url = g.capa?.url;
  return url ? html`<div class="retrato" style="aspect-ratio:1">${imagemCartao(miniatura(url, 500), { preguicosa })}</div>`
    : html`<div class="retrato" style="aspect-ratio:1;font-size:34px">${FORMATOS[g.formato] || '♪'}</div>`;
}

export function discografia(el, params) {
  const todas = E.base.gravacoes;
  if (!todas.length) {
    el.innerHTML = html`<div class="conteudo"><header class="cabecalho"><p class="sobretitulo">Música</p><h1>Discografia</h1></header>${vazioCurado('gravações')}</div>`.s;
    return;
  }
  let q = params.q || '', formatos = lerLista(params.formato);
  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Música</p><h1>Discografia</h1>
      <p class="lead">Discos de 78 rpm, EP, LP, CD, gravações de rádio e televisão e registos inéditos.</p>
      ${editando() ? html`<p class="acoes-lista">${botaoNova('gravacoes')}</p>` : ''}</header>
    <div class="barra-filtros"><input class="campo" type="search" id="q" placeholder="Título, faixa, intérprete, editora…" aria-label="Procurar na discografia" value="${q}">
      ${filtroMultiplo({ id: 'formato', todos: 'Todos os formatos', unidade: ['formato', 'formatos'], opcoes: opcoesCom(FORMATOS, todas, 'formato'), escolhidos: formatos })}</div>
    <p class="mudo total-lista" id="total" aria-live="polite"></p>
    <h2 class="so-leitor">Lista de gravações</h2>
    <div class="grelha" id="grelha"></div></div>`.s;
  const desenhar = () => {
    const termos = termosProcura(q);
    // o texto procura-se no título, editora, referência e intérpretes (cada um à parte, ou as palavras em vários, ver
    // coincideCampos), e também nas faixas (título da faixa ou da obra): um disco que só coincide por uma faixa diz qual
    const faixaDe = new Map();
    const comTexto = (g) => {
      if (coincideCampos([g.titulo, g.editora, g.referencia, ...(g.interpretes || []).map((i) => nomeDe(i.pessoa))], termos)) return true;
      const f = (g.faixas || []).find((x) => [x.titulo, E.por.obras[x.obra]?.titulo].some((t) => t && temTodas(t, termos)));
      if (f) faixaDe.set(g.id, f.titulo || E.por.obras[f.obra]?.titulo);
      return !!f;
    };
    const lista = todas.filter((g) => (!formatos.length || formatos.includes(g.formato)) && comTexto(g))
      .sort((a, b) => (anoDeDisco(a)?.ano ?? 9999) - (anoDeDisco(b)?.ano ?? 9999)); // sem «ano», o dos factos datados
    const audiveis = (g) => (g.faixas || []).filter((f) => (f.media || []).some((m) => E.por.media[m] && visivel(E.por.media[m]))).length;
    $('#grelha').innerHTML = html`${lista.map((g) => html`<a class="cartao" href="#/gravacao/${g.id}">${capaGravacao(g)}
      <div class="cartao-corpo"><p class="meta">${[anoDeDisco(g)?.texto, FORMATOS[g.formato], g.editora].filter(Boolean).join(' · ')}</p>
      <h3>${g.titulo}</h3><p class="resumo">${(g.interpretes || []).map((i) => nomeDe(i.pessoa)).join(', ')}</p>
      ${faixaDe.has(g.id) ? html`<p class="meta faixa-achada">faixa: ${faixaDe.get(g.id)}</p>` : ''}
      ${g.faixas?.length ? html`<p class="meta" style="margin-top:auto">${audiveis(g) ? html`<span class="selo ouro">▶ ${audiveis(g)}/${g.faixas.length} faixas</span>` : html`${g.faixas.length} faixas`}</p>` : ''}</div></a>`)}`.s
      || semResultados(q, 'Nenhuma gravação').s;
    $('#total').textContent = textoTotal(lista.length, ['gravação', 'gravações'], q);
    definirParams({ q, formato: formatos.join(',') });
  };
  $('#q').oninput = debounce((e) => { q = e.target.value; desenhar(); }, 150);
  $('#formato').addEventListener('filtro', (e) => { formatos = e.detail; desenhar(); });
  desenhar();
}

export function gravacao(el, id) {
  const g = E.por.gravacoes[id];
  if (!g && E.juntadas.gravacoes?.[id]) { location.replace(`#/gravacao/${E.juntadas.gravacoes[id]}`); return; }
  if (!g) { naoEncontrada(el, 'gravacoes', id); return; }
  const spotify = g.ligacoes?.spotify && classificar(g.ligacoes.spotify);
  const todosMedia = (g.faixas || []).flatMap((f) => f.media || []);
  // vídeos e áudios ligados a este disco («Disco a que pertence») sem estarem numa faixa: também se mostram aqui (P5a)
  const doDisco = E.base.media.filter((m) => m.gravacao === g.id && !todosMedia.includes(m.id) && visivel(m));
  const ano = anoGravacaoHtml(g); // sem «ano» no disco, o dos factos datados, nas palavras da fonte e com as marcas
  el.innerHTML = html`<div class="conteudo">${barraRevisao('gravacoes', g)}
    <header class="ficha-topo">${capaGravacao(g, false)}<div>
      <p class="sobretitulo">${[FORMATOS[g.formato], g.editora, g.referencia].filter(Boolean).join(' · ')}</p>
      <h1>${g.titulo}</h1>${ano || g.local ? html`<p class="anos">${ano}${ano && g.local ? ', ' : ''}${g.local || ''}</p>` : ''}
      <p>${(g.interpretes || []).map((i, k) => html`${k ? ' · ' : ''}<a href="#/pessoa/${i.pessoa}">${nomeDe(i.pessoa)}</a>${i.funcao ? html` <span class="mudo">(${i.funcao})</span>` : ''}`)}</p>
      ${naoConfundir('gravacoes', g)}
      ${g.editorial ? html`<p class="alt">✎ Ficha criada por ${nomeContribuidor(g.editorial.por)} em ${fmtData(g.editorial.data)}.</p>` : ''}
      ${seloRevisao(g)}
      <div class="acoes-topo">${botoesPartilha(g.titulo, g.estado_revisao)}
        ${botaoCorrigir('gravacoes', g.id)}${botaoHistorico('gravacoes', g.id)}${botaoRevisao('gravacoes', g)}${botaoNovoMedia({ gravacao: g.id })}
        ${todosMedia.length && itensDoDisco(g).length ? html`<button class="botao primario" data-fila="${raw(dadosItem(itensDoDisco(g)))}"
          title="As faixas pela ordem do disco; numa faixa com vários vídeos ou áudios, entram todos (o que avança sozinho primeiro)">Ouvir o disco</button>` : ''}
        ${Object.entries(g.ligacoes || {}).filter(([, u]) => u).map(([k, u]) => html`<a class="botao" href="${u}" target="_blank" rel="noopener">${NOME_LIGACAO[k] || k} ↗</a>`)}
      </div></div></header>
    ${spotify ? html`<section class="seccao"><iframe style="width:100%;height:352px;border:0;border-radius:12px" src="https://open.spotify.com/embed/${spotify.chave}" title="Spotify: ${g.titulo}" loading="lazy" allow="encrypted-media"></iframe></section>` : ''}
    ${g.faixas?.length ? html`<section class="seccao"><h2>Faixas</h2><ul class="lista-simples">${g.faixas.map((f) => html`<li>
      <span class="mono mudo">${f.n || ''}</span>${f.obra ? html`<a href="#/obra/${f.obra}">${f.titulo || E.por.obras[f.obra]?.titulo}</a>` : f.titulo}
      <span class="ouvir-faixa">${botoesMedia(f.media)}${procurarFaixa(f, g)}</span></li>`)}</ul></section>` : ''}
    ${doDisco.length ? html`<section class="seccao"><h2>Vídeos e áudios deste disco <small>ligados ao disco, sem a faixa indicada</small></h2>${cartoesMedia(doDisco)}</section>` : ''}
    ${g.factos?.length || editando() ? html`<section class="seccao"><h2>Factos</h2>${factosSimples(g.factos, { editar: editando() && `gravacoes/${g.id}` })}
      ${editando() ? formFacto(`gravacoes/${g.id}`) : ''}</section>` : ''}
    ${seccaoReferencias(g, `gravacoes/${g.id}`)}
    ${dobraDesambiguar(seccaoDesambiguar('gravacoes', g))}
    ${g.fontes?.length ? html`<section class="seccao biografia estreito"><h2>Fontes</h2>${g.fontes.filter((c) => c.citacao).map(blocoCitacao)}</section>` : ''}
  </div>`.s;
}

export function listaObras(el, params) {
  const todas = E.base.obras;
  if (!todas.length) {
    el.innerHTML = html`<div class="conteudo"><header class="cabecalho"><p class="sobretitulo">Música</p><h1>Obras e letras</h1></header>${vazioCurado('obras')}</div>`.s;
    return;
  }
  let q = params.q || '', generos = lerLista(params.genero), comLetra = params.letra === '1';
  const nComLetra = todas.filter((o) => versoesDe(o).length).length;
  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Música</p><h1>Obras e letras</h1>
      ${editando() ? html`<p class="acoes-lista">${botaoNova('obras')}</p>` : ''}
      <p class="lead">Fados, baladas, serenatas e guitarradas. Em cada obra: autores, letra (quando a fonte a publica) e
        todas as interpretações catalogadas, para comparar lado a lado.</p></header>
    <div class="barra-filtros"><input class="campo" type="search" id="q" placeholder="Título ou autor" aria-label="Procurar nas obras" value="${q}">
      ${filtroMultiplo({ id: 'genero', todos: 'Todos os géneros', unidade: ['género', 'géneros'], opcoes: opcoesCom(GENEROS, todas, 'genero'), escolhidos: generos })}
      <button type="button" class="ficha" id="com-letra" aria-pressed="${String(comLetra)}">Com letra<span class="n">${nComLetra}</span></button></div>
    <p class="mudo total-lista" id="total" aria-live="polite"></p>
    <ul class="lista-simples" id="lista"></ul></div>`.s;
  const desenhar = () => {
    const termos = termosProcura(q);
    const lista = todas.filter((o) => (!generos.length || generos.includes(o.genero)) && (!comLetra || versoesDe(o).length) && coincideCampos([o.titulo, ...(o.titulos_alternativos || []),
      ...(o.musica || []).map(nomeDe), ...(o.letra || []).map(nomeDe)], termos));
    $('#lista').innerHTML = html`${lista.map((o) => {
      const n = (E.faixasDeObra[o.id] || []).length + (E.mediaDeObra[o.id] || []).length, versoes = versoesDe(o).length;
      return html`<li><a href="#/obra/${o.id}" style="font:600 20px var(--f-titulo)">${o.titulo}</a>
        <span class="mudo">${[rotuloDe(GENEROS, o.genero), (o.musica || []).map(nomeDe).join(', '), o.ano].filter(Boolean).join(' · ')}</span>
        ${versoes ? html`<span class="selo">${versoes > 1 ? `letra: ${versoes} versões` : 'letra'}</span>` : ''}${n ? html`<span class="selo ouro">${plural(n, 'interpretação', 'interpretações')}</span>` : ''}</li>`;
    })}`.s || html`<li>${semResultados(q, 'Nenhuma obra')}</li>`.s;
    $('#total').textContent = textoTotal(lista.length, ['obra', 'obras'], q);
    definirParams({ q, genero: generos.join(','), letra: comLetra ? '1' : '' });
  };
  $('#q').oninput = debounce((e) => { q = e.target.value; desenhar(); }, 150);
  $('#genero').addEventListener('filtro', (e) => { generos = e.detail; desenhar(); });
  $('#com-letra').onclick = (e) => { comLetra = !comLetra; e.currentTarget.setAttribute('aria-pressed', String(comLetra)); desenhar(); };
  desenhar();
}

export function obra(el, id, params = {}) {
  const o = E.por.obras[id];
  if (!o && E.juntadas.obras?.[id]) { location.replace(`#/obra/${E.juntadas.obras[id]}`); return; }
  if (!o) { naoEncontrada(el, 'obras', id); return; }
  const itens = itensDaObra(id); // P4: uma por endereço (o mesmo vídeo noutro disco não se repete), só o que toca aqui
  el.innerHTML = html`<div class="conteudo estreito">${barraRevisao('obras', o)}
    <header class="cabecalho"><p class="sobretitulo">${GENEROS[o.genero] || 'Obra'}${o.ano ? ' · ' + o.ano : ''}</p><h1>${o.titulo}</h1>
      ${o.titulos_alternativos?.length ? html`<p class="mudo">Também: ${o.titulos_alternativos.join('; ')}</p>` : ''}
      <p class="lead">${o.musica?.length ? html`Música: ${o.musica.map((p, k) => html`${k ? ', ' : ''}<a href="#/pessoa/${p}">${nomeDe(p)}</a>`)}` : ''}
        ${o.letra?.length ? html`<br>Letra: ${o.letra.map((p, k) => html`${k ? ', ' : ''}<a href="#/pessoa/${p}">${nomeDe(p)}</a>`)}` : ''}</p>
      ${naoConfundir('obras', o)}
      ${o.editorial ? html`<p class="alt">✎ Ficha criada por ${nomeContribuidor(o.editorial.por)} em ${fmtData(o.editorial.data)}.</p>` : ''}
      ${seloRevisao(o)}
      <div class="acoes-topo">${botoesPartilha(o.titulo, o.estado_revisao)}${botaoCorrigir('obras', o.id)}${botaoHistorico('obras', o.id)}${botaoRevisao('obras', o)}${botaoNovoMedia({ obras: [o.id] })}
        ${itens.length > 1 ? html`<button class="botao primario" data-fila="${raw(dadosItem(itens))}">Comparar as ${itens.length} interpretações em sequência</button>` : ''}</div>
    </header>
    ${seccaoLetra(o, params.versao)}
    ${o.factos?.length || editando() ? html`<section class="seccao"><h2>Factos</h2>${factosSimples(o.factos, { editar: editando() && `obras/${o.id}` })}
      ${editando() ? formFacto(`obras/${o.id}`) : ''}</section>` : ''}
    ${seccaoReferencias(o, `obras/${o.id}`)}
    ${dobraDesambiguar(seccaoDesambiguar('obras', o))}
    ${seccaoInterpretacoes(o)}
    ${o.fontes?.length ? html`<section class="seccao biografia"><h2>Fontes</h2>${o.fontes.filter((c) => c.citacao).map(blocoCitacao)}</section>` : ''}
    ${comArquivo() ? html`<section class="seccao"><a class="botao" href="#/arquivo?q=${encodeURIComponent('"' + o.titulo + '"')}">Pesquisar «${o.titulo}» no arquivo</a>
      <a class="botao" href="#/mediateca?q=${encodeURIComponent(o.titulo)}">Procurar vídeos no arquivo</a></section>` : ''}
  </div>`.s;
  if (params.versao) requestAnimationFrame(() => $('#letra', el)?.scrollIntoView()); // veio de uma versão (da folha do leitor, ou acabada de gravar)
}

export function listaInstrumentos(el, params) {
  const todos = E.base.instrumentos;
  const luthiers = E.base.pessoas.filter((p) => p.papeis?.includes('luthier'));
  if (!todos.length && !luthiers.length) {
    el.innerHTML = html`<div class="conteudo"><header class="cabecalho"><p class="sobretitulo">Música</p><h1>Instrumentos e luthiers</h1>
      <p class="lead">Guitarras de Coimbra, violas e os construtores que as fizeram.</p>
      ${editando() ? html`<p class="acoes-lista">${botaoNova('instrumentos')}</p>` : ''}</header>${vazioCurado('instrumentos')}
      <p style="margin-top:18px"><a class="botao" href="#/mediateca?separador=imagens&q=guitarra">Ver imagens de guitarras no arquivo</a></p></div>`.s;
    return;
  }
  // tipos tal como estão nas fichas (não os do formulário); os que só têm um instrumento ficam juntos em «Outros»
  const tipos = tiposInstrumento(), proprios = tipos.filter((t) => t.n > 1), outros = tipos.filter((t) => t.n === 1);
  const opcoesTipo = [...proprios, ...(outros.length ? [{ valor: 'outros', nome: 'Outros', n: outros.length }] : [])];
  const valorDe = (i) => termosProcura(i.tipo || '').join('-');
  const doTipo = (i) => escolhidos.has(valorDe(i)) || (escolhidos.has('outros') && outros.some((t) => t.valor === valorDe(i)));
  let q = params.q || '', escolhidos = new Set(lerLista(params.tipo)), ordem = params.ordem || 'ano';
  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Música</p><h1>Instrumentos e luthiers</h1>
      <p class="lead">Guitarras de Coimbra, violas e os construtores que as fizeram — com fotografias publicadas nas fontes.</p>
      ${editando() ? html`<p class="acoes-lista">${botaoNova('instrumentos')}</p>` : ''}
      ${todos.length && luthiers.length ? html`<p class="acoes-lista"><button type="button" class="botao peq" id="ir-luthiers">Luthiers (${luthiers.length}) ↓</button></p>` : ''}</header>
    ${todos.length ? html`<section class="seccao"><h2>Instrumentos <small>${todos.length}</small></h2>
      <div class="barra-filtros"><input class="campo" type="search" id="q" placeholder="Designação, construtor ou quem a tocou" aria-label="Procurar nos instrumentos" value="${q}">
        <select class="campo" id="ordem" aria-label="Ordem"><option value="ano">Por ano</option><option value="nome">Ordem alfabética</option></select>
        <div class="filtro-telemovel">${filtroMultiplo({ id: 'tipo-lista', todos: 'Todos os tipos', unidade: ['tipo', 'tipos'], opcoes: opcoesTipo, escolhidos: [...escolhidos] })}</div></div>
      <div class="fichas filtro-computador" id="tipos" style="margin:-8px 0 22px">
        <button class="ficha" data-tipo="" aria-pressed="${String(!escolhidos.size)}">Todos<span class="n">${todos.length}</span></button>
        ${opcoesTipo.map((t) => html`<button class="ficha" data-tipo="${t.valor}" aria-pressed="${String(escolhidos.has(t.valor))}"
          ${t.valor === 'outros' ? raw(`title="${esc(outros.map((o) => o.nome).join(', '))}"`) : ''}>${t.nome}<span class="n">${t.n}</span></button>`)}
      </div>
      <p class="mudo total-lista" id="total" aria-live="polite"></p>
      <div class="grelha" id="grelha"></div></section>` : ''}
    ${luthiers.length ? html`<section class="seccao" id="luthiers"><h2>Luthiers <small>${luthiers.length}</small></h2><ul class="lista-simples">
      ${luthiers.map((p) => html`<li><a href="#/pessoa/${p.id}" style="font:600 20px var(--f-titulo)">${p.nome}</a>
        <span class="mudo">${plural((E.instrumentosDe[p.id] || []).filter((x) => x.papel === 'construiu').length, 'instrumento catalogado', 'instrumentos catalogados')}</span></li>`)}</ul></section>` : ''}
    <p style="margin-top:24px"><a class="botao" href="#/mediateca?separador=imagens&q=guitarra">Ver todas as imagens de guitarras no arquivo</a></p>
  </div>`.s;
  if ($('#ir-luthiers')) $('#ir-luthiers').onclick = () => $('#luthiers').scrollIntoView();
  if (!todos.length) return;
  $('#ordem').value = ordem;

  const desenhar = () => {
    const termos = termosProcura(q);
    const campos = (i) => [i.designacao, i.tipo, i.construtor && nomeDe(i.construtor), ...(i.proprietarios || []).map((p) => nomeDe(p.pessoa))];
    const ano = (i) => +(String(i.ano || '').match(/\d{4}/)?.[0] || 9999); // sem ano, no fim
    const lista = todos.filter((i) => (!escolhidos.size || doTipo(i)) && coincideCampos(campos(i), termos))
      .sort((a, b) => (ordem === 'nome' ? 0 : ano(a) - ano(b)) || compararPt(a.designacao, b.designacao));
    $('#grelha').innerHTML = html`${lista.map((i) => html`<a class="cartao" href="#/instrumento/${i.id}">
        ${i.imagens?.[0] ? html`<div class="retrato" style="aspect-ratio:3/4">${imagemCartao(miniatura(i.imagens[0].url, 500))}</div>` : html`<div class="retrato" style="aspect-ratio:3/4">◈</div>`}
        <div class="cartao-corpo"><p class="meta">${[i.tipo, i.ano].filter(Boolean).join(' · ')}</p><h3>${i.designacao}</h3>
        ${i.construtor ? html`<p class="resumo">Construída por ${nomeDe(i.construtor)}</p>` : ''}</div></a>`)}`.s || semResultados(q, 'Nenhum instrumento').s;
    $('#total').textContent = textoTotal(lista.length, ['instrumento', 'instrumentos'], q);
    definirParams({ q, tipo: [...escolhidos].join(','), ordem: ordem === 'ano' ? '' : ordem });
  };
  // os botões (computador) e a lista que abre (telemóvel) mostram sempre a mesma escolha
  const mostrarTipos = () => {
    $$('#tipos [data-tipo]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tipo ? escolhidos.has(b.dataset.tipo) : !escolhidos.size));
    definirEscolhidos($('#tipo-lista'), [...escolhidos]);
  };
  $('#q').oninput = debounce((e) => { q = e.target.value; desenhar(); }, 150);
  $('#ordem').onchange = (e) => { ordem = e.target.value; desenhar(); };
  $('#tipos').onclick = (e) => {
    const b = e.target.closest('[data-tipo]'); if (!b) return;
    const k = b.dataset.tipo;
    if (!k) escolhidos.clear(); else if (escolhidos.has(k)) escolhidos.delete(k); else escolhidos.add(k);
    mostrarTipos();
    desenhar();
  };
  $('#tipo-lista').addEventListener('filtro', (e) => { escolhidos = new Set(e.detail); mostrarTipos(); desenhar(); });
  desenhar();
}

export function instrumento(el, id) {
  const i = E.por.instrumentos[id];
  if (!i && E.juntadas.instrumentos?.[id]) { location.replace(`#/instrumento/${E.juntadas.instrumentos[id]}`); return; }
  if (!i) { naoEncontrada(el, 'instrumentos', id); return; }
  el.innerHTML = html`<div class="conteudo">${barraRevisao('instrumentos', i)}
    <header class="cabecalho"><p class="sobretitulo">${[i.tipo, i.ano].filter(Boolean).join(' · ')}</p><h1>${i.designacao}</h1>
      ${i.construtor ? html`<p class="lead">Construtor: <a href="#/pessoa/${i.construtor}">${nomeDe(i.construtor)}</a></p>` : ''}
      ${i.editorial ? html`<p class="alt">✎ Ficha criada por ${nomeContribuidor(i.editorial.por)} em ${fmtData(i.editorial.data)}.</p>` : ''}
      ${seloRevisao(i)}
      <div class="acoes-topo">${botoesPartilha(i.designacao, i.estado_revisao)}${botaoCorrigir('instrumentos', i.id)}${botaoHistorico('instrumentos', i.id)}${botaoRevisao('instrumentos', i)}</div></header>
    ${i.imagens?.length ? html`<div class="galeria">${i.imagens.map((im) => figuraImagem(im.url, im.legenda, ligacaoFonte(im.fontes?.[0])))}</div>` : ''}
    ${i.proprietarios?.length ? html`<section class="seccao"><h2>Quem a tocou ou possuiu</h2><ul class="lista-simples">
      ${i.proprietarios.map((p) => html`<li><a href="#/pessoa/${p.pessoa}">${nomeDe(p.pessoa)}</a><span class="mudo">${p.periodo || ''}</span>${marcas(p.fontes)}</li>`)}</ul></section>` : ''}
    ${i.factos?.length || editando() ? html`<section class="seccao"><h2>Características e história</h2>${factosSimples(i.factos, { editar: editando() && `instrumentos/${i.id}` })}
      ${editando() ? formFacto(`instrumentos/${i.id}`) : ''}</section>` : ''}
    ${seccaoReferencias(i, `instrumentos/${i.id}`)}
    ${i.fontes?.length ? html`<section class="seccao biografia estreito"><h2>Fontes</h2>${i.fontes.filter((c) => c.citacao).map(blocoCitacao)}</section>` : ''}
  </div>`.s;
}
