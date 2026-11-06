// O que mudou e quem o mudou: o histórico de cada ficha e as diferenças de cada proposta, em português.
// Online, lê-se diretamente do repositório público no GitHub (lista de commits e ficheiros em cada versão); na cópia
// local, o servidor responde a partir do git deste computador (incluindo o que ainda não foi publicado).
import { E, REL, CAMPOS, PAPEIS, nomeDe, nomeContribuidor } from './estado.js';
import { html, api, fmtData } from './util.js';
import { ESPECIES } from './fichas.js';
import { rotaFicha } from './revisao.js';
import { podeAprovar } from './edicao.js';

const online = () => E.sessao?.modo === 'online';
const REPOSITORIO = () => E.sessao?.repositorio || 'pedrosendim/arquivo-cancao-coimbra';

/** Versões de um ficheiro: [{ sha, pai, data, autor, mensagem }], a mais recente primeiro. */
export async function versoes(caminho) {
  if (!online()) return (await api('historico', { caminho })).versoes;
  const r = await fetch(`https://api.github.com/repos/${REPOSITORIO()}/commits?path=${encodeURIComponent(caminho)}&per_page=40`);
  if (!r.ok) throw new Error(r.status === 403 ? 'o GitHub limita as consultas por hora; tente daqui a pouco' : `GitHub ${r.status}`);
  return (await r.json()).map((c) => ({ sha: c.sha, pai: c.parents?.[0]?.sha || '', data: c.commit.author.date,
    autor: c.commit.author.name, mensagem: c.commit.message.split('\n')[0] }));
}

/** O ficheiro numa versão (null se ainda não existia ou já não existe). */
export async function conteudo(caminho, sha) {
  if (!sha) return null;
  if (!online()) return (await api('versao', { caminho, sha })).conteudo;
  const r = await fetch(`https://raw.githubusercontent.com/${REPOSITORIO()}/${sha}/${caminho}`);
  return r.ok ? r.json() : null;
}

// ------------------------------------------------------------------ diferenças em português

// Quem assina cada contributo fica sempre à vista (✎ Nome), tal como o endereço de cada fotografia nova: é o que um
// editor precisa de ver para aprovar uma proposta com confiança.
const quem = (a) => (a?.por ? ` (✎ ${nomeContribuidor(a.por)})` : '');
/** As fontes de um facto ou de uma citação e, nas citações acrescentadas no modo de edição, quem as acrescentou. */
const fonteDe = (fontes) => {
  if (!fontes?.length) return '';
  const por = [...new Set(fontes.filter((c) => c.acrescentada?.por).map((c) => nomeContribuidor(c.acrescentada.por)))];
  return ` — fonte: ${[...new Set(fontes.map((c) => E.fontes[c.fonte]?.nome || c.fonte))].join(', ')}${por.length ? ` (✎ ${por.join(', ')})` : ''}`;
};
/** Como se identifica e descreve cada elemento das listas das fichas. */
const LISTAS = {
  factos: { nome: 'Facto', id: (f) => `${f.campo}|${f.valor}`, txt: (f) => `${CAMPOS[f.campo] || f.campo}: ${f.valor}${fonteDe(f.fontes)}${f.editorial ? ` (testemunho${quem(f.editorial)})` : ''}` },
  biografia: { nome: 'Excerto', id: (c) => c.citacao, txt: (c) => `«${(c.citacao || '').slice(0, 120)}…»${fonteDe([c])}` },
  relacoes: { nome: 'Relação', id: (r) => `${r.tipo}|${r.alvo}`, txt: (r) => `${REL[r.tipo]?.dir || r.tipo} ${nomeDe(r.alvo)}${fonteDe(r.fontes)}${quem(r.editorial)}` },
  imagens: { nome: 'Fotografia', id: (i) => i.url, txt: (i) => `${i.legenda ? `«${i.legenda}» — ` : ''}${i.url}${i.editorial?.origem ? ` · publicada em ${i.editorial.origem}` : ''}${quem(i.editorial)}` },
  referencias: { nome: 'Referência', id: (r) => r.url, txt: (r) => `${r.titulo}${r.publicacao ? ` (${r.publicacao})` : ''} — ${r.url}${quem(r.editorial)}` },
  fontes: { nome: 'Fonte', id: (c) => `${c.fonte}|${c.url}|${c.citacao || ''}`, txt: (c) => `${E.fontes[c.fonte]?.nome || c.fonte}${c.citacao ? `: «${c.citacao.slice(0, 100)}»` : ''}${quem(c.acrescentada)}` },
  notas_editor: { nome: 'Nota', id: (n) => `${n.por}|${n.data}|${n.texto}`, txt: (n) => `«${n.texto}»${quem(n)}` },
  faixas: { nome: 'Faixa', id: (f) => `${f.n}|${f.titulo}|${f.obra || ''}`, txt: (f) => `${f.n}. ${f.titulo || ''}${f.obra ? ` → obra ${E.por.obras[f.obra]?.titulo || f.obra}` : ''}` },
  interpretes: { nome: 'Intérprete', id: (i) => `${i.pessoa}|${i.funcao || ''}`, txt: (i) => `${nomeDe(i.pessoa)}${i.funcao ? ` (${i.funcao})` : ''}` },
  proprietarios: { nome: 'Quem a tocou', id: (p) => p.pessoa, txt: (p) => nomeDe(p.pessoa) },
  distinta_de: { nome: 'Não confundir com', id: (d) => d.id, txt: (d) => `${nomeDe(d.id)}${quem(d)}` },
  juntou: { nome: 'Ficha juntada', id: (j) => j.id, txt: (j) => `${j.nome || j.titulo || j.id}${quem(j)}` },
  ligacoes: { nome: 'Ligação', id: (l) => l.url, txt: (l) => `${l.rotulo || ''} ${l.url}` },
  // a letra à vista, para quem revê poder confirmar o que foi escrito
  letras: { nome: 'Versão da letra', id: (l) => l.id, txt: (l) => `«${l.rotulo}»${fonteDe(l.fonte ? [l] : [])}${quem(l.editorial)}: ${(l.citacao || '').slice(0, 500)}${(l.citacao || '').length > 500 ? '…' : ''}` },
};
const PESSOAS = new Set(['musica', 'letra', 'pessoas']);
const ROTULOS = { nome: 'Nome', titulo: 'Título', designacao: 'Designação', tipo: 'Tipo', genero: 'Género', ano: 'Ano', data: 'Data', formato: 'Formato',
  editora: 'Editora', referencia: 'Referência', local: 'Local', url: 'Endereço', construtor: 'Construtor', gravacao: 'Disco', estado_revisao: 'Estado',
  nota_editor: 'Nota do editor', nomes_alternativos: 'Outros nomes', titulos_alternativos: 'Outros títulos', papeis: 'Atributos', letras: 'Versão da letra', musica: 'Música de',
  letra: 'Letra de', pessoas: 'Quem toca', obras: 'Obras', revisto_por: 'Revista por', nota_editor_por: 'Nota do editor assinada por',
  autor: 'Autor', texto: 'Texto', estado: 'Estado', capa: 'Capa', ligacoes: 'Ligações', letra_texto: 'Letra', plataforma: 'Plataforma' };
