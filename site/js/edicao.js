// Modo de edição: contribuições assinadas de quem os administradores do arquivo convidaram (fichas novas, dados,
// nascimento e morte, factos, referências, fotografias, notas, famílias, revisão, fontes, blogue). Cada ação lê o
// ficheiro original de dados/, altera-o e envia-o para gravar.
// Na cópia local o servidor grava, valida e reconstrói o site; online, a mesma alteração seguirá como
// proposta, que um editor aprova. Nada aqui é fonte: tudo fica assinado (quem, quando, porquê) e à vista.
import { E, carregar, juntarPendentes, REL, CAMPOS, nomeDe, comArquivo, TIPOS_FONTE, nomeContribuidor, fonteNome, catalogado, chaveMedia } from './estado.js';
import { $, api, aviso, guardar, ler, fmtData, norm, classificar, html, plural, enderecoSeguro } from './util.js';
import { ESPECIES, lerCampos, fichaVazia, fichasIguais, factosDaFichaNova, voltaSegura, outraFichaDoMedia } from './fichas.js';
import { abrirNotaNova, abrirEditarNota, fecharNota, autorNotaAntiga } from './notas.js';
import { idDoRotulo } from './desambiguar.js';
import { avisosDaSessao } from './avisos-edicao.js';
import { aplicarMinhasPropostas, juntarMinhaProposta } from './minhas-propostas.js';

export const sessao = () => E.sessao?.contribuidor || null;
export const editando = () => !!sessao() && E.editando;
// papéis: o fundador («dono») e os administradores gerem os contribuidores; com os editores, aprovam; os contribuidores propõem
export const ADMINS = ['dono', 'administrador'];
export const eAdmin = () => ADMINS.includes(sessao()?.papel);
export const podeAprovar = () => [...ADMINS, 'editor'].includes(sessao()?.papel);
export const hoje = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD na hora local
const assinar = (extra = {}) => ({ por: sessao().id, data: hoje(), ...extra });

/** Igual ao slug() de scripts/comum.py, para ids novos (textos do blogue, fontes, contribuidores). */
export const slug = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const unico = (base, existe) => { let id = base, k = 2; while (existe(id)) id = `${base}-${k++}`; return id; };

// a versão de cada ficheiro tal como se leu (/api/dados): volta com a gravação (versao_base), e o servidor recusa gravar
// por cima de uma alteração que outra pessoa fez entretanto. null: o ficheiro ainda não existia (uma ficha nova); se
// entretanto alguém criou um com o mesmo nome, o servidor também recusa, em vez de gravar por cima dele
const versoes = new Map();
const lerFicheiro = async (caminho) => {
  let r;
  try { r = await api('dados', { caminho }); } catch (e) {
    if (/inexistente/i.test(e.message)) versoes.set(caminho, null);
    throw e;
  }
  if (r.versao) versoes.set(caminho, r.versao); else versoes.delete(caminho);
  return r.conteudo;
};
/** O caminho de uma ficha (ou texto do blogue) que esta ação cria: grava-se só se ainda não existir. */
const ficheiroNovo = (caminho) => { versoes.set(caminho, null); return caminho; };
// durante uma ação: o original de cada ficheiro lido, para mostrar «Vai ficar assim» antes de gravar
let lidos = null;
const lerDados = async (caminho) => {
  const c = await lerFicheiro(caminho);
  lidos?.set(caminho, structuredClone(c));
  return c;
};
const fichaPessoa = (id) => `dados/pessoas/${id}.json`;
const urlValida = (u) => /^https?:\/\/\S+$/.test(u || '');
const exigir = (cond, msg) => { if (!cond) throw new Error(msg); };
const texto = (v) => String(v ?? '').trim();

/** Altera uma ficha («pessoas/<id>», «obras/<id>»…). `alterar` recebe a ficha e um contexto onde as fontes novas
 *  (propostas ao citar um site que ainda não é fonte) se juntam, para irem na mesma gravação. */
async function comFicha(alvo, alterar) {
  const [tipo, id] = String(alvo || '').split('/');
  exigir(ESPECIES[tipo] && id, 'Ficha desconhecida.');
  const caminho = `dados/${tipo}/${id}.json`;
  const f = await lerDados(caminho);
  const ctx = {};
  const resumo = await alterar(f, ctx);
  const alteracoes = [[caminho, f]];
  if (ctx.fontes) alteracoes.push(['fontes/fontes.json', ctx.fontes]);
  return { alteracoes, resumo: `${f[ESPECIES[tipo].titulo] || id}: ${resumo}` };
}
const comPessoa = (id, alterar) => comFicha(`pessoas/${id}`, alterar);

/** AAAA, AAAA-MM ou AAAA-MM-DD a partir dos campos dia, mês e ano (vazio se não houver ano). */
export function dataDe(d) {
  const ano = texto(d.ano), mes = texto(d.mes), dia = texto(d.dia);
  if (!ano) { exigir(!mes && !dia, 'Falta o ano.'); return ''; }
  exigir(/^\d{4}$/.test(ano), 'O ano escreve-se com quatro algarismos (ex.: 1925).');
  if (!mes) { exigir(!dia, 'Escolha também o mês.'); return ano; }
  const m = mes.padStart(2, '0');
  if (!dia) return `${ano}-${m}`;
  exigir(/^\d{1,2}$/.test(dia) && +dia >= 1 && +dia <= 31, 'O dia vai de 1 a 31.');
  return `${ano}-${m}-${dia.padStart(2, '0')}`;
}

function imagemDe(p, url) {
  const im = (p.imagens || []).find((x) => x.url === url);
  exigir(im, 'Esta imagem já não está na ficha: recarregue a página.');
  return im;
}

// ------------------------------------------------------------------ endereços e fontes

const RASTREIO = /^(utm_.*|fbclid|gclid|igshid|mc_cid|mc_eid)$/i;
/** Endereço limpo, para gravar e para comparar: sem ?m=1 nem utm_…, sem #…; nos blogues do Blogger, em https e com
 *  .blogspot.com (como o arquivo os guarda). O endereço de um comentário (…?showComment=…#c…) fica como está. */
