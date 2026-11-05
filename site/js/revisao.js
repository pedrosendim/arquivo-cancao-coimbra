// Revisão das fichas. O que o agente escreve (e as fichas criadas por contribuidores) fica «rascunho» até um editor
// a rever e a marcar como revista. Aqui estão o botão, igual em todos os tipos de ficha, e a fila de revisão de
// «Por validar»: as fichas por rever, as mais documentadas primeiro, abertas uma a uma com «Revista, seguinte» e
// «Saltar». A gravação é a ação «revisao» de edicao.js, que só os editores podem usar.
import { E, CAMPOS, nomeContribuidor } from './estado.js';
import { html, raw, fmtData, plural, compararPt, enderecoSeguro } from './util.js';
import { editando, podeAprovar, sessao } from './edicao.js';
import { ESPECIES } from './fichas.js';

export const TIPOS_REVISAO = ['pessoas', 'obras', 'gravacoes', 'instrumentos', 'media'];
export const NOMES_REVISAO = { pessoas: 'Pessoas e grupos', obras: 'Obras', gravacoes: 'Discos', instrumentos: 'Instrumentos', media: 'Vídeos e áudios' };

/** Quanto há para conferir numa ficha: as mais documentadas revêem-se primeiro (e aparecem primeiro em «Por validar»). */
export const riqueza = (x) => (x.factos?.length || 0) + (x.biografia?.length || 0) * 2 + (x.relacoes?.length || 0) + (x.imagens?.length || 0)
  + (x.fontes?.length || 0) + (x.faixas?.length || 0);

export const revista = (x) => x?.estado_revisao === 'revisto';

/** A ficha tem alguma contribuição assinada por esta pessoa (criação, facto, fonte acrescentada, nota, revisão…)?
 *  É o filtro «Só o que eu fiz» de «Por validar» e da fila de revisão. */
export function assinadaPor(x, eu) {
  if (Array.isArray(x)) return x.some((y) => assinadaPor(y, eu));
  if (!x || typeof x !== 'object') return false;
  if ([x.por, x.revisto_por, x.nota_editor_por, x.proposta_por, x.decidido_por].includes(eu)) return true;
  return Object.values(x).some((v) => v && typeof v === 'object' && assinadaPor(v, eu));
}

/** Uma nota assinada sobre um facto que ainda está à vista (a antiga, ou uma da lista que nenhum editor escondeu). */
export const comNota = (f) => !!(f.nota_editorial || (f.notas_editoriais || []).some((n) => !n.oculta));
/** Os campos de uma ficha com divergências por comentar: o campo conta enquanto houver uma versão em conflito sem
 *  nota (um campo pode juntar várias divergências diferentes, como a bibliografia de um autor). */
export const camposPorComentar = (x) => [...new Set((x.factos || []).filter((f) => f.conflito && !comNota(f)).map((f) => f.campo))];

/** Todas as fichas de um tipo pela ordem da fila: as mais documentadas primeiro e, no empate, por ordem alfabética. */
function ordenadas(tipo) {
  const t = ESPECIES[tipo].titulo;
  return [...(E.base[tipo] || [])].sort((a, b) => riqueza(b) - riqueza(a) || compararPt(a[t], b[t]));
}

/** As fichas de um tipo ainda por rever, pela ordem da fila (com `aceitar`, só as que ela aceita: «Só o que eu fiz»). */
export const filaRevisao = (tipo, aceitar = null) => ordenadas(tipo).filter((x) => !revista(x) && (!aceitar || aceitar(x)));

/** A ficha por rever que vem depois desta na fila (volta ao princípio no fim; null se não houver mais nenhuma). */
function proxima(tipo, id, aceitar = null) {
  const todas = ordenadas(tipo), i = todas.findIndex((x) => x.id === id);
  for (let k = 1; k <= todas.length; k++) {
    const x = todas[(i + k) % todas.length];
    if (x.id !== id && !revista(x) && (!aceitar || aceitar(x))) return x;
  }
  return null;
}

/** Endereço de uma ficha no site. Os vídeos e áudios não têm página própria: no modo de edição vão para o formulário
 *  de correção; senão, para a ficha da primeira pessoa (ou para a mediateca, procurados pelo título). */
