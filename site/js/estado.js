// Carrega site/dados/base.json e constrói índices cruzados entre entidades.
import { api, norm, classificar, preferencias, ler, guardar } from './util.js';

const chaveDe = (url) => { const c = classificar(url); return c ? `${c.plataforma}|${c.chave}` : null; };
/** Um media catalogado nas fichas que corresponde a esta plataforma+chave, se existir. */
export const catalogado = (m) => E.catalogados.get(`${m.plataforma}|${m.chave}`);
/** Esconde media com link morto, salvo se o visitante pediu para os ver. */
export const visivel = (m) => m.disponivel !== false && m.disponivel !== 0 || preferencias.mostrarIndisponiveis;

export const REL = {
  filho_de: { grupo: 'familia', dir: 'filho/a de', inv: 'pai/mãe de', topo: 'alvo' },
  neto_de: { grupo: 'familia', dir: 'neto/a de', inv: 'avô/avó de', topo: 'alvo' },
  sobrinho_de: { grupo: 'familia', dir: 'sobrinho/a de', inv: 'tio/a de', topo: 'alvo' },
  irmao_de: { grupo: 'familia', dir: 'irmão/ã de', inv: 'irmão/ã de', sim: true },
  conjuge_de: { grupo: 'familia', dir: 'cônjuge de', inv: 'cônjuge de', sim: true },
  primo_de: { grupo: 'familia', dir: 'primo/a de', inv: 'primo/a de', sim: true },
  aluno_de: { grupo: 'ensino', dir: 'aluno/a de', inv: 'professor/a de', topo: 'alvo' },
  influenciado_por: { grupo: 'ensino', dir: 'influenciado/a por', inv: 'influenciou', topo: 'alvo' },
  tocou_com: { grupo: 'musica', dir: 'tocou com', inv: 'tocou com', sim: true },
  acompanhou: { grupo: 'musica', dir: 'acompanhou', inv: 'acompanhado/a por' },
  membro_de: { grupo: 'musica', dir: 'membro de', inv: 'tem como membro', topo: 'alvo' },
};
export const GRUPOS_REL = { familia: 'Família', ensino: 'Ensino e escola', musica: 'Parcerias musicais' };

export const CAMPOS = {
  nome_completo: 'Nome completo', nascimento: 'Nascimento', morte: 'Morte', naturalidade: 'Naturalidade',
  formacao: 'Formação', profissao: 'Profissão', atividade: 'Atividade', estreia: 'Estreia', gravacao: 'Gravação',
  atuacao: 'Atuação', premio: 'Prémio', homenagem: 'Homenagem', ensino: 'Ensino', instrumento: 'Instrumento',
  afinacao: 'Afinação', residencia: 'Residência', publicacao: 'Bibliografia', outro: 'Outros factos',
};
export const TIPOS_FONTE = { site: 'Site', imprensa: 'Imprensa', instituicao: 'Instituição', livro: 'Livro', blogue: 'Blogue',
  'arquivo-audiovisual': 'Arquivo audiovisual', 'base-de-dados': 'Base de dados', biblioteca: 'Biblioteca',
  'repositorio-academico': 'Repositório académico', 'arquivo-web': 'Arquivo web', plataforma: 'Plataforma', outro: 'Outro' };
export const PAPEIS = {
  guitarrista: 'Guitarrista', violista: 'Viola', cantor: 'Cantor/a', compositor: 'Compositor/a', letrista: 'Letrista',
  poeta: 'Poeta', luthier: 'Luthier', investigador: 'Investigador/a', colecionador: 'Colecionador/a', editor: 'Editor/a',
  professor: 'Professor/a', agrupamento: 'Agrupamento', outro: 'Outro',
};

export const E = {
  base: null, vazio: true, arquivo: null, sessao: null, editando: false,
  por: { pessoas: {}, instrumentos: {}, gravacoes: {}, obras: {}, media: {} },
  fontes: {}, relacoesDe: {}, instrumentosDe: {}, gravacoesDe: {}, obrasDe: {}, mediaDe: {}, mediaDeObra: {}, faixasDeObra: {},
  catalogados: new Map(), contribuidores: {}, blogueDe: {},
};

const junta = (mapa, chave, valor) => { if (chave) (mapa[chave] ||= []).push(valor); };

/** Lê base.json e (re)constrói todos os índices; volta a correr depois de cada gravação do modo de edição. */
// ------------------------------------------------------------------ alterações à espera de publicação
// Online, o que um editor grava entra logo no repositório, mas o site publicado só muda quando a Cloudflare o volta
// a construir (1 a 2 minutos). Entretanto, neste browser, as alterações aplicam-se por cima do base.json; saem
// quando chega uma versão do site feita a partir de um commit igual ou posterior (versao_em, de construir.py).

