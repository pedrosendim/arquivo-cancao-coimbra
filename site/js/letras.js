// Letras: as versões da letra de uma obra, os vídeos e áudios onde cada uma se canta, e a mesma música em todos os sites.
// A letra antiga (`letra_texto` da obra) mostra-se como a primeira versão, sem migrar nada; as outras estão na lista `letras`
// da obra, cada uma com fonte (uma Citação) ou testemunho assinado (✎). Cada vídeo ou áudio pode dizer que versão se canta
// nele (`letras` do media: { obra: versão }). Ver dados/ESQUEMA.md.
// Este módulo só mostra e compara o que as fichas têm: não escreve nem resume texto nenhum. As ações que gravam estão em
// edicao.js; o botão «Letra» do leitor e a folha que ele abre estão aqui, e leitor.js só os coloca e os avisa do que toca.
import { E, nomeContribuidor, visivel, catalogadosDe, chaveMedia, anoGravacao, nomeDe } from './estado.js';
import { $, $$, html, raw, fmtData, plural, termosProcura } from './util.js';
import { marcas } from './citacoes.js';
import { cartaoMediaCurado, ordenarGrupos, botaoOuvir, itemCurado, AVISO_IDENTIFICACOES } from './componentes.js';
import { camposProva, dobra } from './formularios.js';
import { editando, sessao, podeAprovar, perguntar, slug } from './edicao.js';
import { seletorFicha, escolherEm } from './seletor.js';
import { anoCurto } from './leitura.js';

/** O id da letra antiga (`letra_texto`) quando é tratada como uma versão: reservado, nenhuma versão de `letras` o usa. */
export const ID_ANTIGA = 'letra-texto';

// ------------------------------------------------------------------ versões

/** As versões da letra de uma obra: a antiga primeiro, depois as da lista. */
export function versoesDe(o) {
  const a = o?.letra_texto;
  const antiga = a?.citacao ? [{ ...a, id: ID_ANTIGA, rotulo: a.rotulo || `Publicada em ${E.fontes[a.fonte]?.nome || a.fonte}` }] : [];
  return [...antiga, ...(Array.isArray(o?.letras) ? o.letras : []).filter((l) => l?.id && l.citacao)];
}

/** Uma versão tal como está na ficha (o próprio objeto, para edicao.js a alterar). */
export const versaoDe = (o, id) => (id === ID_ANTIGA ? o.letra_texto : (o.letras || []).find((l) => l.id === id)) || null;
/** Quem escreveu uma versão no modo de edição (as tiradas das fontes pelo agente não têm autor). */
export const autorVersao = (v) => v?.editorial?.por || v?.acrescentada?.por || '';
/** Um editor pode corrigir ou retirar qualquer versão; cada autor, as suas. */
export const podeMudarVersao = (v) => podeAprovar() || (!!autorVersao(v) && autorVersao(v) === sessao()?.id);

/** O texto de uma letra, para comparar: sem maiúsculas, acentos nem pontuação. */
const chaveTexto = (t) => termosProcura(t).join(' ');

/** Junta à ficha uma versão nova e devolve o id dela. `prova`: o que a prova() de edicao.js devolveu (fonte ou testemunho). */
export function juntarVersao(o, rotulo, letra, prova) {
  rotulo = String(rotulo || '').trim();
  letra = String(letra || '').replace(/\r\n?/g, '\n').trim();
  if (!rotulo) throw new Error('Diga que versão é (por exemplo, «Como canta Luiz Goes»).');
  if (!letra) throw new Error('Escreva a letra.');
  const vs = versoesDe(o);
  const igual = vs.find((v) => chaveTexto(v.citacao) === chaveTexto(letra));
  if (igual) throw new Error(`Esta letra já está registada, como «${igual.rotulo}».`);
  const base = slug(rotulo).slice(0, 40).replace(/-+$/, '') || 'versao';
  let id = base;
  for (let k = 2; id === ID_ANTIGA || vs.some((v) => v.id === id); k++) id = `${base}-${k}`;
  const [citacao] = prova.fontes;
  (o.letras ||= []).push({ id, rotulo, ...(citacao || { citacao: letra }), ...(prova.editorial ? { editorial: prova.editorial } : {}), ...(prova.nota ? { nota: prova.nota } : {}) });
  return id;
}

/** Junta as versões da obra `b` às da obra `a` (ao juntar duas fichas): nada se perde. A mesma letra da mesma fonte fica
 *  uma só; a letra antiga de `b` entra na lista, se `a` já tiver a dela; um id repetido ganha um número. Devolve o que mudou
 *  de id ({ id em b: id em a }), para os vídeos e áudios continuarem a apontar para a versão certa. */