const IGNORAR = new Set(['id', 'revisto_em', 'nota_editor_em', 'verificada', 'atualizado_em']);
/** Campo sem nada (as fichas novas trazem os campos todos, vazios): não é uma diferença. */
const vazio = (v) => v == null || v === '' || (typeof v === 'object' && !Object.keys(v).length);
const ASSINATURAS = new Set(['revisto_por', 'nota_editor_por', 'autor', 'proposta_por', 'decidido_por']);
const curto = (v) => (String(v).length > 160 ? `${String(v).slice(0, 160)}…` : v);
const valorLegivel = (k, v) => (k === 'construtor' ? nomeDe(v) : k === 'papeis' ? PAPEIS[v] || v : PESSOAS.has(k) ? nomeDe(v)
  : k === 'obras' ? E.por.obras[v]?.titulo || v : k === 'gravacao' ? E.por.gravacoes[v]?.titulo || v
    : ASSINATURAS.has(k) ? `✎ ${nomeContribuidor(v)}` : curto(v));

/** Notas assinadas novas num elemento (a lista «notas_editoriais» de um facto, ou a nota antiga «nota_editorial»). */
function notasNovas(x, antes) {
  const ja = new Set((antes.notas_editoriais || []).map((n) => JSON.stringify(n)));
  const novas = (x.notas_editoriais || []).filter((n) => !ja.has(JSON.stringify(n)));
  if (x.nota_editorial && JSON.stringify(x.nota_editorial) !== JSON.stringify(antes.nota_editorial)) novas.push(x.nota_editorial);
  return novas.map((n) => `nota: «${n.texto}»${quem(n)}`).join('; ');
}

