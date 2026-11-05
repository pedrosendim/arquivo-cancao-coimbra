// Carrega site/dados/base.json e constrói índices cruzados entre entidades.
import { api, norm, classificar, preferencias, ler, guardar, compararPt, termosProcura, temTodas, fmtData, NOME_PLATAFORMA } from './util.js';

const chaveDe = (url) => { const c = classificar(url); return c ? `${c.plataforma}|${c.chave}` : null; };
/** Chave de um vídeo ou faixa catalogado («plataforma|chave»): a mesma em todas as fichas que o têm (uma por disco). */
export const chaveMedia = (m) => chaveDe(m?.url) || `ficha|${m?.id}`;
/** Um media catalogado nas fichas que corresponde a esta plataforma+chave, se existir. */
export const catalogado = (m) => E.catalogados.get(`${m.plataforma}|${m.chave}`);
/** Todas as fichas de media com esta plataforma+chave (o mesmo vídeo pode estar catalogado em vários discos). */
export const catalogadosDe = (m) => E.mesmoMedia?.get(`${m.plataforma}|${m.chave}`) || [];
/** Esconde media com link morto, salvo se o visitante pediu para os ver. */
export const visivel = (m) => m.disponivel !== false && m.disponivel !== 0 || preferencias.mostrarIndisponiveis;

/** Data para ordenar um media: a da ficha ou, sem ela, o ano do disco a que pertence (é o ano da edição em disco, não o
 *  do vídeo ou do áudio). Sem nenhuma: ''. */
export function dataMedia(m) {
  if (m?.data) return m.data;
  const g = m?.gravacao && E.por.gravacoes[m.gravacao];
  const a = g && (typeof anoGravacao === 'function' ? anoGravacao(g)?.ano : parseInt(g.ano, 10));
  return a ? String(a) : '';
}
/** Ano de um disco para os cartões de media, nas palavras de anoGravacao («1957», «gravado em 1928», «… — as fontes divergem»). */
export const anoDoDisco = (g) => (g && (typeof anoGravacao === 'function' ? anoGravacao(g)?.texto : g.ano)) || '';

/** Índices dos media catalogados (refeitos também quando o visitante mostra ou esconde os links mortos): por pessoa e
 *  por obra, só os que tocam; o mesmo vídeo ou faixa nas várias fichas que o têm; e o texto por que cada um se procura
 *  (título; nomes das pessoas, com os alternativos; obras; disco, editora, referência e ano; data). */
export function derivarMedia() {
  E.catalogados = new Map(); E.mesmoMedia = new Map(); E.mediaDe = {}; E.mediaDeObra = {}; E.textoMedia = {}; E.faixasDeMedia = {};
  // as faixas dos discos onde cada media está (o mesmo media pode servir faixas de várias edições)
  for (const g of E.base?.gravacoes || []) for (const f of g.faixas || []) for (const id of f.media || []) junta(E.faixasDeMedia, id, { gravacao: g, faixa: f });
  for (const m of E.base?.media || []) {
    const k = chaveDe(m.url);
    if (k) {
      if (!E.catalogados.has(k)) E.catalogados.set(k, m);
      if (!E.mesmoMedia.has(k)) E.mesmoMedia.set(k, []);
      E.mesmoMedia.get(k).push(m);
    }
    const g = m.gravacao && E.por.gravacoes[m.gravacao];
    E.textoMedia[m.id] = [m.titulo, m.data, ...(m.pessoas || []).flatMap((p) => [E.por.pessoas[p]?.nome, ...(E.por.pessoas[p]?.nomes_alternativos || [])]),
      ...(m.obras || []).flatMap((o) => [E.por.obras[o]?.titulo, ...(E.por.obras[o]?.titulos_alternativos || [])]),
      g && g.titulo, g && g.editora, g && g.referencia, g && g.ano].filter(Boolean).join(' ');
    if (!visivel(m)) continue;
    for (const p of m.pessoas || []) junta(E.mediaDe, p, m);
    for (const o of m.obras || []) junta(E.mediaDeObra, o, m);
  }
}

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
export const FORMATOS = { cilindro: 'Cilindro', 'disco de massa': 'Disco de massa', '78rpm': '78 rpm', EP: 'EP', LP: 'LP', single: 'Single',
  CD: 'CD', cassete: 'Cassete', radio: 'Rádio', televisao: 'Televisão', inedito: 'Inédito', digital: 'Digital' };