export function fundirVersoes(a, b) {
  const novos = {};
  const mesma = (x, y) => chaveTexto(x.citacao) === chaveTexto(y.citacao) && x.fonte === y.fonte && x.url === y.url && x.editorial?.por === y.editorial?.por;
  for (const v of versoesDe(b)) {
    if (v.id === ID_ANTIGA && a.letra_texto === b.letra_texto) continue; // `a` não tinha letra antiga: ficou com a de `b`
    const vs = versoesDe(a), igual = vs.find((x) => mesma(x, v));
    if (igual) { if (igual.id !== v.id) novos[v.id] = igual.id; continue; }
    const base = v.id === ID_ANTIGA ? slug(v.rotulo).slice(0, 40).replace(/-+$/, '') || 'versao' : v.id;
    let id = base;
    for (let k = 2; id === ID_ANTIGA || vs.some((x) => x.id === id); k++) id = `${base}-${k}`;
    (a.letras ||= []).push({ ...v, id });
    if (id !== v.id) novos[v.id] = id;
  }
  return novos;
}

// ------------------------------------------------------------------ comparar duas versões

/** Maior subsequência comum: os pares [i, j] de elementos iguais, por ordem. */
function emComum(a, b) {
  const n = a.length, m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const pares = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) pares.push([i++, j++]);
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return pares;
}

const palavras = (l) => l.split(/\s+/).filter(Boolean);
const linhasDe = (t) => String(t || '').split(/\r?\n/).map((l) => l.trim());
const corrido = (linhas) => linhas.filter(Boolean).length <= 1;

/** Quanto duas linhas se parecem, de 0 a 1, pelas palavras que têm em comum. */
function parecenca(a, b) {
  const pa = palavras(a).map(chaveTexto), pb = palavras(b).map(chaveTexto);
  return pa.length + pb.length ? (2 * emComum(pa, pb).length) / (pa.length + pb.length) : 0;
}

/** Um texto corrido (sem mudanças de linha, como vem em alguns posts) parte-se nos mesmos sítios da outra versão, só para
 *  comparar: cada palavra fica na linha da palavra igual da outra versão. Nada se acrescenta ao texto. */
function partirComo(texto, linhas) {
  const lista = palavras(texto), alvo = linhas.flatMap((l, n) => palavras(l).map((p) => ({ p: chaveTexto(p), n })));
  const par = new Map(emComum(lista.map(chaveTexto), alvo.map((x) => x.p)));
  const res = linhas.map(() => []);
  let atual = alvo[0]?.n ?? 0;
  lista.forEach((p, i) => { if (par.has(i)) atual = alvo[par.get(i)].n; res[atual].push(p); });
  // o que sobra no fim, depois da última palavra igual: se for mais do que uma linha, fica numa linha à parte
  const ultima = Math.max(-1, ...par.keys()), resto = lista.slice(ultima + 1);
  if (resto.length > (palavras(linhas.at(-1) || '').length || 8)) {
    res[atual].length -= resto.length;
    res.push(resto);
  }
  return res.map((x) => x.join(' '));
}

/** Num troço sem linhas iguais, junta as linhas parecidas lado a lado; as outras ficam só de um lado. */
function alinhar(as, bs) {
  as = as.filter(Boolean); bs = bs.filter(Boolean);
  if (as.length === bs.length) return as.map((a, i) => ({ tipo: 'difere', a, b: bs[i] }));
  const res = [];
  let j = 0;
  for (const a of as) {
    let k = j;
    while (k < bs.length && parecenca(a, bs[k]) < 0.5) k++;
    if (k === bs.length) { res.push({ tipo: 'so-a', a }); continue; }
    while (j < k) res.push({ tipo: 'so-b', b: bs[j++] });
    res.push({ tipo: 'difere', a, b: bs[j++] });
  }
  while (j < bs.length) res.push({ tipo: 'so-b', b: bs[j++] });
  return res;
}

/** Compara dois textos linha a linha, sem contar maiúsculas, acentos nem pontuação. Devolve as linhas alinhadas:
 *  { tipo: 'igual' | 'difere' | 'so-a' | 'so-b' | 'quebra', a, b } ('quebra': a linha em branco entre quadras). */
export function compararLetras(textoA, textoB) {
  let a = linhasDe(textoA), b = linhasDe(textoB);
  if (corrido(a) && !corrido(b)) a = partirComo(a.join(' '), b);
  else if (corrido(b) && !corrido(a)) b = partirComo(b.join(' '), a);
  const pares = emComum(a.map(chaveTexto), b.map(chaveTexto));
  const res = [];
  let i = 0, j = 0;
  for (const [x, y] of [...pares, [a.length, b.length]]) {
    res.push(...alinhar(a.slice(i, x), b.slice(j, y)));
    if (x < a.length) res.push(a[x] ? { tipo: 'igual', a: a[x], b: b[y] } : { tipo: 'quebra' });
    i = x + 1; j = y + 1;
  }
  return res;
}