/** Lista de frases: o que uma versão de uma ficha muda em relação à anterior. */
function diferencasFicha(a, b) {
  const frases = [];
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (IGNORAR.has(k)) continue;
    const va = a?.[k], vb = b?.[k];
    if (JSON.stringify(va) === JSON.stringify(vb) || (vazio(va) && vazio(vb))) continue;
    if (LISTAS[k] && (Array.isArray(va) || Array.isArray(vb))) {
      const L = LISTAS[k], ia = new Map((va || []).map((x) => [L.id(x), x])), ib = new Map((vb || []).map((x) => [L.id(x), x]));
      for (const [i, x] of ib) {
        if (!ia.has(i)) frases.push(['mais', `${L.nome}: ${L.txt(x)}`]);
        else if (JSON.stringify(ia.get(i)) !== JSON.stringify(x)) {
          const antes = ia.get(i);
          const muda = notasNovas(x, antes)
            || (x.conflito !== antes.conflito ? (x.conflito ? 'marcado como divergência entre fontes' : 'deixou de ser divergência')
              : x.oculta && !antes.oculta ? `${k === 'imagens' ? 'desassociada da ficha' : 'escondida'}${x.oculta.nota ? ` («${x.oculta.nota}»)` : ''}${quem(x.oculta)}`
                : x.escolhida && !antes.escolhida ? `escolhida como retrato${quem(x.escolhida)}`
                  : x.recorte && JSON.stringify(x.recorte) !== JSON.stringify(antes.recorte) ? `recorte 1:1 ajustado${quem(x.recorte)}`
                  : (x.fontes?.length || 0) > (antes.fontes?.length || 0) ? `mais uma fonte${fonteDe(x.fontes.slice(antes.fontes?.length || 0))}` : 'alterado');
          frases.push(['muda', `${L.nome} «${L.txt(x).slice(0, 80)}»: ${muda}`]);
        }
      }
      for (const [i, x] of ia) if (!ib.has(i)) frases.push(['menos', `${L.nome}: ${L.txt(x)}`]);
    } else if (Array.isArray(va) || Array.isArray(vb)) {
      const sa = new Set(va || []), sb = new Set(vb || []);
      for (const x of sb) if (!sa.has(x)) frases.push(['mais', `${ROTULOS[k] || k}: ${valorLegivel(k, x)}`]);
      for (const x of sa) if (!sb.has(x)) frases.push(['menos', `${ROTULOS[k] || k}: ${valorLegivel(k, x)}`]);
    } else if (k === 'editorial') { // quem criou a ficha
      frases.push([va ? 'muda' : 'mais', vb?.por ? `Ficha criada por ✎ ${nomeContribuidor(vb.por)}${vb.nota ? ` — «${vb.nota}»` : ''}` : 'Assinatura de quem criou a ficha: retirada']);
    } else if (typeof (vb ?? va) === 'object') {
      // objetos simples (as ligações de um disco, a capa): o que mudou, com os endereços à vista
      const sub = [...new Set([...Object.keys(va || {}), ...Object.keys(vb || {})])]
        .filter((s) => typeof (vb?.[s] ?? va?.[s]) !== 'object' && JSON.stringify(va?.[s]) !== JSON.stringify(vb?.[s]));
      frases.push(['muda', `${ROTULOS[k] || k}: ${sub.length ? sub.map((s) => `${s} ${va?.[s] ? `${curto(va[s])} → ` : ''}${vb?.[s] ? curto(vb[s]) : '(retirado)'}`).join('; ') : 'alterado'}`]);
    } else {
      frases.push(['muda', `${ROTULOS[k] || k}: ${va ? `${valorLegivel(k, va)} → ` : ''}${vb ? valorLegivel(k, vb) : '(retirado)'}`]);
    }
  }
  return frases;
}

const valorRegisto = (k, v) => (v == null || v === '' ? '—' : /(^|_)por$/.test(k) ? `✎ ${nomeContribuidor(v)}` : typeof v === 'object' ? JSON.stringify(v) : curto(v));

/** As entradas de um registo (fontes, contribuidores, retirados do catálogo) que entram, mudam ou saem. */
function diferencasRegisto(a, b, chave, nome, txt) {
  const ia = new Map((a || []).map((x) => [x[chave], x])), frases = [];
  for (const x of b || []) {
    const antes = ia.get(x[chave]);
    if (!antes) frases.push(['mais', `${nome}: ${txt(x)}`]);
    else if (JSON.stringify(antes) !== JSON.stringify(x)) {
      const mudou = Object.keys({ ...antes, ...x }).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(antes[k]) && !['decidido_em', 'proposta_em'].includes(k));
      frases.push(['muda', `${nome} «${txt(x)}»: ${mudou.map((k) => `${k} ${valorRegisto(k, antes[k])} → ${valorRegisto(k, x[k])}`).join('; ')}`]);
    }
  }
  for (const x of a || []) if (!(b || []).some((y) => y[chave] === x[chave])) frases.push(['menos', `${nome}: ${txt(x)}`]);
  return frases;
}