export function rotaFicha(tipo, x, sufixo = '') {
  const rota = ESPECIES[tipo]?.rota;
  if (rota) return `#/${rota}/${x.id}${sufixo}`;
  if (editando()) return `#/editar/${tipo}/${x.id}`;
  return x.pessoas?.[0] ? `#/pessoa/${x.pessoas[0]}` : `#/mediateca?estado=catalogados&q=${encodeURIComponent(x.titulo || '')}`;
}

/** Endereço de uma ficha aberta a partir da fila de revisão (com a barra «Revista, seguinte»); com `meu`, a fila
 *  continua só com as fichas que têm contributos de quem revê («Só o que eu fiz»). */
export const rotaNaFila = (tipo, x, meu = false) => rotaFicha(tipo, x, `?rever=${tipo}${meu ? '&meu=1' : ''}`);
/** A lista do separador «Rever as fichas» de um tipo (com o filtro «Só o que eu fiz», se estiver ligado). */
const rotaLista = (tipo, meu = false) => `#/validar?separador=rever&tipo=${tipo}${meu ? '&meu=1' : ''}`;

/** «Marcar a ficha como revista» (ou «Voltar a pôr como rascunho»), para os editores, no modo de edição. Serve a
 *  qualquer tipo de ficha (nas pessoas está também na caixa do editor, no topo da ficha). */
export function botaoRevisao(tipo, f, classe = 'botao') {
  if (!f || !editando() || !podeAprovar()) return '';
  const r = revista(f);
  return html`<button type="button" class="${classe}" data-acao="revisao" data-alvo="${tipo}/${f.id}" data-estado="${r ? 'rascunho' : 'revisto'}"
    title="${r ? 'Deixa de constar como revista' : 'Confirma que leu a ficha e que cada citação diz o que a ficha diz'}">${r ? 'Voltar a pôr como rascunho' : 'Marcar a ficha como revista'}</button>`;
}

// ------------------------------------------------------------------ o que conferir numa ficha

/** Uma linha curta com o que há para conferir: citações (e quantas o validador confirmou), divergências por comentar,
 *  testemunhos e relações sem fonte, fotografias acrescentadas por contribuidores, notas do agente. */
export function oQueConferir(x) {
  let citacoes = 0, verificadas = 0;
  const percorrer = (v) => {
    if (Array.isArray(v)) v.forEach(percorrer);
    else if (v && typeof v === 'object') {
      if ('fonte' in v && String(v.citacao || '').trim()) { citacoes++; if (v.verificada === true) verificadas++; }
      Object.values(v).forEach(percorrer);
    }
  };
  percorrer(x);
  const factos = x.factos || [];
  const divergencias = camposPorComentar(x);
  const partes = [
    citacoes && `${plural(citacoes, 'citação', 'citações')} (${verificadas === citacoes ? 'todas confirmadas pelo validador' : `${verificadas} confirmadas pelo validador`})`,
    divergencias.length && `divergências por comentar: ${divergencias.map((c) => CAMPOS[c] || c).join(', ')}`,
    factos.filter((f) => f.editorial && !f.fontes?.length).length && plural(factos.filter((f) => f.editorial && !f.fontes?.length).length, 'testemunho sem fonte', 'testemunhos sem fonte'),
    (x.relacoes || []).filter((r) => r.editorial).length && plural(x.relacoes.filter((r) => r.editorial).length, 'relação sem fonte', 'relações sem fonte'),
    (x.imagens || []).filter((im) => im.editorial).length && plural(x.imagens.filter((im) => im.editorial).length, 'fotografia de contribuidor', 'fotografias de contribuidores'),
    factos.filter((f) => f.nota).length && plural(factos.filter((f) => f.nota).length, 'nota do agente', 'notas do agente'),
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'ficha quase vazia: confira o nome e o que diz';
}

// ------------------------------------------------------------------ a fila de revisão, ficha a ficha

// «Revista, seguinte»: a ação grava (edicao.js) e a página volta a desenhar-se; quando a ficha já aparece revista,
// a barra segue para a próxima da fila. O destino fica guardado durante a gravação.
const SEGUINTE = 'revisaoSeguinte';
const lerSeguinte = () => { try { return JSON.parse(sessionStorage.getItem(SEGUINTE) || 'null'); } catch { return null; } };
const esquecerSeguinte = () => { try { sessionStorage.removeItem(SEGUINTE); } catch { /* sem armazenamento */ } };
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-acao="revisao"]');
  if (!b) return;
  if (!b.dataset.seguinte) { esquecerSeguinte(); return; }
  try { sessionStorage.setItem(SEGUINTE, JSON.stringify({ alvo: b.dataset.alvo, para: b.dataset.seguinte, em: Date.now() })); } catch { /* sem armazenamento */ }
});