const PENDENTES = 'alteracoesPendentes';
const VALIDADE = 20 * 60 * 1000; // nunca mais de 20 minutos, mesmo que a construção falhe

export function juntarPendentes(alteracoes, em) {
  guardar(PENDENTES, ler(PENDENTES, []).concat(alteracoes.map(([caminho, conteudo]) => ({ caminho, conteudo, em }))));
}

const chaveOrdem = (d) => d.nome || d.titulo || d.designacao || d.id;

/** O que o construir.py acrescenta às fichas: citações verificadas, imagens escondidas à parte, estado dos vídeos. */
function comoNoSite(tipo, novo, antigo) {
  const verificadas = new Set();
  const chave = (c) => `${c.fonte}|${c.url}|${(c.citacao || '').trim()}`;
  const percorrer = (x, f) => {
    if (Array.isArray(x)) x.forEach((y) => percorrer(y, f));
    else if (x && typeof x === 'object') { if ('citacao' in x && 'fonte' in x) f(x); Object.values(x).forEach((y) => percorrer(y, f)); }
  };
  if (antigo) percorrer(antigo, (c) => { if (c.verificada) verificadas.add(chave(c)); });
  percorrer(novo, (c) => { c.verificada = verificadas.has(chave(c)); });
  if ((tipo === 'pessoas' || tipo === 'instrumentos') && (novo.imagens || []).some((im) => im.oculta)) {
    novo.imagens_ocultas = novo.imagens.filter((im) => im.oculta);
    novo.imagens = novo.imagens.filter((im) => !im.oculta);
  }
  if (tipo === 'media' && antigo) {
    if ('disponivel' in antigo) novo.disponivel = antigo.disponivel;
    if (antigo.miniatura && !novo.miniatura) novo.miniatura = antigo.miniatura;
  }
  if (tipo === 'blogue') {
    const tipoDe = (id) => ['pessoas', 'obras', 'gravacoes', 'instrumentos'].find((t) => E.base[t]?.some((d) => d.id === id));
    const ids = [...(novo.texto || '').matchAll(/\[\[([a-z0-9]+(?:-[a-z0-9]+)*)(?:\|[^\]]*)?\]\]|\]\(#\/(?:pessoa|obra|gravacao|instrumento)\/([a-z0-9-]+)\)/g)]
      .map((m) => m[1] || m[2]);
    novo.mencoes = [...new Set(ids)].map((id) => ({ tipo: tipoDe(id), id })).filter((m) => m.tipo);
  }
  return novo;
}

function aplicar(base, { caminho, conteudo }) {
  if (caminho === 'fontes/fontes.json') {
    const n = Object.fromEntries((base.fontes || []).map((f) => [f.id, f.n_citacoes || 0]));
    base.fontes = conteudo.fontes.map((f) => ({ ...f, n_citacoes: n[f.id] || 0 }));
    return;
  }
  if (caminho === 'dados/contribuidores.json') { base.contribuidores = conteudo.contribuidores; return; }
  const m = caminho.match(/^dados\/(pessoas|instrumentos|gravacoes|obras|media|blogue)\/([a-z0-9-]+)\.json$/);
  if (!m) return;
  const [, tipo, id] = m;
  const lista = (base[tipo] ||= []);
  const i = lista.findIndex((d) => d.id === id);
  if (conteudo === null) { if (i >= 0) lista.splice(i, 1); return; }
  const novo = comoNoSite(tipo, structuredClone(conteudo), i >= 0 ? lista[i] : null);
  if (i >= 0) lista[i] = novo;
  else {
    lista.push(novo);
    if (tipo !== 'blogue') lista.sort((a, b) => (chaveOrdem(a) < chaveOrdem(b) ? -1 : chaveOrdem(a) > chaveOrdem(b) ? 1 : 0));
  }
}

function aplicarPendentes(base) {
  const versao = Date.parse(base.versao_em || base.gerado_em || 0) || 0;
  const pendentes = ler(PENDENTES, []).filter((p) => Date.parse(p.em) > versao && Date.now() - Date.parse(p.em) < VALIDADE);
  guardar(PENDENTES, pendentes);
  E.base = base; // para as menções do blogue
  for (const p of pendentes) aplicar(base, p);
  return pendentes.length;
}

export async function carregar() {
  let base;
  try {
    const r = await fetch('dados/base.json', { cache: 'no-store' });
    base = r.ok ? await r.json() : null;
  } catch { base = null; }
  base ||= { fontes: [], pessoas: [], instrumentos: [], gravacoes: [], obras: [], media: [] };
  E.aPublicar = aplicarPendentes(base);
  E.base = base;
  E.vazio = !['pessoas', 'instrumentos', 'gravacoes', 'obras', 'media'].some((t) => base[t]?.length);
  E.por = { pessoas: {}, instrumentos: {}, gravacoes: {}, obras: {}, media: {} };
  E.fontes = {}; E.contribuidores = {}; E.catalogados = new Map();
  for (const k of ['relacoesDe', 'instrumentosDe', 'gravacoesDe', 'obrasDe', 'mediaDe', 'mediaDeObra', 'faixasDeObra', 'blogueDe']) E[k] = {};
  for (const t of Object.keys(E.por)) for (const x of base[t] || []) E.por[t][x.id] = x;
  for (const f of base.fontes || []) E.fontes[f.id] = f;
  for (const c of base.contribuidores || []) E.contribuidores[c.id] = c;
  base.blogue ||= [];
  for (const post of base.blogue) if (post.estado === 'publicado') for (const m of post.mencoes || []) junta(E.blogueDe, m.id, post);

  for (const p of base.pessoas) {
    for (const r of p.relacoes || []) {
      junta(E.relacoesDe, p.id, { ...r, outro: r.alvo, sentido: 'dir' });
      junta(E.relacoesDe, r.alvo, { ...r, outro: p.id, sentido: 'inv' });
    }
  }
  for (const i of base.instrumentos) {
    junta(E.instrumentosDe, i.construtor, { instrumento: i, papel: 'construiu' });
    for (const pr of i.proprietarios || []) junta(E.instrumentosDe, pr.pessoa, { instrumento: i, papel: 'tocou/possuiu' });
  }
  for (const g of base.gravacoes) {
    for (const it of g.interpretes || []) junta(E.gravacoesDe, it.pessoa, { gravacao: g, funcao: it.funcao });
    for (const fx of g.faixas || []) junta(E.faixasDeObra, fx.obra, { gravacao: g, faixa: fx });
  }
  for (const o of base.obras) {
    for (const p of o.musica || []) junta(E.obrasDe, p, { obra: o, papel: 'música' });
    for (const p of o.letra || []) junta(E.obrasDe, p, { obra: o, papel: 'letra' });
  }
  for (const m of base.media) {
    const k = chaveDe(m.url);
    if (k) E.catalogados.set(k, m);
    if (!visivel(m)) continue;
    for (const p of m.pessoas || []) junta(E.mediaDe, p, m);
    for (const o of m.obras || []) junta(E.mediaDeObra, o, m);
  }
  [E.arquivo, E.sessao] = await Promise.all([api('estado').catch(() => null), api('sessao').catch(() => null)]);
}

/** O arquivo dos blogues (pesquisa, posts, media à volta) só existe na cópia local, com o servidor ligado. */
export const comArquivo = () => !!E.arquivo;

/** Nome de quem assinou uma contribuição (sem assinatura: o editor do arquivo, autor das notas anteriores). */
export const nomeContribuidor = (id) => E.contribuidores[id]?.nome
  || (id ? id : Object.values(E.contribuidores).find((c) => c.papel === 'dono')?.nome || 'Editor do arquivo');

/** Anos de vida a partir dos factos de nascimento/morte (ignora factos em conflito). */
export function vida(p) {
  const ano = (campo) => (p.factos || []).find((f) => f.campo === campo && f.data && !f.conflito)?.data?.slice(0, 4);
  const n = ano('nascimento'), m = ano('morte');
  if (!n && !m) return '';
  return `${n || '?'} – ${m || ''}`.trim();
}

export const nomeDe = (id) => E.por.pessoas[id]?.nome || id;
export const iniciais = (nome) => nome.split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const fonteNome = (id) => E.fontes[id]?.nome || id;

export function procurarEntidades(consulta, limite = 12) {
  const q = norm(consulta).trim();
  if (!q) return [];
  const res = [];
  const testar = (tipo, x, nomes, rota) => {
    const alvo = nomes.filter(Boolean).map(norm);
    const pos = Math.min(...alvo.map((a) => { const i = a.indexOf(q); return i < 0 ? 999 : i; }));
    if (pos < 999) res.push({ tipo, x, rota, pos, nome: nomes[0] });
  };
  for (const p of E.base.pessoas) testar(p.tipo === 'grupo' ? 'Agrupamento' : 'Pessoa', p, [p.nome, ...(p.nomes_alternativos || [])], `#/pessoa/${p.id}`);
  for (const o of E.base.obras) testar('Obra', o, [o.titulo, ...(o.titulos_alternativos || [])], `#/obra/${o.id}`);
  for (const g of E.base.gravacoes) testar('Gravação', g, [g.titulo], `#/gravacao/${g.id}`);
  for (const i of E.base.instrumentos) testar('Instrumento', i, [i.designacao], `#/instrumento/${i.id}`);
  return res.sort((a, b) => a.pos - b.pos || a.nome.localeCompare(b.nome)).slice(0, limite);
}
