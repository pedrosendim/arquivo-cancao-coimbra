// Discografia (gravações) e Obras (peças, letras e interpretações comparadas).
import { E, nomeDe, visivel, comArquivo } from '../estado.js';
import { $, html, raw, esc, norm, debounce, definirParams, classificar, miniatura, plural, NOME_PLATAFORMA } from '../util.js';
import { marcas, blocoCitacao } from '../citacoes.js';
import { cartaoMediaCurado, itemCurado, dadosItem, figuraImagem, vazioCurado, tabelaFactos, ligacaoFonte } from '../componentes.js';
import { filtroMultiplo } from '../filtros.js';

const FORMATOS = { cilindro: 'Cilindro', 'disco de massa': 'Disco de massa', '78rpm': '78 rpm', EP: 'EP', LP: 'LP', single: 'Single',
  CD: 'CD', cassete: 'Cassete', radio: 'Rádio', televisao: 'Televisão', inedito: 'Inédito', digital: 'Digital' };
const GENEROS = { fado: 'Fado', balada: 'Balada', cancao: 'Canção', serenata: 'Serenata', guitarrada: 'Guitarrada',
  variacoes: 'Variações', estudo: 'Estudo', outro: 'Outro' };

const factosSimples = tabelaFactos;

/** Opções de um filtro a partir de um dicionário de nomes: só as que existem, com quantas há de cada. */
function opcoesCom(nomes, lista, campo) {
  const n = {};
  for (const x of lista) if (x[campo]) n[x[campo]] = (n[x[campo]] || 0) + 1;
  return Object.entries(nomes).filter(([k]) => n[k]).map(([k, nome]) => ({ valor: k, nome, n: n[k] }));
}
const lerLista = (v) => (v || '').split(',').filter(Boolean);

function botoesMedia(ids) {
  const itens = (ids || []).map((id) => E.por.media[id]).filter((m) => m && visivel(m)).map(itemCurado);
  return itens.map((it) => html`<button class="botao peq" data-tocar="${raw(dadosItem(it))}">▶ ${NOME_PLATAFORMA[it.plataforma] || 'Ouvir'}</button>`);
}