/** As duas linhas de um par diferente, com as palavras que mudam assinaladas. */
function comMarcas(a, b) {
  const pa = palavras(a), pb = palavras(b);
  const pares = emComum(pa.map(chaveTexto), pb.map(chaveTexto));
  const pinta = (lista, iguais) => html`${lista.map((p, i) => html`${i ? ' ' : ''}${iguais.has(i) ? p : html`<mark>${p}</mark>`}`)}`;
  return [pinta(pa, new Set(pares.map((x) => x[0]))), pinta(pb, new Set(pares.map((x) => x[1])))];
}

function linhaComparada(l) {
  const celula = (lado, conteudo) => (conteudo === undefined
    ? html`<div role="cell" class="comparar-nada" data-lado="${lado}"><span class="so-leitor">esta versão não tem esta linha</span></div>`
    : html`<div role="cell" data-lado="${lado}">${conteudo}</div>`);
  if (l.tipo === 'quebra') return html`<div class="comparar-linha quebra" role="row"><div role="cell"></div><div role="cell"></div></div>`;
  const [a, b] = l.tipo === 'difere' ? comMarcas(l.a, l.b) : [l.a, l.b];
  return html`<div class="comparar-linha ${l.tipo}" role="row">${celula('1', a)}${celula('2', b)}</div>`;
}

/** O quadro de duas versões lado a lado. No telemóvel, as linhas iguais aparecem uma vez e as diferentes uma por cima da outra. */
function quadroComparacao(a, b) {
  if (a.id === b.id) return html`<p class="mudo">Escolha duas versões diferentes.</p>`;
  const linhas = compararLetras(a.citacao, b.citacao);
  const conta = (t) => linhas.filter((l) => l.tipo === t).length;
  const difere = conta('difere'), soUma = conta('so-a') + conta('so-b');
  return html`<p class="comparar-resumo">${difere || soUma ? [difere && plural(difere, 'linha diferente', 'linhas diferentes'),
    soUma && `${plural(soUma, 'linha', 'linhas')} só numa das versões`].filter(Boolean).join(' · ') : 'O texto das duas versões é igual.'}</p>
    <div class="comparar-grelha" role="table" aria-label="Comparação de duas versões da letra">
      <div class="comparar-linha comparar-titulos" role="row"><div role="columnheader" data-lado="1">${a.rotulo}</div><div role="columnheader" data-lado="2">${b.rotulo}</div></div>
      ${linhas.map(linhaComparada)}</div>`;
}

function blocoComparar(vs) {
  const opcoes = (sel) => vs.map((v) => html`<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${v.rotulo}</option>`);
  return html`<details class="letra-comparar"><summary>Comparar versões</summary>
    <div class="linha-campos"><label>Primeira versão <select class="campo" data-comparar="a">${opcoes(vs[0].id)}</select></label>
      <label>Segunda versão <select class="campo" data-comparar="b">${opcoes(vs[1].id)}</select></label></div>
    <div data-comparacao aria-live="polite">${quadroComparacao(vs[0], vs[1])}</div>
    <p class="mudo letra-nota">Compara linha a linha, sem contar maiúsculas, acentos nem pontuação; as palavras que mudam ficam assinaladas.
      Um texto escrito sem mudanças de linha parte-se nos mesmos sítios do outro, só para comparar.</p></details>`;
}

// ------------------------------------------------------------------ interpretações: a mesma música em todos os sites

/** Os vídeos e áudios de uma obra: os ligados a ela e os das faixas dela, cada ficha uma só vez. */
function mediaDaObra(id) {
  const fichas = new Map((E.mediaDeObra[id] || []).map((m) => [m.id, m]));
  for (const { faixa } of E.faixasDeObra[id] || []) {
    for (const x of faixa.media || []) if (E.por.media[x] && visivel(E.por.media[x])) fichas.set(x, E.por.media[x]);
  }
  return [...fichas.values()];
}

/** A nota da ficha diz que não é a gravação daquele disco: fica à parte, por muito que a ficha aponte para o disco. */
const OUTRA_ATUACAO = /n[ãa]o [ée] a grava[çc][ãa]o/i;

/** Junta as fichas por interpretação, para cada grupo mostrar os sites todos num só cartão, sem repetir endereços: o mesmo
 *  disco (uma ficha por plataforma), o mesmo endereço, ou, sem disco, o mesmo título e as mesmas pessoas noutra plataforma
 *  (duas fichas da mesma plataforma podem ser atuações diferentes e ficam em cartões separados). Só arruma a apresentação. */
