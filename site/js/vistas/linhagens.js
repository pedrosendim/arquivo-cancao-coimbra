// Linhagens: cada família com a sua árvore (por ordem cronológica) e, à parte, as escolas de mestres e discípulos.
// Posições calculadas pelo dagre; cartões em HTML e ligações em SVG.
import { E, REL, PAPEIS, vida, nomeDe } from '../estado.js';
import { $, $$, html, raw, norm, definirParams, miniatura, plural, compararPt, estiloRecorte } from '../util.js';
import { vazioCurado } from '../componentes.js';
import { seletorPessoa } from '../seletor.js';
import { marcas } from '../citacoes.js';
import { iconesPessoa, legendaPapeis } from '../icones.js';

const DAGRE = 'https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js';
let carregamento = null;
export const carregarDagre = () => (carregamento ||= new Promise((res, rej) => {
  if (window.dagre) return res(window.dagre);
  const s = document.createElement('script'); s.src = DAGRE; s.onload = () => res(window.dagre); s.onerror = rej;
  document.head.append(s);
}));

const W = 156, H = 224, GAP_CASAL = 34, V = 34;
const FAMILIA = ['filho_de', 'neto_de', 'sobrinho_de', 'irmao_de', 'conjuge_de', 'primo_de'];
const ESCOLA = ['aluno_de', 'influenciado_por'];
// as escolas separam-se pelo que se aprende: um guitarrista aprende com guitarristas, um cantor com cantores
export const AREAS = { guitarrista: 'Guitarra', violista: 'Viola', cantor: 'Canto', luthier: 'Construção de instrumentos' };
const HIER = new Set(['filho_de', 'neto_de', 'sobrinho_de', 'aluno_de', 'influenciado_por']);
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'junior', 'filho', 'neto', 'sobrinho']);

/** Ligações dos tipos pedidos, orientadas de cima (pai, mestre) para baixo (filho, aluno). */
function ligacoes(tipos) {
  const res = [];
  for (const p of E.base.pessoas) for (const r of p.relacoes || []) {
    if (!tipos.includes(r.tipo) || !E.por.pessoas[r.alvo]) continue;
    const def = REL[r.tipo] || {};
    const [de, para] = def.topo === 'alvo' ? [r.alvo, p.id] : [p.id, r.alvo];
    res.push({ id: `${p.id}|${r.tipo}|${r.alvo}`, de, para, tipo: r.tipo, grupo: def.grupo, hier: HIER.has(r.tipo), fontes: r.fontes, nota: r.nota,
      editorial: r.editorial, origem: p.id, alvo: r.alvo });
  }
  return res;
}

const ano = (id, campo) => {
  const f = (E.por.pessoas[id]?.factos || []).find((x) => x.campo === campo && x.data && !x.conflito)
    || (E.por.pessoas[id]?.factos || []).find((x) => x.campo === campo && x.data);
  return f ? +f.data.slice(0, 4) : null;
};
/** Ano de referência para ordenar: nascimento; senão o facto datado mais antigo menos 20 anos. */
const anoRef = (id) => {
  const n = ano(id, 'nascimento');
  if (n) return n;
  const fs = (E.por.pessoas[id]?.factos || []).filter((f) => f.data).map((f) => +f.data.slice(0, 4));
  return fs.length ? Math.min(...fs) - 20 : null;
};

/** Componentes ligados (uma família, uma escola), por ordem cronológica. */
function componentes(lig) {
  const pai = {};
  const raiz = (x) => { while ((pai[x] ??= x) !== x) x = pai[x] = pai[pai[x]] ?? pai[x]; return x; };
  for (const l of lig) pai[raiz(l.de)] = raiz(l.para);
  const grupos = {};
  for (const l of lig) {
    const r = raiz(l.de);
    (grupos[r] ||= { membros: new Set(), arestas: [] });
    grupos[r].membros.add(l.de).add(l.para);
    grupos[r].arestas.push(l);
  }
  return Object.values(grupos).map((c) => {
    const nasc = [...c.membros].map(anoRef).filter(Boolean);
    const fim = [...c.membros].map((id) => ano(id, 'morte') || anoRef(id)).filter(Boolean);
    return { ...c, desde: nasc.length ? Math.min(...nasc) : null, ate: fim.length ? Math.max(...fim) : null };
  }).sort((a, b) => (a.desde ?? 9999) - (b.desde ?? 9999) || b.membros.size - a.membros.size);
}

/** Em que áreas fica uma ligação de mestre a aluno: as que os dois partilham; se não partilharem nenhuma, a principal do
 *  aluno (é ele quem está a aprender); na falta dela, a do mestre; senão fica em «Outras». */
function areasDe(l) {
  const de = (id) => (E.por.pessoas[id]?.papeis || []).filter((k) => AREAS[k]);
  const mestre = de(l.de), aluno = de(l.para), comuns = aluno.filter((k) => mestre.includes(k));
  return comuns.length ? comuns : aluno.length ? aluno.slice(0, 1) : mestre.length ? mestre.slice(0, 1) : ['outras'];
}

/** As escolas de uma área. Sem `influencias`, só as ligações de quem ensinou: as árvores ficam mais pequenas. */
const escolasDe = (area, influencias) => componentes(ligacoes(influencias ? ESCOLA : ['aluno_de']).filter((l) => areasDe(l).includes(area)));

// famílias e escolas, calculadas uma vez por versão dos dados (o E.base muda depois de cada gravação)
let calculadas = { base: null };
function familiasEEscolas() {
  if (calculadas.base !== E.base) calculadas = { base: E.base, familias: componentes(ligacoes(FAMILIA)), escolas: componentes(ligacoes(ESCOLA)) };
  return calculadas;
}

/** Onde está uma pessoa nas Linhagens: a família e a escola, cada uma com { pessoas, ligacoes } (as ligações dessa
 *  pessoa), ou null. Para a ficha só mostrar os botões que levam a algum lado. */
export function naLinhagem(id) {
  const { familias, escolas } = familiasEEscolas();
  const em = (lista) => {
    const c = lista.find((x) => x.membros.has(id));
    return c ? { pessoas: c.membros.size, ligacoes: c.arestas.filter((l) => l.de === id || l.para === id).length } : null;
  };
  return { familia: em(familias), escola: em(escolas) };
}