function capaGravacao(g) {
  const url = g.capa?.url;
  return url ? html`<div class="retrato" style="aspect-ratio:1;background-image:url('${raw(esc(miniatura(url, 500)))}')"></div>`
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
      <p class="lead">Discos de 78 rpm, EP, LP, CD, gravações de rádio e televisão e registos inéditos.</p></header>
    <div class="barra-filtros"><input class="campo" type="search" id="q" placeholder="Título, intérprete, editora…" value="${q}">
      ${filtroMultiplo({ id: 'formato', todos: 'Todos os formatos', unidade: ['formato', 'formatos'], opcoes: opcoesCom(FORMATOS, todas, 'formato'), escolhidos: formatos })}</div>
    <div class="grelha" id="grelha"></div></div>`.s;
  const desenhar = () => {
    const nq = norm(q);
    const lista = todas.filter((g) => (!formatos.length || formatos.includes(g.formato)) && (!nq || norm([g.titulo, g.editora, g.referencia,
      ...(g.interpretes || []).map((i) => nomeDe(i.pessoa))].join(' ')).includes(nq)))
      .sort((a, b) => (a.ano || '9999').localeCompare(b.ano || '9999'));
    const audiveis = (g) => (g.faixas || []).filter((f) => (f.media || []).some((m) => E.por.media[m] && visivel(E.por.media[m]))).length;
    $('#grelha').innerHTML = html`${lista.map((g) => html`<a class="cartao" href="#/gravacao/${g.id}">${capaGravacao(g)}
      <div class="cartao-corpo"><p class="meta">${[g.ano, FORMATOS[g.formato], g.editora].filter(Boolean).join(' · ')}</p>
      <h3>${g.titulo}</h3><p class="resumo">${(g.interpretes || []).map((i) => nomeDe(i.pessoa)).join(', ')}</p>
      ${g.faixas?.length ? html`<p class="meta" style="margin-top:auto">${audiveis(g) ? html`<span class="selo ouro">▶ ${audiveis(g)}/${g.faixas.length} faixas</span>` : html`${g.faixas.length} faixas`}</p>` : ''}</div></a>`)}`.s
      || '<p class="mudo">Sem resultados.</p>';
    definirParams({ q, formato: formatos.join(',') });
  };
  $('#q').oninput = debounce((e) => { q = e.target.value; desenhar(); }, 150);
  $('#formato').addEventListener('filtro', (e) => { formatos = e.detail; desenhar(); });
  desenhar();
}

export function gravacao(el, id) {
  const g = E.por.gravacoes[id];
  if (!g) { el.innerHTML = '<div class="conteudo"><h1>Gravação não encontrada</h1></div>'; return; }
  const spotify = g.ligacoes?.spotify && classificar(g.ligacoes.spotify);
  const todosMedia = (g.faixas || []).flatMap((f) => f.media || []);
  el.innerHTML = html`<div class="conteudo">
    <header class="ficha-topo">${capaGravacao(g)}<div>
      <p class="sobretitulo">${[FORMATOS[g.formato], g.editora, g.referencia].filter(Boolean).join(' · ')}</p>
      <h1>${g.titulo}</h1><p class="anos">${[g.ano, g.local].filter(Boolean).join(', ')}</p>
      <p>${(g.interpretes || []).map((i, k) => html`${k ? ' · ' : ''}<a href="#/pessoa/${i.pessoa}">${nomeDe(i.pessoa)}</a>${i.funcao ? html` <span class="mudo">(${i.funcao})</span>` : ''}`)}</p>
      <div class="acoes-topo">
        ${todosMedia.length ? html`<button class="botao primario" data-fila="${raw(dadosItem(todosMedia.map((m) => E.por.media[m]).filter((x) => x && visivel(x)).map(itemCurado)))}">Ouvir o disco</button>` : ''}
        ${Object.entries(g.ligacoes || {}).filter(([, u]) => u).map(([k, u]) => html`<a class="botao" href="${u}" target="_blank" rel="noopener">${k} ↗</a>`)}
      </div></div></header>
    ${spotify ? html`<section class="seccao"><iframe style="width:100%;height:352px;border:0;border-radius:12px" src="https://open.spotify.com/embed/${spotify.chave}" loading="lazy" allow="encrypted-media"></iframe></section>` : ''}
    ${g.faixas?.length ? html`<section class="seccao"><h2>Faixas</h2><ul class="lista-simples">${g.faixas.map((f) => html`<li>
      <span class="mono mudo">${f.n || ''}</span>${f.obra ? html`<a href="#/obra/${f.obra}">${f.titulo || E.por.obras[f.obra]?.titulo}</a>` : f.titulo}
      <span style="margin-left:auto;display:flex;gap:6px">${botoesMedia(f.media)}</span></li>`)}</ul></section>` : ''}
    ${g.factos?.length ? html`<section class="seccao"><h2>Factos</h2>${factosSimples(g.factos)}</section>` : ''}
    ${g.fontes?.length ? html`<section class="seccao biografia estreito"><h2>Fontes</h2>${g.fontes.filter((c) => c.citacao).map(blocoCitacao)}</section>` : ''}
  </div>`.s;
}

export function listaObras(el, params) {
  const todas = E.base.obras;
  if (!todas.length) {
    el.innerHTML = html`<div class="conteudo"><header class="cabecalho"><p class="sobretitulo">Música</p><h1>Obras e letras</h1></header>${vazioCurado('obras')}</div>`.s;
    return;
  }
  let q = params.q || '', generos = lerLista(params.genero);
  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Música</p><h1>Obras e letras</h1>
      <p class="lead">Fados, baladas, serenatas e guitarradas. Em cada obra: autores, letra (quando a fonte a publica) e
        todas as interpretações catalogadas, para comparar lado a lado.</p></header>
    <div class="barra-filtros"><input class="campo" type="search" id="q" placeholder="Título ou autor" value="${q}">
      ${filtroMultiplo({ id: 'genero', todos: 'Todos os géneros', unidade: ['género', 'géneros'], opcoes: opcoesCom(GENEROS, todas, 'genero'), escolhidos: generos })}</div>
    <ul class="lista-simples" id="lista"></ul></div>`.s;
  const desenhar = () => {
    const nq = norm(q);
    const lista = todas.filter((o) => (!generos.length || generos.includes(o.genero)) && (!nq || norm([o.titulo, ...(o.titulos_alternativos || []),
      ...(o.musica || []).map(nomeDe), ...(o.letra || []).map(nomeDe)].join(' ')).includes(nq)));
    $('#lista').innerHTML = html`${lista.map((o) => {
      const n = (E.faixasDeObra[o.id] || []).length + (E.mediaDeObra[o.id] || []).length;
      return html`<li><a href="#/obra/${o.id}" style="font:600 20px var(--f-titulo)">${o.titulo}</a>
        <span class="mudo">${[GENEROS[o.genero], (o.musica || []).map(nomeDe).join(', '), o.ano].filter(Boolean).join(' · ')}</span>
        ${o.letra_texto ? html`<span class="selo">letra</span>` : ''}${n ? html`<span class="selo ouro">${plural(n, 'interpretação', 'interpretações')}</span>` : ''}</li>`;
    })}`.s;
    definirParams({ q, genero: generos.join(',') });
  };
  $('#q').oninput = debounce((e) => { q = e.target.value; desenhar(); }, 150);
  $('#genero').addEventListener('filtro', (e) => { generos = e.detail; desenhar(); });
  desenhar();
}