function interpretacoes(lista, obra) {
  const pai = new Map();
  const raiz = (k) => { if (!pai.has(k)) pai.set(k, k); while (pai.get(k) !== k) k = pai.get(k); return k; };
  const vistos = new Map();
  for (const m of lista) {
    const chaves = [`e:${chaveMedia(m)}`];
    const discos = new Set([m.gravacao, ...(E.faixasDeMedia?.[m.id] || []).filter((x) => x.faixa.obra === obra).map((x) => x.gravacao.id)].filter((g) => E.por.gravacoes[g]));
    if (OUTRA_ATUACAO.test(m.nota || '')) { /* só o endereço */ }
    else if (discos.size) chaves.push(...[...discos].map((g) => `d:${g}`));
    else {
      const base = `t:${chaveTexto(m.titulo)}|${[...(m.pessoas || [])].sort().join(',')}`, plataforma = `${base}|${chaveMedia(m).split('|')[0]}`;
      vistos.set(plataforma, (vistos.get(plataforma) || 0) + 1);
      chaves.push(`${base}|${vistos.get(plataforma)}`);
    }
    for (const k of chaves.slice(1)) pai.set(raiz(k), raiz(chaves[0]));
  }
  const grupos = new Map();
  for (const m of lista) {
    const k = raiz(`e:${chaveMedia(m)}`);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(m);
  }
  return [...grupos.values()];
}

/** «Interpretações» da página da obra, e os discos da obra sem nada para ouvir. */
export function seccaoInterpretacoes(o) {
  const lista = mediaDaObra(o.id);
  const grupos = ordenarGrupos(interpretacoes(lista, o.id));
  const comMedia = new Set(lista.flatMap((m) => [m.gravacao, ...(E.faixasDeMedia?.[m.id] || []).map((x) => x.gravacao.id)]));
  const semMedia = [...new Map((E.faixasDeObra[o.id] || []).filter(({ gravacao: g }) => !comMedia.has(g.id)).map(({ gravacao: g }) => [g.id, g])).values()]
    .sort((a, b) => (anoGravacao(a)?.ano ?? 9999) - (anoGravacao(b)?.ano ?? 9999));
  return html`${grupos.length ? html`<section class="seccao"><h2>Interpretações <small>cada uma com os sites onde se pode ouvir ou ver</small></h2>
      <p class="aviso-identificacoes">${AVISO_IDENTIFICACOES}</p>
      <div class="grelha larga">${grupos.map((g) => cartaoMediaCurado(g))}</div></section>` : ''}
    ${semMedia.length ? html`<section class="seccao"><h2>Noutros discos <small>sem vídeo nem áudio disponível; por ano, sem ano no fim</small></h2><ul class="lista-simples">
      ${semMedia.map((g) => html`<li><span class="mono mudo">${anoCurto(g)}</span><a href="#/gravacao/${g.id}">${g.titulo}</a>
        <span class="mudo">${(g.interpretes || []).map((i) => nomeDe(i.pessoa)).join(', ')}</span></li>`)}</ul></section>` : ''}`;
}

/** Os vídeos e áudios onde se canta esta versão (por interpretação, com o botão de cada site). */
function cantadaEm(o, v) {
  const lista = mediaDaObra(o.id).filter((m) => m.letras?.[o.id] === v.id);
  if (!lista.length) return '';
  const linha = (g) => {
    const vistos = new Set();
    const itens = g.filter((m) => { const k = chaveMedia(m); return !vistos.has(k) && vistos.add(k); }).map(itemCurado);
    return html`<li><span>${g[0].titulo || itens[0].url}</span><span class="letra-sites">${itens.map(botaoOuvir)}</span></li>`;
  };
  return html`<div class="letra-cantada"><h3>Cantada em</h3><ul class="lista-simples">${ordenarGrupos(interpretacoes(lista, o.id)).map((g) => linha(g))}</ul></div>`;
}

// ------------------------------------------------------------------ a letra na página da obra

/** De onde vem a versão: a fonte, com as marcas de citação, ou o ✎ de quem a escreveu. */
function origemVersao(v) {
  const a = v.acrescentada, t = v.editorial;
  return html`${v.fonte ? html`<p class="citacao-rodape">Transcrita literalmente de ${E.fontes[v.fonte]?.nome || v.fonte}${marcas([v])}${a ? html` · acrescentada por ${nomeContribuidor(a.por)}` : ''}</p>` : ''}
    ${t ? html`<p class="citacao-rodape letra-testemunho"><span class="marca-editorial">✎</span> Escrita por ${nomeContribuidor(t.por)} em ${fmtData(t.data)}${t.nota ? ` (${t.nota})` : ''}.
      É um testemunho assinado, não é fonte.</p>` : ''}
    ${v.nota ? html`<p class="citacao-rodape">Nota: ${v.nota}</p>` : ''}
    ${(v.notas_editoriais || []).filter((n) => !n.oculta).map((n) => html`<p class="citacao-rodape"><span class="nota-editorial">✎ ${nomeContribuidor(n.por)}: ${n.texto}</span></p>`)}`;
}

/** Os campos de uma versão nova, no formulário da obra e na janela do vídeo. `exemplo`: quem a canta, para o texto de ajuda. */
const camposVersao = (exemplo = 'Luiz Goes') => html`<label>Que versão é? <small>um nome curto: quem a canta, o ano, o que tem de diferente</small>
    <input class="campo" name="rotulo" required placeholder="Ex.: Como canta ${exemplo}"></label>
  <label>A letra <small>o texto completo: um verso em cada linha e uma linha em branco entre as quadras</small>
    <textarea class="campo campo-letra" name="texto" rows="14" required></textarea></label>
  ${camposProva({ semFrase: true })}`;