/** Centra na horizontal a caixa de uma árvore no cartão de uma pessoa (sem mexer na posição da página). */
export function centrarArvore(caixa, id) {
  const no = caixa?.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (no) caixa.scrollLeft = no.offsetLeft * (parseFloat(getComputedStyle(no.parentElement).zoom) || 1) - caixa.clientWidth / 2 + 80;
}

// ordem das ligações nas listas: pais, cônjuges, filhos, irmãos…; depois mestres e alunos
const ORDEM_LIGACOES = ['filho_de', 'conjuge_de', 'irmao_de', 'neto_de', 'sobrinho_de', 'primo_de', 'aluno_de', 'influenciado_por'];

/** As ligações de uma árvore, uma por linha, com o tipo e as marcas de citação: a árvore não leva às fontes, esta lista
 *  leva. (As notas das relações ficam de fora até o fundador decidir que notas do agente se mostram.) */
export function listaLigacoes(c, titulo = 'Ligações desta árvore e fontes') {
  const pos = (l) => { const k = ORDEM_LIGACOES.indexOf(l.tipo); return k < 0 ? 99 : k; };
  const ls = [...c.arestas].sort((a, b) => pos(a) - pos(b) || compararPt(nomeDe(a.origem), nomeDe(b.origem)));
  return html`<details class="ligacoes-arvore"><summary>${titulo} (${ls.length})</summary><ul class="lista-simples">
    ${ls.map((l) => html`<li><span><a href="#/pessoa/${l.origem}">${nomeDe(l.origem)}</a> <span class="mudo">${REL[l.tipo]?.dir || l.tipo}</span>
      <a href="#/pessoa/${l.alvo}">${nomeDe(l.alvo)}</a>${marcas(l.fontes)}${l.editorial
        ? html` <span class="marca-editorial" title="Indicada por um contribuidor, sem fonte">✎</span>` : ''}</span></li>`)}</ul></details>`;
}

function nomeFamilia(c) {
  const conta = {};
  for (const id of c.membros) {
    const t = (E.por.pessoas[id]?.nome || '').replace(/\s*\([^)]*\)/g, '').split(/\s+/).filter((w) => w && !PARTICULAS.has(norm(w)));
    if (t.length > 1) conta[t.at(-1)] = (conta[t.at(-1)] || 0) + 1;
  }
  const ord = Object.entries(conta).sort((a, b) => b[1] - a[1]);
  if (!ord.length) return nomeDe([...c.membros][0]);
  return ord[1] && ord[1][1] === ord[0][1] && ord[0][1] > 1 ? `${ord[0][0]} / ${ord[1][0]}` : ord[0][0];
}

/** O nome de uma escola: quem tem mais alunos ligados nesta árvore (os dois primeiros, do mais antigo para o mais novo). */
function nomeEscola(c) {
  const n = {};
  for (const l of c.arestas) n[l.de] = (n[l.de] || 0) + 1;
  const ordem = (a, b) => (anoRef(a) ?? 9999) - (anoRef(b) ?? 9999);
  return Object.keys(n).sort((a, b) => n[b] - n[a] || ordem(a, b)).slice(0, 2).sort(ordem).map(nomeDe).join(' e ');
}

// ------------------------------------------------------------------ desenho de uma árvore

const SILHUETA = raw('<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="24" r="11"/><path d="M12 60c1.5-13 9.5-20 20-20s18.5 7 20 20z"/></svg>');

function cartao(id, x, y, foco) {
  const p = E.por.pessoas[id];
  const partes = p.nome.split(/\s+/);
  const papel = p.papeis?.[0] || 'outro';
  const im = p.imagens?.[0], img = im?.url;
  return html`<a class="no-arvore ${id === foco ? 'foco' : ''}" data-id="${id}" href="#/pessoa/${id}" style="left:${x - W / 2}px;top:${y - H / 2}px" title="${p.nome}">
    <span class="foto-arvore">${img
      ? html`<img src="${miniatura(img, 220)}" alt="" loading="lazy" referrerpolicy="no-referrer" ${im.recorte ? raw(`style="${estiloRecorte(im)}"`) : ''} onerror="this.remove()">${SILHUETA}`
      : SILHUETA}</span>${iconesPessoa(p, 'na-foto')}
    <span class="nome-arvore">${partes.length > 1 ? html`${partes[0]}<b>${partes.slice(1).join(' ')}</b>` : html`<b>${p.nome}</b>`}</span>
    <span class="anos-arvore">${vida(p) || (papel !== 'outro' ? PAPEIS[papel] || '' : '')}</span></a>`;
}

const porAno = (a, b) => (anoRef(a) ?? 9999) - (anoRef(b) ?? 9999);

// separação entre cartões: irmãos (e cônjuges) mais perto; famílias diferentes na mesma geração mais longe
const SEP_IRMAOS = 34, SEP_FAMILIAS = 64, MARGEM = 24;

/** Posições na horizontal de uma árvore já dividida em gerações pelo dagre (guia: site/ARVORES.md).
 *  Cada nó fica com um «pai principal» (a ligação mais forte; em empate, o lado com mais descendência): isso faz uma
 *  floresta, desenhada como árvore arrumada — os filhos lado a lado, por ordem de nascimento, e o grupo centrado por baixo
 *  do ponto de onde desce a linha (o ⚭ do casal ou o cartão do pai/mãe/mestre). As outras ligações (o outro lado de um
 *  casamento, um segundo mestre) não mexem na disposição: as árvores que só se ligam por elas ficam o mais perto possível
 *  do sítio onde se ligam, sem se sobreporem. Muda g.node(n).x e a largura do gráfico. */