export function obra(el, id) {
  const o = E.por.obras[id];
  if (!o) { el.innerHTML = '<div class="conteudo"><h1>Obra não encontrada</h1></div>'; return; }
  const faixas = E.faixasDeObra[id] || [];
  const media = E.mediaDeObra[id] || [];
  const itens = [...media.map(itemCurado), ...faixas.flatMap((f) => (f.faixa.media || []).map((m) => E.por.media[m]).filter((x) => x && visivel(x)).map(itemCurado))];
  el.innerHTML = html`<div class="conteudo estreito">
    <header class="cabecalho"><p class="sobretitulo">${GENEROS[o.genero] || 'Obra'}${o.ano ? ' · ' + o.ano : ''}</p><h1>${o.titulo}</h1>
      ${o.titulos_alternativos?.length ? html`<p class="mudo">Também: ${o.titulos_alternativos.join('; ')}</p>` : ''}
      <p class="lead">${o.musica?.length ? html`Música: ${o.musica.map((p, k) => html`${k ? ', ' : ''}<a href="#/pessoa/${p}">${nomeDe(p)}</a>`)}` : ''}
        ${o.letra?.length ? html`<br>Letra: ${o.letra.map((p, k) => html`${k ? ', ' : ''}<a href="#/pessoa/${p}">${nomeDe(p)}</a>`)}` : ''}</p>
      ${itens.length > 1 ? html`<div class="acoes-topo"><button class="botao primario" data-fila="${raw(dadosItem(itens))}">Comparar as ${itens.length} interpretações em sequência</button></div>` : ''}
    </header>
    ${o.letra_texto ? html`<section class="seccao"><h2>Letra</h2><div class="letra">${o.letra_texto.citacao}</div>
      <p class="citacao-rodape">Transcrita literalmente de ${E.fontes[o.letra_texto.fonte]?.nome || o.letra_texto.fonte}${marcas([o.letra_texto])}</p></section>` : ''}
    ${o.factos?.length ? html`<section class="seccao"><h2>Factos</h2>${factosSimples(o.factos)}</section>` : ''}
    ${faixas.length ? html`<section class="seccao"><h2>Gravações</h2><ul class="lista-simples">${faixas.map(({ gravacao: g, faixa }) => html`<li>
      <span class="mono mudo">${g.ano || '—'}</span><a href="#/gravacao/${g.id}">${g.titulo}</a>
      <span class="mudo">${(g.interpretes || []).map((i) => nomeDe(i.pessoa)).join(', ')}</span>
      <span style="margin-left:auto;display:flex;gap:6px">${botoesMedia(faixa.media)}</span></li>`)}</ul></section>` : ''}
    ${media.length ? html`<section class="seccao"><h2>Interpretações em vídeo e áudio</h2><div class="grelha larga">${media.map(cartaoMediaCurado)}</div></section>` : ''}
    ${o.fontes?.length ? html`<section class="seccao biografia"><h2>Fontes</h2>${o.fontes.filter((c) => c.citacao).map(blocoCitacao)}</section>` : ''}
    ${comArquivo() ? html`<section class="seccao"><a class="botao" href="#/arquivo?q=${encodeURIComponent('"' + o.titulo + '"')}">Pesquisar «${o.titulo}» no arquivo</a>
      <a class="botao" href="#/mediateca?q=${encodeURIComponent(o.titulo)}">Procurar vídeos no arquivo</a></section>` : ''}
  </div>`.s;
}