function formNovaVersao(o) {
  return dobra('ed-letra', '+ Acrescentar uma versão da letra', html`<form class="caixa-edicao" data-acao="nova-letra">
    <input type="hidden" name="alvo" value="obras/${o.id}">
    ${camposVersao()}
    <div class="acoes"><button class="botao peq primario">Acrescentar esta versão</button></div></form>`);
}

/** No modo de edição, quem pode: corrigir (o texto continua no mesmo sítio, num formulário) ou retirar a versão. */
function acoesVersao(o, v) {
  if (!editando() || !podeMudarVersao(v)) return '';
  const meu = autorVersao(v) === sessao()?.id;
  return html`<div class="letra-acoes">${dobra(`ed-letra-${v.id}`, '✎ Corrigir esta versão', html`<form class="caixa-edicao" data-acao="corrigir-letra">
      <input type="hidden" name="obra" value="${o.id}"><input type="hidden" name="versao" value="${v.id}">
      <label>Que versão é? <input class="campo" name="rotulo" required value="${v.rotulo}"></label>
      <label>A letra ${v.fonte ? html`<small>tem fonte: o texto tem de continuar igual ao da fonte (o validador confere-o)</small>` : ''}
        <textarea class="campo campo-letra" name="texto" rows="14" required>${v.citacao}</textarea></label>
      ${meu ? '' : html`<label>O que corrigiu e porquê <small>fica assinado por si, por baixo da versão</small><input class="campo" name="motivo" required></label>`}
      <div class="acoes"><button class="botao peq primario">Guardar a correção</button></div></form>`, { lembrar: false })}
    <p><button type="button" class="botao peq" data-acao="retirar-letra" data-obra="${o.id}" data-versao="${v.id}" data-confirmar="Retirar a versão «${v.rotulo}»?"
      ${meu ? '' : raw('data-pedir="Porque retira esta versão? (o motivo fica no histórico)" data-pedir-campo="motivo"')}>Retirar esta versão</button></p></div>`;
}

const botaoVersao = (v, atual, atributo) => html`<button type="button" class="ficha" ${raw(atributo)}="${v.id}" aria-pressed="${String(v.id === atual)}">${v.rotulo}</button>`;

/** A secção «Letra» da obra: uma escolha simples da versão, a letra com a fonte ou o ✎, onde se canta, e comparar versões. */
export function seccaoLetra(o, pedida = '') {
  const vs = versoesDe(o);
  if (!vs.length && !editando()) return '';
  const atual = vs.find((v) => v.id === pedida)?.id || vs[0]?.id;
  return html`<section class="seccao seccao-letra" id="letra" data-obra="${o.id}"><h2>Letra ${vs.length > 1 ? html`<small>${vs.length} versões</small>` : ''}</h2>
    ${vs.length > 1 ? html`<div class="fichas letra-versoes" role="group" aria-label="Versões da letra">${vs.map((v) => botaoVersao(v, atual, 'data-letra-versao'))}</div>` : ''}
    ${vs.map((v) => html`<div class="letra-painel" data-versao="${v.id}" ${v.id === atual ? '' : raw('hidden')}>
      ${vs.length === 1 && v.id !== ID_ANTIGA ? html`<p class="letra-rotulo">${v.rotulo}</p>` : ''}
      <div class="letra">${v.citacao}</div>${origemVersao(v)}${cantadaEm(o, v)}${acoesVersao(o, v)}</div>`)}
    ${vs.length > 1 ? blocoComparar(vs) : ''}
    ${!vs.length ? html`<p class="mudo">Esta obra ainda não tem letra no arquivo.</p>` : ''}
    ${editando() ? formNovaVersao(o) : ''}</section>`;
}

// ------------------------------------------------------------------ «Letra» num cartão de vídeo ou áudio (modo de edição)

/** As obras de uma ficha de media: as dela e as das faixas onde está. */
const obrasDoMedia = (m) => [...(m.obras || []), ...(E.faixasDeMedia?.[m.id] || []).map((x) => x.faixa.obra)].filter((o) => E.por.obras[o]);

/** O botão do cartão: diz quantas versões tem a obra deste vídeo, e ✓ se já tem a letra ligada. Com o mesmo vídeo em várias
 *  fichas (ou uma interpretação em vários sites), a ligação grava-se em todas. */