export const GENEROS = { fado: 'Fado', balada: 'Balada', cancao: 'Canção', serenata: 'Serenata', guitarrada: 'Guitarrada',
  variacoes: 'Variações', estudo: 'Estudo', outro: 'Outro' };
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
    if (tipo !== 'blogue') lista.sort((a, b) => compararPt(chaveOrdem(a), chaveOrdem(b)));
  }
}

function aplicarPendentes(base) {
  const versao = Date.parse(base.versao_em || base.gerado_em || 0) || 0;
  const pendentes = ler(PENDENTES, []).filter((p) => Date.parse(p.em) > versao && Date.now() - Date.parse(p.em) < VALIDADE);
  guardar(PENDENTES, pendentes);
  E.base = base; // para as menções do blogue
  for (const p of pendentes) aplicar(base, p);
  // online, as propostas ainda abertas de quem contribui, só no browser dessa pessoa (minhas-propostas.js)
  for (const p of E.minhasPropostas || []) aplicar(base, p);
  return pendentes.length;
}

export async function carregar() {
  // quem está a editar e o estado do arquivo local pedem-se já, em paralelo com os dados; o arquivo dos blogues
  // só existe na cópia local (online, /api/estado responde sempre que não há)
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const pedidos = Promise.all([local ? api('estado').catch(() => null) : null, api('sessao').catch(() => null)]);
  // «no-cache»: o browser pergunta sempre se há versão nova e só descarrega o base.json quando mudou
  const pedir = () => fetch('dados/base.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const antecipado = window.basePedida; // no arranque, o pedido já saiu do <head> (index.html); depois de gravar, pede-se outra vez
  window.basePedida = null;
  let base = await (antecipado || pedir());
  if (!base && antecipado) base = await pedir(); // o pedido antecipado falhou: mais uma tentativa
  base ||= { fontes: [], pessoas: [], instrumentos: [], gravacoes: [], obras: [], media: [] };
  E.aPublicar = aplicarPendentes(base);
  // ordem alfabética portuguesa (Álvaro junto de Alberto, e não depois de Zélia), seja qual for a do ficheiro
  for (const t of ['pessoas', 'instrumentos', 'gravacoes', 'obras']) base[t]?.sort((a, b) => compararPt(chaveOrdem(a), chaveOrdem(b)));
  E.base = base;
  E.vazio = !['pessoas', 'instrumentos', 'gravacoes', 'obras', 'media'].some((t) => base[t]?.length);
  E.por = { pessoas: {}, instrumentos: {}, gravacoes: {}, obras: {}, media: {} };
  E.fontes = {}; E.contribuidores = {}; E.catalogados = new Map();
  for (const k of ['relacoesDe', 'instrumentosDe', 'gravacoesDe', 'obrasDe', 'mediaDe', 'mediaDeObra', 'faixasDeObra', 'blogueDe']) E[k] = {};
  for (const t of Object.keys(E.por)) for (const x of base[t] || []) E.por[t][x.id] = x;
  // fichas juntadas a outra: o endereço antigo leva à ficha que ficou
  E.juntadas = {};
  for (const t of Object.keys(E.por)) for (const x of base[t] || []) for (const j of x.juntou || []) (E.juntadas[t] ||= {})[j.id] = x.id;
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
  derivarMedia();
  [E.arquivo, E.sessao] = await pedidos;
}

/** O arquivo dos blogues (pesquisa, posts, media à volta) só existe na cópia local, com o servidor ligado. */
export const comArquivo = () => !!E.arquivo;

/** Nome de quem assinou uma contribuição (sem assinatura: o editor do arquivo, autor das notas anteriores). */
export const nomeContribuidor = (id) => E.contribuidores[id]?.nome
  || (id ? id : Object.values(E.contribuidores).find((c) => c.papel === 'dono')?.nome || 'Editor do arquivo');

const anoDe = (f) => (/^\d{4}/.test(f.data || '') ? +f.data.slice(0, 4) : null);

/** Anos de vida para o topo das fichas, os cartões, as árvores e as listas, sem escolher entre fontes que divergem.
 *  Num campo sem versões em conflito: o ano do primeiro facto datado (como sempre). Com conflito: o ano, se todas as
 *  versões têm data e o mesmo ano (o dia que diverge fica na linha de baixo); senão os anos distintos das versões
 *  datadas, por ordem, seguidos de «≠» («1924/1929≠»), ou «?≠» se nenhuma tem data. Nunca um ano sozinho, sem sinal,
 *  quando há uma versão sem data.
 *  Devolve { texto: «1924/1929≠ – 1987», ano: o ano de nascimento mais antigo (para ordenar; null sem nenhum),
 *  nascimento e morte: { texto, anos, diverge } ou null }. */
export function anosVida(p) {
  const parte = (campo) => {
    const fs = (p.factos || []).filter((f) => f.campo === campo);
    // um ano que só vem de testemunhos (contribuições assinadas, sem fonte) leva ✎, como na tabela de factos
    const com = (a) => `${a}${fs.filter((f) => anoDe(f) === a).every((f) => f.editorial) ? ' ✎' : ''}`;
    if (!fs.some((f) => f.conflito)) {
      const a = fs.map(anoDe).find(Boolean);
      return a ? { texto: com(a), anos: [a], diverge: false } : null;
    }
    const anos = [...new Set(fs.map(anoDe).filter(Boolean))].sort((a, b) => a - b);
    if (anos.length === 1 && fs.every(anoDe)) return { texto: com(anos[0]), anos, diverge: false, conflito: true };
    return { texto: `${anos.length ? anos.map(com).join('/') : '?'}≠`, anos, diverge: true, conflito: true };
  };
  const n = parte('nascimento'), m = parte('morte');
  return { texto: !n && !m ? '' : `${n?.texto || '?'} – ${m?.texto || ''}`.trim(), ano: n?.anos[0] ?? null, nascimento: n, morte: m };
}

/** Anos de vida em texto: «1929 – 1987», «1924/1929≠ – 1987» (ver anosVida). */
export const vida = (p) => anosVida(p).texto;

/** Ano de uma gravação para as listas, os cartões e a cronologia, sem escrever nada no campo «ano»: o próprio campo;
 *  senão o dos factos com data, nas palavras da fonte («gravado em 1928», «editado em 1927»), e «as fontes divergem»
 *  sempre que um facto datado está em conflito, mesmo com um só ano. Um ano que só vem de testemunhos (contribuições
 *  assinadas, sem fonte) leva ✎, como na tabela de factos: «1963 ✎ · 1964». Devolve { texto, ano (o mais antigo, para
 *  ordenar), factos (os factos datados, para as marcas de citação), diverge, rotulo («gravado em », «editado em » ou
 *  ''), testemunho (os anos que só vêm de testemunhos) } ou null. */
export function anoGravacao(g) {
  if (/^\d{4}/.test(g.ano || '')) return { texto: String(g.ano), ano: +g.ano.slice(0, 4), factos: [], diverge: false, rotulo: '', testemunho: new Set() };
  const datados = (g.factos || []).filter(anoDe).sort((a, b) => a.data.localeCompare(b.data));
  if (!datados.length) return null;
  const anos = [...new Set(datados.map(anoDe))].sort((a, b) => a - b);
  const diverge = datados.some((f) => f.conflito);
  const testemunho = new Set(anos.filter((a) => datados.every((f) => anoDe(f) !== a || f.editorial)));
  const com = (a) => `${a}${testemunho.has(a) ? ' ✎' : ''}`;
  let texto = anos.map(com).join(' · '), rotulo = '';
  if (diverge) texto = `${anos.length > 1 ? `${anos.slice(0, -1).map(com).join(', ')} ou ${com(anos.at(-1))}` : com(anos[0])} — as fontes divergem`;
  else if (anos.length === 1) {
    rotulo = datados.some((f) => f.campo === 'gravacao') ? 'gravado em '
      : datados.some((f) => /^ano de edi[cç][aã]o/i.test(f.valor || '')) ? 'editado em ' : '';
    texto = `${rotulo}${com(anos[0])}`;
  }
  return { texto, ano: anos[0], factos: datados, diverge, rotulo, testemunho };
}

// parentescos pela ordem em que distinguem melhor uma pessoa: cônjuge, pais, filhos, irmãos, e os outros
const ORDEM_PARENTESCO = ['conjuge_de:dir', 'conjuge_de:inv', 'filho_de:dir', 'filho_de:inv', 'irmao_de:dir', 'irmao_de:inv',
  'neto_de:dir', 'neto_de:inv', 'sobrinho_de:dir', 'sobrinho_de:inv', 'primo_de:dir', 'primo_de:inv'];

/** Quem não tem papel musical (mães, cônjuges, filhos…) distingue-se pelo primeiro parentesco registado, que já tem
 *  fonte: «cônjuge de José Niza», «filho/a de Horácio Paulo Menano». Devolve { texto, editorial } ou null. */
export function parentescoDe(p) {
  if (!p || p.tipo === 'grupo' || (p.papeis || []).some((x) => x !== 'outro')) return null;
  const pos = (r) => { const k = ORDEM_PARENTESCO.indexOf(`${r.tipo}:${r.sentido}`); return k < 0 ? 99 : k; };
  const r = (E.relacoesDe[p.id] || []).filter((x) => REL[x.tipo]?.grupo === 'familia' && E.por.pessoas[x.outro])
    .sort((a, b) => pos(a) - pos(b) || compararPt(nomeDe(a.outro), nomeDe(b.outro)))[0];
  const rotulo = r && (r.sentido === 'dir' ? REL[r.tipo].dir : REL[r.tipo].inv);
  return r ? { texto: `${rotulo} ${nomeDe(r.outro)}`, rotulo, id: r.outro, editorial: !!r.editorial } : null;
}

export const nomeDe = (id) => E.por.pessoas[id]?.nome || id;
export const iniciais = (nome) => nome.split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const fonteNome = (id) => E.fontes[id]?.nome || id;

// ------------------------------------------------------------------ procura (paleta, página «Procurar», listas)

/** Quanto as fontes dizem de uma ficha (excertos, factos, relações, imagens): desempata as procuras e escolhe os destaques. */
export const riqueza = (p) => (p.biografia?.length || 0) * 3 + (p.factos?.length || 0) + (p.relacoes?.length || 0) + (p.imagens?.length || 0) * 2;
/** Pessoa com papel musical, ou grupo. Os familiares sem papel aparecem depois dos músicos. */
export const musicoOuGrupo = (p) => p.tipo === 'grupo' || (p.papeis || []).some((x) => x !== 'outro');
/** Nome a mostrar para um valor livre dos dados: o do dicionário, se o tiver; senão o próprio valor («valsa» → «Valsa»). */
export const rotuloDe = (nomes, v) => nomes[v] || (v ? v[0].toUpperCase() + v.slice(1) : '');

/** Procura das listas em vários campos (título, outros títulos, intérpretes, editora, autores…): coincide quando um só
 *  campo tem todas as palavras, como na procura rápida, ou quando as palavras estão em campos diferentes («Paredes
 *  Alvorada»); neste caso as de uma ou duas letras («em», «ré») têm de começar uma palavra, para não se apanharem dentro
 *  de outra («re» em «Paredes» deixava «Variações em Si Menor» entrar em «Variações em Ré menor»). */
export function coincideCampos(campos, termos) {
  const cs = campos.filter(Boolean);
  if (!termos.length || cs.some((c) => temTodas(c, termos))) return true;
  const juntas = ` ${cs.map((c) => termosProcura(c).join(' ')).join(' ')}`;
  return termos.every((p) => juntas.includes(p.length <= 2 ? ` ${p}` : p));
}

/** Opções de um filtro a partir dos valores que existem nos dados, com quantas há de cada: primeiro pela ordem do
 *  dicionário de nomes, depois os valores que ele não conhece (ex.: «Valsa»); «Outro» fica no fim. */
export function opcoesDosDados(lista, campo, nomes = {}) {
  const n = {};
  for (const x of lista) if (x[campo]) n[x[campo]] = (n[x[campo]] || 0) + 1;
  const conhecidos = Object.keys(nomes).filter((k) => n[k] && k !== 'outro');
  const novos = Object.keys(n).filter((k) => !(k in nomes) && k !== 'outro').sort(compararPt);
  return [...conhecidos, ...novos, ...(n.outro ? ['outro'] : [])].map((k) => ({ valor: k, nome: rotuloDe(nomes, k), n: n[k] }));
}

/** Tipos de instrumento tal como estão nas fichas, com quantos há de cada (valor = o tipo sem acentos, para o endereço). */
export function tiposInstrumento() {
  const n = {};
  for (const i of E.base.instrumentos) if (i.tipo) (n[i.tipo] ||= { valor: termosProcura(i.tipo).join('-'), nome: rotuloDe({}, i.tipo), tipo: i.tipo, n: 0 }).n++;
  return Object.values(n).sort((a, b) => b.n - a.n || compararPt(a.nome, b.nome));
}

/** Grupos de resultados da procura, pela ordem em que aparecem quando empatam. */
export const GRUPOS_PROCURA = { pessoas: 'Pessoas', grupos: 'Grupos', obras: 'Obras', gravacoes: 'Discos e gravações',
  instrumentos: 'Instrumentos', media: 'Vídeos e áudios' };
const TIPO_RESULTADO = { pessoas: 'Pessoa', grupos: 'Agrupamento', obras: 'Obra', gravacoes: 'Gravação', instrumentos: 'Instrumento', media: 'Vídeo ou áudio' };

/** A relação que distingue quem tem o mesmo nome, tirada das relações da ficha: «cônjuge de José Niza».
 *  Sem papel musical, o parentesco de parentescoDe(); senão (ou sem parentesco) a primeira relação de família e depois
 *  as outras («membro de…»), as que têm fonte primeiro. Uma indicada por um contribuidor, sem fonte, leva ✎. Sem relações: ''. */
export function relacaoDistintiva(p) {
  const par = parentescoDe(p);
  if (par) return `${par.texto}${par.editorial ? ' ✎' : ''}`;
  const posicao = (r) => (REL[r.tipo].grupo === 'familia' ? 0 : 2) + (r.fontes?.length ? 0 : 1);
  const [r] = (E.relacoesDe[p.id] || []).filter((x) => REL[x.tipo] && E.por.pessoas[x.outro]).sort((a, b) => posicao(a) - posicao(b));
  return r ? `${r.sentido === 'dir' ? REL[r.tipo].dir : REL[r.tipo].inv} ${nomeDe(r.outro)}${r.editorial ? ' ✎' : ''}` : '';
}

let repetidos = null, repetidosDe = null;
/** Nome de uma só palavra («Isabel») ou igual ao de outra ficha («Custódio Moreirinhas»): sozinho, não distingue a pessoa. */
export function nomeAmbiguo(p) {
  if (repetidosDe !== E.base) {
    repetidos = {};
    for (const x of E.base.pessoas) { const k = termosProcura(x.nome).join(' '); repetidos[k] = (repetidos[k] || 0) + 1; }
    repetidosDe = E.base;
  }
  const k = termosProcura(p.nome).join(' ');
  return !k.includes(' ') || repetidos[k] > 1;
}

/** A linha que distingue um resultado de outro com o mesmo nome, só com dados das fichas. */
function detalheDe(grupo, x) {
  if (grupo === 'pessoas') return [vida(x), (x.papeis || []).filter((k) => k !== 'outro').map((k) => PAPEIS[k] || k).join(', '),
    (!musicoOuGrupo(x) || nomeAmbiguo(x)) && relacaoDistintiva(x)];
  if (grupo === 'grupos') {
    const membros = (E.relacoesDe[x.id] || []).filter((r) => r.tipo === 'membro_de' && r.sentido === 'inv').map((r) => E.por.pessoas[r.outro])
      .filter(Boolean).sort((a, b) => riqueza(b) - riqueza(a));
    return [vida(x), membros.length && `com ${membros.slice(0, 3).map((m) => m.nome).join(', ')}${membros.length > 3 ? '…' : ''}`];
  }
  if (grupo === 'obras') return [rotuloDe(GENEROS, x.genero), (x.musica || []).map(nomeDe).join(', '), x.ano];
  if (grupo === 'gravacoes') return [x.ano, rotuloDe(FORMATOS, x.formato), x.editora, x.referencia, (x.interpretes || []).slice(0, 2).map((i) => nomeDe(i.pessoa)).join(', ')];
  if (grupo === 'instrumentos') return [rotuloDe({}, x.tipo), x.ano, x.construtor && nomeDe(x.construtor)];
  return [fmtData(x.data, true), NOME_PLATAFORMA[x.plataforma] || x.plataforma, (x.pessoas || []).slice(0, 3).map(nomeDe).join(', ')];
}

let indice = null, indiceDe = null, indiceMortos = null;
/** Os nomes por que cada ficha se procura, já sem acentos; refeito quando o base.json muda (depois de cada gravação) e
 *  quando o visitante mostra ou esconde os vídeos com link morto («+ N com link morto»). */
function indiceProcura() {
  if (indiceDe === E.base && indiceMortos === preferencias.mostrarIndisponiveis) return indice;
  const nome = (texto, como = '') => ({ texto, como, t: termosProcura(texto).join(' ') });
  const vistos = new Set(); // o mesmo vídeo ou áudio catalogado em vários discos aparece uma só vez
  const novo = (m) => !vistos.has(chaveMedia(m)) && vistos.add(chaveMedia(m));
  const entrada = (grupo, x, rota, principal, outros = []) => principal && ({ grupo, x, rota, nome: principal,
    nomes: [nome(principal), ...outros.filter(([n]) => n).map(([n, como]) => nome(n, como))] });
  indice = [
    ...E.base.pessoas.map((p) => entrada(p.tipo === 'grupo' ? 'grupos' : 'pessoas', p, `#/pessoa/${p.id}`, p.nome, (p.nomes_alternativos || []).map((n) => [n, 'também']))),
    ...E.base.obras.map((o) => entrada('obras', o, `#/obra/${o.id}`, o.titulo, (o.titulos_alternativos || []).map((n) => [n, 'também']))),
    ...E.base.gravacoes.map((g) => entrada('gravacoes', g, `#/gravacao/${g.id}`, g.titulo,
      [[g.referencia, ''], ...(g.faixas || []).map((f) => [f.titulo || E.por.obras[f.obra]?.titulo, 'faixa'])])),
    ...E.base.instrumentos.map((i) => entrada('instrumentos', i, `#/instrumento/${i.id}`, i.designacao)),
    ...E.base.media.filter((m) => visivel(m) && novo(m)).map((m) => entrada('media', m, '', m.titulo)),
  ].filter(Boolean);
  indiceDe = E.base; indiceMortos = preferencias.mostrarIndisponiveis;
  return indice;
}

/**
 * Fichas cujo nome (ou outro nome, ou o título de uma faixa) tem todas as palavras escritas, por qualquer ordem e sem
 * acentos; uma inicial («A. Menano») tem de começar uma palavra. Ordem: o nome igual ao escrito, depois nomes com palavras
 * que começam pelo escrito, depois os que só o contêm; em empate, o nome principal antes dos outros, pessoas e grupos antes
 * de obras, discos e instrumentos, os músicos antes dos familiares e as fichas mais documentadas primeiro.
 * Cada resultado: { grupo, tipo, x, rota, nome, coincidiu ({texto, como} quando não foi o nome principal), detalhe [] }.
 * Os vídeos e áudios catalogados só entram com { media: true } (não são fichas: tocam no leitor).
 */
export function procurarEntidades(consulta, limite = 12, { media = false } = {}) {
  const termos = termosProcura(consulta);
  if (!termos.length) return [];
  const frase = termos.join(' '), ordem = Object.keys(GRUPOS_PROCURA);
  const res = [];
  for (const e of indiceProcura()) {
    if (e.grupo === 'media' && !media) continue;
    let melhor = null;
    e.nomes.forEach((n, k) => {
      if (!n.t || !temTodas(n.t, termos)) return;
      const pos = (n.t === frase ? 0 : termos.every((p) => ` ${n.t}`.includes(` ${p}`)) ? 1 : 2) * 2 + (k ? 1 : 0);
      if (!melhor || pos < melhor.pos) melhor = { pos, n: k ? n : null };
    });
    if (melhor) res.push({ ...e, pos: melhor.pos, coincidiu: melhor.n, tipo: TIPO_RESULTADO[e.grupo] });
  }
  const familiar = (r) => (r.grupo === 'pessoas' && !musicoOuGrupo(r.x) ? 1 : 0);
  return res.sort((a, b) => a.pos - b.pos || ordem.indexOf(a.grupo) - ordem.indexOf(b.grupo) || familiar(a) - familiar(b)
    || riqueza(b.x) - riqueza(a.x) || compararPt(a.nome, b.nome)).slice(0, limite)
    .map((r) => { // a linha que distingue só se calcula para os resultados que se mostram
      let d;
      return Object.defineProperty(r, 'detalhe', { enumerable: true,
        get: () => (d ||= [...detalheDe(r.grupo, r.x), r.coincidiu?.como && `${r.coincidiu.como}: ${r.coincidiu.texto}`].filter(Boolean)) });
    });
}

/** Os resultados de procurarEntidades arrumados por grupo; os grupos pela ordem do seu melhor resultado. */
export function agruparResultados(resultados) {
  const grupos = new Map();
  for (const r of resultados) { if (!grupos.has(r.grupo)) grupos.set(r.grupo, []); grupos.get(r.grupo).push(r); }
  return [...grupos].map(([grupo, itens]) => ({ grupo, titulo: GRUPOS_PROCURA[grupo], itens }));
}

// plural simples, só para os atalhos: «luthiers» → luthier, «cantores» → cantor, «canções» → cancao
const singular = (p) => (p.length < 3 ? p : p.endsWith('oes') ? `${p.slice(0, -3)}ao` : p.endsWith('res') ? p.slice(0, -2) : p.replace(/s$/, ''));
const formaAtalho = (texto) => termosProcura(texto).map(singular).join(' ');

/** Atalhos para as listas quando o texto escrito é um papel, um tipo de instrumento, um género ou um formato, com quantas
 *  fichas há: «Pessoas › Luthier (34)», «Instrumentos › Guitarra de Coimbra (26)». No máximo 3; o nome igual primeiro. */
export function atalhosProcura(consulta) {
  const termos = termosProcura(consulta).map(singular);
  if (!termos.length) return [];
  const frase = termos.join(' ');
  const res = [];
  const testar = (lista, formas, n, rota) => {
    const f = formas.map(formaAtalho);
    // o nome tem de começar pela primeira palavra: «guitarra» dá as guitarras, «Coimbra» sozinho não
    if (n && f.some((x) => x.startsWith(termos[0]) && temTodas(x, termos))) res.push({ lista, rotulo: formas[0], n, rota, exato: f.includes(frase) });
  };
  const pessoas = E.base.pessoas.filter((p) => p.tipo !== 'grupo');
  for (const [k, nome] of Object.entries(PAPEIS)) {
    if (k === 'outro' || k === 'agrupamento') continue;
    testar('Pessoas', [nome, k, nome.replace(/\/a$/, ''), nome.replace(/\/a$/, 'a')], pessoas.filter((p) => p.papeis?.includes(k)).length, `#/pessoas?papel=${k}`);
  }
  for (const t of tiposInstrumento()) testar('Instrumentos', [t.nome], t.n > 1 && t.n, `#/instrumentos?tipo=${t.valor}`);
  for (const o of opcoesDosDados(E.base.obras, 'genero', GENEROS)) testar('Obras', [o.nome], o.n, `#/obras?genero=${encodeURIComponent(o.valor)}`);
  for (const o of opcoesDosDados(E.base.gravacoes, 'formato', FORMATOS)) testar('Discografia', [o.nome], o.n, `#/discografia?formato=${encodeURIComponent(o.valor)}`);
  return res.sort((a, b) => b.exato - a.exato || b.n - a.n).slice(0, 3);
}
