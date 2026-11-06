// Propostas (só na versão online): o que os contribuidores alteraram no modo de edição, à espera de um editor.
// Cada proposta mostra logo o que muda, ficheiro a ficheiro e com quem assina cada contributo, e no topo, a vermelho,
// o que merece um segundo olhar antes de aprovar. Quem a fez pode retirá-la enquanto espera; as decididas nos
// últimos 30 dias ficam à vista, com o motivo de cada recusa.
import { descrever, conteudo } from '../historico.js';
import { E, carregar, nomeDe, nomeContribuidor } from '../estado.js';
import { $, html, raw, esc, api, fmtData, plural, enderecoSeguro } from '../util.js';
import { sessao, podeAprovar } from '../edicao.js';
import { barraReservada } from './reservada.js';

const VALIDACAO = {
  passou: ['verde', 'validação passou'], falhou: ['vinho', 'validação falhou'],
  'a-verificar': ['ouro', 'a validar…'], 'por-verificar': ['', 'ainda por validar'],
};
const EDITORES = ['dono', 'administrador', 'editor'];

// ------------------------------------------------------------------ o que merece um segundo olhar

const CAMPOS_ASSINATURA = ['revisto_por', 'nota_editor_por', 'proposta_por', 'decidido_por'];
const NOMES_ASSINATURA = { revisto_por: 'a revisão da ficha', nota_editor_por: 'a nota do editor', proposta_por: 'quem propôs a fonte', decidido_por: 'quem decidiu a fonte' };
/** Todas as assinaturas de um ficheiro (objetos com «por» e campos como revisto_por), como textos comparáveis. */
function assinaturas(x, res = []) {
  if (Array.isArray(x)) x.forEach((y) => assinaturas(y, res));
  else if (x && typeof x === 'object') {
    if (typeof x.por === 'string') res.push({ por: x.por, k: `${x.por}|${x.data || ''}|${x.nota || ''}|${x.texto || ''}|${x.origem || ''}` });
    for (const [k, v] of Object.entries(x)) {
      if (CAMPOS_ASSINATURA.includes(k) && typeof v === 'string') res.push({ por: v, k: `${k}=${v}`, campo: k });
      else if (v && typeof v === 'object') assinaturas(v, res);
    }
  }
  return res;
}

/** Endereços de um ficheiro, para encontrar os novos: os campos «url» e «origem» (fotografias, referências, citações,
 *  vídeos) e os valores do objeto «ligacoes» de um disco ({ spotify: url, … }). Nas pessoas, «ligacoes» é uma lista de
 *  { rotulo, url }: conta o url, não o rótulo. Os campos vazios (as fichas novas trazem-nos) não contam. */
function enderecos(x, res = new Set(), chave = '') {
  if (Array.isArray(x)) x.forEach((y) => enderecos(y, res, chave));
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (k === 'ligacoes' && v && typeof v === 'object' && !Array.isArray(v)) Object.values(v).forEach((u) => enderecos(u, res, 'url'));
      else enderecos(v, res, k);
    }
  } else if (typeof x === 'string' && x.trim() && ['url', 'origem'].includes(chave)) res.add(x);
  return res;
}

const nomeFicha = (caminho, f) => f?.nome || f?.titulo || f?.designacao || caminho.split('/').pop().replace(/\.json$/, '');

/** Avisos de uma proposta, calculados neste browser a partir do que está no GitHub: fichas com factos apagadas,
 *  endereços estranhos, assinaturas em nome de outra pessoa, revisões e fontes decididas por quem não é editor,
 *  e mudanças na lista de contribuidores. Não decidem nada: só chamam a atenção do editor. */