export function botaoLetraMedia(fichas) {
  const lista = [].concat(fichas).filter(Boolean);
  const n = [...new Set(lista.flatMap(obrasDoMedia))].reduce((s, o) => s + versoesDe(E.por.obras[o]).length, 0);
  const ligada = lista.some((m) => Object.keys(m.letras || {}).length);
  return html`<button type="button" class="botao peq" data-letra-media="${lista.map((m) => m.id).join(',')}"
    title="Dizer que música e que letra se ouve aqui">Letra${n ? ` (${n})` : ''}${ligada ? ' ✓' : ''}</button>`;
}

/** Grava pelo caminho de todos os formulários do modo de edição (o «submit» de um form[data-acao], ver edicao.js), que trata
 *  da proposta, do «Vai ficar assim», de recarregar os dados e de redesenhar a página. Devolve { gravado } ou { erro };
 *  sem nenhum dos dois, a pessoa voltou atrás em «Vai ficar assim». */
function gravarPeloFormulario(acao, dados) {
  return new Promise((resolver) => {
    const f = document.createElement('form');
    f.hidden = true;
    f.dataset.acao = acao;
    for (const [k, v] of Object.entries(dados)) f.append(Object.assign(document.createElement('input'), { type: 'hidden', name: k, value: v ?? '' }));
    const fim = (r) => { vigia.disconnect(); document.removeEventListener('gravado', gravado); f.remove(); resolver(r); };
    const gravado = (e) => { if (e.detail?.acao === acao) fim({ gravado: true }); };
    const vigia = new MutationObserver(() => {
      if (!f.getAttribute('aria-busy')) fim({ erro: $$('.erros-gravacao p, .erros-gravacao li', f).map((x) => x.textContent.replace(/^Não foi gravado\.\s*/, '').trim()).join(' ') });
    });
    vigia.observe(f, { attributes: true, attributeFilter: ['aria-busy'] });
    document.addEventListener('gravado', gravado);
    document.body.append(f);
    f.requestSubmit();
  });
}

/** O início de uma letra, para reconhecer a versão na lista. */
const inicioDe = (t) => { const p = palavras(String(t)).slice(0, 9).join(' '); return `${p}…`; };

function zonaVersoes(o, vs, ligada) {
  const opcao = (valor, rotulo, detalhe) => html`<label class="opcao letra-opcao"><input type="radio" name="versao" value="${valor}" ${valor === ligada ? 'checked' : ''}>
    <span>${rotulo}${detalhe ? html`<small>${detalhe}</small>` : ''}</span></label>`;
  return html`<fieldset class="letra-escolha"><legend>Que letra se canta aqui? <small>${vs.length ? plural(vs.length, 'versão registada', 'versões registadas') : 'esta obra ainda não tem letra'}</small></legend>
      ${vs.map((v) => opcao(v.id, v.rotulo, inicioDe(v.citacao)))}
      ${opcao('nova', '+ Acrescentar uma versão nova')}
      ${opcao('', vs.length ? 'Não escolher nenhuma versão' : 'Deixar sem letra, por agora')}</fieldset>
    <div class="letra-campos" data-letra-campos></div>`;
}

/** O que a janela faz enquanto se escolhe: a obra mostra as versões dela, «versão nova» mostra os campos. `v`: o que já
 *  estava escrito, quando a janela volta a abrir (não foi gravado, ou voltou atrás em «Vai ficar assim»). */
function ligarJanela(d, fichas, v) {
  const form = $('form', d), zona = $('[data-letra-versoes]', d), sim = $('button[value=sim]', d), caixa = $('[data-seletor-pessoa]', d);
  const exemplo = nomeDe(fichas[0].pessoas?.[0]) || undefined;
  const nova = () => form.elements.qual.value === 'nova';
  const obra = () => (nova() ? null : E.por.obras[form.elements.obra.value]);
  const acertar = () => {
    $('[data-letra-existente]', d).hidden = nova();
    $('[data-letra-nova-obra]', d).hidden = !nova();
    sim.disabled = !(nova() ? form.elements.titulo_obra.value.trim() : obra());
  };
  const campos = () => {
    const c = $('[data-letra-campos]', zona);
    if (!c) return;
    const quer = $('input[name=versao]:checked', zona)?.value === 'nova';
    if (quer && !c.firstElementChild) c.innerHTML = camposVersao(exemplo).s;
    if (!quer) c.innerHTML = '';
  };
  const desenhar = (versao) => {
    const o = obra();
    zona.innerHTML = o || nova() ? zonaVersoes(o, versoesDe(o), versao ?? fichas.map((m) => m.letras?.[o?.id]).find(Boolean) ?? '').s : '';
    campos();
    acertar();
  };
  d.addEventListener('escolha', () => desenhar());
  d.addEventListener('change', (e) => { if (e.target.name === 'qual') desenhar(); else if (e.target.name === 'versao') campos(); });
  // (o seletor apaga a escolha no «input» do documento, depois deste: daí o setTimeout)
  d.addEventListener('input', () => setTimeout(() => { if (!nova() && !obra()) zona.innerHTML = ''; acertar(); }));
  d.addEventListener('click', (e) => { const b = e.target.closest('[data-obra-rapida]'); if (b) escolherEm(caixa, { id: b.dataset.obraRapida }); });
  if (v.qual === 'nova') form.elements.qual.value = 'nova';
  if (v.obra) escolherEm(caixa, { id: v.obra });
  desenhar(v.versao);
  for (const el of form.elements) { // (depois de desenhar: os campos da versão nova só agora existem)
    if (!el.name || !(el.name in v) || el.closest('[data-seletor-pessoa]')) continue;
    if (el.type === 'radio') el.checked = el.value === v[el.name]; else el.value = v[el.name];
  }
  acertar();
}