export function limparEndereco(u) {
  const s = texto(u);
  let url;
  try { url = new URL(s); } catch { return s; }
  if (!/^https?:$/.test(url.protocol)) return s;
  const blogger = /\.blogspot\.[a-z.]+$/i.test(url.hostname);
  const tirar = [...url.searchParams.keys()].filter((k) => RASTREIO.test(k) || (blogger && k === 'm'));
  if (!blogger && !tirar.length && !url.hash) return s; // nada a limpar: fica como foi escrito
  tirar.forEach((k) => url.searchParams.delete(k));
  if (blogger) {
    url.protocol = 'https:';
    url.hostname = url.hostname.replace(/\.blogspot\.[a-z.]+$/i, '.blogspot.com');
  }
  if (!(blogger && (url.searchParams.has('showComment') || /^#c\d+$/.test(url.hash)))) url.hash = '';
  return url.href;
}

const raiz = (u) => limparEndereco(u).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
/** `u` está dentro de `base` (a mesma página, ou uma página por baixo dela; «aja.pt/cronologia» não inclui «aja.pt/cronologia-x»). */
const dentro = (u, base) => u === base || (u.startsWith(base) && '/?#'.includes(u[base.length]));

/** As fontes registadas para um endereço. `site`: a do site que publica a página (o blogue, o site, a instituição), nunca um
 *  livro só porque o registo dele aponta para essa página. `obras`: as outras fontes registadas nesse endereço, ou numa parte
 *  dele (por exemplo o livro ou o jornal que o post transcreve), de que a frase pode ser citação. `vizinhas`: sem `site`,
 *  as fontes registadas noutras páginas do mesmo site, ou no domínio a que ele pertence, ou num subdomínio dele (o arquivo
 *  sonoro arquivosonoro.museudofado.pt e a fonte «Museu do Fado»). Quem contribui escolhe; nada se adivinha. */
export function fontesDoEndereco(url, fontes = E.base?.fontes || []) {
  const u = raiz(url), host = u.split(/[/?#]/)[0];
  const comprimento = (a, b) => raiz(a.url).length - raiz(b.url).length;
  const prefixo = fontes.filter((f) => f.url && dentro(u, raiz(f.url))).sort(comprimento);
  const site = prefixo.find((f) => f.tipo !== 'livro') || null;
  const mesmoDominio = (h) => !!h && !!host && (h === host || host.endsWith(`.${h}`) || h.endsWith(`.${host}`));
  const vizinhas = site ? [] : fontes.filter((f) => f.url && !prefixo.includes(f) && mesmoDominio(raiz(f.url).split(/[/?#]/)[0])).sort(comprimento);
  return { site, obras: prefixo.filter((f) => f !== site), vizinhas };
}

/** Um site que ainda não é fonte do arquivo fica proposto (pendente) na mesma gravação, só para o uso pedido (factos, ou
 *  vídeos e áudios), com o nome que quem contribui lhe deu; um editor aprova-o ou rejeita-o. */
async function proporFonteDe(url, ctx, uso, nome) {
  ctx.fontes ||= await lerDados('fontes/fontes.json');
  const ja = fontesDoEndereco(url, ctx.fontes.fontes).site;
  if (ja) return ja;
  const origem = new URL(url), site = origem.hostname.replace(/^www\./, '');
  const id = unico(slug(site).slice(0, 40).replace(/-+$/, ''), (x) => ctx.fontes.fontes.some((f) => f.id === x));
  const f = { id, nome: texto(nome) || site, tipo: 'site', url: `${origem.protocol}//${origem.hostname}`, autor: '', estado: 'pendente', decidido_em: null,
    uso: [uso], recolha: { metodo: 'manual' }, notas: `Proposta ao citar ${url}`, proposta_por: sessao().id, proposta_em: hoje() };
  ctx.fontes.fontes.push(f);
  return f;
}

const PARES = { '«': '»', '“': '”', '„': '“', '‹': '›', '‘': '’', '"': '"', "'": "'" };
/** As aspas `abre`…`fecha` nas pontas envolvem a frase inteira (e não são o fim de um título e o princípio de outro,
 *  como em «A» e «B»)? Com aspas iguais dos dois lados ("…"), só se não houver outras lá dentro. */
function envolve(abre, fecha, dentro) {
  if (abre === fecha) return !dentro.includes(abre);
  let n = 0;
  for (const ch of dentro) {
    if (ch === abre) n++;
    else if (ch === fecha && --n < 0) return false;
  }
  return n === 0;
}
/** A frase sem os espaços e sem o par de aspas que se lhe põe à volta ao colá-la («…» ou "…", só quando envolve a frase
 *  inteira). As aspas da própria fonte, por exemplo um título entre «» no princípio ou no fim da frase, ficam: a frase
 *  guardada continua literal (a comparação com o documento já não conta as aspas das pontas, comum.trocos). */
export function semAspas(t) {
  const s = texto(t), fecha = PARES[s[0]];
  return fecha && s.length > 2 && s.at(-1) === fecha && envolve(s[0], fecha, s.slice(1, -1)) ? s.slice(1, -1).trim() : s;
}

/** Na cópia local, procura a frase no documento arquivado, com as regras do validar.py. null quando não se pode saber. */
async function confirmarNoArquivo(url, citacao) {
  if (!comArquivo() || !urlValida(url) || !citacao) return null;
  try { return await api('verificar-citacao', { url, citacao }); } catch { return null; }
}
const tituloSimples = (t) => String(t || '').replace(/^~/, '') || '(sem título)';
/** «no post «Artur Paredes» (Guitarra de Coimbra V)», a partir da resposta de /api/verificar-citacao. Um comentário tem
 *  por título «Comentário a: <título do post>», às vezes sem o título: «no comentário ao post «…»», ou «num comentário». */
export function noDocumento(v) {
  const doPost = v.tipo === 'comentario' ? String(v.titulo || '').replace(/^Coment[áa]rio a:\s*/i, '').trim() : '';
  const onde = v.tipo === 'comentario' ? (doPost ? `no comentário ao post «${doPost}»` : 'num comentário')
    : `${{ post: 'no post', pagina: 'na página' }[v.tipo] || 'no documento'} «${tituloSimples(v.titulo)}»`;
  return onde + (v.fonte ? ` (${E.fontes[v.fonte]?.nome || v.fonte})` : '');
}
export const fraseEmFalta = (v) => `Não encontrei esta frase ${noDocumento(v)}.`
  + (v.bate && v.troco ? ` Bate até «…${v.bate}», mas não a partir de «${v.troco}».` : v.troco ? ` O primeiro troço que não bate é «${v.troco}».` : '')
  + ' Copie-a à letra (pode cortar troços com …).';

/** A prova de uma afirmação: o endereço da página (ou uma fonte da lista) com a frase copiada à letra, ou o testemunho
 *  assinado de quem o sabe. A frase fica atribuída à fonte escolhida na lista (por exemplo «é do livro») ou à do site que
 *  publica a página; se o site ainda não for fonte do arquivo, fica proposto e a citação mostra «fonte pendente». Na cópia
 *  local, a frase confirma-se logo no documento arquivado. */
async function prova(d, ctx, uso = 'factos') {
  exigir(d.como, 'Diga como sabe: numa fonte ou por conhecimento próprio.'); // nada vem pré-escolhido (formularios.js)
  const nota = texto(d.nota_testemunho || d.nota);
  if (d.como !== 'fonte') return { fontes: [], nota: '', editorial: assinar(nota ? { nota } : {}) };
  const citacao = semAspas(d.citacao), url = limparEndereco(d.fonte_url);
  exigir(citacao, 'Copie à letra a frase da fonte que o diz: é a prova.');
  exigir(!url || urlValida(url), 'O endereço da página tem de começar por https://');
  let f = d.fonte ? E.fontes[d.fonte] : url ? fontesDoEndereco(url).site : null;
  exigir(url || f, 'Indique o endereço da página onde está escrito (ou, se for um livro ou disco, escolha a fonte na lista).');
  if (!f) f = await proporFonteDe(url, ctx, uso, d.fonte_nome);
  exigir(f.estado !== 'rejeitada', `A fonte «${f.nome}» foi rejeitada pelos editores: não se pode citar.`);
  exigir((f.uso || []).includes(uso), `A fonte «${f.nome}» não está aceite para ${uso === 'media' ? 'fotografias, vídeos e áudios' : 'factos'}.`);
  const v = url ? await confirmarNoArquivo(url, citacao) : null;
  exigir(v?.estado !== 'nao-encontrada', v && fraseEmFalta(v));
  const referencia = texto(d.referencia);
  return { fontes: [{ fonte: f.id, url: url || f.url, ...(v?.doc ? { doc: v.doc } : {}), citacao, ...(referencia ? { referencia } : {}),
    acrescentada: assinar() }], nota };
}

/** Datas compatíveis: iguais, ou uma mais precisa do que a outra (1925 e 1925-03-03). */
const compativeis = (a, b) => !a || !b || a.startsWith(b) || b.startsWith(a);

/** Junta um facto à ficha. Se já existir igual, a fonte nova junta-se às dele. Para nascimento, morte, naturalidade e
 *  nome completo, uma versão diferente fica ao lado das outras como divergência («As fontes divergem»). */
function juntarFacto(ficha, facto, pr) {
  ficha.factos ||= [];
  const mesmos = ficha.factos.filter((x) => x.campo === facto.campo);
  const igual = mesmos.find((x) => norm(x.valor) === norm(facto.valor) || ((x.data || facto.data) && x.data === facto.data
    && norm(x.local || '') === norm(facto.local || '')));
  if (igual) {
    exigir(pr.fontes.length, 'Isso já está registado. Para o confirmar, indique a fonte (endereço e frase).');
    igual.fontes = [...(igual.fontes || []), ...pr.fontes];
    return 'confirmado com mais uma fonte';
  }
  const novo = { ...facto, fontes: pr.fontes, ...(pr.editorial ? { editorial: pr.editorial } : {}) };
  const unicos = ['nascimento', 'morte', 'naturalidade', 'nome_completo'];
  const diverge = (x) => !compativeis(x.data, facto.data) || (x.local && facto.local && norm(x.local) !== norm(facto.local));
  if (unicos.includes(facto.campo) && mesmos.some(diverge)) {
    mesmos.forEach((x) => { x.conflito = true; });
    novo.conflito = true;
  }
  ficha.factos.push(novo);
  return novo.conflito ? 'acrescentada outra versão (as fontes divergem)' : 'acrescentado';
}

/** Facto, relação ou referência acrescentada no modo de edição (e não tirada das fontes pelo agente). */
const deContribuidor = (x) => x.editorial || (x.fontes?.length && x.fontes.every((c) => c.acrescentada));
const autorDe = (x) => x.editorial?.por || x.fontes?.[0]?.acrescentada?.por;

/** Um id já usado por uma ficha deste tipo, ou por uma ficha que foi juntada a outra (o endereço antigo reencaminha). */
const ocupado = (tipo, id) => !!E.por[tipo]?.[id] || !!E.juntadas?.[tipo]?.[id];

/** Ficha mínima de uma pessoa que ainda não está no arquivo, criada a partir de uma relação (ou de um disco, de uma
 *  obra…: `nota`). `tambem`: ids já dados a outras fichas novas da mesma gravação. */
function fichaNova(nome, nota = 'Ficha criada no modo de edição, a partir de uma relação.', tambem = new Set()) {
  const base = slug(nome);
  exigir(base, 'Escreva o nome da pessoa.');
  // a mesma regra de «Nova pessoa»: com este nome (ou com este entre os outros nomes) já há uma ficha (P5a)
  const [ja] = fichasIguais('pessoas', nome);
  exigir(!ja, `Já existe a ficha «${ja?.nome}»${ja && norm(ja.nome) !== norm(nome) ? ` (também «${nome}»)` : ''}: escolha-a na lista em vez de criar outra.`
    + ' Se for outra pessoa com o mesmo nome, crie-a primeiro em «Nova pessoa» e marque a caixa «é outra».');
  const id = unico(base, (x) => ocupado('pessoas', x) || tambem.has(x));
  ficheiroNovo(fichaPessoa(id)); // P6: versao_base null
  return { id, tipo: 'pessoa', nome, nomes_alternativos: [], papeis: [], biografia: [],
    factos: [], relacoes: [], imagens: [], ligacoes: [], estado_revisao: 'rascunho',
    editorial: assinar({ nota }) };
}

/** Relação sem fonte própria (indicada no modo de edição ou com citações aí acrescentadas): pode ser retirada. */
const relacaoDeContribuidor = deContribuidor;

// ------------------------------------------------------------------ desambiguação
// Juntar duas fichas que são a mesma; separar uma ficha que mistura duas pessoas (ou duas músicas) com o mesmo nome;
// marcar duas fichas como diferentes («não confundir com»). Tudo o que noutras fichas aponta para elas é corrigido.

const troca = (lista, de, para) => [...new Set((lista || []).map((x) => (x === de ? para : x)))];
/** Onde cada tipo de ficha é referido noutras: [tipo da ficha que refere, troca as referências de → para]. */
const LIGACOES = {
  pessoas: [
    ['pessoas', (f, de, para) => { for (const r of f.relacoes || []) if (r.alvo === de) r.alvo = para; }],
    ['gravacoes', (f, de, para) => { for (const i of f.interpretes || []) if (i.pessoa === de) i.pessoa = para; }],
    ['obras', (f, de, para) => { f.musica = troca(f.musica, de, para); f.letra = troca(f.letra, de, para); }],
    ['instrumentos', (f, de, para) => {
      if (f.construtor === de) f.construtor = para;
      for (const x of f.proprietarios || []) if (x.pessoa === de) x.pessoa = para;
    }],
    ['media', (f, de, para) => { f.pessoas = troca(f.pessoas, de, para); }],
  ],
  obras: [
    ['gravacoes', (f, de, para) => { for (const x of f.faixas || []) if (x.obra === de) x.obra = para; }],
    ['media', (f, de, para) => { f.obras = troca(f.obras, de, para); }],
  ],
  gravacoes: [['media', (f, de, para) => { if (f.gravacao === de) f.gravacao = para; }]],
  media: [['gravacoes', (f, de, para) => { for (const x of f.faixas || []) if (x.media) x.media = troca(x.media, de, para); }]],
  instrumentos: [],
};

/** Fichas (de outros ficheiros) que referem `id`, lidas do repositório e já corrigidas para `para`. */
async function corrigirReferencias(tipo, id, para, ignorar = new Set(), escolher = () => true) {
  const res = [];
  for (const [t, trocar] of LIGACOES[tipo]) {
    for (const x of E.base[t] || []) {
      const chave = `${t}/${x.id}`;
      if (ignorar.has(chave) || !JSON.stringify(x).includes(`"${id}"`) || !escolher(t, x.id)) continue;
      const f = await lerDados(`dados/${chave}.json`);
      const antes = JSON.stringify(f);
      trocar(f, id, para);
      if (t === 'pessoas') f.relacoes = semRepetidas(f.relacoes, f.id);
      if (JSON.stringify(f) !== antes) res.push([`dados/${chave}.json`, f]);
    }
  }
  return res;
}

/** Relações sem repetições nem relações consigo própria; se duas iguais tiverem fontes diferentes, juntam-se. */
function semRepetidas(relacoes, dono) {
  const vistas = new Map();
  for (const r of relacoes || []) {
    if (r.alvo === dono) continue;
    const k = `${r.tipo}|${r.alvo}`;
    if (!vistas.has(k)) { vistas.set(k, r); continue; }
    const v = vistas.get(k);
    v.fontes = [...(v.fontes || []), ...(r.fontes || [])];
    if (v.fontes.length) delete v.editorial;
  }
  return [...vistas.values()];
}

const juntarListas = (a, b, chave = (x) => JSON.stringify(x)) => {
  const vistos = new Set((a || []).map(chave));
  return [...(a || []), ...(b || []).filter((x) => !vistos.has(chave(x)))];
};

const NOTA_ANTIGA = ['nota_editor', 'nota_editor_por', 'nota_editor_em'];

/** Junta a ficha `b` em `a` (as duas do mesmo tipo): nada se perde, o que só `b` tinha passa para `a`. As notas assinadas
 *  juntam-se em lista, cada uma com quem a escreveu. Devolve o que fica registado na entrada «juntou» (a nota antiga de `b`,
 *  quando não pode ficar com a sua assinatura). */
function fundir(tipo, a, b) {
  const titulo = ESPECIES[tipo].titulo;
  for (const [k, v] of Object.entries(b)) { // campos simples que `a` não tinha
    if (['id', 'editorial', 'estado_revisao', 'revisto_por', 'revisto_em', 'notas_editor', ...NOTA_ANTIGA, titulo].includes(k)) continue;
    if (typeof v === 'string' && v && !a[k]) a[k] = v;
    if (v && typeof v === 'object' && !Array.isArray(v) && !a[k]) a[k] = v;
  }
  const alt = tipo === 'pessoas' ? 'nomes_alternativos' : 'titulos_alternativos';
  if (['pessoas', 'obras'].includes(tipo)) {
    a[alt] = [...new Set([...(a[alt] || []), b[titulo], ...(b[alt] || [])])].filter((x) => x && norm(x) !== norm(a[titulo]));
  }
  for (const k of ['papeis', 'musica', 'letra', 'pessoas', 'obras']) if (a[k] || b[k]) a[k] = [...new Set([...(a[k] || []), ...(b[k] || [])])];
  for (const k of ['biografia', 'factos', 'fontes', 'ligacoes']) if (a[k] || b[k]) a[k] = juntarListas(a[k], b[k]);
  if (a.imagens || b.imagens) a.imagens = juntarListas(a.imagens, b.imagens, (x) => x.url);
  if (a.referencias || b.referencias) a.referencias = juntarListas(a.referencias, b.referencias, (x) => x.url);
  if (a.relacoes || b.relacoes) a.relacoes = semRepetidas([...(a.relacoes || []), ...(b.relacoes || []).map((r) => ({ ...r }))], a.id);
  if (a.interpretes || b.interpretes) a.interpretes = juntarListas(a.interpretes, b.interpretes, (x) => x.pessoa);
  if (a.proprietarios || b.proprietarios) a.proprietarios = juntarListas(a.proprietarios, b.proprietarios, (x) => x.pessoa);
  if (!a.faixas?.length && b.faixas?.length) a.faixas = b.faixas;
  if (a.notas_editor || b.notas_editor) a.notas_editor = juntarListas(a.notas_editor, b.notas_editor);
  // a nota antiga (uma por ficha) nunca fica com a assinatura de outra pessoa: passa tal como está, junta-se à do mesmo autor,
  // ou entra na lista se tiver autor e data; senão fica guardada na entrada «juntou»
  const extra = {};
  if (b.nota_editor) {
    if (!a.nota_editor) NOTA_ANTIGA.forEach((k) => { if (b[k]) a[k] = b[k]; });
    else if (autorNotaAntiga(a) === autorNotaAntiga(b)) a.nota_editor = `${a.nota_editor} / ${b.nota_editor}`;
    else if (b.nota_editor_por && b.nota_editor_em) (a.notas_editor ||= []).push({ por: b.nota_editor_por, data: b.nota_editor_em, texto: b.nota_editor });
    else extra.nota_editor = b.nota_editor;
  }
  a.distinta_de = juntarListas(a.distinta_de, b.distinta_de, (x) => x.id).filter((x) => x.id !== a.id && x.id !== b.id);
  if (!a.distinta_de.length) delete a.distinta_de;
  a.juntou = [...(a.juntou || []), ...(b.juntou || [])];
  // nascimento, morte, naturalidade e nome completo: se as duas fichas diziam coisas diferentes, fica à vista
  for (const campo of ['nascimento', 'morte', 'naturalidade', 'nome_completo']) {
    const v = (a.factos || []).filter((f) => f.campo === campo);
    const diferentes = new Set(v.map((f) => `${f.data || ''}|${norm(f.local || f.valor)}`));
    if (diferentes.size > 1) v.forEach((f) => { f.conflito = true; });
  }
  return extra;
}

/** A nota a que um pedido se refere (`onde`: ficha, antiga, facto ou facto-antiga; `indice` na lista; `facto` e
 *  `valorFacto` nas de um facto; `textoAntes` confirma que ninguém a mudou entretanto). `tirar()` retira-a da ficha. */
function notaDe(p, { onde, indice, facto, valorFacto, textoAntes }) {
  const mudou = 'A nota mudou entretanto: recarregue a página.';
  const fa = onde === 'facto' || onde === 'facto-antiga' ? p.factos?.[+facto] : null;
  exigir(!onde?.startsWith('facto') || (fa && (!valorFacto || fa.valor === valorFacto)), 'A ficha mudou entretanto: recarregue a página.');
  const dono = fa || p, chave = fa ? 'notas_editoriais' : 'notas_editor';
  const guardar = (l) => { if (l?.length) dono[chave] = l; else delete dono[chave]; };
  const base = { facto: fa, lista: dono[chave], guardar };
  if (onde === 'antiga') {
    exigir(p.nota_editor && (textoAntes === undefined || p.nota_editor === textoAntes), mudou);
    return { ...base, antiga: true, n: { texto: p.nota_editor }, autor: autorNotaAntiga(p), tirar: () => NOTA_ANTIGA.forEach((k) => delete p[k]) };
  }
  if (onde === 'facto-antiga') {
    exigir(fa.nota_editorial && (textoAntes === undefined || fa.nota_editorial.texto === textoAntes), mudou);
    return { ...base, antiga: true, n: fa.nota_editorial, autor: fa.nota_editorial.por, tirar: () => delete fa.nota_editorial };
  }
  const n = dono[chave]?.[+indice];
  exigir(n && (textoAntes === undefined || n.texto === textoAntes), mudou);
  return { ...base, n, autor: n.por, tirar: () => { dono[chave].splice(+indice, 1); guardar(dono[chave]); } };
}
const retirarNota = (x) => x.tirar();

const USOS = { factos: 'factos (datas, biografias, relações)', media: 'fotografias, vídeos e áudios' };
/** Os usos escolhidos para uma fonte (pelo menos um). Com `id`, nunca sem um uso de que as citações dela dependem: o
 *  validador recusaria todas essas citações e, online, o site deixava de se atualizar. */
function usosDe(uso, id) {
  const u = [].concat(uso || []).filter((x) => USOS[x]);
  exigir(u.length, 'Escolha para que serve a fonte: factos, ou fotografias, vídeos e áudios (ou os dois).');
  if (id) {
    const citados = usosCitados(citacoesDaFonte(id)), falta = Object.keys(USOS).find((k) => citados[k] && !u.includes(k));
    exigir(!falta, falta && `Esta fonte não pode deixar de servir para ${USOS[falta]}: ${plural(citados[falta], 'citação depende', 'citações dependem')} disso.`);
  }
  return u;
}
const EXCLUIDOS = 'dados/excluidos.json'; // endereços retirados do catálogo, que os scripts não voltam a catalogar
/** As fichas de media do mesmo vídeo ou áudio (a mesma chave do leitor, ou o mesmo endereço; como chave_endereco em
 *  comum.py): o mesmo áudio pode estar catalogado em vários discos, e retirá-lo do catálogo retira-o de todos. */
const enderecoComparavel = (u) => limparEndereco(u).replace(/^http:/i, 'https:').replace(/\/+$/, '');
const mesmoMedia = (m) => (E.base?.media || []).filter((x) => x.id === m.id || chaveMedia(x) === chaveMedia(m)
  || (!!x.url && !!m.url && enderecoComparavel(x.url) === enderecoComparavel(m.url)));

const ACOES = {
  // ---- fichas de pessoas
  revisao: ({ id, alvo, estado }) => comFicha(alvo || `pessoas/${id}`, (p) => {
    exigir(podeAprovar(), 'Só os editores marcam fichas como revistas.');
    p.estado_revisao = estado;
    if (estado === 'revisto') Object.assign(p, { revisto_por: sessao().id, revisto_em: hoje() });
    else { delete p.revisto_por; delete p.revisto_em; }
    return `marcada como ${estado}`;
  }),

  // ---- notas assinadas (ver notas.js): cada nota é de quem a escreveu; uma nota nova junta-se às outras, nunca as substitui
  'nota-editor': ({ id, alvo, texto: nota }) => comFicha(alvo || `pessoas/${id}`, (p) => {
    nota = texto(nota);
    exigir(nota, 'Escreva a nota.');
    (p.notas_editor ||= []).push(assinar({ texto: nota }));
    return 'nota acrescentada';
  }),

  'editar-nota': ({ texto: nota, ...d }) => comFicha(d.alvo, (p) => {
    const x = notaDe(p, d);
    exigir(x.autor === sessao().id, 'Só quem escreveu a nota a pode corrigir.');
    nota = texto(nota);
    exigir(nota, 'Escreva a nota (para a retirar, use ×).');
    if (x.antiga) { // a nota antiga, corrigida pelo autor, passa para a lista com a assinatura dele
      retirarNota(x);
      (x.lista ||= []).push(assinar({ texto: nota }));
      x.guardar(x.lista);
    } else Object.assign(x.n, { texto: nota, data: hoje() });
    return `nota corrigida${x.facto ? ` (facto «${x.facto.valor.slice(0, 60)}»)` : ''}`;
  }),

  'retirar-nota': (d) => comFicha(d.alvo, (p) => {
    const x = notaDe(p, d);
    exigir(x.autor === sessao().id, 'Só quem escreveu a nota a pode retirar (um editor pode escondê-la).');
    retirarNota(x);
    return `nota retirada${x.facto ? ` (facto «${x.facto.valor.slice(0, 60)}»)` : ''}`;
  }),

  'esconder-nota': ({ motivo, mostrar, ...d }) => comFicha(d.alvo, (p) => {
    exigir(podeAprovar(), 'Só os editores escondem notas de outras pessoas.');
    const x = notaDe(p, d);
    exigir(!x.antiga, 'As notas antigas só o autor as muda.');
    if (mostrar) { delete x.n.oculta; return 'nota de novo visível'; }
    exigir(texto(motivo), 'Diga porque esconde a nota (fica registado).');
    x.n.oculta = assinar({ nota: texto(motivo) });
    return `nota de ${nomeContribuidor(x.autor)} escondida`;
  }),

  retrato: ({ id, url }) => comPessoa(id, (p) => {
    const im = imagemDe(p, url);
    p.imagens = [im, ...p.imagens.filter((x) => x !== im)];
    p.imagens.forEach((x) => delete x.escolhida);
    delete im.oculta;
    im.escolhida = assinar();
    return 'retrato escolhido';
  }),

  'ocultar-imagem': ({ id, url, nota }) => comPessoa(id, (p) => {
    const im = imagemDe(p, url);
    delete im.escolhida;
    im.oculta = assinar(nota ? { nota } : {});
    return 'imagem escondida';
  }),

  'mostrar-imagem': ({ id, url }) => comPessoa(id, (p) => {
    delete imagemDe(p, url).oculta;
    return 'imagem de novo visível';
  }),

  'nova-imagem': ({ id, url, origem, legenda, nota, retrato }) => comPessoa(id, (p) => {
    url = String(url || '').trim(); origem = String(origem || '').trim();
    exigir(urlValida(url), 'O endereço da imagem tem de começar por https://');
    exigir(urlValida(origem), 'Indique a página onde a fotografia está publicada (começa por https://).');
    p.imagens ||= [];
    exigir(!p.imagens.some((x) => x.url === url), 'Essa imagem já está na ficha.');
    const im = { url, legenda: String(legenda || '').trim(), fontes: [], editorial: assinar({ origem, ...(nota ? { nota } : {}) }) };
    if (retrato) {
      p.imagens.forEach((x) => delete x.escolhida);
      im.escolhida = assinar();
      p.imagens.unshift(im);
    } else p.imagens.push(im);
    return 'fotografia acrescentada';
  }),

  async 'nova-relacao'({ id, relacao, outro, nova_pessoa, nota, ...resto }) {
    const [tipo, sentido] = String(relacao || '').split('|');
    exigir(REL[tipo], 'Escolha o tipo de relação.');
    nova_pessoa = String(nova_pessoa || '').trim();
    exigir(E.por.pessoas[outro] || nova_pessoa, 'Escolha a pessoa na lista que aparece ao escrever o nome (ou «Criar a ficha», se ainda não existir).');
    const ctx = {};
    // as duas notas ficam (P5a). Num testemunho, o «Como sabe?» e a «Nota» juntam-se na assinatura (editorial.nota), que
    // se vê no ✎ da relação; com fonte, a «Nota» fica na relação, como antes
    const pr = await prova(resto, ctx), extra = texto(nota);
    const relacao_ = pr.editorial
      ? { ...pr, editorial: { ...pr.editorial, ...(extra ? { nota: [pr.editorial.nota, extra].filter(Boolean).join('; ') } : {}) } }
      : { ...pr, nota: extra };
    if (!relacao_.nota) delete relacao_.nota;
    const nova = nova_pessoa ? fichaNova(nova_pessoa) : null;
    const outroId = nova ? nova.id : outro;
    exigir(outroId !== id, 'Uma pessoa não se relaciona consigo própria.');
    // a relação guarda-se só num sentido, na ficha de quem «é filho de», «é aluno de», «é membro de»…
    const [dono, alvo] = sentido === 'inv' ? [outroId, id] : [id, outroId];
    const ja = (de, para) => (E.por.pessoas[de]?.relacoes || []).some((r) => r.tipo === tipo && r.alvo === para);
    exigir(!ja(dono, alvo) && !(REL[tipo].sim && ja(alvo, dono)), 'Essa relação já está registada.');
    const rel = { tipo, alvo, ...relacao_ };
    const alteracoes = [];
    if (nova && dono === nova.id) nova.relacoes.push(rel);
    else {
      const p = await lerDados(fichaPessoa(dono));
      (p.relacoes ||= []).push(rel);
      alteracoes.push([fichaPessoa(dono), p]);
    }
    if (nova) alteracoes.push([fichaPessoa(nova.id), nova]);
    if (ctx.fontes) alteracoes.push(['fontes/fontes.json', ctx.fontes]);
    const nome = (x) => (nova && x === nova.id ? nova.nome : nomeDe(x));
    return { alteracoes, resumo: `${nome(dono)}: ${REL[tipo].dir} ${nome(alvo)}${nova ? ` (ficha nova: ${nova.nome})` : ''}` };
  },

  'retirar-relacao': ({ dono, tipo, alvo }) => comPessoa(dono, (p) => {
    const i = (p.relacoes || []).findIndex((r) => r.tipo === tipo && r.alvo === alvo && relacaoDeContribuidor(r));
    exigir(i >= 0, 'Só se retiram relações acrescentadas no modo de edição; as que o agente tirou das fontes ficam.');
    p.relacoes.splice(i, 1);
    return `retirada a relação «${REL[tipo].dir} ${nomeDe(alvo)}»`;
  }),

  async 'apagar-ficha'({ id, alvo }) {
    const [tipo, idFicha] = String(alvo || `pessoas/${id}`).split('/');
    if (tipo !== 'pessoas') {
      const f = await lerDados(`dados/${tipo}/${idFicha}.json`);
      exigir(f.editorial && !f.factos?.length, 'Só se apagam fichas criadas no modo de edição e ainda sem factos.');
      exigir(f.editorial.por === sessao().id || podeAprovar(), 'Só quem criou a ficha ou um editor a pode apagar.');
      return { alteracoes: [[`dados/${tipo}/${idFicha}.json`, null]], resumo: `ficha apagada: ${f[ESPECIES[tipo].titulo]}`, ir: ESPECIES[tipo].lista };
    }
    id = idFicha;
    const p = await lerDados(fichaPessoa(id));
    exigir(p.editorial && !p.factos?.length && !p.biografia?.length, 'Só se apagam fichas criadas no modo de edição e ainda sem factos.');
    exigir(p.editorial.por === sessao().id || podeAprovar(), 'Só quem criou a ficha ou um editor a pode apagar.');
    const alteracoes = [[fichaPessoa(id), null]];
    for (const q of E.base.pessoas) {
      if (q.id === id || !(q.relacoes || []).some((r) => r.alvo === id)) continue;
      exigir(q.relacoes.filter((r) => r.alvo === id).every(relacaoDeContribuidor), `A ficha de ${q.nome} liga a esta por uma fonte: não se pode apagar.`);
      const f = await lerDados(fichaPessoa(q.id));
      f.relacoes = f.relacoes.filter((r) => r.alvo !== id);
      alteracoes.push([fichaPessoa(q.id), f]);
    }
    return { alteracoes, resumo: `ficha apagada: ${p.nome}`, ir: '#/pessoas' };
  },

  'nota-facto': ({ id, alvo, indice, valorFacto, texto: nota }) => comFicha(alvo || `pessoas/${id}`, (p) => {
    const f = p.factos?.[+indice];
    exigir(f && (valorFacto === undefined || f.valor === valorFacto), 'A ficha mudou entretanto: recarregue a página.');
    nota = texto(nota);
    exigir(nota, 'Escreva a nota.');
    (f.notas_editoriais ||= []).push(assinar({ texto: nota }));
    return `nota sobre o facto «${f.valor.slice(0, 60)}»`;
  }),

  // ---- nascimento, morte, factos e referências (em fichas de qualquer tipo)
  vida: ({ alvo, campo, local, aprox, ...d }) => comFicha(alvo, async (p, ctx) => {
    exigir(['nascimento', 'morte'].includes(campo), 'Campo desconhecido.');
    const data = dataDe(d);
    local = texto(local);
    exigir(data || local, 'Indique a data, o local, ou os dois.');
    const quando = data ? (aprox ? `c. ${data.slice(0, 4)}` : fmtData(data)) : '';
    const facto = { campo, valor: [quando, local].filter(Boolean).join(', '), ...(data && !aprox ? { data } : {}), ...(local ? { local } : {}) };
    return `${CAMPOS[campo].toLowerCase()} ${juntarFacto(p, facto, await prova(d, ctx))}: ${facto.valor}`;
  }),

  'novo-facto': ({ alvo, campo, valor, local, aprox, ...d }) => comFicha(alvo, async (f, ctx) => {
    exigir(CAMPOS[campo], 'Escolha o tipo de facto.');
    valor = texto(valor); local = texto(local);
    exigir(valor, 'Escreva o facto (ex.: «Atuou no Coliseu dos Recreios com Luiz Goes»).');
    const data = dataDe(d);
    const facto = { campo, valor: data && aprox ? `${valor} (c. ${data.slice(0, 4)})` : valor, ...(data && !aprox ? { data } : {}), ...(local ? { local } : {}) };
    return `facto ${juntarFacto(f, facto, await prova(d, ctx))} (${CAMPOS[campo].toLowerCase()})`;
  }),

  'retirar-facto': ({ alvo, indice, valor }) => comFicha(alvo, (f) => {
    const fa = f.factos?.[+indice];
    exigir(fa && fa.valor === valor, 'A ficha mudou entretanto: recarregue a página.');
    exigir(deContribuidor(fa), 'Só se retiram factos acrescentados no modo de edição; os que o agente tirou das fontes ficam (pode juntar-lhes uma nota).');
    exigir(autorDe(fa) === sessao().id || podeAprovar(), 'Só quem o acrescentou ou um editor o pode retirar.');
    f.factos.splice(+indice, 1);
    const resto = f.factos.filter((x) => x.campo === fa.campo);
    if (resto.length === 1) delete resto[0].conflito; // ficou uma só versão: já não há divergência
    return `facto retirado: «${valor.slice(0, 60)}»`;
  }),

  'nova-referencia': ({ alvo, titulo, url, publicacao, autor, ano, nota }) => comFicha(alvo, (f) => {
    titulo = texto(titulo); url = texto(url); ano = texto(ano);
    exigir(titulo && urlValida(url), 'Indique o título e o endereço (https://…).');
    exigir(!ano || /^\d{4}$/.test(ano), 'O ano escreve-se com quatro algarismos.');
    f.referencias ||= [];
    exigir(!f.referencias.some((r) => r.url === url), 'Essa referência já está na ficha.');
    f.referencias.push({ titulo, url, ...(texto(publicacao) ? { publicacao: texto(publicacao) } : {}), ...(texto(autor) ? { autor: texto(autor) } : {}),
      ...(ano ? { ano } : {}), editorial: assinar(texto(nota) ? { nota: texto(nota) } : {}) });
    return `referência acrescentada: ${titulo}`;
  }),

  'retirar-referencia': ({ alvo, url }) => comFicha(alvo, (f) => {
    const i = (f.referencias || []).findIndex((r) => r.url === url);
    exigir(i >= 0, 'Essa referência já não está na ficha.');
    exigir(f.referencias[i].editorial?.por === sessao().id || podeAprovar(), 'Só quem a acrescentou ou um editor a pode retirar.');
    const [r] = f.referencias.splice(i, 1);
    return `referência retirada: ${r.titulo}`;
  }),

  // ---- fichas novas e dados das fichas (pessoas e grupos, obras, discos, instrumentos, vídeos e áudios)
  async 'guardar-ficha'({ especie: tipo, id, homonimo, volta, ...d }) { // «tipo» é um campo das pessoas (pessoa ou grupo)
    const esp = ESPECIES[tipo];
    exigir(esp, 'Tipo de ficha desconhecido.');
    const novo = !id;
    const ficha = novo ? fichaVazia(tipo) : await lerDados(`dados/${tipo}/${id}.json`);
    // pessoas escritas com «+ Criar a ficha» (intérpretes, autores, construtor…): fichas mínimas na mesma gravação (P5a)
    const novas = new Map();
    const novaPessoa = (nome) => {
      if (!novas.has(norm(nome))) novas.set(norm(nome), fichaNova(nome, '', new Set([...novas.values()].map((p) => p.id))));
      return novas.get(norm(nome)).id;
    };
    Object.assign(ficha, lerCampos(tipo, d, novaPessoa));
    const titulo = ficha[esp.titulo];
    exigir(titulo, `Falta: ${esp.campos.find((c) => c.k === esp.titulo).r}.`);
    const vidas = novo ? factosDaFichaNova(tipo, ficha, d) : []; // nascimento e morte escritos ao criar a pessoa
    if (tipo === 'media') {
      const c = classificar(ficha.url);
      exigir(c && ['video', 'audio'].includes(c.tipo), 'Esse endereço não é de um vídeo ou áudio que o arquivo saiba tocar (YouTube, Vimeo, SoundCloud…).');
      // o mesmo vídeo com outro endereço (youtu.be/…, ?si=…) também conta: compara-se a plataforma e a chave
      // (ao corrigir uma ficha que já tinha este vídeo, as outras fichas dele, uma por disco, não contam)
      const ja = outraFichaDoMedia(c, id);
      exigir(!ja, `Esse vídeo ou áudio já está catalogado: «${ja?.titulo}». Corrija essa ficha em vez de criar outra.`);
      Object.assign(ficha, { url: c.url, tipo: c.tipo, plataforma: c.plataforma });
    }
    const ctx = {};
    if (d.como === 'fonte') (ficha.fontes ||= []).push(...(await prova(d, ctx, esp.fonte)).fontes);
    for (const { facto, dados } of vidas) juntarFacto(ficha, facto, await prova(dados, ctx));
    const alteracoes = [];
    if (novo) {
      // o mesmo nome (ou um dos outros nomes) noutra ficha: ou é a mesma (acrescente-se lá), ou é outra e ficam as duas
      // marcadas «não confundir com»
      const iguais = fichasIguais(tipo, titulo);
      exigir(!iguais.length || homonimo, `Já existe «${iguais[0]?.[esp.titulo]}». Se for a mesma, acrescente lá o que sabe; se for outra com o mesmo nome, marque a caixa «é outra».`);
      ficha.id = unico(slug(titulo).slice(0, 70).replace(/-+$/, '') || tipo, (x) => ocupado(tipo, x));
      ficheiroNovo(`dados/${tipo}/${ficha.id}.json`); // P6: versao_base null
      Object.assign(ficha, { estado_revisao: 'rascunho', editorial: assinar() });
      for (const x of iguais) {
        (ficha.distinta_de ||= []).push({ id: x.id, ...assinar() });
        const outra = await lerDados(`dados/${tipo}/${x.id}.json`);
        (outra.distinta_de ||= []).push({ id: ficha.id, ...assinar() });
        alteracoes.push([`dados/${tipo}/${x.id}.json`, outra]);
      }
    }
    alteracoes.unshift([`dados/${tipo}/${ficha.id}.json`, ficha]);
    for (const p of novas.values()) {
      p.editorial.nota = `Ficha criada no modo de edição, a partir de «${titulo}» (${esp.nome}).`;
      alteracoes.push([fichaPessoa(p.id), p]);
    }
    if (ctx.fontes) alteracoes.push(['fontes/fontes.json', ctx.fontes]);
    const ir = voltaSegura(volta) || (esp.rota ? `#/${esp.rota}/${ficha.id}` : ficha.pessoas?.[0] ? `#/pessoa/${ficha.pessoas[0]}` : esp.lista);
    const criada = `${tipo === 'pessoas' && ficha.tipo === 'grupo' ? 'Novo grupo' : esp.nova}: ${titulo}`;
    const fichasNovas = novas.size ? ` (fichas novas: ${[...novas.values()].map((p) => p.nome).join(', ')})` : '';
    return { alteracoes, resumo: `${novo ? criada : `${titulo}: dados corrigidos`}${fichasNovas}`, ir };
  },

  // «Tirar esta pessoa deste vídeo» (no cartão, na ficha da pessoa): o motivo é obrigatório e fica no histórico (P5a)
  'tirar-pessoa-media': ({ alvo, pessoa, nota }) => comFicha(alvo, (m) => {
    exigir(String(alvo || '').startsWith('media/'), 'Só se tiram pessoas de vídeos e áudios.');
    exigir((m.pessoas || []).includes(pessoa), 'Esta pessoa já não está neste vídeo ou áudio: recarregue a página.');
    nota = texto(nota);
    exigir(nota, 'Diga porque é que esta pessoa não está neste vídeo ou áudio: o motivo fica no histórico.');
    m.pessoas = m.pessoas.filter((x) => x !== pessoa);
    return `tirada a pessoa ${nomeDe(pessoa)} (${nota})`;
  }),

  // ---- desambiguação
  async juntar({ tipo, manter, outra, nota }) {
    const esp = ESPECIES[tipo];
    if (!E.por[tipo]?.[outra]) outra = idDoRotulo(tipo, outra); // obras e discos escolhem-se pelo título
    exigir(esp && manter && outra && manter !== outra, 'Escolha a outra ficha (diferente desta).');
    const a = await lerDados(`dados/${tipo}/${manter}.json`), b = await lerDados(`dados/${tipo}/${outra}.json`);
    exigir(!(a.distinta_de || []).some((x) => x.id === outra), `As duas fichas estão marcadas como diferentes («não confundir»). Se afinal são a mesma, retire primeiro essa marca.`);
    const extra = fundir(tipo, a, b);
    // o que vem de uma ficha por rever não fica com o selo «revisto» da outra: a ficha junta volta a ficar por rever
    if (a.estado_revisao === 'revisto' && b.estado_revisao !== 'revisto') {
      a.estado_revisao = 'rascunho';
      delete a.revisto_por;
      delete a.revisto_em;
    }
    a.juntou.push({ id: outra, [esp.titulo]: b[esp.titulo], ...assinar(texto(nota) ? { nota: texto(nota) } : {}), ...extra });
    // quem apontava para a ficha juntada passa a apontar para esta (a antiga deixa de existir; o endereço reencaminha)
    const outras = await corrigirReferencias(tipo, outra, manter, new Set([`${tipo}/${manter}`, `${tipo}/${outra}`]));
    // «não confundir com» a ficha juntada, noutras fichas do mesmo tipo, passa a apontar para a que fica
    for (const x of E.base[tipo] || []) {
      if ([manter, outra].includes(x.id) || !(x.distinta_de || []).some((d) => d.id === outra)) continue;
      const cam = `dados/${tipo}/${x.id}.json`;
      if (!outras.some(([c]) => c === cam)) outras.push([cam, await lerDados(cam)]);
    }
    for (const [, f] of outras) {
      if (f.distinta_de) f.distinta_de = juntarListas(f.distinta_de.map((d) => (d.id === outra ? { ...d, id: manter } : d)), [], (d) => d.id);
    }
    return { alteracoes: [[`dados/${tipo}/${manter}.json`, a], [`dados/${tipo}/${outra}.json`, null], ...outras],
      resumo: `${a[esp.titulo]}: juntada a ficha «${b[esp.titulo]}»`, ir: esp.rota ? `#/${esp.rota}/${manter}` : esp.lista };
  },

  async distintas({ tipo, a: idA, b: idB, nota, retirar }) {
    const esp = ESPECIES[tipo];
    if (!E.por[tipo]?.[idB]) idB = idDoRotulo(tipo, idB);
    exigir(esp && idA && idB && idA !== idB, 'Escolha a outra ficha (diferente desta).');
    const alteracoes = [];
    for (const [x, y] of [[idA, idB], [idB, idA]]) {
      const f = await lerDados(`dados/${tipo}/${x}.json`);
      f.distinta_de = (f.distinta_de || []).filter((d) => d.id !== y);
      if (!retirar) f.distinta_de.push({ id: y, ...assinar(texto(nota) ? { nota: texto(nota) } : {}) });
      if (!f.distinta_de.length) delete f.distinta_de;
      alteracoes.push([`dados/${tipo}/${x}.json`, f]);
    }
    const nome = (id) => E.por[tipo]?.[id]?.[esp.titulo] || id;
    return { alteracoes, resumo: `${nome(idA)} e ${nome(idB)}: ${retirar ? 'retirada a marca «não confundir»' : 'marcadas como diferentes'}` };
  },

  /** Separar: o que se escolheu (factos, excertos, relações, fotografias, gravações, interpretações…) passa para outra
   *  ficha, nova ou já existente; as duas ficam marcadas «não confundir com». */
  async separar({ tipo, id, destino, nome, outro, itens, nota }) {
    const esp = ESPECIES[tipo];
    exigir(['pessoas', 'obras'].includes(tipo), 'Só se separam pessoas e obras.');
    itens = [].concat(itens || []);
    exigir(itens.length, 'Escolha o que pertence à outra ficha.');
    const a = await lerDados(`dados/${tipo}/${id}.json`);
    let b;
    if (destino === 'existente') {
      if (!E.por[tipo]?.[outro]) outro = idDoRotulo(tipo, outro);
      exigir(E.por[tipo]?.[outro] && outro !== id, 'Escolha a outra ficha na lista.');
      b = await lerDados(`dados/${tipo}/${outro}.json`);
    } else {
      nome = texto(nome) || a[esp.titulo];
      b = { ...fichaVazia(tipo), [esp.titulo]: nome, estado_revisao: 'rascunho' };
      b.id = unico(slug(nome).slice(0, 70).replace(/-+$/, ''), (x) => ocupado(tipo, x));
      ficheiroNovo(`dados/${tipo}/${b.id}.json`); // P6: versao_base null
      b.editorial = assinar({ nota: `Separada de «${a[esp.titulo]}»${texto(nota) ? `: ${texto(nota)}` : ''}` });
      if (tipo === 'pessoas') Object.assign(b, { tipo: a.tipo || 'pessoa' });
    }
    const escolhido = new Set(itens);
    // na própria ficha: listas cujos elementos se movem (por posição, ou pelo endereço nas imagens e referências)
    const mover = (k, chave) => {
      if (!a[k]?.length) return;
      const ficam = [];
      a[k].forEach((x, i) => (escolhido.has(`${k}:${chave ? chave(x) : i}`) ? (b[k] ||= []).push(x) : ficam.push(x)));
      a[k] = ficam;
    };
    for (const k of ['factos', 'biografia', 'relacoes', 'fontes', 'ligacoes']) mover(k);
    mover('imagens', (x) => x.url);
    mover('referencias', (x) => x.url);
    for (const k of ['musica', 'letra', 'titulos_alternativos', 'nomes_alternativos']) {
      const vao = (a[k] || []).filter((x) => escolhido.has(`${k}:${x}`));
      if (vao.length) { b[k] = [...new Set([...(b[k] || []), ...vao])]; a[k] = a[k].filter((x) => !vao.includes(x)); }
    }
    if (escolhido.has('letra_texto') && a.letra_texto) { b.letra_texto = a.letra_texto; delete a.letra_texto; }
    if (tipo === 'pessoas') b.relacoes = semRepetidas(b.relacoes, b.id);
    // noutras fichas: só as referências escolhidas («gravacoes:<id>», «pessoas:<id>» para relações de outras pessoas…)
    const outras = await corrigirReferencias(tipo, id, b.id, new Set([`${tipo}/${id}`, `${tipo}/${b.id}`]), (t, x) => escolhido.has(`${t}:${x}`));
    // e as diferenças passam a estar registadas
    for (const [x, y] of [[a, b], [b, a]]) {
      x.distinta_de = (x.distinta_de || []).filter((d) => d.id !== y.id);
      x.distinta_de.push({ id: y.id, ...assinar(texto(nota) ? { nota: texto(nota) } : {}) });
    }
    return { alteracoes: [[`dados/${tipo}/${id}.json`, a], [`dados/${tipo}/${b.id}.json`, b], ...outras],
      resumo: `${a[esp.titulo]}: ${itens.length} ${itens.length === 1 ? 'elemento passou' : 'elementos passaram'} para «${b[esp.titulo]}»`,
      ir: `#/${esp.rota}/${b.id}` };
  },

  // ---- fontes
  async 'decidir-fonte'({ id, estado, nota, uso }) {
    exigir(podeAprovar(), 'Só os editores aprovam ou rejeitam fontes.');
    exigir(['aprovada', 'rejeitada'].includes(estado), 'Decisão desconhecida.');
    const caminho = 'fontes/fontes.json', reg = await lerDados(caminho);
    const f = reg.fontes.find((x) => x.id === id);
    exigir(f, 'Fonte inexistente.');
    if (estado === 'aprovada' && uso !== undefined) f.uso = usosDe(uso, id); // ao aprovar, o editor escolhe para que serve
    delete f.aprovacao; // a decisão explícita substitui a aprovação provisória por pedido geral
    Object.assign(f, { estado, decidido_em: hoje(), decidido_por: sessao().id });
    if (estado === 'rejeitada' && nota) f.notas = `${f.notas || ''} [Rejeitada: ${nota}]`.trim();
    return { alteracoes: [[caminho, reg]], resumo: `fonte ${f.nome}: ${estado}`, motivo: nota };
  },

  /** Corrigir o registo de uma fonte (nome, autor, tipo, uso, notas); o endereço não muda, porque as citações dependem dele. */
  async 'corrigir-fonte'({ id, nome, autor, tipo, uso, notas, motivo }) {
    exigir(podeAprovar(), 'Só os editores corrigem fontes.');
    const caminho = 'fontes/fontes.json', reg = await lerDados(caminho);
    const f = reg.fontes.find((x) => x.id === id);
    exigir(f, 'Fonte inexistente.');
    exigir(texto(nome), 'A fonte precisa de um nome.');
    exigir(TIPOS_FONTE[tipo], 'Escolha o tipo da fonte.');
    Object.assign(f, { nome: texto(nome), autor: texto(autor), tipo, uso: usosDe(uso, id), notas: texto(notas), corrigida_por: sessao().id, corrigida_em: hoje() });
    return { alteracoes: [[caminho, reg]], resumo: `fonte corrigida: ${f.nome}`, motivo };
  },

  async 'propor-fonte'({ nome, url, tipo, uso, autor, notas }) {
    nome = String(nome || '').trim(); url = String(url || '').trim();
    exigir(nome && urlValida(url), 'Indique o nome e o endereço (https://…) da fonte.');
    exigir(String(notas || '').trim(), 'Explique porque é uma fonte séria e para que serve.');
    const caminho = 'fontes/fontes.json', reg = await lerDados(caminho);
    exigir(!reg.fontes.some((f) => f.url === url), 'Essa fonte já está registada.');
    const id = unico(slug(nome).slice(0, 40).replace(/-+$/, ''), (x) => reg.fontes.some((f) => f.id === x));
    reg.fontes.push({ id, nome, tipo: tipo || 'site', url, autor: String(autor || '').trim(), estado: 'pendente', decidido_em: null,
      uso: [].concat(uso || ['factos']), recolha: { metodo: 'manual' }, notas: String(notas).trim(), proposta_por: sessao().id, proposta_em: hoje() });
    return { alteracoes: [[caminho, reg]], resumo: `fonte proposta: ${nome}` };
  },

  // ---- blogue
  async 'guardar-texto'({ id, titulo, texto, estado }) {
    titulo = String(titulo || '').trim();
    exigir(titulo, 'O texto precisa de um título.');
    let post;
    if (id) {
      post = await lerDados(`dados/blogue/${id}.json`);
      exigir(post.autor === sessao().id || podeAprovar(), 'Só o autor ou um editor alteram este texto.');
    } else {
      id = unico(`${hoje()}-${slug(titulo).slice(0, 60).replace(/-+$/, '')}`, (x) => E.base.blogue.some((p) => p.id === x));
      ficheiroNovo(`dados/blogue/${id}.json`); // P6: versao_base null
      post = { id, titulo, data: hoje(), autor: sessao().id, estado: 'rascunho' };
    }
    if (estado === 'publicado' && post.estado !== 'publicado') post.data = hoje(); // a data é a da publicação
    Object.assign(post, { titulo, texto: String(texto || '').replace(/\r/g, ''), estado, atualizado_em: hoje() });
    return { alteracoes: [[`dados/blogue/${id}.json`, post]], resumo: `blogue: «${titulo}» (${estado})`, ir: `#/blogue/${id}` };
  },

  async 'apagar-texto'({ id }) {
    const post = await lerDados(`dados/blogue/${id}.json`);
    exigir(post.autor === sessao().id || podeAprovar(), 'Só o autor ou um editor apagam este texto.');
    return { alteracoes: [[`dados/blogue/${id}.json`, null]], resumo: `blogue: apagado «${post.titulo}»`, ir: '#/blogue' };
  },

  // ---- contribuidores (os administradores convidam, mudam papéis e retiram acessos; o fundador só ele próprio)
  async 'guardar-contribuidor'({ id, nome, github, papel, apresentacao }) {
    exigir(eAdmin(), 'Só os administradores gerem os contribuidores.');
    nome = String(nome || '').trim(); github = String(github || '').trim().replace(/^@/, '');
    exigir(nome, 'Indique o nome.');
    const caminho = 'dados/contribuidores.json', reg = await lerDados(caminho);
    let c = id && reg.contribuidores.find((x) => x.id === id);
    // ninguém passa a fundador; o próprio fundador pode mudar o nome e a apresentação (P5a)
    exigir(papel !== 'dono' || c?.papel === 'dono', 'O arquivo tem um só fundador.');
    if (!c) {
      c = { id: unico(slug(nome), (x) => reg.contribuidores.some((y) => y.id === x)), nome, github, papel, desde: hoje(), apresentacao: '' };
      reg.contribuidores.push(c);
    }
    if (c.papel === 'dono') {
      exigir(sessao().papel === 'dono', 'Os dados do fundador do arquivo só ele os pode mudar.');
      papel = 'dono';
    }
    Object.assign(c, { nome, github, papel, apresentacao: String(apresentacao || '').trim() });
    return { alteracoes: [[caminho, reg]], resumo: `contribuidor ${c.nome}: ${papel}` };
  },

  // ---- catálogo de vídeos e áudios
  /** Retirar do catálogo um vídeo ou áudio que não é da Canção de Coimbra (por exemplo, um que um script catalogou por
   *  engano): a ficha apaga-se e o endereço fica em dados/excluidos.json, assinado, para os scripts não o voltarem a criar.
   *  O mesmo vídeo ou áudio catalogado noutras fichas (uma por disco) sai com ela: é o mesmo endereço. */
  async 'retirar-catalogo'({ id, motivo }) {
    exigir(podeAprovar(), 'Só os editores retiram vídeos e áudios do catálogo.');
    motivo = texto(motivo);
    exigir(motivo, 'Diga porque o retira do catálogo (fica registado).');
    const m = await lerDados(`dados/media/${id}.json`);
    const fichas = [{ ...m, id }];
    for (const x of mesmoMedia({ ...m, id })) {
      if (x.id === id) continue;
      try { fichas.push({ ...await lerDados(`dados/media/${x.id}.json`), id: x.id }); } catch (e) { if (!/inexistente/.test(e.message)) throw e; }
    }
    const reg = await lerDados(EXCLUIDOS).catch((e) => { if (/inexistente/.test(e.message)) return {}; throw e; });
    reg.media ||= [];
    for (const f of fichas) if (f.url && !reg.media.some((x) => x.url === f.url)) reg.media.push({ url: f.url, motivo, por: sessao().id, em: hoje() });
    const ids = new Set(fichas.map((f) => f.id));
    const alteracoes = [...fichas.map((f) => [`dados/media/${f.id}.json`, null]), [EXCLUIDOS, reg]];
    for (const g of E.base.gravacoes || []) { // os discos que o referiam numa faixa deixam de o referir
      if (!(g.faixas || []).some((x) => (x.media || []).some((y) => ids.has(y)))) continue;
      const f = await lerDados(`dados/gravacoes/${g.id}.json`);
      for (const x of f.faixas || []) {
        if (!x.media) continue;
        x.media = x.media.filter((y) => !ids.has(y));
        if (!x.media.length) delete x.media;
      }
      alteracoes.push([`dados/gravacoes/${g.id}.json`, f]);
    }
    return { alteracoes, resumo: `retirado do catálogo: ${m.titulo || m.url}${fichas.length > 1 ? ` (${plural(fichas.length, 'ficha', 'fichas')})` : ''}`, motivo,
      ir: m.pessoas?.[0] ? `#/pessoa/${m.pessoas[0]}` : '#/mediateca?estado=catalogados' };
  },
};

/** Envia as alterações para /api/gravar. Na cópia local, o servidor grava, valida e reconstrói (e recusa o que
 *  criar erros); online, a alteração vai para o GitHub como proposta, aprovada logo se quem a faz for editor.
 *  `extra`: outros campos do pedido, por exemplo { motivo } (online, fica na mensagem do commit e no texto da proposta).
 *  Cada ficheiro lido leva a versão que se leu (versao_base): se mudou entretanto, o servidor responde 409. */
async function gravar(alteracoes, resumo, extra = {}) {
  const r = await fetch('/api/gravar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...extra, resumo, por: sessao().id, alteracoes: alteracoes.map(([caminho, conteudo]) => ({ caminho, conteudo,
      ...(versoes.has(caminho) ? { versao_base: versoes.get(caminho) } : {}) })) }),
  });
  const j = await r.json().catch(() => ({ erro: 'resposta inválida do servidor' }));
  if (!r.ok || j.erro) {
    const msg = (j.erro || r.statusText) + (j.detalhe ? `\n\n(Detalhe técnico: ${j.detalhe})` : '');
    throw Object.assign(new Error(msg), { erros: j.erros, estado: r.status });
  }
  for (const [caminho] of alteracoes) versoes.delete(caminho); // a versão mudou: a próxima ação volta a ler o ficheiro
  return j;
}

// ------------------------------------------------------------------ antes de gravar: «Vai ficar assim» e o motivo

/** Ações que corrigem ou apagam o que já está registado: antes de gravar mostra-se o que vai mudar e pergunta-se o que se
 *  corrigiu e como se sabe (o motivo segue com a alteração). Nos factos e relações simples, nada disto. */
const CORRIGEM = new Set(['juntar', 'separar', 'retirar-facto', 'retirar-relacao', 'retirar-referencia', 'apagar-ficha']);
const corrige = (nome, d) => CORRIGEM.has(nome) || (nome === 'guardar-ficha' && !!d.id);
/** Online, o que um contribuidor grava fica como proposta, que depois já não pode emendar: vê antes o que vai mudar. */
const proposta = () => E.sessao?.modo === 'online' && !podeAprovar();
const vaiRever = (nome, d) => corrige(nome, d) || proposta();

/** Uma janela por cima da página, para confirmar ou escolher (rever, rejeitar ou corrigir uma fonte…). `corpo` é html``.
 *  Devolve os campos do formulário da janela (como dadosFormulario), ou null se a pessoa voltar atrás. */
export function perguntar({ titulo, corpo, sim = 'Gravar', nao = 'Voltar', classe = '' }) {
  return new Promise((resolver) => {
    const d = document.createElement('dialog');
    d.className = `dialogo-edicao ${classe}`.trim();
    d.setAttribute('aria-labelledby', 'dialogo-titulo');
    d.innerHTML = html`<form method="dialog"><h2 id="dialogo-titulo">${titulo}</h2>
      <div class="dialogo-corpo">${corpo}</div>
      <div class="acoes"><button class="botao primario" value="sim">${sim}</button>
        <button class="botao" value="nao" formnovalidate>${nao}</button></div></form>`.s;
    document.body.append(d);
    d.addEventListener('close', () => {
      const r = d.returnValue === 'sim' ? dadosFormulario(d.querySelector('form')) : null;
      d.remove();
      resolver(r);
    });
    d.showModal();
  });
}

const NOMES_FICHEIRO = { 'fontes/fontes.json': 'Registo de fontes', 'dados/contribuidores.json': 'Contribuidores', [EXCLUIDOS]: 'Retirados do catálogo' };
function nomeDoFicheiro(caminho, f) {
  if (NOMES_FICHEIRO[caminho]) return NOMES_FICHEIRO[caminho];
  const tipo = caminho.split('/')[1], esp = ESPECIES[tipo];
  const nome = f?.[esp?.titulo] || f?.titulo || caminho.split('/').pop().replace(/\.json$/, '');
  return tipo === 'blogue' ? `Blogue: ${nome}` : `${esp ? esp.nome[0].toUpperCase() + esp.nome.slice(1) : tipo}: ${nome}`;
}
const exclusoes = (antes, depois) => {
  const ja = new Set((antes?.media || []).map((x) => x.url));
  return html`<ul class="diferencas">${(depois?.media || []).filter((x) => !ja.has(x.url))
    .map((x) => html`<li class="mais"><b>+</b> ${x.url}${x.motivo ? ` — ${x.motivo}` : ''}</li>`)}</ul>`;
};

/** O campo «O que corrigiu e como sabe». Online vai na mensagem que fica no histórico e no texto da proposta; na cópia
 *  local o servidor só o mostra na janela dele (não fica guardado), e o texto di-lo. */
const campoMotivo = () => html`<label class="motivo">O que corrigiu e como sabe <small>${E.sessao?.modo === 'online'
  ? 'opcional; vai na mensagem que fica no histórico e na proposta, para quem a rever saber porquê'
  : 'opcional; nesta cópia local só aparece na janela do servidor e não fica guardado (online, vai no histórico e na proposta)'}</small>
  <textarea class="campo" name="motivo" rows="2"></textarea></label>`;

/** «Vai ficar assim»: o que muda em cada ficheiro, em português (como no Histórico e nas Propostas), e o motivo. */
async function rever(nome, dados, { alteracoes, antes, resumo }) {
  let descrever = null;
  try { ({ descrever } = await import('./historico.js')); } catch { /* sem a descrição: diz-se só o que muda */ }
  const simples = (a, depois) => html`<p class="mudo">${depois ? (a ? 'alterada' : 'nova') : 'apagada'}</p>`;
  const partes = alteracoes.map(([caminho, depois]) => {
    const a = antes.get(caminho) ?? null;
    let corpo;
    try { corpo = caminho === EXCLUIDOS ? exclusoes(a, depois) : descrever ? descrever(caminho, a, depois) : simples(a, depois); } catch { corpo = simples(a, depois); }
    return html`<h3>${nomeDoFicheiro(caminho, depois || a)}</h3>${corpo}`;
  });
  const r = await perguntar({ titulo: 'Vai ficar assim', classe: 'rever', sim: proposta() ? 'Enviar a proposta' : 'Gravar', corpo: html`
    <p class="mudo">${resumo}</p>${partes.slice(0, 3)}
    ${partes.length > 3 ? html`<details class="mais-fichas"><summary>E mais ${plural(partes.length - 3, 'ficha alterada', 'fichas alteradas')}</summary>${partes.slice(3)}</details>` : ''}
    ${corrige(nome, dados) ? campoMotivo() : ''}
    ${proposta() ? html`<p class="mudo">Fica como proposta: um editor revê-a e, depois de aprovada, aparece no site com o seu nome.
      Depois de enviada, já não a pode emendar.</p>` : ''}` });
  return r && { motivo: texto(r.motivo) };
}

/** Faz uma ação: calcula as alterações, mostra-as antes de gravar quando corrigem ou apagam (ou são uma proposta), e
 *  envia-as. `motivo`: porque se corrigiu (vai com a gravação). Devolve { cancelado } se a pessoa voltar atrás. */
export async function executar(nome, dados, { motivo = '' } = {}) {
  exigir(sessao(), 'Precisa de entrar como contribuidor.');
  exigir(ACOES[nome], `Ação desconhecida: ${nome}`);
  const antes = lidos = new Map();
  let r;
  try { r = await ACOES[nome](dados); } finally { lidos = null; }
  const { alteracoes, resumo, ir } = r;
  motivo = texto(motivo || r.motivo);
  if (vaiRever(nome, dados)) {
    const visto = await rever(nome, dados, { alteracoes, antes, resumo });
    if (!visto) return { cancelado: true };
    motivo = visto.motivo || motivo;
  }
  aviso('A gravar…');
  const resposta = await gravar(alteracoes, resumo, motivo ? { motivo } : {});
  document.dispatchEvent(new CustomEvent('gravado', { detail: { acao: nome } })); // rascunhos.js: o rascunho já não faz falta
  return { ir, alteracoes, resposta };
}

/** Campos de um formulário; caixas com o mesmo nome terminado em [] dão uma lista. */
function dadosFormulario(form) {
  const d = {};
  for (const [k, v] of new FormData(form)) {
    if (k.endsWith('[]')) (d[k.slice(0, -2)] ||= []).push(v);
    else d[k] = v;
  }
  return d;
}

// ------------------------------------------------------------------ decisões com janela própria: fontes e catálogo

/** Onde uma fonte é citada nas fichas publicadas: uma linha por ficha, com quantas citações tem e para quê (`usos`), com as
 *  regras do validar.py: as fotografias (imagens), as capas e as fichas de vídeos e áudios contam como «media»; o resto
 *  (factos, relações, excertos da biografia, letras, quem tocou um instrumento) como «factos». */
function citacoesDaFonte(id) {
  const res = [];
  for (const [tipo, esp] of Object.entries(ESPECIES)) {
    for (const x of E.base[tipo] || []) {
      const usos = { factos: 0, media: 0 };
      const ver = (v, uso) => {
        if (Array.isArray(v)) v.forEach((y) => ver(y, uso));
        else if (v && typeof v === 'object') {
          if (v.fonte === id) usos[uso]++;
          for (const [k, y] of Object.entries(v)) ver(y, k === 'imagens' || k === 'capa' ? 'media' : uso);
        }
      };
      ver(x, tipo === 'media' ? 'media' : 'factos');
      const n = usos.factos + usos.media;
      if (n) res.push({ rota: esp.rota ? `#/${esp.rota}/${x.id}` : `#/editar/${tipo}/${x.id}`, nome: x[esp.titulo] || x.id, tipo: esp.nome, n, usos });
    }
  }
  return res.sort((a, b) => b.n - a.n);
}
/** Quantas citações dependem de cada uso da fonte: { factos, media }. */
const usosCitados = (onde) => onde.reduce((s, x) => ({ factos: s.factos + x.usos.factos, media: s.media + x.usos.media }), { factos: 0, media: 0 });

/** «Serve para»: um uso de que já dependem citações fica marcado e não se pode tirar (vai num campo escondido, porque
 *  uma caixa desligada não segue com o formulário). */
const caixasUso = (f) => {
  const uso = f.uso || [], citados = usosCitados(citacoesDaFonte(f.id));
  return html`<fieldset class="opcoes-uso"><legend>Serve para</legend>${Object.entries(USOS).map(([k, t]) => (citados[k]
    ? html`<label class="opcao"><input type="checkbox" checked disabled> ${t}<input type="hidden" name="uso[]" value="${k}">
      <small class="mudo">usado em ${plural(citados[k], 'citação', 'citações')}: não se pode tirar</small></label>`
    : html`<label class="opcao"><input type="checkbox" name="uso[]" value="${k}" ${uso.includes(k) ? 'checked' : ''}> ${t}</label>`))}</fieldset>`;
};
/** Uma ligação para fora, só com um endereço http(s) (enderecoSeguro); sem ele, o texto sem ligação. */
const ligacaoFora = (u) => {
  const seguro = enderecoSeguro(u);
  return seguro ? html`<a href="${seguro}" target="_blank" rel="noopener">${u}</a>` : html`<span>${u || ''}</span>`;
};

/** Antes de aprovar ou rejeitar uma fonte. Aprovar: para que serve (factos, e/ou fotografias, vídeos e áudios). Rejeitar:
 *  onde já é citada (essas citações deixam de contar como prova) e o motivo, que fica registado. */
async function decidirFonte(estado, f) {
  if (estado === 'rejeitada') {
    const onde = citacoesDaFonte(f.id), n = onde.reduce((s, x) => s + x.n, 0);
    const r = await perguntar({ titulo: `Rejeitar «${f.nome}»`, sim: 'Rejeitar a fonte', classe: 'perigo', corpo: html`
      ${onde.length ? html`<p>Esta fonte tem <b>${plural(n, 'citação', 'citações')}</b>, em ${plural(onde.length, 'ficha', 'fichas')}:</p>
        <ul class="citacoes-da-fonte">${onde.slice(0, 30).map((x) => html`<li><a href="${x.rota}" target="_blank" rel="noopener">${x.nome}</a>
          <span class="mudo">${x.tipo} · ${plural(x.n, 'citação', 'citações')}</span></li>`)}
          ${onde.length > 30 ? html`<li class="mudo">e mais ${plural(onde.length - 30, 'ficha', 'fichas')}</li>` : ''}</ul>
        <p>Se a rejeitar, estas citações deixam de contar como prova e passam a mostrar «fonte rejeitada»; os factos não se apagam.
          Os factos acrescentados no modo de edição retiram-se na ficha, com ×; aos outros, acrescente outra fonte (senão, fica a marca «fonte rejeitada»).</p>` : html`<p>Ainda não é citada em nenhuma ficha.</p>`}
      <label>Motivo da rejeição <small>fica no registo de fontes</small><textarea class="campo" name="nota" rows="2" required autofocus></textarea></label>` });
    return r && { dados: { nota: texto(r.nota) }, motivo: texto(r.nota) };
  }
  const confirmar = f.estado === 'aprovada';
  const r = await perguntar({ titulo: `${confirmar ? 'Confirmar' : 'Aprovar'} «${f.nome}»`, sim: confirmar ? 'Confirmar' : 'Aprovar', corpo: html`
    <p class="mudo">${[TIPOS_FONTE[f.tipo] || f.tipo, f.autor].filter(Boolean).join(' · ')} · ${ligacaoFora(f.url)}</p>
    ${f.notas ? html`<p>${f.notas}</p>` : ''}${caixasUso(f)}` });
  return r && { dados: { uso: r.uso || [] } };
}

/** «Corrigir» uma fonte: o nome, o autor, o tipo, para que serve e as notas (o endereço não muda). */
async function corrigirFonte(f) {
  const r = await perguntar({ titulo: `Corrigir «${f.nome}»`, corpo: html`
    <p class="mudo">Endereço: ${ligacaoFora(f.url)} (não muda: as citações dependem dele)</p>
    <label>Nome <input class="campo" name="nome" value="${f.nome}" required></label>
    <div class="linha-campos"><label>Tipo <select class="campo" name="tipo">${Object.entries(TIPOS_FONTE).map(([v, t]) => html`<option value="${v}"
      ${v === f.tipo ? 'selected' : ''}>${t}</option>`)}</select></label>
      <label>Autor <small>se for um texto de alguém</small><input class="campo" name="autor" value="${f.autor || ''}"></label></div>
    ${caixasUso(f)}
    <label>Notas <small>porque é séria e o que traz ao arquivo</small><textarea class="campo" name="notas" rows="3">${f.notas || ''}</textarea></label>
    ${campoMotivo()}` });
  return r && { dados: { nome: r.nome, tipo: r.tipo, autor: r.autor, uso: r.uso || [], notas: r.notas }, motivo: texto(r.motivo) };
}

/** «Retirar do catálogo»: o que acontece, e porquê (obrigatório: fica registado com o endereço). */
async function retirarDoCatalogo(m) {
  const outras = m.id ? mesmoMedia(m).filter((x) => x.id !== m.id) : [];
  const disco = (x) => E.por.gravacoes?.[x.gravacao]?.titulo;
  const r = await perguntar({ titulo: 'Retirar do catálogo', sim: 'Retirar do catálogo', classe: 'perigo', corpo: html`
    <p><b>${m.titulo || m.url}</b><br>${ligacaoFora(m.url)}</p>
    <p>Para um ${m.tipo === 'audio' ? 'áudio' : 'vídeo'} que não é da Canção de Coimbra (por exemplo, um que um script catalogou por engano).
      A ficha apaga-se e o endereço fica na lista dos retirados do catálogo, com o seu nome e o motivo: os scripts de catálogo não o voltam a criar.</p>
    ${outras.length ? html`<p>O mesmo ${m.tipo === 'audio' ? 'áudio' : 'vídeo'} também está catalogado ${outras.length === 1 ? 'noutra ficha, que sai'
      : `em mais ${outras.length} fichas, que saem`} com esta:</p>
      <ul class="citacoes-da-fonte">${outras.map((x) => html`<li><a href="#/editar/media/${x.id}" target="_blank" rel="noopener">${x.titulo || x.id}</a>
        ${disco(x) ? html`<span class="mudo">disco «${disco(x)}»</span>` : ''}</li>`)}</ul>` : ''}
    <label>Porque não é da Canção de Coimbra? <small>fica registado</small><textarea class="campo" name="motivo" rows="2" required autofocus></textarea></label>` });
  return r && { dados: { motivo: texto(r.motivo) }, motivo: texto(r.motivo) };
}

const COM_JANELA = new Set(['decidir-fonte', 'corrigir-fonte', 'retirar-catalogo']);
/** As ações que pedem uma escolha antes de gravar: a janela devolve os dados que faltam (null se a pessoa voltar atrás). */
async function antesDe(acao, d) {
  const f = E.fontes[d.id];
  if (acao !== 'retirar-catalogo' && !f) { alert('Esta fonte já não está no registo: recarregue a página.'); return null; }
  if (acao === 'decidir-fonte') return decidirFonte(d.estado, f);
  if (acao === 'corrigir-fonte') return corrigirFonte(f);
  return retirarDoCatalogo(E.por.media[d.id] || { url: d.id });
}

/** «Retirar do catálogo» (editores, no modo de edição): para um vídeo ou áudio catalogado que não é da Canção de Coimbra. */
export const botaoRetirarCatalogo = (m) => (editando() && podeAprovar() && m?.id ? html`<button type="button" class="botao" data-acao="retirar-catalogo"
  data-id="${m.id}" title="Não é da Canção de Coimbra: a ficha apaga-se e os scripts de catálogo não a voltam a criar">Retirar do catálogo</button>` : '');
/** «Corrigir» uma fonte do registo (editores, no modo de edição): nome, autor, tipo, para que serve e notas. */
export const botaoCorrigirFonte = (f) => (editando() && podeAprovar() ? html`<div class="acoes" style="margin-top:6px"><button type="button" class="botao peq"
  data-acao="corrigir-fonte" data-id="${f.id}" title="Corrigir o nome, o autor, o tipo, para que serve e as notas">Corrigir</button></div>` : '');

// ------------------------------------------------------------------ «Como sabe?» à vista
// Ao colar o endereço, o formulário diz logo a que fonte fica atribuída a frase: uma fonte do arquivo, um livro (ou jornal)
// registado nesse endereço, se for disso que a frase é citação, ou um site novo, que fica proposto. Com a frase, a cópia
// local diz se ela está no documento arquivado e, se não estiver, onde deixa de bater.

/** Os campos de um «Como sabe?» (o prefixo distingue-os quando há vários no mesmo formulário, ver formularios.js). */
function provaDe(fs) {
  const radio = fs?.querySelector('input[type=radio][value=fonte]');
  if (!radio) return null;
  const p = radio.name.replace(/como$/, '');
  const campo = (k) => fs.querySelector(`[name="${CSS.escape(p + k)}"]`);
  return { p, url: campo('fonte_url'), lista: campo('fonte'), frase: campo('citacao'), comFonte: radio.checked };
}
const usoDe = (form) => ESPECIES[form?.elements.especie?.value]?.fonte || 'factos';
const tipoDe = (f) => (TIPOS_FONTE[f.tipo] || f.tipo || '').toLowerCase();

/** A linha de ajuda por baixo de um campo (criada da primeira vez que é precisa). */
function linhaDe(campo, chave) {
  const depois = campo.closest('label') || campo;
  let p = depois.nextElementSibling;
  if (!p?.matches(`.prova-linha[data-linha="${chave}"]`)) {
    p = document.createElement('div');
    p.className = 'prova-linha';
    p.dataset.linha = chave;
    p.setAttribute('aria-live', 'polite');
    depois.after(p);
  }
  return p;
}

/** O botão de gravar fica desligado enquanto uma das fontes escolhidas não servir (rejeitada, ou não aceite para isto). */
function bloquear(form) {
  if (!form || form.getAttribute('aria-busy')) return;
  const motivo = [...form.querySelectorAll('.como-sabe[data-bloqueio]')].map((x) => x.dataset.bloqueio).find(Boolean) || '';
  form.querySelectorAll('button:not([type=button])').forEach((b) => { b.disabled = !!motivo; b.title = motivo; });
}

function mostrarFonte(fs) {
  const c = provaDe(fs);
  if (!c?.url) return;
  const linha = linhaDe(c.url, 'fonte'), form = fs.closest('form'), uso = usoDe(form);
  const escrito = texto(c.url.value), url = limparEndereco(escrito), valido = urlValida(url);
  const escolhida = c.lista?.value ? E.fontes[c.lista.value] : null;
  const chave = [c.comFonte, url, escolhida?.id, uso].join('|');
  if (linha.dataset.chave === chave) return; // nada mudou (e não se apaga o nome que se está a escrever)
  linha.dataset.chave = chave;
  fs.dataset.bloqueio = '';
  if (!c.comFonte || (!escrito && !escolhida)) { linha.hidden = true; bloquear(form); return; }
  const { site, obras, vizinhas } = valido ? fontesDoEndereco(url) : { site: null, obras: [], vizinhas: [] };
  const f = escolhida || site;
  let corpo;
  if (escrito && !valido) corpo = html`<p class="prova-aviso">O endereço tem de começar por https://</p>`;
  else if (f) {
    const naoServe = f.estado === 'rejeitada' ? 'foi rejeitada pelos editores: não se pode citar'
      : !(f.uso || []).includes(uso) ? `não está aceite para ${uso === 'media' ? 'fotografias, vídeos e áudios' : 'factos'}` : '';
    if (naoServe) fs.dataset.bloqueio = `A fonte «${f.nome}» ${naoServe}.`;
    const estado = naoServe || (f.estado === 'pendente' ? 'ainda está por aprovar: a citação fica «pendente» até um editor decidir' : '');
    corpo = html`<p class="${naoServe ? 'prova-aviso' : ''}">Fonte: <b>${f.nome}</b> <span class="mudo">(${tipoDe(f)}${f.autor ? `, ${f.autor}` : ''})</span>${estado ? ` — ${estado}.` : ' ✓'}
      ${escolhida && escrito && valido && escolhida !== site ? html`<button type="button" class="botao-ligacao" data-fonte-escolher="">Não: a frase é do
        próprio ${site ? tipoDe(site) : 'site'}</button>` : ''}</p>`;
  } else {
    const host = new URL(url).hostname.replace(/^www\./, '');
    // o nome que se escreveu fica, enquanto o endereço for do mesmo site (por exemplo, ao corrigir o endereço da notícia)
    const antes = linha.querySelector(`[name="${CSS.escape(c.p + 'fonte_nome')}"]`);
    const nome = antes && linha.dataset.host === host ? antes.value : host;
    linha.dataset.host = host;
    corpo = html`<p>${host} ainda não é fonte do arquivo: fica proposto e a citação aparece «pendente» até um editor decidir.</p>
      <label>Nome da fonte <small>como se chama o site ou a publicação</small><input class="campo" name="${c.p}fonte_nome" value="${nome}"></label>`;
  }
  // outras fontes registadas neste endereço (o livro ou o jornal que o post transcreve) ou, sem fonte do site, noutras páginas dele
  const lista = (titulo, fontes) => (escolhida || !fontes.length ? '' : html`<p class="mudo">${titulo}</p>
    <ul class="prova-obras">${fontes.map((x) => html`<li>«${x.nome}» <span class="mudo">(${tipoDe(x)}${x.autor ? `, ${x.autor}` : ''})</span>
      <button type="button" class="botao-ligacao" data-fonte-escolher="${x.id}">Escolher</button></li>`)}</ul>`);
  linha.innerHTML = html`${corpo}${lista('Este endereço também é a referência de outra fonte. Se a frase for citação dela, escolha-a:', obras)}
    ${lista('Neste site, ou no domínio a que pertence, está registada outra fonte. Se a frase for dela, escolha-a:', vizinhas)}`.s;
  linha.hidden = false;
  bloquear(form);
}

/** A frase está no documento? Só na cópia local (online não há arquivo: fica «por confirmar»). */
async function verificarFrase(fs) {
  const c = provaDe(fs);
  if (!c?.frase || !c.url) return;
  const linha = linhaDe(c.frase, 'frase');
  const url = limparEndereco(c.url.value), frase = semAspas(c.frase.value);
  const chave = [c.comFonte, url, frase].join('|');
  if (linha.dataset.chave === chave) return;
  linha.dataset.chave = chave;
  if (!c.comFonte || !frase || !urlValida(url)) { linha.hidden = true; return; }
  linha.hidden = false;
  if (!comArquivo()) {
    linha.innerHTML = html`<p class="mudo">${E.sessao?.modo === 'online' ? 'Online não se confirma já: a frase fica «por confirmar» até ser verificada na cópia local do arquivo.'
      : 'Sem o arquivo local, a frase fica por verificar.'} Confirme que a copiou à letra.</p>`.s;
    return;
  }
  linha.innerHTML = '<p class="mudo carregando">A procurar a frase no arquivo</p>';
  const v = await confirmarNoArquivo(url, frase);
  if (linha.dataset.chave !== chave) return; // entretanto mudou
  if (!v) { linha.hidden = true; return; }
  linha.innerHTML = (v.estado === 'encontrada'
    ? html`<p class="prova-certa">✓ Encontrei esta frase ${noDocumento(v)}.
      <a href="#/doc/${v.doc}?realce=${encodeURIComponent(frase.slice(0, 80))}" target="_blank" rel="noopener">Ver no arquivo ↗</a></p>`
    : v.estado === 'nao-encontrada' ? html`<p class="prova-aviso">✗ ${fraseEmFalta(v)}</p>`
      : html`<p class="mudo">Esta página não está no arquivo local: a frase fica por verificar.</p>`).s;
}

/** «Sim, é do livro» / «Não, é do próprio blogue»: a escolha vai no campo «fonte», que a prova respeita. */
function escolherFonte(fs, id) {
  const c = provaDe(fs);
  if (!c) return;
  let lista = c.lista;
  if (!lista) { lista = Object.assign(document.createElement('input'), { type: 'hidden', name: `${c.p}fonte` }); fs.append(lista); }
  if (id && lista.tagName === 'SELECT' && ![...lista.options].some((o) => o.value === id)) lista.append(new Option(E.fontes[id]?.nome || id, id));
  lista.value = id;
  lista.dispatchEvent(new Event('change', { bubbles: true }));
}

// ------------------------------------------------------------------ erros em português simples

/** Onde está o problema, a partir do caminho que o validador indica («pessoas/artur-paredes.factos[3:nascimento]…»). */
const SITIOS = [
  [/^\.factos\[\d+:([a-z_]+)\]/, (m) => `facto «${CAMPOS[m[1]] || m[1]}»`],
  [/^\.relacoes\[\d+:([a-z_]+)\]/, (m) => `relação «${REL[m[1]]?.dir || m[1]}»`],
  [/^\.biografia\[(\d+)\]/, (m) => `excerto ${+m[1] + 1}`],
  [/^\.imagens\[(\d+)\]/, (m) => `fotografia ${+m[1] + 1}`],
  [/^\.referencias\[(\d+)\]/, (m) => `referência ${+m[1] + 1}`],
  [/^\.faixas\[(\d+)\]/, (m) => `faixa ${+m[1] + 1}`],
  [/^\.interpretes\[(\d+)\]/, (m) => `intérprete ${+m[1] + 1}`],
  [/^\.proprietarios\[(\d+)\]/, (m) => `quem a tocou (${+m[1] + 1})`],
  [/^\.notas_editor\[(\d+)\]/, (m) => `nota ${+m[1] + 1}`],
  [/^\.fontes\[(\d+)\]/, (m) => `fonte ${+m[1] + 1}`],
  [/^\.letra_texto/, () => 'letra'],
  [/^\.capa/, () => 'capa'],
  [/^\.juntou/, () => 'ficha juntada'],
  [/^\.distinta_de/, () => '«não confundir com»'],
];
/** O que o validador diz, em frases simples (o que não se reconhece fica como está). */
const MENSAGENS = [
  [/^citação NÃO encontrada no documento .*?: «(.*?)…?» — (.*)$/, (m) => `a frase «${m[1]}» não aparece no documento: ${m[2]}`],
  [/^citação NÃO encontrada no documento .*?: «(.*?)…?»$/, (m) => `a frase «${m[1]}» não aparece no documento: copie-a à letra (pode cortar troços com …)`],
  [/^fonte '(.+?)' não existe em fontes\.json/, (m) => `a fonte «${m[1]}» não está no registo de fontes`],
  [/^fonte '(.+?)' está '(\w+)'/, (m) => `a fonte «${fonteNome(m[1])}» está ${m[2]}: só se citam fontes aprovadas`],
  [/^fonte '(.+?)' não está aprovada para uso '(\w+)'/, (m) => `a fonte «${fonteNome(m[1])}» não está aceite para ${m[2] === 'media' ? 'fotografias, vídeos e áudios' : 'factos'}`],
  [/^citação sem url/, () => 'falta o endereço da página'],
  [/^citação mal formada/, () => 'a citação está mal formada'],
  [/^falta a citação literal/, () => 'falta a frase copiada à letra'],
  [/^sem fontes$/, () => 'falta a fonte (o endereço e a frase) ou o testemunho assinado'],
  [/^referência a \w+ inexistente '(.+?)'/, (m) => `aponta para uma ficha que não existe («${m[1]}»)`],
  [/^data '(.*?)' fora do formato/, (m) => `a data «${m[1]}» está mal escrita (AAAA, AAAA-MM ou AAAA-MM-DD)`],
  [/^contribuidor '(.*?)' não existe/, (m) => `quem assina («${m[1]}») não está na lista de contribuidores`],
  [/^assinatura mal formada/, () => 'a assinatura (quem e quando) está mal formada'],
  [/^falta o texto/, () => 'a nota está vazia'],
  [/^faltam 'campo' ou 'valor'/, () => 'falta o tipo ou o texto do facto'],
  [/^relação da pessoa consigo própria/, () => 'uma pessoa não se relaciona consigo própria'],
  [/^liga a uma ficha inexistente '(.+?)'/, (m) => `o texto liga a uma ficha que não existe («${m[1]}»)`],
  [/^a ficha juntada '(.+?)' ainda existe/, (m) => `a ficha juntada («${m[1]}») ainda existe`],
  [/^ficha inexistente '(.+?)'/, (m) => `a ficha «${m[1]}» não existe`],
  [/falta a página de origem da fotografia/, () => 'falta a página onde a fotografia está publicada'],
  [/^JSON inválido/, () => 'o ficheiro ficou mal formado'],
  [/^id .*(inválido|diferente do nome do ficheiro)/, () => 'o identificador da ficha é inválido'],
  [/^sem (título|nome)$/, (m) => `falta o ${m[1]}`],
  [/^sem url$/, () => 'falta o endereço'],
];
const primeira = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** Uma linha do validador («pessoas/x.factos[2:morte].fontes[0]: fonte 'y' está 'rejeitada' — …») em português simples
 *  (serve também para os erros que o GitHub devolve de uma proposta). */
export function explicarErro(linha) {
  const i = String(linha).indexOf(': ');
  if (i < 0) return primeira(String(linha));
  const onde = linha.slice(0, i), msg = linha.slice(i + 2);
  const m = onde.match(/^(pessoas|obras|gravacoes|instrumentos|media|blogue|contribuidores|fontes)[/.]([a-z0-9-]+)(.*)$/);
  let quem = onde;
  if (m) {
    const [, tipo, id, resto] = m, esp = ESPECIES[tipo];
    const nome = esp ? `${esp.nome[0].toUpperCase()}${esp.nome.slice(1)} «${E.por[tipo]?.[id]?.[esp.titulo] || id}»`
      : { blogue: `Texto do blogue «${id}»`, contribuidores: `Contribuidor «${id}»`, fontes: `Fonte «${fonteNome(id)}»` }[tipo];
    const sitio = SITIOS.map(([re, f]) => { const x = resto.match(re); return x && f(x); }).find(Boolean);
    quem = [nome, sitio].filter(Boolean).join(', ');
  } else if (onde.startsWith('excluidos')) quem = 'Retirados do catálogo';
  const t = MENSAGENS.map(([re, f]) => { const x = msg.match(re); return x && f(x); }).find(Boolean) || msg;
  return `${quem}: ${t}`;
}

/** A mensagem principal de uma gravação que falhou, em português (sem rede, sem permissão, outra pessoa gravou…). */
function explicarMensagem(e) {
  const m = String(e?.message || e || '');
  if (/Failed to fetch|NetworkError|Load failed|network error/i.test(m)) {
    return E.sessao?.modo === 'online' ? 'Sem ligação: verifique a ligação à Internet e tente outra vez.'
      : 'Sem ligação ao servidor local: confirme que está ligado (python scripts/servidor.py) e tente outra vez.';
  }
  return primeira({
    'a alteração não passou na validação': 'A alteração tem problemas que o validador não deixa passar:',
    'resposta inválida do servidor': 'O servidor respondeu de forma inesperada: tente outra vez daqui a pouco.',
    Forbidden: 'Não tem permissão para esta alteração.', Conflict: 'Outra pessoa alterou esta ficha entretanto: recarregue a página e volte a fazer a alteração.',
    'Bad Request': 'O servidor recusou o pedido.', 'Not Found': 'O servidor não conhece este pedido.',
    'Internal Server Error': 'Erro no servidor: tente outra vez daqui a pouco.',
  }[m] || m);
}

/** «Não foi gravado»: num formulário, por cima do botão de gravar (fica à vista enquanto se corrige); senão, um alerta. */
function mostrarErro(el, e) {
  const msg = explicarMensagem(e), linhas = (e?.erros || []).map(explicarErro);
  if (el.tagName === 'FORM' && el.isConnected) {
    const caixa = document.createElement('div');
    caixa.className = 'erros-gravacao';
    caixa.setAttribute('role', 'alert');
    caixa.innerHTML = html`<p><b>Não foi gravado.</b> ${msg}</p>${linhas.length ? html`<ul>${linhas.map((l) => html`<li>${l}</li>`)}</ul>` : ''}`.s;
    const botao = el.querySelector('button:not([type=button])');
    if (botao) (botao.closest('.acoes') || botao).before(caixa); else el.append(caixa);
    caixa.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    aviso('Não foi gravado');
  } else alert(`Não foi gravado. ${msg}${linhas.length ? `\n\n${linhas.join('\n')}` : ''}`);
}
const limparErro = (el) => el.querySelectorAll?.('.erros-gravacao').forEach((x) => x.remove());

export function iniciarEdicao(redesenhar) {
  E.editando = ler('editando', false);
  const botao = $('#modo-edicao'), entrar = $('#entrar'), navPropostas = $('#nav-propostas'), navValidar = $('#nav-validar');
  const online = () => E.sessao?.modo === 'online';
  const desenhar = () => {
    botao.hidden = !sessao();
    botao.setAttribute('aria-checked', editando());
    botao.querySelector('b').textContent = editando() ? 'ligado' : 'desligado';
    document.documentElement.classList.toggle('a-editar', editando());
    // online: entrar com o GitHub / sair; na cópia local quem usa o site é sempre o dono
    entrar.hidden = !online() || !E.sessao.entrada;
    const dentro = online() && E.sessao.github;
    entrar.querySelector('span').textContent = dentro ? `Sair (${sessao()?.nome || '@' + E.sessao.github})` : 'Entrar';
    entrar.title = dentro ? 'Terminar a sessão neste browser' : 'Entrar com a conta do GitHub (para contribuidores convidados)';
    navPropostas.hidden = !(online() && sessao());
    navValidar.hidden = !sessao(); // a lista de trabalho de quem edita
    $('#nav-alteracoes').hidden = !sessao(); // o que mudou nos dados (vistas/alteracoes.js)
  };
  entrar.onclick = () => { entrar.href = E.sessao?.github ? '/api/sair' : `/api/entrar?volta=${encodeURIComponent(location.hash || '#/')}`; };
  botao.onclick = () => { E.editando = !E.editando; guardar('editando', E.editando); desenhar(); redesenhar(); };
  desenhar();
  if (online() && sessao()) { // quantas propostas esperam (os editores veem todas; cada contribuidor, as suas, que vê já nas fichas)
    api('propostas', podeAprovar() ? { contar: 1 } : { minhas: 1 }).then(async (r) => {
      navPropostas.querySelector('b').textContent = (r.n ?? r.propostas.length) || '';
      if (await aplicarMinhasPropostas(r)) { avisosDaSessao(); await redesenhar(); } // minhas-propostas.js
    }).catch(() => {});
  }
  if (online() && E.sessao.github && !sessao() && !E.sessao.problema) { // com «problema» (token, limite), a faixa diz qual é
    aviso(`A conta @${E.sessao.github} ainda não foi convidada para contribuir.`);
  }
  avisosDaSessao(); // cópia local atrasada, token do site expirado ou perto do fim (avisos-edicao.js)

  /** Enquanto grava, o formulário (ou o botão) fica ocupado; depois, uma fonte que não serve continua a não deixar gravar. */
  const travar = (el, sim) => {
    if (sim) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
    el.querySelectorAll?.('button').forEach((b) => { b.disabled = sim; });
    if (el.tagName === 'BUTTON') el.disabled = sim;
    if (!sim && el.tagName === 'FORM') bloquear(el);
  };

  const correr = async (nome, dados, el, opcoes = {}) => {
    travar(el, true);
    limparErro(el);
    try {
      const r = await executar(nome, dados, opcoes);
      if (r.cancelado) { travar(el, false); return; } // voltou atrás em «Vai ficar assim»
      const { ir, alteracoes, resposta } = r;
      if (online() && !resposta.publicado && !resposta.aviso) { // proposta de um contribuidor: espera por um editor, e quem a fez vê-a já
        juntarMinhaProposta(alteracoes, resposta.numero); // minhas-propostas.js: só neste browser, com a faixa «à espera de aprovação»
        if (!resposta.juntada) navPropostas.querySelector('b').textContent = String((+navPropostas.querySelector('b').textContent || 0) + 1);
        await carregar();
        desenhar();
        avisosDaSessao();
        aviso(resposta.juntada ? `Juntou-se à sua proposta n.º ${resposta.numero}, que um editor vai rever.`
          : `Proposta enviada (n.º ${resposta.numero}). Já a vê aqui; um editor vai revê-la.`);
        if (ir && ir !== location.hash) location.hash = ir; else await redesenhar();
        return;
      }
      if (online() && !resposta.publicado) {
        travar(el, false);
        // um editor cuja gravação não entrou logo (outra alteração à mesma ficha entrou antes): pode aprová-la ele próprio
        alert(resposta.aviso ? 'Não entrou logo (outra alteração à mesma ficha entrou antes). Está nas Propostas; pode aprová-la lá.'
          : 'Proposta enviada. Um editor vai revê-la; depois de aprovada, aparece no site com o seu nome.');
        location.hash = '#/propostas';
        return;
      }
      // online, o site publicado só muda quando a Cloudflare o reconstruir; quem gravou vê já a alteração (estado.js)
      if (online()) juntarPendentes(alteracoes, resposta.em || new Date().toISOString());
      await carregar();
      desenhar();
      aviso(online() ? 'Gravado. Os outros visitantes veem a alteração dentro de 1 a 2 minutos.' : 'Gravado');
      if (ir && ir !== location.hash) location.hash = ir; else await redesenhar();
    } catch (e) {
      travar(el, false);
      mostrarErro(el, e); // em português simples, junto do botão de gravar
    }
  };

  document.addEventListener('click', async (e) => {
    // notas: corrigir a sua no próprio sítio (notas.js); «Sim, é do livro» por baixo do endereço da fonte
    const editarNota = e.target.closest('[data-nota-editar]'), cancelar = e.target.closest('[data-nota-cancelar]');
    const escolher = e.target.closest('[data-fonte-escolher]');
    if (editarNota || cancelar || escolher) {
      e.preventDefault();
      if (editarNota) abrirEditarNota(editarNota);
      else if (cancelar) fecharNota(cancelar);
      else escolherFonte(escolher.closest('.como-sabe'), escolher.dataset.fonteEscolher);
      return;
    }
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    e.preventDefault();
    const { acao, confirmar, pedir, pedirCampo, valor, ...dados } = b.dataset;
    if (acao === 'nota-facto') { abrirNotaNova(b); return; } // a nota nova escreve-se por baixo do facto, sem prompt()
    if (COM_JANELA.has(acao)) { // aprovar, rejeitar ou corrigir uma fonte; retirar do catálogo: primeiro a janela
      const r = await antesDe(acao, dados);
      if (r) correr(acao, { ...dados, ...r.dados }, b, { motivo: r.motivo });
      return;
    }
    if (confirmar && !vaiRever(acao, dados) && !confirm(confirmar)) return; // «Vai ficar assim» já serve de confirmação
    if (pedir) {
      const resposta = prompt(pedir, valor || '');
      if (resposta === null) return;
      dados[pedirCampo || 'nota'] = resposta.trim();
    } else if (valor !== undefined) dados.valor = valor; // sem pergunta, data-valor é um dado da ação
    correr(acao, dados, b);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-acao]');
    if (!f) return;
    e.preventDefault();
    correr(f.dataset.acao, dadosFormulario(f), f);
  });

  // «Como sabe?» à vista: a fonte da frase ao colar o endereço; a frase procurada no arquivo (na cópia local)
  const relogios = new WeakMap();
  const adiar = (fs, chave, fn, ms) => {
    const r = relogios.get(fs) || {};
    relogios.set(fs, r);
    clearTimeout(r[chave]);
    r[chave] = setTimeout(() => fn(fs), ms);
  };
  const campoDaProva = (el) => {
    const fs = el.closest?.('.como-sabe'), c = provaDe(fs);
    return c && el.name ? [fs, el.name.slice(c.p.length)] : [];
  };
  document.addEventListener('input', (e) => {
    const [fs, k] = campoDaProva(e.target);
    if (k === 'fonte_url') { adiar(fs, 'fonte', mostrarFonte, 250); adiar(fs, 'frase', verificarFrase, 700); }
    else if (k === 'citacao') adiar(fs, 'frase', verificarFrase, 900);
  });
  document.addEventListener('change', (e) => {
    const [fs, k] = campoDaProva(e.target);
    if (['como', 'fonte', 'fonte_url'].includes(k)) { mostrarFonte(fs); verificarFrase(fs); }
  });
  document.addEventListener('focusout', (e) => {
    const [fs, k] = campoDaProva(e.target);
    if (k === 'citacao' || k === 'fonte_url') verificarFrase(fs);
  });
  // um formulário que já vem preenchido (por exemplo «+ Catalogar», com o endereço do post): ao abrir a dobra ou ao entrar nele
  const mostrarJa = (raiz) => raiz?.querySelectorAll?.('.como-sabe').forEach((fs) => { if (provaDe(fs)?.url?.value) { mostrarFonte(fs); verificarFrase(fs); } });
  document.addEventListener('toggle', (e) => { if (e.target.open) mostrarJa(e.target); }, true);
  document.addEventListener('focusin', (e) => { const fs = e.target.closest?.('.como-sabe'); if (fs) mostrarJa(fs.parentElement); });
}
