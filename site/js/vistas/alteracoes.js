// Alterações recentes: o que mudou nos dados do arquivo (fichas, fontes, contribuidores), quem e quando, da mais
// recente para a mais antiga. Inclui as gravações dos editores, que entram sem passar pelas Propostas.
// Online, lê-se do repositório público no GitHub; na cópia local, do git deste computador, com o que ainda não foi
// publicado à frente. Cada alteração abre o que mudou, em português, e liga à ficha e ao seu histórico.
import { E, nomeContribuidor } from '../estado.js';
import { $, html, api, fmtData, plural, ler, guardar } from '../util.js';
import { descrever, conteudo } from '../historico.js';
import { ESPECIES } from '../fichas.js';
import { podeAprovar } from '../edicao.js';
import { barraReservada } from './reservada.js';

const online = () => E.sessao?.modo === 'online';
const REPOSITORIO = () => E.sessao?.repositorio || 'pedrosendim/arquivo-cancao-coimbra';
const RE_DADOS = /^(dados\/(pessoas|instrumentos|gravacoes|obras|media|blogue)\/[a-z0-9-]+\.json|dados\/contribuidores\.json|dados\/excluidos\.json|fontes\/fontes\.json)$/;
// junções, separações, apagamentos e retiradas: o que mais vale a pena rever (pelo resumo escrito ao gravar)
const RE_FORTES = /juntad|separad|passou para|passaram para|apagad|retirad/i;
const VISTA = 'alteracoesVistas'; // a data da alteração mais recente que este browser já mostrou
const ESTADOS = { added: 'nova', removed: 'apagada', renamed: 'mudou de nome' };

/** A ficha (ou página) de um ficheiro de dados: [endereço, nome, endereço do histórico ou null]. */
function destino(caminho) {
  if (caminho === 'fontes/fontes.json') return ['#/fontes', 'Registo de fontes', null];
  if (caminho === 'dados/contribuidores.json') return ['#/contribuidores', 'Contribuidores', null];
  if (caminho === 'dados/excluidos.json') return ['#/mediateca', 'Retirados do catálogo', null];
  const [, tipo, id] = caminho.match(/^dados\/([a-z]+)\/(.+)\.json$/) || [];
  if (tipo === 'blogue') return [`#/blogue/${id}`, `Blogue: ${E.base.blogue?.find((p) => p.id === id)?.titulo || id}`, null];
  const esp = ESPECIES[tipo], x = E.por[tipo]?.[id];
  const nome = x?.[esp?.titulo] || id;
  if (!x) return [null, `${nome} (já não existe com este nome)`, null];
  return [esp.rota ? `#/${esp.rota}/${id}` : esp.lista, nome, `#/historico/${tipo}/${id}`];
}

/** Online: os commits do main que mexem em dados/ ou em fontes/ (dois pedidos públicos ao GitHub). */
async function lerOnline() {
  const pedir = async (pasta) => {
    const r = await fetch(`https://api.github.com/repos/${REPOSITORIO()}/commits?sha=main&path=${pasta}&per_page=50`);
    if (!r.ok) throw new Error(r.status === 403 ? 'o GitHub limita as consultas por hora; tente daqui a pouco' : `GitHub ${r.status}`);
    return r.json();
  };
  const vistos = new Map();
  for (const c of (await Promise.all([pedir('dados'), pedir('fontes')])).flat()) {
    const [mensagem, ...resto] = c.commit.message.split('\n');
    vistos.set(c.sha, { sha: c.sha, pai: c.parents?.[0]?.sha || '', data: c.commit.author.date, autor: c.commit.author.name,
      mensagem, corpo: resto.join('\n').trim(), ficheiros: null });
  }
  return [...vistos.values()].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 50);
}

// a lista que esta página leu, para «Desfazer» (edicao.js) saber em que ficheiros mexeu cada alteração
const LIDAS = new Map();
export const alteracaoLida = (sha) => LIDAS.get(sha);

/** Os ficheiros de dados de uma alteração (online, só quando se abre: um pedido ao GitHub). */
export async function ficheirosDe(a) {
  if (a.ficheiros) return a.ficheiros;
  const r = await fetch(`https://api.github.com/repos/${REPOSITORIO()}/commits/${a.sha}`);
  if (!r.ok) throw new Error(r.status === 403 ? 'o GitHub limita as consultas por hora; tente daqui a pouco' : `GitHub ${r.status}`);
  a.ficheiros = ((await r.json()).files || []).filter((f) => RE_DADOS.test(f.filename))
    .map((f) => ({ caminho: f.filename, estado: f.status }));
  return a.ficheiros;
}

/** O que muda em dados/excluidos.json: os vídeos e áudios retirados do catálogo (e porquê), ou que voltaram. */
function descreverExcluidos(antes, depois) {
  const urls = (x) => new Set((x?.media || []).map((e) => e.url));
  const ja = urls(antes), fica = urls(depois);
  const frases = [...(depois?.media || []).filter((e) => !ja.has(e.url)).map((e) => ['mais', `Retirado do catálogo: ${e.url}${e.motivo ? ` — «${e.motivo}»` : ''}${e.por ? ` (✎ ${nomeContribuidor(e.por)})` : ''}`]),
    ...(antes?.media || []).filter((e) => !fica.has(e.url)).map((e) => ['menos', `Voltou a poder ser catalogado: ${e.url}`])];
  return frases.length ? html`<ul class="diferencas">${frases.map(([t, f]) => html`<li class="${t}"><b>${t === 'mais' ? '+' : '−'}</b> ${f}</li>`)}</ul>`
    : html`<p class="mudo">Sem diferenças visíveis (só arrumação do ficheiro).</p>`;
}