function disporNaHorizontal(g, pontos, anoDe) {
  const nos = g.nodes(), y = {}, larg = {};
  for (const n of nos) { y[n] = g.node(n).y; larg[n] = g.node(n).width; }
  const sucessores = (n) => g.outEdges(n).map((e) => e.w).filter((w) => y[w] > y[n]);
  const desc = {};
  const contar = (n) => desc[n] ?? (desc[n] = 0, desc[n] = sucessores(n).reduce((s, w) => s + 1 + contar(w), 0));
  // pai principal: a ligação com mais peso; em empate, quem tem mais descendência; nunca de baixo para cima
  const principal = {};
  for (const w of nos) {
    let melhor = null;
    for (const e of g.inEdges(w)) {
      if (!(y[e.v] < y[w])) continue;
      const peso = g.edge(e)?.weight ?? 1, chave = [peso, contar(e.v)];
      if (!melhor || chave[0] > melhor.chave[0] || (chave[0] === melhor.chave[0] && chave[1] > melhor.chave[1])) melhor = { v: e.v, chave };
    }
    if (melhor) principal[w] = melhor.v;
  }
  const filhos = {};
  for (const [w, v] of Object.entries(principal)) (filhos[v] ||= []).push(w);
  for (const v of Object.keys(filhos)) filhos[v].sort((a, b) => pontos(v, a)[0] - pontos(v, b)[0] || anoDe(a) - anoDe(b) || (a < b ? -1 : 1));

  // árvore arrumada: contorno [esquerda, direita] por geração, relativo ao centro do nó
  const rel = {};
  const arrumar = (v) => {
    const meio = larg[v] / 2, cont = new Map([[y[v], [-meio, meio]]]), ks = filhos[v] || [];
    if (!ks.length) return cont;
    const subs = ks.map(arrumar), dx = [];
    let acum = null;
    subs.forEach((s, i) => {
      if (!acum) { dx.push(0); acum = new Map([...s].map(([r, [l, d]]) => [r, [l, d]])); return; }
      let d = -Infinity;
      for (const [r, [l]] of s) if (acum.has(r)) d = Math.max(d, acum.get(r)[1] - l + (r === y[ks[i]] && principal[ks[i - 1]] === v ? SEP_IRMAOS : SEP_FAMILIAS));
      if (d === -Infinity) d = dx[i - 1] + larg[ks[i - 1]] / 2 + larg[ks[i]] / 2 + SEP_IRMAOS;
      dx.push(d);
      for (const [r, [l, dd]] of s) { const a = acum.get(r); acum.set(r, a ? [Math.min(a[0], l + d), Math.max(a[1], dd + d)] : [l + d, dd + d]); }
    });
    // o grupo de filhos fica centrado por baixo do ponto de onde desce a linha
    const ancora = media(ks.map((w) => pontos(v, w)[0])), presos = ks.map((w, i) => dx[i] + pontos(v, w)[1]);
    const ajuste = ancora - (presos[0] + presos.at(-1)) / 2;
    ks.forEach((w, i) => { rel[w] = dx[i] + ajuste; });
    for (const [r, [l, d]] of acum) cont.set(r, [l + ajuste, d + ajuste]);
    return cont;
  };
  const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const raizes = nos.filter((n) => !principal[n]);
  const arvores = raizes.map((r) => {
    arrumar(r);
    const x = { [r]: 0 }, fila = [r];
    while (fila.length) { const v = fila.shift(); for (const w of filhos[v] || []) { x[w] = x[v] + rel[w]; fila.push(w); } }
    return { r, x, n: Object.keys(x).length };
  }).sort((a, b) => b.n - a.n || anoDe(a.r) - anoDe(b.r));

  // as árvores juntam-se uma a uma, cada uma perto do sítio onde se liga às já postas, sem sobreposição
  const X = {}, ocupado = {};
  const pousar = (a, sh) => { for (const [n, x] of Object.entries(a.x)) { X[n] = x + sh; (ocupado[y[n]] ||= []).push([X[n] - larg[n] / 2, X[n] + larg[n] / 2]); } };
  const proibidos = (a) => {
    const f = [];
    for (const [n, x] of Object.entries(a.x)) for (const [b0, b1] of ocupado[y[n]] || []) f.push([b0 - (x + larg[n] / 2) - SEP_FAMILIAS, b1 - (x - larg[n] / 2) + SEP_FAMILIAS]);
    return f.sort((p, q) => p[0] - q[0]);
  };
  const livreMaisPerto = (f, alvo) => {
    const juntos = [];
    for (const [a, b] of f) if (juntos.length && a <= juntos.at(-1)[1]) juntos.at(-1)[1] = Math.max(juntos.at(-1)[1], b); else juntos.push([a, b]);
    const dentro = juntos.find(([a, b]) => alvo > a && alvo < b);
    if (!dentro) return alvo;
    return alvo - dentro[0] <= dentro[1] - alvo ? dentro[0] : dentro[1];
  };
  const resto = [...arvores];
  pousar(resto.shift(), 0);
  while (resto.length) {
    let melhor = 0, alvo = null, ligacoes = -1;
    resto.forEach((a, i) => {
      const ds = [];
      for (const n of Object.keys(a.x)) for (const e of [...g.inEdges(n), ...g.outEdges(n)]) {
        const outro = e.v === n ? e.w : e.v;
        if (X[outro] === undefined) continue;
        const [pp, pf] = e.v === n ? pontos(n, outro) : pontos(outro, n);
        ds.push(e.v === n ? (X[outro] + pf) - (a.x[n] + pp) : (X[outro] + pp) - (a.x[n] + pf));
      }
      if (ds.length > ligacoes) { ligacoes = ds.length; melhor = i; alvo = ds.length ? media(ds) : null; }
    });
    const a = resto.splice(melhor, 1)[0];
    if (alvo === null) { const dir = Math.max(...Object.values(ocupado).flat().map((i) => i[1])), esq = Math.min(...Object.entries(a.x).map(([n, x]) => x - larg[n] / 2)); alvo = dir - esq + SEP_FAMILIAS; }
    pousar(a, livreMaisPerto(proibidos(a), alvo));
  }
  const minimo = Math.min(...nos.map((n) => X[n] - larg[n] / 2)), maximo = Math.max(...nos.map((n) => X[n] + larg[n] / 2));
  for (const n of nos) g.node(n).x = X[n] - minimo + MARGEM;
  g.graph().width = maximo - minimo + 2 * MARGEM;
}

