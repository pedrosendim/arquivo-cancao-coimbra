// Linhagens: cada família com a sua árvore (por ordem cronológica) e, à parte, as escolas de mestres e discípulos.
// Posições calculadas pelo dagre; cartões em HTML e ligações em SVG.
import { E, REL, PAPEIS, vida, nomeDe } from '../estado.js';
import { $, $$, html, raw, norm, definirParams, miniatura, plural } from '../util.js';
import { vazioCurado } from '../componentes.js';

const DAGRE = 'https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js';
let carregamento = null;
export const carregarDagre = () => (carregamento ||= new Promise((res, rej) => {
  if (window.dagre) return res(window.dagre);
  const s = document.createElement('script'); s.src = DAGRE; s.onload = () => res(window.dagre); s.onerror = rej;
  document.head.append(s);
}));

const W = 156, H = 216, GAP_CASAL = 34, V = 34;
const FAMILIA = ['filho_de', 'neto_de', 'sobrinho_de', 'irmao_de', 'conjuge_de', 'primo_de'];
const ESCOLA = ['aluno_de', 'influenciado_por'];
const HIER = new Set(['filho_de', 'neto_de', 'sobrinho_de', 'aluno_de', 'influenciado_por']);
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'junior', 'filho', 'neto', 'sobrinho']);