function alertas(p, ficheiros) {
  const autor = p.autor?.id || '';
  const editor = EDITORES.includes(E.contribuidores[autor]?.papel);
  const res = [];
  // fichas apagadas que tinham factos ou excertos (ao juntar é normal: diz-se a que ficha foi juntada)
  for (const { caminho, antes, depois } of ficheiros) {
    if (!antes || depois || !/^dados\/(pessoas|obras|gravacoes|instrumentos|media)\//.test(caminho)) continue;
    const n = (antes.factos?.length || 0) + (antes.biografia?.length || 0);
    if (!n) continue;
    const juntada = ficheiros.find((f) => (f.depois?.juntou || []).some((j) => j.id === antes.id) && !(f.antes?.juntou || []).some((j) => j.id === antes.id));
    res.push(`Apaga a ficha «${nomeFicha(caminho, antes)}», que tinha ${n} ${n === 1 ? 'facto ou excerto' : 'factos e excertos'}`
      + (juntada ? ` (é juntada a «${nomeFicha(juntada.caminho, juntada.depois)}»: confira que nada se perde)` : ', sem a juntar a outra ficha'));
  }
  // endereços novos que não começam por http(s) ou têm caracteres que não cabem num endereço
  for (const { caminho, antes, depois } of ficheiros) {
    const ja = enderecos(antes);
    for (const u of enderecos(depois)) {
      if (ja.has(u)) continue;
      if (!/^https?:\/\//i.test(u) || /['"\\<>\u0000-\u001f]/.test(u)) res.push(`Endereço estranho em «${nomeFicha(caminho, depois)}»: ${u.slice(0, 120)}`);
    }
  }
  // assinaturas novas em nome de outra pessoa (juntar e separar só mudam de sítio as que já existiam)
  const contar = (lista) => lista.reduce((m, a) => m.set(a.k, (m.get(a.k) || 0) + 1), new Map());
  const antes = contar(ficheiros.flatMap((f) => assinaturas(f.antes))), depois = ficheiros.flatMap((f) => assinaturas(f.depois));
  const vistas = new Set();
  for (const a of depois) {
    if (a.por === autor || vistas.has(a.k)) continue;
    const n = depois.filter((b) => b.k === a.k).length - (antes.get(a.k) || 0);
    if (n > 0) { vistas.add(a.k); res.push(`${n === 1 ? 'Uma assinatura nova' : `${n} assinaturas novas`} em nome de ${nomeContribuidor(a.por)}${a.campo ? ` (${NOMES_ASSINATURA[a.campo]})` : ''}, e a proposta é de ${p.autor?.nome || 'outra pessoa'}`); }
  }
  for (const { caminho, antes: a, depois: d } of ficheiros) {
    // textos do blogue: o autor é quem os escreveu
    if (caminho.startsWith('dados/blogue/') && d?.autor && d.autor !== a?.autor && d.autor !== autor) res.push(`O texto «${d.titulo}» do blogue fica assinado por ${nomeContribuidor(d.autor)}`);
    if (editor) continue;
    // o que só os editores podem fazer
    if (d && (d.estado_revisao || 'rascunho') !== (a?.estado_revisao || 'rascunho') && (a || d.estado_revisao === 'revisto')) {
      res.push(`Muda o estado de revisão de «${nomeFicha(caminho, d)}» para «${d.estado_revisao || 'rascunho'}», e só os editores o podem fazer`);
    }
    if (caminho === 'fontes/fontes.json') {
      const ja = new Map((a?.fontes || []).map((f) => [f.id, f]));
      for (const f of d?.fontes || []) {
        const v = ja.get(f.id);
        if (v && (v.estado !== f.estado || v.decidido_por !== f.decidido_por)) res.push(`Decide a fonte «${f.nome}» (${v.estado} → ${f.estado}), e só os editores decidem fontes`);
        if (!v && (f.estado !== 'pendente' || (f.proposta_por && f.proposta_por !== autor))) res.push(`Fonte nova «${f.nome}» com o estado «${f.estado}»${f.proposta_por && f.proposta_por !== autor ? `, proposta em nome de ${nomeContribuidor(f.proposta_por)}` : ''}`);
      }
    }
  }
  if (ficheiros.some((f) => f.caminho === 'dados/contribuidores.json')) res.push('Mexe na lista de contribuidores (quem entra no arquivo e com que papel)');
  return res;
}

/** «Não foi possível…»: a resposta do servidor ou, sem rede, uma explicação. */
async function pedir(rota, corpo) {
  let resp;
  try {
    resp = await fetch(rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  } catch {
    return { erro: 'não houve resposta do servidor (está sem rede?). Tente outra vez daqui a pouco.' };
  }
  const j = await resp.json().catch(() => ({ erro: `resposta inválida do servidor (${resp.status})` }));
  return !resp.ok || j.erro ? { erro: j.erro || resp.statusText || `erro ${resp.status}` } : j;
}

/** Os ficheiros de dados que não são fichas (os outros ficheiros mostram-se pelo caminho, tal como são). */
const REGISTOS = { 'fontes/fontes.json': ['#/fontes', 'Registo de fontes'], 'dados/contribuidores.json': ['#/contribuidores', 'Contribuidores'],
  'dados/excluidos.json': ['#/mediateca', 'Retirados do catálogo'] };

/** Ficha ou página do site que corresponde a um ficheiro alterado. */
function destino(caminho) {
  const m = caminho.match(/^dados\/(pessoas|obras|gravacoes|instrumentos|blogue|media)\/(.+)\.json$/);
  if (!m) return REGISTOS[caminho] || ['#/propostas', caminho];
  const [, tipo, id] = m;
  if (tipo === 'pessoas') return [`#/pessoa/${id}`, E.por.pessoas[id] ? nomeDe(id) : `${id} (ficha nova)`];
  if (tipo === 'blogue') return [`#/blogue/${id}`, `Blogue: ${E.base.blogue.find((p) => p.id === id)?.titulo || id}`];
  if (tipo === 'media') return ['#/mediateca', `Media: ${E.por.media[id]?.titulo || id}`];
  const rota = { obras: 'obra', gravacoes: 'gravacao', instrumentos: 'instrumento' }[tipo];
  const x = E.por[tipo][id];
  return [`#/${rota}/${id}`, x?.titulo || x?.designacao || id];
}

const MUITOS_FICHEIROS = 100; // /api/propostas pede ao GitHub 100 ficheiros por proposta; se houver mais, a lista completa está lá

export async function propostas(el) {
  const cabecalho = barraReservada('propostas', ' As propostas ficam no repositório público do arquivo, no GitHub: mesmo recusadas ou retiradas, continuam lá legíveis.');
  if (E.sessao?.modo !== 'online') {
    el.innerHTML = html`<div class="conteudo estreito">${cabecalho}<div class="vazio"><h3>Só na versão online</h3>
      <p>Na cópia local, o que grava no modo de edição fica logo no arquivo. As propostas dos contribuidores chegam pela versão online do site.</p></div></div>`.s;
    return;
  }
  el.innerHTML = html`<div class="conteudo estreito">${cabecalho}<div id="lista-propostas"><p class="carregando">A carregar</p></div></div>`.s;
  let r;
  try { r = await api('propostas'); } catch (e) { if (el.isConnected) $('#lista-propostas').innerHTML = html`<p class="mudo">Não foi possível ler as propostas: ${e.message}</p>`.s; return; }
  if (!el.isConnected) return; // entretanto mudou-se de página
  const eu = sessao()?.id, login = String(E.sessao?.github || '').toLowerCase();
  const minha = (p) => (eu && p.autor?.id === eu) || (login && String(p.autor?.github || '').toLowerCase() === login);
  const decididas = r.decididas || [];
  const DECISAO = { aprovada: ['verde', 'Aprovada'], recusada: ['vinho', 'Recusada'], retirada: ['', 'Retirada'] };
  const seccaoDecididas = decididas.length ? html`<section class="seccao decididas"><h2>Decididas nos últimos 30 dias
    <small>${plural(decididas.length, 'proposta', 'propostas')}${podeAprovar() ? '' : ' suas'}; o motivo de cada recusa fica aqui à vista</small></h2>
    <ul class="lista-simples">${decididas.map((d) => {
      const [cor, nome] = DECISAO[d.decisao] || ['', d.decisao];
      return html`<li><span class="selo ${cor}">${nome}</span> <a href="${enderecoSeguro(d.url) || '#/propostas'}" target="_blank" rel="noopener">${d.titulo}</a>
        <span class="mudo">${nome.toLowerCase()} por ${d.por}${d.em ? `, ${fmtData(String(d.em).slice(0, 10))}` : ''}${podeAprovar() && d.autor?.nome ? ` · proposta de ${d.autor.nome}` : ''}</span>
        ${d.motivo ? html`<p class="motivo-decisao">«${d.motivo}»</p>` : ''}</li>`;
    })}</ul></section>` : '';
  $('#lista-propostas').innerHTML = html`${r.propostas.length ? html`${r.propostas.map((p) => {
    const [cor, estado] = VALIDACAO[p.validacao] || ['', p.validacao || ''];
    // só se aprova depois de a validação passar (o servidor recusa também enquanto corre)
    const semAprovar = p.validacao !== 'passou' ? 'a validação ainda não passou' : p.soDados === false ? 'mexe em ficheiros que não são dados' : '';
    return html`<article class="proposta" data-numero="${p.numero}">
      <p class="meta">${fmtData(p.data.slice(0, 10))} · ${p.autor.nome} <span class="selo ${cor}">${estado}</span>${p.n_alteracoes > 1 ? ` · ${p.n_alteracoes} alterações` : ''}</p>
      <h2>${p.titulo}</h2>
      ${p.validacao === 'falhou' && p.erros_validacao?.length ? html`<div class="erros-validacao"><p>A validação encontrou isto (quem propôs pode corrigir na ficha e voltar a gravar):</p>
        <ul>${p.erros_validacao.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
      ${p.nao_arrancou ? html`<p class="aviso-proposta">A validação não arrancou. Veja no <a href="${p.url}/checks" target="_blank" rel="noopener">GitHub ↗</a>: sem ela, a proposta não se pode aprovar.</p>` : ''}
      ${p.conflito ? html`<p class="aviso-proposta">Em conflito com outra alteração: esta proposta e outra gravação mexeram na mesma ficha. Se «Aprovar» falhar, recuse-a e peça para a refazer.</p>` : ''}
      <div class="alertas-proposta" aria-live="polite"></div>
      <ul class="lista-simples">${p.ficheiros.map((f) => {
        const [rota, nome] = destino(f.caminho);
        return html`<li><span class="mudo">${{ added: 'novo', removed: 'apagado' }[f.estado] || 'alterado'}</span> <a href="${rota}">${nome}</a></li>`;
      })}</ul>
      ${p.ficheiros.length >= MUITOS_FICHEIROS ? html`<p class="mudo">Mostram-se os primeiros ${p.ficheiros.length} ficheiros. Se a proposta tiver mais,
        a lista completa está <a href="${p.url}/files" target="_blank" rel="noopener">no GitHub ↗</a>: veja-a antes de aprovar.</p>` : ''}
      <details class="o-que-muda" open><summary>O que muda</summary><div class="carregando">A comparar</div></details>
      ${p.soDados === false ? html`<p class="selo vinho" style="display:block;padding:8px 10px;margin:8px 0;text-transform:none;font-size:13px">Esta proposta mexe em ficheiros que não são dados do arquivo. O site não a deixa aprovar: recuse-a.</p>` : ''}
      <div class="acoes-topo">
        <a class="botao peq" href="${p.url}/files" target="_blank" rel="noopener">No GitHub ↗</a>
        ${r.editor ? html`<button class="botao peq primario" data-decidir="aprovar" data-numero="${p.numero}" ${semAprovar ? raw(`disabled title="${esc(`Ainda não: ${semAprovar}`)}"`) : ''}>Aprovar</button>
          <button class="botao peq" data-decidir="recusar" data-numero="${p.numero}">Recusar</button>` : ''}
        ${minha(p) ? html`<button class="botao peq" data-retirar="${p.numero}">Retirar a minha proposta</button>` : ''}
      </div></article>`;
  })}` : html`<div class="vazio"><h3>Não há propostas à espera</h3><p>${podeAprovar() ? 'Quando um contribuidor alterar alguma coisa, aparece aqui.' : 'As suas propostas aparecem aqui até um editor as decidir.'}</p></div>`}
    ${seccaoDecididas}`.s;

  // enquanto há validações a correr, volta a perguntar de 20 em 20 segundos (até 2 minutos) e redesenha quando mudam
  const aCorrer = (lista) => lista.filter((p) => ['a-verificar', 'por-verificar'].includes(p.validacao) && !p.nao_arrancou).map((p) => `${p.numero}:${p.validacao}`).join();
  const estados = aCorrer(r.propostas);
  if (estados) {
    let vezes = 0;
    const verificar = async () => {
      if (!location.hash.startsWith('#/propostas') || !el.querySelector('#lista-propostas') || ++vezes > 6) return;
      const novo = await api('propostas').catch(() => null);
      if (novo && aCorrer(novo.propostas) !== estados) propostas(el); else setTimeout(verificar, 20000);
    };
    setTimeout(verificar, 20000);
  }

  el.querySelectorAll('[data-decidir]').forEach((b) => {
    b.onclick = async () => {
      const decisao = b.dataset.decidir;
      const motivo = decisao === 'recusar' ? prompt('Porque recusa esta proposta? (fica registado, e quem a fez vê o motivo)') : '';
      if (motivo === null || (decisao === 'aprovar' && !confirm('Aprovar esta proposta? Entra no arquivo e aparece no site.'))) return;
      b.disabled = true;
      // «head»: a versão da proposta que o editor viu; se quem a fez lhe juntou entretanto alterações, o Worker recusa (P6)
      const head = r.propostas.find((p) => p.numero === +b.dataset.numero)?.head;
      const j = await pedir('/api/propostas/decidir', { numero: +b.dataset.numero, decisao, motivo, head });
      if (j.erro) { alert(`Não foi possível: ${j.erro}`); b.disabled = false; return; }
      if (decisao === 'aprovar') await carregar(); // o que entrou vê-se já (/api/recentes, estado.js)
      propostas(el);
    };
  });
  el.querySelectorAll('[data-retirar]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Retirar esta proposta? Fecha-se sem entrar no arquivo. Continua legível no GitHub, como todas as propostas.')) return;
      b.disabled = true;
      const j = await pedir('/api/propostas/retirar', { numero: +b.dataset.retirar });
      if (j.erro) { alert(`Não foi possível retirar a proposta: ${j.erro}`); b.disabled = false; return; }
      propostas(el);
    };
  });

  // o que cada proposta muda, ficheiro a ficheiro, em português (lido do repositório público), e os avisos;
  // uma proposta de cada vez, para não fazer dezenas de pedidos ao mesmo tempo
  for (const p of r.propostas) {
    const art = el.querySelector(`.proposta[data-numero="${p.numero}"]`);
    if (!art?.isConnected) return; // mudou-se de página entretanto
    const caixa = art.querySelector('.o-que-muda > div');
    try {
      const ficheiros = await Promise.all(p.ficheiros.map(async (f) => ({ caminho: f.caminho,
        antes: f.estado === 'added' ? null : await conteudo(f.caminho, p.base), depois: f.estado === 'removed' ? null : await conteudo(f.caminho, p.head) })));
      caixa.outerHTML = html`<div>${ficheiros.map((f) => html`<h4>${destino(f.caminho)[1]}</h4>${descrever(f.caminho, f.antes, f.depois)}`)}</div>`.s;
      const avisos = alertas(p, ficheiros);
      if (avisos.length) {
        art.querySelector('.alertas-proposta').innerHTML = html`<p class="alertas-titulo">Antes de aprovar, confira:</p>
          <ul>${avisos.map((a) => html`<li>${a}</li>`)}</ul>`.s;
      }
    } catch (e) { caixa.textContent = `Não foi possível comparar: ${e.message}`; }
  }
}