// símbolo de casamento: dois anéis entrelaçados sobre um fundo que interrompe o traço
const ANEIS = raw('<ellipse class="fundo" rx="12" ry="7"/><circle cx="-3.6" r="4.6"/><circle cx="3.6" r="4.6"/>');

/** Desenha um componente (família ou escola). Devolve HTML com tamanho próprio.
 *  Cônjuges (e pais de um mesmo filho) ficam lado a lado na mesma geração e os filhos descem do ponto entre os dois;
 *  tio→sobrinho, avô→neto, irmãos e primos só se desenham quando falta o elo do meio (senão seriam linhas repetidas). */
export function desenharArvore(dagre, comp, foco = '') {
  const arestas = comp.arestas;
  const ids = [...comp.membros].sort(porAno);
  const paisDe = {}, filhosDe = {};
  for (const l of arestas) if (l.tipo === 'filho_de') {
    (paisDe[l.para] ||= new Set()).add(l.de);
    (filhosDe[l.de] ||= new Set()).add(l.para);
  }
  const partilham = (a, b) => [...(paisDe[a] || [])].some((x) => paisDe[b]?.has(x));
  const irmaos = (a, b) => partilham(a, b)
    || arestas.some((l) => l.tipo === 'irmao_de' && [l.de, l.para].includes(a) && [l.de, l.para].includes(b));

  // casais: cônjuges registados e, à parte, os dois pais de um mesmo filho sem casamento registado
  const conj = {}, tipoPar = {};
  const par = (a, b) => [a, b].sort().join('|');
  const juntaPar = (a, b, tipo, nota) => {
    if (a === b) return;
    (conj[a] ||= new Set()).add(b); (conj[b] ||= new Set()).add(a);
    if (!tipoPar[par(a, b)]) tipoPar[par(a, b)] = { tipo, nota };
  };
  for (const l of arestas) if (l.tipo === 'conjuge_de') juntaPar(l.de, l.para, 'casamento', l.nota || '');
  for (const s of Object.values(paisDe)) if (s.size === 2) juntaPar(...s, 'copais', '');

  // unidades: quem está ligado por casamento fica junto, na mesma geração (um só nó para o dagre)
  const raiz = {};
  const r = (x) => { while ((raiz[x] ??= x) !== x) x = raiz[x]; return x; };
  for (const [a, s] of Object.entries(conj)) for (const b of s) raiz[r(a)] = r(b);
  const unidades = {};
  for (const id of ids) (unidades[r(id)] ||= []).push(id);
  const ordem = {};
  for (const [k, membros] of Object.entries(unidades)) {
    // quem tem mais cônjuges fica entre o primeiro e os seguintes, por ordem cronológica
    const centro = [...membros].sort((a, b) => (conj[b]?.size || 0) - (conj[a]?.size || 0) || porAno(a, b))[0];
    const resto = membros.filter((x) => x !== centro).sort((a, b) => !!conj[centro]?.has(b) - !!conj[centro]?.has(a) || porAno(a, b));
    ordem[k] = (conj[centro]?.size || 0) > 1 ? [resto[0], centro, ...resto.slice(1)] : [centro, ...resto];
  }
  const uDe = (id) => `u:${r(id)}`;
  const largura = (n) => n * W + (n - 1) * GAP_CASAL;

  // irmãos sem pais conhecidos: marcador «pais por identificar»
  const virtuais = [];
  const raizI = {};
  const ri = (x) => { while ((raizI[x] ??= x) !== x) x = raizI[x]; return x; };
  for (const l of arestas) if (l.tipo === 'irmao_de') raizI[ri(l.de)] = ri(l.para);
  const gruposI = {};
  for (const id of Object.keys(raizI)) (gruposI[ri(id)] ||= []).push(id);
  for (const [k, membros] of Object.entries(gruposI)) {
    if (membros.length > 1 && !membros.some((m) => paisDe[m])) virtuais.push({ k: `pais:${k}`, filhos: membros });
  }
  const comMarcador = new Set(virtuais.flatMap((v) => v.filhos));

  // parentescos que já se leem pelo caminho dos pais
  const redundante = (l) => {
    if (l.tipo === 'neto_de') return [...(filhosDe[l.de] || [])].some((c) => paisDe[l.para]?.has(c));
    if (l.tipo === 'sobrinho_de') return [...(paisDe[l.para] || [])].some((p) => irmaos(p, l.de));
    if (l.tipo === 'irmao_de') return partilham(l.de, l.para) || (comMarcador.has(l.de) && comMarcador.has(l.para));
    if (l.tipo === 'primo_de') return [...(paisDe[l.de] || [])].some((p) => [...(paisDe[l.para] || [])].some((q) => irmaos(p, q)));
    return false;
  };

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'TB', nodesep: 34, ranksep: 78, marginx: 24, marginy: 56 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const [k, membros] of Object.entries(ordem)) g.setNode(`u:${k}`, { width: largura(membros.length), height: H });
  for (const v of virtuais) {
    g.setNode(v.k, { width: V, height: V });
    for (const f of v.filhos) g.setEdge(v.k, uDe(f), { minlen: 1 }, `${v.k}>${f}`);
  }
  for (const l of arestas.filter((x) => x.hier)) {
    const a = uDe(l.de), b = uDe(l.para);
    // tio/avô só dão a geração (peso 0), não puxam o sobrinho/neto para debaixo de si
    const fraco = l.tipo === 'sobrinho_de' || l.tipo === 'neto_de';
    if (a !== b) g.setEdge(a, b, { minlen: l.tipo === 'neto_de' ? 2 : 1, weight: fraco ? (redundante(l) ? 0 : 1) : 2 }, l.id);
  }
  // um irmão sem pais registados fica na geração do irmão que os tem (ligação só para a disposição)
  for (const l of arestas.filter((x) => x.tipo === 'irmao_de' || x.tipo === 'primo_de')) {
    for (const [com, sem] of [[l.de, l.para], [l.para, l.de]]) {
      if (paisDe[com] && !paisDe[sem] && !comMarcador.has(sem)) {
        const pai = uDe([...paisDe[com]][0]);
        if (pai !== uDe(sem)) g.setEdge(pai, uDe(sem), { minlen: 1, weight: 1 }, `disp:${l.id}:${sem}`);
      }
    }
  }
  dagre.layout(g);
  // o dagre dá as gerações; a posição na horizontal faz-se à parte, com os filhos centrados por baixo dos pais
  const membrosDe = (n) => (n.startsWith('u:') ? ordem[n.slice(2)] : []);
  const desvio = (n, id) => { const m = membrosDe(n), i = m.indexOf(id); return i < 0 ? 0 : -largura(m.length) / 2 + W / 2 + i * (W + GAP_CASAL); };
  const elos = {};
  const elo = (v, w, pai, filho) => { const e = (elos[`${v}>${w}`] ||= { pais: new Set(), filhos: new Set() }); if (pai) e.pais.add(pai); if (filho) e.filhos.add(filho); };
  for (const l of arestas.filter((x) => x.hier)) elo(uDe(l.de), uDe(l.para), l.de, l.para);
  for (const v of virtuais) for (const f of v.filhos) elo(v.k, uDe(f), '', f);
  const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  disporNaHorizontal(g, (v, w) => {
    const e = elos[`${v}>${w}`];
    if (!e) return [0, 0];
    return [media([...e.pais].map((p) => desvio(v, p))), media([...e.filhos].map((f) => desvio(w, f)))];
  }, (n) => Math.min(...membrosDe(n).map((id) => anoRef(id) ?? 9999), 9999));

  const pos = {};
  for (const [k, membros] of Object.entries(ordem)) {
    const d = g.node(`u:${k}`);
    membros.forEach((id, i) => { pos[id] = { x: d.x - largura(membros.length) / 2 + W / 2 + i * (W + GAP_CASAL), y: d.y }; });
  }
  for (const v of virtuais) { const d = g.node(v.k); pos[v.k] = { x: d.x, y: d.y }; }
  const juntos = (a, b) => Math.abs(pos[a].x - pos[b].x) < W + GAP_CASAL + 1;

  // traço de cada casal: entre os cartões, se estão lado a lado; senão por baixo deles (ex.: segundo e terceiro casamentos).
  // O ⚭ fica junto do cônjuge com menos casamentos e os filhos do casal descem desse ponto.
  const casal = {};
  const niveis = {};
  for (const k of Object.keys(tipoPar)) {
    const [e, d] = k.split('|').sort((a, b) => pos[a].x - pos[b].x);
    if (juntos(e, d)) { casal[k] = { e, d, junto: true, x: (pos[e].x + pos[d].x) / 2, y: pos[e].y }; continue; }
    const n = niveis[r(e)] = (niveis[r(e)] ?? -1) + 1;
    const fora = (conj[d]?.size || 0) <= (conj[e]?.size || 0) ? d : e;
    const x = fora === d ? pos[d].x - W / 2 - GAP_CASAL / 2 : pos[e].x + W / 2 + GAP_CASAL / 2;
    casal[k] = { e, d, junto: false, x, y: pos[e].y + H / 2 + 14 + n * 10 };
  }

  // filhos: barramento a partir do ponto do casal (ou do cartão do único pai/mãe registado)
  const caminhos = [];
  const barramentos = {};
  // um barramento por origem, tipo de linha e geração: «influenciou» (tracejado) nunca partilha o traço de «ensinou»
  const juntar = (chave, ox, oy, grupo, filho, extra = '', tipo = '') => {
    (barramentos[`${chave}|${grupo}|${extra}|${pos[filho].y}`] ||= { ox, oy, grupo, extra, tipo, origem: chave, filhos: [] }).filhos.push(filho);
  };
  const tratados = new Set();
  for (const [filho, pais] of Object.entries(paisDe)) {
    if (pais.size !== 2) continue;
    const [a, b] = [...pais];
    const c = casal[par(a, b)];
    if (!c) continue;
    juntar(par(a, b), c.x, c.y, 'familia', filho);
    tratados.add(`${filho}|${a}`).add(`${filho}|${b}`);
  }
  const DESCENDENCIA = new Set(['filho_de', 'aluno_de', 'influenciado_por']);
  for (const l of arestas.filter((x) => DESCENDENCIA.has(x.tipo))) {
    if (tratados.has(`${l.para}|${l.de}`)) continue;
    juntar(l.de, pos[l.de].x, pos[l.de].y + H / 2, l.grupo, l.para, l.tipo === 'influenciado_por' ? 'influencia' : '', l.tipo);
  }
  for (const v of virtuais) for (const f of v.filhos) juntar(v.k, pos[v.k].x, pos[v.k].y + V / 2, 'familia', f, 'tracejada');

  // irmão sem pais registados, ao lado de um irmão que os tem: pendura-se tracejado na linha dos irmãos
  const pendurados = new Set();
  for (const l of arestas.filter((x) => x.tipo === 'irmao_de' && !redundante(x))) {
    for (const [com, sem] of [[l.de, l.para], [l.para, l.de]]) {
      if (pendurados.has(sem) || paisDe[sem] || comMarcador.has(sem) || !paisDe[com]) continue;
      const b = Object.values(barramentos).find((x) => x.grupo === 'familia' && x.filhos.includes(com));
      if (!b || Math.abs(pos[sem].y - pos[com].y) > 1) continue;
      (b.irmaos ||= []).push(sem);
      pendurados.add(sem);
    }
  }
  // barramentos que se sobrepõem na mesma geração ficam a alturas diferentes, para não parecerem um só casal
  const ocupado = {};
  for (const b of Object.values(barramentos).sort((p, q) => p.ox - q.ox)) {
    const topo = Math.min(...b.filhos.map((f) => pos[f].y - H / 2));
    const xs = b.filhos.map((f) => pos[f].x).concat(b.ox);
    const [x0, x1] = [Math.min(...xs) - 8, Math.max(...xs) + 8];
    let nivel = 0;
    while ((ocupado[topo] ||= []).some((o) => o.nivel === nivel && o.x0 < x1 && x0 < o.x1)) nivel++;
    ocupado[topo].push({ nivel, x0, x1 });
    const ym = topo - 28 - (nivel % 3) * 10 + (b.grupo === 'ensino' ? -8 : 0);
    let d = `M${b.ox} ${b.oy}V${ym}M${Math.min(...xs)} ${ym}H${Math.max(...xs)}`;
    for (const f of b.filhos) d += `M${pos[f].x} ${ym}V${pos[f].y - H / 2}`;
    caminhos.push(b.grupo === 'ensino' && E.por.pessoas[b.origem]
      ? html`<path class="lig ${b.grupo} ${b.extra}" d="${d}"><title>${nomeDe(b.origem)} · ${REL[b.tipo]?.inv || ''} ${b.filhos.map(nomeDe).join(', ')}</title></path>`
      : html`<path class="lig ${b.grupo} ${b.extra}" d="${d}"/>`);
    if (b.irmaos) {
      let t = '';
      for (const s of b.irmaos) {
        const perto = xs.reduce((m, x) => (Math.abs(x - pos[s].x) < Math.abs(m - pos[s].x) ? x : m));
        t += `M${perto} ${ym}H${pos[s].x}V${pos[s].y - H / 2}`;
      }
      caminhos.push(html`<path class="lig familia parentesco" d="${t}"><title>Irmão/ã registado/a nas fontes, sem pais registados</title></path>`);
    }
  }

  // casais: traço entre os cartões com ⚭ (casamento) ou pontilhado (pais de um mesmo filho, sem casamento nas fontes)
  for (const [chave, info] of Object.entries(tipoPar)) {
    const { e, d, junto, x, y } = casal[chave];
    const casamento = info.tipo === 'casamento';
    const titulo = casamento ? `${nomeDe(e)} ⚭ ${nomeDe(d)}${info.nota ? ' — ' + info.nota : ''}`
      : `${nomeDe(e)} e ${nomeDe(d)}: pais de um mesmo filho (as fontes não registam o casamento)`;
    const traco = junto ? `M${pos[e].x + W / 2} ${y}H${pos[d].x - W / 2}`
      : `M${pos[e].x} ${pos[e].y + H / 2}V${y}H${pos[d].x}V${pos[d].y + H / 2}`;
    caminhos.push(html`<path class="lig familia ${casamento ? '' : 'pontilhada'}" d="${traco}"><title>${titulo}</title></path>`);
    if (casamento) caminhos.push(html`<g class="anel" transform="translate(${x} ${y})"><title>${titulo}</title>${ANEIS}</g>`);
  }

  // tio→sobrinho, avô→neto, irmãos, primos: só quando não há caminho pelos pais; tracejado e com o nome do parentesco
  const arcos = {}, rotulos = new Set();
  for (const l of arestas.filter((x) => ['sobrinho_de', 'neto_de', 'irmao_de', 'primo_de'].includes(x.tipo) && !redundante(x))) {
    if (l.tipo === 'irmao_de' && (pendurados.has(l.de) || pendurados.has(l.para))) continue;
    const a = pos[l.de], b = pos[l.para];
    if (!a || !b) continue;
    const rotulo = { sobrinho_de: 'tio/a', neto_de: 'avô/avó', irmao_de: 'irmãos', primo_de: 'primos' }[l.tipo];
    let d, lx, ly;
    if (Math.abs(a.y - b.y) < 2) {           // mesma geração: arco por cima, com o rótulo no arco
      const n = arcos[`p${a.y}`] = (arcos[`p${a.y}`] || 0) + 1;
      const topo = a.y - H / 2, alto = topo - 40 - (n % 3) * 9;
      d = `M${a.x - 20} ${topo}V${alto}H${b.x - 20}V${topo}`; lx = (a.x + b.x) / 2; ly = alto - 4;
    } else {                                  // gerações diferentes: o rótulo fica junto de quem está em baixo
      const [cima, baixo] = a.y < b.y ? [a, b] : [b, a];
      const lado = baixo.x >= cima.x ? 1 : -1;
      const x1 = cima.x + lado * (W / 2 - 18), y1 = cima.y + H / 2, x2 = baixo.x - lado * 30, y2 = baixo.y - H / 2;
      d = `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`; lx = x2 - lado * 6; ly = y2 - 7;
    }
    const titulo = `${nomeDe(l.de)} · ${rotulo} · ${nomeDe(l.para)}`;
    caminhos.push(html`<path class="lig familia parentesco" d="${d}"><title>${titulo}</title></path>`);
    if (rotulos.has(`${lx}|${ly}|${rotulo}`)) continue;  // avô e avó do mesmo neto: um só rótulo
    rotulos.add(`${lx}|${ly}|${rotulo}`);
    caminhos.push(html`<text class="rotulo-parentesco" x="${lx}" y="${ly}" text-anchor="middle"><title>${titulo}</title>${rotulo}</text>`);
  }

  const { width, height } = g.graph();
  return html`<div class="arvore-mundo" style="width:${width}px;height:${height}px">
    <svg class="arvore-linhas" width="${width}" height="${height}">${caminhos}</svg>
    ${ids.filter((id) => pos[id]).map((id) => cartao(id, pos[id].x, pos[id].y, foco))}
    ${virtuais.map((v) => html`<span class="pais-incognitos" style="left:${pos[v.k].x - V / 2}px;top:${pos[v.k].y - V / 2}px"
      title="Irmãos: pais por identificar nas fontes">?</span>`)}</div>`;
}