/** As diferenças de um ficheiro de dados entre duas versões, como lista legível. */
export function descrever(caminho, antes, depois) {
  let frases;
  const tipo = caminho.split('/')[1], esp = ESPECIES[tipo];
  if (caminho === 'fontes/fontes.json') {
    frases = diferencasRegisto(antes?.fontes, depois?.fontes, 'id', 'Fonte', (f) => `${f.nome}${f.estado ? ` (${f.estado})` : ''}${f.url ? ` — ${f.url}` : ''}`
      + `${f.proposta_por ? ` (proposta por ✎ ${nomeContribuidor(f.proposta_por)})` : ''}`);
  } else if (caminho === 'dados/contribuidores.json') {
    frases = diferencasRegisto(antes?.contribuidores, depois?.contribuidores, 'id', 'Contribuidor', (c) => `${c.nome} (${c.papel})${c.github ? ` · @${c.github}` : ''}`);
  } else if (caminho === 'dados/excluidos.json') {
    // vídeos e áudios retirados do catálogo, com o motivo e quem os retirou (uma linha riscada: voltam a poder catalogar-se)
    frases = diferencasRegisto(antes?.media, depois?.media, 'url', 'Retirado do catálogo', (x) => `${x.url}${x.motivo ? ` — «${x.motivo}»` : ''}${quem(x)}`);
  } else if (!antes && depois) {
    frases = [['mais', `Ficha nova: ${depois[esp?.titulo] || depois.titulo || depois.id}`], ...diferencasFicha({}, depois).filter(([, f]) => !/^(Nome|Título|Designação):/.test(f))];
  } else if (antes && !depois) {
    frases = [['menos', `Ficha retirada: ${antes[esp?.titulo] || antes.titulo || antes.id}`]];
  } else frases = diferencasFicha(antes, depois);
  const sinal = { mais: '+', menos: '−', muda: '~' };
  return frases.length ? html`<ul class="diferencas">${frases.map(([t, f]) => html`<li class="${t}"><b>${sinal[t]}</b> ${f}</li>`)}</ul>`
    : html`<p class="mudo">Sem diferenças visíveis (só arrumação do ficheiro).</p>`;
}

// ------------------------------------------------------------------ página «Histórico» de uma ficha

export async function historico(el, tipo, id) {
  const esp = ESPECIES[tipo];
  const f = E.por[tipo]?.[id];
  if (!esp || !f) { el.innerHTML = '<div class="conteudo"><h1>Ficha não encontrada</h1></div>'; return; }
  const caminho = `dados/${tipo}/${id}.json`, nome = f[esp.titulo];
  el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Histórico</p>
    <h1><a href="${rotaFicha(tipo, f)}">${nome}</a></h1>
    <p class="lead">Todas as alterações a esta ficha, da mais recente para a mais antiga: quem, quando e o quê.</p></header>
    <ol class="historico" id="historico"><li class="carregando">A ler o histórico</li></ol></div>`.s;
  const lista = el.querySelector('#historico');
  let vs;
  try { vs = await versoes(caminho); } catch (e) { lista.innerHTML = html`<li class="mudo">Não foi possível ler o histórico: ${e.message}</li>`.s; return; }
  if (!vs.length) { lista.innerHTML = '<li class="mudo">Sem histórico (a ficha ainda não foi publicada).</li>'; return; }
  lista.innerHTML = html`${vs.map((v, i) => html`<li>
    <p class="meta">${v.sha === 'local' ? 'Por publicar (só nesta cópia)' : fmtData(v.data.slice(0, 10))} · ${v.autor}</p>
    <p>${v.mensagem}</p>
    <details data-i="${i}"><summary>Ver o que mudou</summary><div class="carregando">A comparar</div></details>
    ${i > 0 && v.sha !== 'local' && podeAprovar() ? html`<p class="repor"><button type="button" class="botao peq" data-acao="repor-versao" data-tipo="${tipo}" data-id="${id}"
      data-sha="${v.sha}" data-quando="${fmtData(v.data.slice(0, 10))}">Repor esta versão</button></p>` : ''}</li>`)}`.s;
  lista.addEventListener('toggle', async (e) => {
    const d = e.target;
    if (!d.open || d.dataset.feito) return;
    d.dataset.feito = '1';
    const v = vs[+d.dataset.i];
    try {
      const [antes, depois] = await Promise.all([conteudo(caminho, v.pai), conteudo(caminho, v.sha)]);
      d.querySelector('div').outerHTML = descrever(caminho, antes, depois).s;
    } catch (err) { d.querySelector('div').textContent = `Não foi possível comparar: ${err.message}`; }
  }, true);
}

export const botaoHistorico = (tipo, id) => html`<a class="botao" href="#/historico/${tipo}/${id}">Histórico</a>`;