/** O texto da alteração além do resumo (por exemplo, o motivo), sem a linha automática «Proposta de …». */
const detalhe = (corpo) => (corpo || '').split('\n').filter((l) => l.trim() && !/^Proposta de .*modo de edição/.test(l)).join(' ');

export async function alteracoes(el, params = {}) {
  const fortes = params.fortes === '1';
  el.innerHTML = html`<div class="conteudo estreito">
    ${barraReservada('alteracoes', ' Inclui o que os editores gravam, que entra sem passar pelas propostas.')}
    <p class="filtros-alteracoes"><label><input type="checkbox" id="so-fortes" ${fortes ? 'checked' : ''}>
      Só junções, separações, apagamentos e retiradas</label></p>
    <ol class="historico alteracoes" id="alteracoes"><li class="carregando">A ler as alterações</li></ol></div>`.s;
  $('#so-fortes').onchange = (e) => { location.hash = e.target.checked ? '#/alteracoes?fortes=1' : '#/alteracoes'; };
  const lista = $('#alteracoes');
  let todas;
  try { todas = online() ? await lerOnline() : (await api('alteracoes')).alteracoes; } catch (e) {
    lista.innerHTML = html`<li class="mudo">Não foi possível ler as alterações: ${e.message}</li>`.s;
    return;
  }
  for (const a of todas) LIDAS.set(a.sha, a);
  const vista = ler(VISTA, '');
  const recente = todas.find((a) => a.data)?.data;
  if (recente && recente > vista) guardar(VISTA, recente);
  const mostradas = fortes ? todas.filter((a) => RE_FORTES.test(a.mensagem)) : todas;
  if (!mostradas.length) {
    lista.innerHTML = html`<li class="mudo">${fortes ? 'Nenhuma junção, separação ou apagamento nas alterações recentes.' : 'Ainda não há alterações registadas.'}</li>`.s;
    return;
  }
  lista.innerHTML = html`${mostradas.map((a, i) => html`<li>
    <p class="meta">${a.sha === 'local' ? 'Por publicar (só nesta cópia)' : fmtData(a.data.slice(0, 10))} · ${a.autor}
      ${vista && a.data > vista ? html` <span class="selo ouro">nova</span>` : ''}</p>
    <p>${a.mensagem}</p>
    ${detalhe(a.corpo) ? html`<p class="mudo">${detalhe(a.corpo)}</p>` : ''}
    ${a.ficheiros ? html`<p class="mudo">${plural(a.ficheiros.length, 'ficheiro', 'ficheiros')}</p>` : ''}
    <details data-i="${todas.indexOf(a)}"><summary>Ver o que mudou</summary><div class="carregando">A comparar</div></details>
    ${a.sha !== 'local' && a.pai && podeAprovar() ? html`<p class="repor"><button type="button" class="botao peq" data-acao="desfazer-alteracao" data-sha="${a.sha}"
      data-mensagem="${a.mensagem}">Desfazer esta alteração</button></p>` : ''}</li>`)}`.s;
  lista.addEventListener('toggle', async (e) => {
    const d = e.target;
    if (!d.open || d.dataset.feito) return;
    d.dataset.feito = '1';
    const a = todas[+d.dataset.i];
    try {
      const ficheiros = await ficheirosDe(a);
      if (!ficheiros.length) { d.querySelector('div').outerHTML = html`<p class="mudo">Só ficheiros gerados ou de documentação (nenhuma ficha mudou).</p>`.s; return; }
      const titulo = (f) => {
        const [rota, nome, hist] = destino(f.caminho);
        return html`${rota ? html`<a href="${rota}">${nome}</a>` : nome}${ESTADOS[f.estado] ? html` <span class="mudo">(${ESTADOS[f.estado]})</span>` : ''}
          ${hist ? html` · <a class="mudo" href="${hist}">histórico</a>` : ''}`;
      };
      // o que mudou, ficha a ficha (nas alterações grandes, as primeiras 20; as outras só pelo nome, com o histórico)
      const partes = await Promise.all(ficheiros.slice(0, 20).map(async (f) => {
        const [antes, depois] = await Promise.all([conteudo(f.caminho, a.pai), f.estado === 'removed' ? null : conteudo(f.caminho, a.sha)]);
        return html`<h4>${titulo(f)}</h4>${f.caminho === 'dados/excluidos.json' ? descreverExcluidos(antes, depois) : descrever(f.caminho, antes, depois)}`;
      }));
      const resto = ficheiros.slice(20);
      d.querySelector('div').outerHTML = html`<div>${partes}${resto.length ? html`<h4>E mais ${plural(resto.length, 'ficheiro', 'ficheiros')}</h4>
        <ul class="lista-simples">${resto.map((f) => html`<li>${titulo(f)}</li>`)}</ul>` : ''}</div>`.s;
    } catch (err) { d.querySelector('div').textContent = `Não foi possível comparar: ${err.message}`; }
  }, true);
}