function pedirLetra(fichas, v, erro) {
  const m = fichas[0], obras = [...new Set(fichas.flatMap(obrasDoMedia))];
  // o título da obra nova parte do título do vídeo: o que estiver entre «», ou o que vem antes de « — Intérprete»
  const titulo = (String(m.titulo || '').match(/«([^»]+)»/)?.[1] || String(m.titulo || '').split(/\s[—–-]\s/)[0]).trim();
  const resposta = perguntar({ titulo: 'Letra deste vídeo ou áudio', classe: 'dialogo-letra', sim: 'Gravar', corpo: html`
    ${erro ? html`<div class="erros-gravacao" role="alert"><p><b>Não foi gravado.</b> ${erro}</p></div>` : ''}
    <p class="mudo">${m.titulo || m.url}</p>
    <fieldset class="letra-escolha"><legend>Que música se canta aqui?</legend>
      <label class="opcao letra-opcao"><input type="radio" name="qual" value="existente" checked> <span>Uma obra que já está no arquivo</span></label>
      <label class="opcao letra-opcao"><input type="radio" name="qual" value="nova"> <span>Uma obra nova</span></label></fieldset>
    <div data-letra-existente>
      ${obras.length > 1 ? html`<p class="fichas">${obras.map((o) => html`<button type="button" class="ficha" data-obra-rapida="${o}">${E.por.obras[o].titulo}</button>`)}</p>` : ''}
      ${seletorFicha('obras', { nome: 'obra', nomeNova: 'obra_por_criar', valor: obras[0] || '', rotulo: 'Obra' })}</div>
    <label data-letra-nova-obra hidden>Título da obra nova <small>vem do título do vídeo: corrija-o se for preciso. A ficha fica assinada por si.</small>
      <input class="campo" name="titulo_obra" value="${titulo}"></label>
    <div data-letra-versoes></div>` });
  ligarJanela($('dialog.dialogo-letra'), fichas, v);
  return resposta;
}

/** «Letra», num cartão: a janela, e gravar. Se não gravar (ou se voltar atrás em «Vai ficar assim»), a janela volta com tudo o que se escreveu. */
async function abrirJanela(ids) {
  const fichas = ids.split(',').map((id) => E.por.media[id]).filter(Boolean);
  if (!fichas.length) return;
  let valores = {}, erro = '';
  for (;;) {
    const r = await pedirLetra(fichas, valores, erro);
    if (!r) return;
    const fim = await gravarPeloFormulario('ligar-letra', { ...r, media: ids });
    if (fim.gravado) return;
    valores = r; erro = fim.erro || '';
  }
}

// ------------------------------------------------------------------ a letra no leitor: um botão e uma folha, sem parar a música

/** O que há para ler do que está a tocar: [{ obra, versoes, ligada }], primeiro as obras com a versão ligada a este vídeo.
 *  Conta todas as fichas do mesmo vídeo ou áudio (uma por disco) e as faixas onde está. */
export function letrasDoItem(it) {
  if (!it) return [];
  const fichas = [...new Set([E.por.media[it.id], ...catalogadosDe(it)].filter(Boolean))];
  const ligadas = Object.assign({}, ...fichas.map((m) => (m.letras && typeof m.letras === 'object' ? m.letras : {})));
  return [...new Set([...Object.keys(ligadas), ...fichas.flatMap(obrasDoMedia)])].map((id) => E.por.obras[id]).filter(Boolean)
    .map((obra) => ({ obra, versoes: versoesDe(obra), ligada: ligadas[obra.id] || '' })).filter((x) => x.versoes.length)
    .sort((a, b) => !!b.ligada - !!a.ligada);
}

let noLeitor = null, chaveLeitor = '', folhaAberta = false, escolha = {};
const folha = () => $('#folha-letra');