export function listaInstrumentos(el, params) {
  const todos = E.base.instrumentos;
  const luthiers = E.base.pessoas.filter((p) => p.papeis?.includes('luthier'));
  if (!todos.length && !luthiers.length) {
    el.innerHTML = html`<div class="conteudo"><header class="cabecalho"><p class="sobretitulo">Música</p><h1>Instrumentos e luthiers</h1>
      <p class="lead">Guitarras de Coimbra, violas e os construtores que as fizeram.</p></header>${vazioCurado('instrumentos')}
      <p style="margin-top:18px"><a class="botao" href="#/mediateca?separador=imagens&q=guitarra">Ver imagens de guitarras no arquivo</a></p></div>`.s;
    return;
  }
  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Música</p><h1>Instrumentos e luthiers</h1>
      <p class="lead">Guitarras de Coimbra, violas e os construtores que as fizeram — com fotografias publicadas nas fontes.</p></header>
    ${todos.length ? html`<section class="seccao"><h2>Instrumentos <small>${todos.length}</small></h2><div class="grelha">
      ${todos.map((i) => html`<a class="cartao" href="#/instrumento/${i.id}">
        ${i.imagens?.[0] ? html`<div class="retrato" style="aspect-ratio:3/4;background-image:url('${raw(esc(miniatura(i.imagens[0].url, 500)))}')"></div>` : html`<div class="retrato" style="aspect-ratio:3/4">◈</div>`}
        <div class="cartao-corpo"><p class="meta">${[i.tipo, i.ano].filter(Boolean).join(' · ')}</p><h3>${i.designacao}</h3>
        ${i.construtor ? html`<p class="resumo">Construída por ${nomeDe(i.construtor)}</p>` : ''}</div></a>`)}</div></section>` : ''}
    ${luthiers.length ? html`<section class="seccao"><h2>Luthiers <small>${luthiers.length}</small></h2><ul class="lista-simples">
      ${luthiers.map((p) => html`<li><a href="#/pessoa/${p.id}" style="font:600 20px var(--f-titulo)">${p.nome}</a>
        <span class="mudo">${plural((E.instrumentosDe[p.id] || []).filter((x) => x.papel === 'construiu').length, 'instrumento catalogado', 'instrumentos catalogados')}</span></li>`)}</ul></section>` : ''}
    <p style="margin-top:24px"><a class="botao" href="#/mediateca?separador=imagens&q=guitarra">Ver todas as imagens de guitarras no arquivo</a></p>
  </div>`.s;
}

export function instrumento(el, id) {
  const i = E.por.instrumentos[id];
  if (!i) { el.innerHTML = '<div class="conteudo"><h1>Instrumento não encontrado</h1></div>'; return; }
  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">${[i.tipo, i.ano].filter(Boolean).join(' · ')}</p><h1>${i.designacao}</h1>
      ${i.construtor ? html`<p class="lead">Construtor: <a href="#/pessoa/${i.construtor}">${nomeDe(i.construtor)}</a></p>` : ''}</header>
    ${i.imagens?.length ? html`<div class="galeria">${i.imagens.map((im) => figuraImagem(im.url, im.legenda, ligacaoFonte(im.fontes?.[0])))}</div>` : ''}
    ${i.proprietarios?.length ? html`<section class="seccao"><h2>Quem a tocou ou possuiu</h2><ul class="lista-simples">
      ${i.proprietarios.map((p) => html`<li><a href="#/pessoa/${p.pessoa}">${nomeDe(p.pessoa)}</a><span class="mudo">${p.periodo || ''}</span>${marcas(p.fontes)}</li>`)}</ul></section>` : ''}
    ${i.factos?.length ? html`<section class="seccao"><h2>Características e história</h2>${factosSimples(i.factos)}</section>` : ''}
    ${i.fontes?.length ? html`<section class="seccao biografia estreito"><h2>Fontes</h2>${i.fontes.filter((c) => c.citacao).map(blocoCitacao)}</section>` : ''}
  </div>`.s;
}