/** Ligações dos tipos pedidos, orientadas de cima (pai, mestre) para baixo (filho, aluno). */
function ligacoes(tipos) {
  const res = [];
  for (const p of E.base.pessoas) for (const r of p.relacoes || []) {
    if (!tipos.includes(r.tipo) || !E.por.pessoas[r.alvo]) continue;
    const def = REL[r.tipo] || {};
    const [de, para] = def.topo === 'alvo' ? [r.alvo, p.id] : [p.id, r.alvo];
    res.push({ id: `${p.id}|${r.tipo}|${r.alvo}`, de, para, tipo: r.tipo, grupo: def.grupo, hier: HIER.has(r.tipo), fontes: r.fontes, nota: r.nota });
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

function nomeFamilia(c) {
  const conta = {};
  for (const id of c.membros) {
    const t = (E.por.pessoas[id]?.nome || '').split(/\s+/).filter((w) => !PARTICULAS.has(norm(w)));
    if (t.length > 1) conta[t.at(-1)] = (conta[t.at(-1)] || 0) + 1;
  }
  const ord = Object.entries(conta).sort((a, b) => b[1] - a[1]);
  if (!ord.length) return nomeDe([...c.membros][0]);
  return ord[1] && ord[1][1] === ord[0][1] && ord[0][1] > 1 ? `${ord[0][0]} / ${ord[1][0]}` : ord[0][0];
}

function nomeEscola(c) {
  const alunos = new Set(c.arestas.map((l) => l.para));
  const raizes = [...c.membros].filter((id) => !alunos.has(id)).sort((a, b) => (anoRef(a) ?? 9999) - (anoRef(b) ?? 9999));
  return raizes.slice(0, 2).map(nomeDe).join(' e ');
}

// ------------------------------------------------------------------ desenho de uma árvore

const SILHUETA = raw('<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="24" r="11"/><path d="M12 60c1.5-13 9.5-20 20-20s18.5 7 20 20z"/></svg>');

function cartao(id, x, y, foco) {
  const p = E.por.pessoas[id];
  const partes = p.nome.split(/\s+/);
  const papel = p.papeis?.[0] || 'outro';
  const img = p.imagens?.[0]?.url;
  return html`<a class="no-arvore ${id === foco ? 'foco' : ''}" data-id="${id}" href="#/pessoa/${id}" style="left:${x - W / 2}px;top:${y - H / 2}px" title="${p.nome}">
    <span class="foto-arvore papel-${papel}">${img
      ? html`<img src="${miniatura(img, 220)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">${SILHUETA}`
      : SILHUETA}</span>
    <span class="nome-arvore">${partes.length > 1 ? html`${partes[0]}<b>${partes.slice(1).join(' ')}</b>` : html`<b>${p.nome}</b>`}</span>
    <span class="anos-arvore">${vida(p) || (papel !== 'outro' ? PAPEIS[papel] || '' : '')}</span></a>`;
}

const porAno = (a, b) => (anoRef(a) ?? 9999) - (anoRef(b) ?? 9999);
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
  const juntar = (chave, ox, oy, grupo, filho, extra = '') => {
    (barramentos[`${chave}|${grupo}|${pos[filho].y}`] ||= { ox, oy, grupo, extra, filhos: [] }).filhos.push(filho);
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
    juntar(l.de, pos[l.de].x, pos[l.de].y + H / 2, l.grupo, l.para);
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
    caminhos.push(html`<path class="lig ${b.grupo} ${b.extra}" d="${d}"/>`);
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

/** Legenda das árvores de família: o que quer dizer cada linha e cada cor. */
export const legendaArvore = () => html`<div class="legenda-arvore">
  <span><svg viewBox="0 0 30 12"><path d="M15 0V12M0 12H30" class="l-fam"/></svg> pais → filhos</span>
  <span><svg viewBox="-15 -6 30 12"><g class="anel">${ANEIS}</g></svg> casamento (o casal fica lado a lado)</span>
  <span><svg viewBox="0 0 30 12"><path d="M0 6H30" class="l-fam l-pont"/></svg> pais do mesmo filho, sem casamento nas fontes</span>
  <span><svg viewBox="0 0 30 12"><path d="M0 6H30" class="l-fam l-trac"/></svg> irmão/ã sem pais registados; tio/a, avô/avó, primos quando falta o elo do meio</span>
  <span><b class="pais-leg">?</b> irmãos com pais por identificar</span>
  <span>Cor do retrato: <i class="pt ouro"></i> guitarra <i class="pt azul"></i> viola <i class="pt vinho"></i> canto <i class="pt cinza"></i> outros e familiares</span>
</div>`;

/** Árvore da família de uma pessoa (para a ficha), ou '' se não tiver família registada. */
export async function arvoreFamiliaDe(id) {
  const comp = componentes(ligacoes(FAMILIA)).find((c) => c.membros.has(id));
  if (!comp) return '';
  const dagre = await carregarDagre();
  return html`<p class="mudo" style="margin:-6px 0 12px;font-size:13px">Família ${nomeFamilia(comp)} · ${plural(comp.membros.size, 'pessoa', 'pessoas')} ·
    <a href="#/linhagens?pessoa=${id}">ver nas Linhagens</a></p>${legendaArvore()}<div class="arvore-caixa">${desenharArvore(dagre, comp, id)}</div>`;
}

// ------------------------------------------------------------------ página

export async function linhagens(el, params) {
  const sep = params.ver === 'escolas' ? 'escolas' : 'familias';
  const familias = componentes(ligacoes(FAMILIA));
  const escolas = componentes(ligacoes(ESCOLA));
  const lista = sep === 'familias' ? familias : escolas;
  const titulo = (c) => (sep === 'familias' ? `Família ${nomeFamilia(c)}` : `Escola de ${nomeEscola(c)}`);
  const anos = (c) => (c.desde ? `${c.desde}${c.ate && c.ate !== c.desde ? '–' + c.ate : ''}` : 'datas por apurar');
  const pessoas = [...new Set(lista.flatMap((c) => [...c.membros]))].sort((a, b) => nomeDe(a).localeCompare(nomeDe(b)));

  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Estudar</p><h1>Linhagens</h1>
      <p class="lead">${sep === 'familias'
        ? 'As famílias da Canção de Coimbra, cada uma com a sua árvore — pais, mães, cônjuges, irmãos e filhos que as fontes nomeiam —, pela ordem da história.'
        : 'Quem aprendeu com quem: as escolas de mestres e discípulos, pela ordem da história.'}</p></header>
    <div class="separadores" role="tablist">
      <button role="tab" data-ver="familias" aria-selected="${sep === 'familias'}">Famílias <span class="mudo">${familias.length}</span></button>
      <button role="tab" data-ver="escolas" aria-selected="${sep === 'escolas'}">Escolas <span class="mudo">${escolas.length}</span></button>
      <a href="#/grupos" style="margin-left:auto;align-self:center;font-size:14px">Grupos →</a>
    </div>
    ${lista.length ? html`
    <div class="barra-filtros">
      <input class="campo" type="search" id="procurar-pessoa" placeholder="Encontrar uma pessoa…" list="nomes-linhagem">
      <datalist id="nomes-linhagem">${pessoas.map((id) => html`<option value="${nomeDe(id)}">`)}</datalist>
    </div>
    ${sep === 'familias' ? legendaArvore() : ''}
    <nav class="indice-linhagens">${lista.map((c, i) => html`<a href="javascript:void 0" data-ir="${i}">
      <b>${titulo(c)}</b><span>${anos(c)}</span></a>`)}</nav>
    <div id="arvores">${lista.map((c, i) => html`<section class="familia" id="linhagem-${i}">
      <h2>${titulo(c)} <small>${anos(c)} · ${plural(c.membros.size, 'pessoa', 'pessoas')}</small></h2>
      <div class="arvore-caixa" data-i="${i}"><p class="carregando">A desenhar</p></div></section>`)}</div>`
    : vazioCurado(sep === 'familias' ? 'famílias' : 'escolas')}
  </div>`.s;

  $$('[data-ver]', el).forEach((b) => b.onclick = () => { location.hash = `#/linhagens${b.dataset.ver === 'escolas' ? '?ver=escolas' : ''}`; });
  if (!lista.length) return;

  let dagre;
  try { dagre = await carregarDagre(); } catch {
    $$('.arvore-caixa', el).forEach((c) => { c.innerHTML = '<p class="mudo">Não foi possível carregar a biblioteca de árvores (sem internet?).</p>'; });
    return;
  }
  const foco = params.pessoa || '';
  $$('.arvore-caixa', el).forEach((caixa) => { caixa.innerHTML = desenharArvore(dagre, lista[+caixa.dataset.i], foco).s; });

  const irPara = (i, id) => {
    const s = document.getElementById(`linhagem-${i}`);
    s?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const no = id && s?.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (no) {
      $$('.no-arvore.foco', el).forEach((x) => x.classList.remove('foco'));
      no.classList.add('foco');
      const caixa = no.closest('.arvore-caixa');
      caixa.scrollLeft = no.offsetLeft * (parseFloat(getComputedStyle(no.parentElement).zoom) || 1) - caixa.clientWidth / 2 + 80;
    }
  };
  $('.indice-linhagens', el).onclick = (e) => { const a = e.target.closest('[data-ir]'); if (a) irPara(+a.dataset.ir); };
  $('#procurar-pessoa').onchange = (e) => {
    const id = pessoas.find((x) => norm(nomeDe(x)) === norm(e.target.value));
    if (!id) return;
    definirParams({ ver: sep === 'escolas' ? 'escolas' : '', pessoa: id });
    irPara(lista.findIndex((c) => c.membros.has(id)), id);
  };
  if (foco) setTimeout(() => irPara(lista.findIndex((c) => c.membros.has(foco)), foco), 60);
}