function seguirSeGravou(tipo, f) {
  const s = lerSeguinte();
  if (!s || s.alvo !== `${tipo}/${f.id}`) return;
  if (!revista(f)) { if (Date.now() - s.em > 120000) esquecerSeguinte(); return; } // ainda a gravar, ou não gravou
  esquecerSeguinte();
  setTimeout(() => { location.hash = s.para; });
}

const parametros = () => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));

/** Barra da fila de revisão no topo de uma ficha aberta de «Por validar» (endereço com «?rever=<tipo>», e «&meu=1» com o
 *  filtro «Só o que eu fiz»): em que ficha vai, o que conferir e os botões para avançar. Só para os editores, no modo de
 *  edição. */
export function barraRevisao(tipo, f) {
  const params = parametros();
  if (!f || params.rever !== tipo || !editando() || !podeAprovar()) return '';
  seguirSeGravou(tipo, f);
  const eu = sessao()?.id, meu = params.meu === '1' && !!eu;
  const aceitar = meu ? (x) => assinadaPor(x, eu) : null;
  const fila = filaRevisao(tipo, aceitar), pos = fila.findIndex((x) => x.id === f.id);
  const depois = proxima(tipo, f.id, aceitar);
  const lista = rotaLista(tipo, meu);
  const para = depois ? rotaNaFila(tipo, depois, meu) : lista;
  return html`<aside class="barra-revisao" aria-label="Fila de revisão">
    <p class="barra-revisao-onde"><b>A rever: ${NOMES_REVISAO[tipo].toLowerCase()}${meu ? ' com contributos seus' : ''}</b> · ${revista(f)
      ? html`<span class="selo verde">revista${f.revisto_por ? ` por ${nomeContribuidor(f.revisto_por)}` : ''}${f.revisto_em ? `, ${fmtData(f.revisto_em)}` : ''}</span>`
      : pos < 0 ? 'esta ficha não está na fila' : `ficha ${(pos + 1).toLocaleString('pt-PT')} de ${fila.length.toLocaleString('pt-PT')} por rever`}</p>
    <p class="barra-revisao-conferir"><span class="mudo">O que conferir:</span> ${oQueConferir(f)}</p>
    <div class="acoes">
      ${revista(f) ? '' : html`<button type="button" class="botao primario" data-acao="revisao" data-alvo="${tipo}/${f.id}" data-estado="revisto"
        data-seguinte="${para}">${depois ? 'Revista, seguinte →' : 'Revista (é a última)'}</button>`}
      ${depois ? html`<a class="botao" href="${para}">${revista(f) ? 'Seguinte →' : 'Saltar →'}</a>` : ''}
      <a class="botao" href="${lista}">Voltar à lista</a>
    </div>
    ${depois ? '' : html`<p class="mudo">${revista(f) ? 'Não há' : 'Depois desta, não há'} mais ${NOMES_REVISAO[tipo].toLowerCase()} por rever.</p>`}
  </aside>`;
}

// ------------------------------------------------------------------ separador «Rever as fichas» de «Por validar»

/** Uma linha da lista: a ficha (aberta na fila) e o que conferir; os vídeos e áudios, sem página, revêem-se aqui mesmo
 *  (o título liga ao site de origem só se o endereço for http(s)). `meu`: a fila segue com o filtro «Só o que eu fiz». */