function desenharFolha() {
  const opcoes = letrasDoItem(noLeitor), el = folha();
  if (!opcoes.length) { fecharFolha(); return; }
  const x = opcoes.find((o) => o.obra.id === escolha.obra) || opcoes[0];
  const v = x.versoes.find((w) => w.id === escolha.versao) || x.versoes.find((w) => w.id === x.ligada) || x.versoes[0];
  el.innerHTML = html`<button type="button" class="fechar" data-fechar-letra aria-label="Fechar a letra">×</button>
    <p class="sobretitulo">Letra</p><h2 id="folha-letra-titulo">${x.obra.titulo}</h2>
    ${opcoes.length > 1 ? html`<div class="fichas letra-versoes" role="group" aria-label="Obras neste vídeo ou áudio">${opcoes.map((o) => html`<button type="button" class="ficha"
      data-folha-obra="${o.obra.id}" aria-pressed="${String(o === x)}">${o.obra.titulo}</button>`)}</div>` : ''}
    ${x.versoes.length > 1 ? html`<div class="fichas letra-versoes" role="group" aria-label="Versões da letra">${x.versoes.map((w) => botaoVersao(w, v.id, 'data-folha-versao'))}</div>`
      : v.id !== ID_ANTIGA ? html`<p class="letra-rotulo">${v.rotulo}</p>` : ''}
    ${x.ligada && x.ligada === v.id ? html`<p class="letra-aqui">É a versão que se canta aqui.</p>` : ''}
    <div class="letra">${v.citacao}</div>${origemVersao(v)}
    <p class="folha-letra-obra"><a class="botao peq" href="#/obra/${x.obra.id}?versao=${v.id}">Ver a obra: versões e interpretações</a></p>`.s;
}

function abrirFolha() {
  const el = folha();
  folhaAberta = true;
  $('#leitor')?.classList.remove('expandido'); // no ecrã grande do leitor não sobrava espaço para ler
  desenharFolha();
  if (!folhaAberta) return;
  el.hidden = false;
  el.scrollTop = 0;
  $('#leitor-letra')?.setAttribute('aria-expanded', 'true');
  el.focus({ preventScroll: true });
}

function fecharFolha() {
  const el = folha();
  if (!el) return;
  const dentro = el.contains(document.activeElement);
  folhaAberta = false;
  el.hidden = true;
  $('#leitor-letra')?.setAttribute('aria-expanded', 'false');
  if (dentro) $('#leitor-letra:not([hidden])')?.focus({ preventScroll: true });
}

/** O leitor diz o que tem (null: nada). O botão só aparece se houver letra; com a folha aberta, a letra acompanha a música. */
export function mostrarLetraDe(it) {
  const k = it ? `${it.plataforma}|${it.chave}` : '', mudou = k !== chaveLeitor;
  if (mudou) { chaveLeitor = k; escolha = {}; }
  noLeitor = it || null;
  const b = $('#leitor-letra');
  if (!b) return;
  b.hidden = !letrasDoItem(noLeitor).length;
  if (folhaAberta && (b.hidden || mudou)) { if (b.hidden) fecharFolha(); else { desenharFolha(); folha().scrollTop = 0; } }
}

/** Liga o botão do leitor. Depois de gravar ou de mudar de página, os dados e as marcas de citação são outros: volta a ver-se tudo. */
export function iniciarFolhaLetra() {
  $('#leitor-letra').onclick = () => (folhaAberta ? fecharFolha() : abrirFolha());
  new MutationObserver(() => { mostrarLetraDe(noLeitor); if (folhaAberta) desenharFolha(); }).observe($('.moldura'), { childList: true });
}

// ------------------------------------------------------------------ cliques e escolhas (delegados: as páginas redesenham-se)

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const janela = e.target.closest('[data-letra-media]');
    if (janela) { e.preventDefault(); abrirJanela(janela.dataset.letraMedia); return; }
    const versao = e.target.closest('[data-letra-versao]');
    if (versao) {
      const s = versao.closest('.seccao-letra');
      $$('[data-letra-versao]', s).forEach((b) => b.setAttribute('aria-pressed', String(b === versao)));
      $$('.letra-painel', s).forEach((p) => { p.hidden = p.dataset.versao !== versao.dataset.letraVersao; });
      return;
    }
    if (e.target.closest('[data-fechar-letra]')) { fecharFolha(); return; }
    const folhaVersao = e.target.closest('[data-folha-versao]'), folhaObra = e.target.closest('[data-folha-obra]');
    if (folhaVersao || folhaObra) {
      escolha = folhaObra ? { obra: folhaObra.dataset.folhaObra } : { ...escolha, versao: folhaVersao.dataset.folhaVersao };
      desenharFolha();
      folha().scrollTop = 0;
    }
  });
  document.addEventListener('change', (e) => {
    const lado = e.target.closest?.('[data-comparar]');
    if (!lado) return;
    const s = lado.closest('.seccao-letra'), vs = versoesDe(E.por.obras[s.dataset.obra]);
    const ver = (k) => vs.find((v) => v.id === $(`[data-comparar=${k}]`, s).value);
    $('[data-comparacao]', s).innerHTML = quadroComparacao(ver('a'), ver('b')).s;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && folhaAberta && !e.target.closest?.('#paleta, #lightbox, dialog') && !$('#painel.aberto')) fecharFolha();
  });
  window.addEventListener('hashchange', fecharFolha);
}