/** Legenda das árvores de família: o que quer dizer cada linha e cada ícone (só os que há nesta árvore). */
export const legendaArvore = (membros = []) => html`<div class="legenda-arvore">
  <span><svg viewBox="0 0 30 12"><path d="M15 0V12M0 12H30" class="l-fam"/></svg> pais → filhos</span>
  <span><svg viewBox="-15 -6 30 12"><g class="anel">${ANEIS}</g></svg> casamento (o casal fica lado a lado)</span>
  <span><svg viewBox="0 0 30 12"><path d="M0 6H30" class="l-fam l-pont"/></svg> pais do mesmo filho, sem casamento nas fontes</span>
  <span><svg viewBox="0 0 30 12"><path d="M0 6H30" class="l-fam l-trac"/></svg> irmão/ã sem pais registados; tio/a, avô/avó, primos quando falta o elo do meio</span>
  <span><b class="pais-leg">?</b> irmãos com pais por identificar</span>
  ${legendaPapeis(membros.map((id) => E.por.pessoas[id]))}
</div>`;

/** Legenda das escolas: ensinar e influenciar são relações diferentes nas fontes, e desenham-se de maneira diferente. */
export const legendaEscola = (membros = [], influencias = true) => html`<div class="legenda-arvore">
  <span><svg viewBox="0 0 30 12"><path d="M15 0V12M0 12H30" class="l-ens"/></svg> mestre → aluno/a («aluno/a de»)</span>
  ${influencias ? html`<span><svg viewBox="0 0 30 12"><path d="M15 0V12M0 12H30" class="l-ens l-trac"/></svg> influenciou («influenciado/a por»: não quer dizer que ensinou)</span>` : ''}
  ${legendaPapeis(membros.map((id) => E.por.pessoas[id]))}
</div>`;