function linhaFila(tipo, x, ed, meu = false) {
  const t = ESPECIES[tipo].titulo;
  if (tipo === 'media') {
    const u = enderecoSeguro(x.url);
    return html`<li class="fila-item"><div>${u ? html`<a href="${u}" target="_blank" rel="noopener"><b>${x[t] || u}</b> ↗</a>` : html`<b>${x[t] || x.url}</b>`}
      <small class="mudo">${[fmtData(x.data, true), ...(x.pessoas || []).map((p) => E.por.pessoas[p]?.nome || p),
        ...(x.obras || []).map((o) => E.por.obras[o]?.titulo || o)].filter(Boolean).join(' · ') || 'sem pessoas nem obras identificadas'}</small></div>
      <div class="acoes">${ed ? html`${botaoRevisao(tipo, x, 'botao peq primario')}<a class="botao peq" href="#/editar/media/${x.id}">✎ Corrigir</a>` : ''}
        ${x.pessoas?.[0] ? html`<a class="botao peq" href="#/pessoa/${x.pessoas[0]}">Ficha de ${E.por.pessoas[x.pessoas[0]]?.nome || x.pessoas[0]}</a>` : ''}</div></li>`;
  }
  return html`<li class="fila-item"><div><a href="${ed ? rotaNaFila(tipo, x, meu) : rotaFicha(tipo, x)}"><b>${x[t]}</b></a>
    <small class="mudo">${oQueConferir(x)}</small></div></li>`;
}

/** O separador «Rever as fichas»: quantas já estão revistas, a escolha do tipo e as primeiras da fila. Com `meu`
 *  (uma função), só as fichas que ela aceita (o filtro «Só o que eu fiz»). */
export function seccaoFila(params, meu = null) {
  const ed = editando() && podeAprovar();
  const tipo = TIPOS_REVISAO.includes(params.tipo) ? params.tipo : 'pessoas';
  const total = TIPOS_REVISAO.reduce((n, t) => n + (E.base[t] || []).length, 0);
  const revistas = TIPOS_REVISAO.reduce((n, t) => n + (E.base[t] || []).filter(revista).length, 0);
  const fila = filaRevisao(tipo, meu);
  const MOSTRAR = 40;
  return html`<section class="seccao fila-revisao">
    <p class="mudo"><b>${revistas.toLocaleString('pt-PT')} de ${total.toLocaleString('pt-PT')}</b> fichas revistas. O que o agente escreve fica como rascunho até
      um editor o rever: ler a ficha, abrir as citações (os números junto de cada facto) e confirmar que a fonte diz o que a ficha diz.
      ${ed ? 'Ao marcar uma ficha como revista, fica assinada com o seu nome.' : 'Só os editores marcam fichas como revistas.'}</p>
    <div class="fichas" role="group" aria-label="Tipo de ficha">${TIPOS_REVISAO.map((t) => {
      const lista = E.base[t] || [];
      return html`<a class="ficha" href="${rotaLista(t, !!meu)}" ${t === tipo ? raw('aria-current="true"') : ''}>${NOMES_REVISAO[t]}
        <span class="n">${lista.filter(revista).length.toLocaleString('pt-PT')}/${lista.length.toLocaleString('pt-PT')}</span></a>`;
    })}</div>
    ${!fila.length ? html`<div class="vazio"><h3>Nada por rever aqui</h3><p>${meu ? 'Das fichas em que tem contributos assinados, nenhuma deste tipo está por rever.' : 'Todas as fichas deste tipo estão revistas.'}</p></div>`
      : html`${ed && tipo !== 'media' ? html`<p class="fila-comecar"><a class="botao primario" href="${rotaNaFila(tipo, fila[0], !!meu)}">Começar a rever</a>
          <small class="mudo">pela primeira, «${fila[0][ESPECIES[tipo].titulo]}»; cada ficha abre com a barra «Revista, seguinte» no topo</small></p>` : ''}
        <ol class="fila-lista">${fila.slice(0, MOSTRAR).map((x) => linhaFila(tipo, x, ed, !!meu))}</ol>
        ${fila.length > MOSTRAR ? html`<p class="mudo">E mais ${(fila.length - MOSTRAR).toLocaleString('pt-PT')} por rever${tipo === 'media' ? '' : ': a barra «Revista, seguinte» leva-o a todas, pela ordem'}.</p>` : ''}`}
  </section>`;
}