/** Árvore da família de uma pessoa (para a ficha), ou '' se não tiver família registada. */
export async function arvoreFamiliaDe(id) {
  const comp = componentes(ligacoes(FAMILIA)).find((c) => c.membros.has(id));
  if (!comp) return '';
  const dagre = await carregarDagre();
  return html`<p class="mudo" style="margin:-6px 0 12px;font-size:13px">Família ${nomeFamilia(comp)} · ${plural(comp.membros.size, 'pessoa', 'pessoas')} ·
    <a href="#/linhagens?pessoa=${id}">ver nas Linhagens</a></p>${legendaArvore([...comp.membros])}<div class="arvore-caixa">${desenharArvore(dagre, comp, id)}</div>`;
}

// ------------------------------------------------------------------ página

export async function linhagens(el, params) {
  const sep = params.ver === 'escolas' ? 'escolas' : 'familias';
  const familias = componentes(ligacoes(FAMILIA));
  // nas escolas: uma área de cada vez, e as influências só a pedido; uma pessoa em foco mostra-se onde estiver
  const areas = [...Object.keys(AREAS), 'outras'].filter((a) => escolasDe(a, true).length);
  const foco0 = params.pessoa || '';
  const tem = (area, inf) => escolasDe(area, inf).some((c) => c.membros.has(foco0));
  let influencias = params.influencias === '1';
  let area = areas.includes(params.area) ? params.area : areas[0] || '';
  if (sep === 'escolas' && foco0 && !tem(area, influencias)) {
    const alvo = areas.find((a) => tem(a, influencias)) || (influencias ? '' : areas.find((a) => tem(a, true)));
    if (alvo) { area = alvo; if (!tem(alvo, influencias)) influencias = true; }
  }
  const escolas = area ? escolasDe(area, influencias) : [];
  const lista = sep === 'familias' ? familias : escolas;
  const nomeArea = (a) => AREAS[a] || 'Outras';
  const titulo = (c) => (sep === 'familias' ? `Família ${nomeFamilia(c)}` : `Escola de ${nomeEscola(c)}`);
  const anos = (c) => (c.desde ? `${c.desde}${c.ate && c.ate !== c.desde ? '–' + c.ate : ''}` : 'datas por apurar');
  const pessoas = [...new Set(lista.flatMap((c) => [...c.membros]))].sort((a, b) => nomeDe(a).localeCompare(nomeDe(b)));
  const chave = (c) => [...c.membros].sort()[0]; // estável para o endereço, mesmo quando a ordem muda
  // na lista de escolha, agrupadas por século (do nascimento mais antigo)
  const SECULOS = { 17: 'Século XVII', 18: 'Século XVIII', 19: 'Século XIX', 20: 'Século XX', 21: 'Século XXI' };
  const grupo = (c) => (c.desde ? SECULOS[Math.floor((c.desde - 1) / 100) + 1] || 'Outras datas' : 'Datas por apurar');
  const grupos = [];
  lista.forEach((c, i) => { const g = grupo(c); if (grupos.at(-1)?.[0] !== g) grupos.push([g, []]); grupos.at(-1)[1].push(i); });

  const foco = foco0;
  // pediram uma pessoa que não está em nenhuma família (ou escola): diz-se isso, em vez de abrir a primeira da lista
  const focoFora = !!foco && !!E.por.pessoas[foco] && !lista.some((c) => c.membros.has(foco));
  let atual = foco ? lista.findIndex((c) => c.membros.has(foco)) : lista.findIndex((c) => chave(c) === params.familia);
  if (atual < 0) atual = focoFora ? -1 : 0;
  // nas escolas, sem nada pedido, abre a maior: é a que mostra mais de quem aprendeu com quem
  if (sep === 'escolas' && !foco && !params.familia) lista.forEach((c, i) => { if (c.membros.size > lista[atual].membros.size) atual = i; });
  const [anterior, seguinte] = sep === 'familias' ? ['Família anterior', 'Família seguinte'] : ['Escola anterior', 'Escola seguinte'];

  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Linhagens</h1>
      <p class="lead">${sep === 'familias'
        ? 'As famílias da Canção de Coimbra, cada uma com a sua árvore — pais, mães, cônjuges, irmãos e filhos que as fontes nomeiam —, pela ordem da história.'
        : 'Quem aprendeu com quem, separado pelo que se aprende: guitarra, viola, canto e construção de instrumentos.'}</p></header>
    <div class="separadores" role="tablist">
      <button role="tab" data-ver="familias" aria-selected="${String(sep === 'familias')}">Famílias <span class="mudo">${familias.length}</span></button>
      <button role="tab" data-ver="escolas" aria-selected="${String(sep === 'escolas')}">Escolas <span class="mudo">${familiasEEscolas().escolas.length ? areas.length : 0}</span></button>
    </div>
    ${sep === 'escolas' && areas.length ? html`<div class="escolha-area">
      <div class="fichas" role="group" aria-label="Área">${areas.map((a) => html`<button type="button" class="ficha" data-area="${a}" aria-pressed="${String(a === area)}">${nomeArea(a)}<span class="n">${new Set(escolasDe(a, influencias).flatMap((c) => [...c.membros])).size}</span></button>`)}</div>
      <label class="opcao"><input type="checkbox" id="com-influencias" ${influencias ? raw('checked') : ''}> Mostrar também as influências</label>
    </div>` : ''}
    ${lista.length ? html`
    <div class="barra-filtros">
      <div class="escolher-linhagem">
        <button class="botao" type="button" id="anterior" title="${anterior} (mais antiga)" aria-label="${anterior}">‹</button>
        <select class="campo" id="escolher" aria-label="Escolher">${focoFora ? html`<option value="" selected disabled hidden>${sep === 'familias' ? 'Escolher uma família' : 'Escolher uma escola'}</option>` : ''}${grupos.map(([g, is]) => html`<optgroup label="${g}">
          ${is.map((i) => html`<option value="${i}">${titulo(lista[i])} · ${anos(lista[i])} · ${plural(lista[i].membros.size, 'pessoa', 'pessoas')}</option>`)}</optgroup>`)}</select>
        <button class="botao" type="button" id="seguinte" title="${seguinte} (mais recente)" aria-label="${seguinte}">›</button>
      </div>
      ${seletorPessoa({ criar: false, apenas: pessoas, placeholder: 'Encontrar uma pessoa nas árvores…' })}
    </div>
    <div id="legenda-linhagem"></div>
    <section class="familia" id="linhagem"><h2></h2><div class="arvore-caixa"><p class="carregando">A desenhar</p></div><div class="ligacoes-lista"></div></section>`
    : vazioCurado(sep === 'familias' ? 'famílias' : 'escolas')}
  </div>`.s;

  // trocar de separador mantém a pessoa em foco, se ela também estiver na outra lista
  const pessoaAtual = () => new URLSearchParams(location.hash.split('?')[1] || '').get('pessoa') || '';
  $$('[data-ver]', el).forEach((b) => b.onclick = () => {
    const quem = pessoaAtual();
    const manter = quem && (b.dataset.ver === 'escolas' ? familiasEEscolas().escolas : familias).some((c) => c.membros.has(quem));
    const qs = new URLSearchParams({ ...(b.dataset.ver === 'escolas' ? { ver: 'escolas' } : {}), ...(manter ? { pessoa: quem } : {}) }).toString();
    location.hash = `#/linhagens${qs ? '?' + qs : ''}`;
  });
  const irEscolas = (a, inf) => {
    const quem = pessoaAtual();
    const qs = new URLSearchParams({ ver: 'escolas', area: a, ...(inf ? { influencias: '1' } : {}), ...(quem ? { pessoa: quem } : {}) }).toString();
    location.hash = `#/linhagens?${qs}`;
  };
  $$('[data-area]', el).forEach((b) => b.onclick = () => irEscolas(b.dataset.area, influencias));
  if ($('#com-influencias', el)) $('#com-influencias', el).onchange = (e) => irEscolas(area, e.target.checked);
  if (!lista.length) return;

  let dagre;
  try { dagre = await carregarDagre(); } catch {
    $('.arvore-caixa', el).innerHTML = '<p class="mudo">Não foi possível carregar a biblioteca de árvores (sem internet?).</p>';
    return;
  }
  if (!el.isConnected) return; // entretanto mudou-se de página (não mexer no endereço da página nova)

  /** Mostra uma família (ou escola) de cada vez; com uma pessoa em foco, centra a árvore nela. */
  const mostrar = (i, id = '') => {
    atual = Math.max(0, Math.min(lista.length - 1, i));
    const c = lista[atual], s = $('#linhagem', el);
    $('#escolher', el).value = atual;
    $('#anterior', el).disabled = atual === 0;
    $('#seguinte', el).disabled = atual === lista.length - 1;
    s.querySelector('h2').innerHTML = html`${titulo(c)} <small>${anos(c)} · ${plural(c.membros.size, 'pessoa', 'pessoas')} · ${atual + 1} de ${lista.length}</small>`.s;
    const caixa = s.querySelector('.arvore-caixa');
    $('.aviso-linhagem', s)?.remove();
    caixa.hidden = false;
    caixa.innerHTML = desenharArvore(dagre, c, id).s;
    $('.ligacoes-lista', s).innerHTML = listaLigacoes(c).s;
    $('#legenda-linhagem', el).innerHTML = (sep === 'familias' ? legendaArvore([...c.membros]) : legendaEscola([...c.membros], influencias)).s;
    definirParams({ ver: sep === 'escolas' ? 'escolas' : '', area: sep === 'escolas' ? area : '', influencias: sep === 'escolas' && influencias ? '1' : '',
      familia: id ? '' : chave(c), pessoa: id });
    const no = id && caixa.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (no) {
      no.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); // o cartão da pessoa à vista, também no telemóvel
      caixa.scrollLeft = no.offsetLeft * (parseFloat(getComputedStyle(no.parentElement).zoom) || 1) - caixa.clientWidth / 2 + 80;
    }
  };
  $('#escolher', el).onchange = (e) => mostrar(+e.target.value);
  $('#anterior', el).onclick = () => mostrar(atual - 1);
  $('#seguinte', el).onclick = () => mostrar(atual + 1);
  $('[data-seletor-pessoa]', el).addEventListener('escolha', (e) => {
    const { id } = e.detail;
    if (id) mostrar(lista.findIndex((c) => c.membros.has(id)), id);
  });
  if (!focoFora) { mostrar(atual, foco); return; }
  // a pessoa pedida não está em nenhuma árvore deste separador: só o que o arquivo tem, e o caminho de volta
  const s = $('#linhagem', el), nome = nomeDe(foco);
  const naOutra = (sep === 'familias' ? familiasEEscolas().escolas : familias).some((c) => c.membros.has(foco));
  $('#anterior', el).disabled = true;
  s.querySelector('h2').textContent = nome;
  s.querySelector('.arvore-caixa').outerHTML = html`<div class="vazio aviso-linhagem"><p>${nome} ainda não tem ${sep === 'familias' ? 'família registada' : 'mestres nem alunos registados'} no arquivo.</p>
    <p><a href="#/pessoa/${foco}">Voltar à ficha de ${nome}</a>${naOutra ? html` · <a href="#/linhagens?${sep === 'familias' ? 'ver=escolas&' : ''}pessoa=${foco}">${sep === 'familias' ? 'Ver os mestres e alunos' : 'Ver a família'}</a>` : ''}</p></div>
    <div class="arvore-caixa" hidden></div>`.s;
}
