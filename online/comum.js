// Utilitários da versão online (Worker da Cloudflare: online/worker.js e as rotas em online/api/).
// A sessão é um cookie assinado com «quem é» (o utilizador do GitHub); o arquivo nunca guarda palavras-passe
// nem o token do contribuidor. As alterações vão para o repositório como propostas (pull requests), feitas com
// o token do dono do arquivo, guardado como segredo na Cloudflare (GITHUB_TOKEN).
//
// Variáveis na Cloudflare: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (aplicação OAuth do GitHub), GITHUB_TOKEN;
// opcional REPOSITORIO (por omissão pedrosendim/arquivo-cancao-coimbra).

export const repositorio = (env) => env.REPOSITORIO || 'pedrosendim/arquivo-cancao-coimbra';
// os mesmos ficheiros que o servidor local deixa editar (scripts/servidor.py)
export const RE_EDITAVEL = /^(dados\/(pessoas|instrumentos|gravacoes|obras|media|blogue)\/[a-z0-9]+(-[a-z0-9]+)*\.json|dados\/contribuidores\.json|dados\/excluidos\.json|fontes\/fontes\.json)$/;
// o fundador («dono») e os administradores gerem os contribuidores; com os editores, aprovam
export const ADMINS = ['dono', 'administrador'];
export const APROVAM = [...ADMINS, 'editor'];
const AGENTE = 'arquivo-cancao-coimbra';

export function json(dados, estado = 200) {
  return new Response(JSON.stringify(dados), {
    status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** Um erro que se pode mostrar tal como está a quem usa o site (em português); o texto técnico fica em `detalhe`. */
export function erroSite(mensagem, estado = 400, detalhe = '') {
  return Object.assign(new Error(mensagem), { publico: true, estado, detalhe });
}

/** Texto escrito por quem usa o site, para pôr numa proposta do GitHub sem avisar ninguém («@nome» não chama ninguém). */
export const semMencoes = (t) => String(t || '').replace(/@(?=[A-Za-z0-9])/g, '@\u200b');

/** Escritas só a partir do próprio site (outro site aberto no browser não pode gravar em nome de ninguém). */
export const mesmaOrigem = (pedido) => pedido.headers.get('Origin') === new URL(pedido.url).origin
  && (pedido.headers.get('Content-Type') || '').startsWith('application/json');

// ---------------------------------------------------------------- sessão assinada

const cod = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const chave = (env) => crypto.subtle.importKey('raw', cod.encode(`sessao:${env.GITHUB_CLIENT_SECRET}`),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function assinar(env, dados) {
  const corpo = b64url(cod.encode(JSON.stringify(dados)));
  return `${corpo}.${b64url(await crypto.subtle.sign('HMAC', await chave(env), cod.encode(corpo)))}`;
}

async function verificar(env, valor) {
  const [corpo, assinatura] = String(valor || '').split('.');
  if (!corpo || !assinatura) return null;
  try {
    if (b64url(deB64url(assinatura)) !== assinatura) return null; // só a forma exata que o servidor escreveu
    if (!await crypto.subtle.verify('HMAC', await chave(env), deB64url(assinatura), cod.encode(corpo))) return null;
    const dados = JSON.parse(new TextDecoder().decode(deB64url(corpo)));
    return dados.exp > Date.now() ? dados : null;
  } catch { return null; }
}

export const cookie = (pedido, nome) => {
  for (const parte of (pedido.headers.get('Cookie') || '').split(/;\s*/)) {
    const i = parte.indexOf('=');
    if (parte.slice(0, i) === nome) return decodeURIComponent(parte.slice(i + 1));
  }
  return null;
};

/** { login, id } de quem entrou, ou null. */
export const sessao = (pedido, env) => verificar(env, cookie(pedido, 'sessao'));

// ---------------------------------------------------------------- GitHub

// o fim do prazo do token do site, que o GitHub manda em cada resposta (tokens de granularidade fina): o site avisa o
// fundador 15 dias antes (online/api/sessao.js)
let fimDoToken = null;
export const fimDoPrazoDoToken = () => fimDoToken;

async function pedirGithub(env, caminho, opcoes = {}) {
  const r = await fetch(`https://api.github.com${caminho}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': AGENTE,
      'X-GitHub-Api-Version': '2022-11-28', ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}), ...opcoes.headers },
  });
  const fim = r.headers.get('github-authentication-token-expiration'); // «2026-12-01 10:00:00 UTC»
  if (fim) fimDoToken = fim.replace(' UTC', 'Z').replace(' ', 'T');
  return r;
}

/** As falhas do GitHub que se sabe explicar, em português; as outras ficam com o texto técnico. */
function erroDoGithub(r, texto) {
  let msg = null, problema = null;
  if (r.status === 401) {
    problema = 'token';
    msg = 'O site perdeu o acesso ao GitHub (o token GITHUB_TOKEN expirou ou foi revogado). Avise o fundador: tem de criar um token novo e pô-lo na Cloudflare.';
  } else if ([403, 429].includes(r.status) && (r.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(texto))) {
    problema = 'limite';
    const reset = Number(r.headers.get('x-ratelimit-reset')) * 1000 || Date.now() + 60_000;
    let hora;
    try { hora = new Date(reset).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }); } catch { hora = new Date(reset).toISOString().slice(11, 16); }
    msg = `O GitHub está a limitar os pedidos do site; tente às ${hora}.`;
  } else if (/not accessible by personal access token/i.test(texto)) {
    problema = 'permissao';
    // o token do site (segredo GITHUB_TOKEN) não tem uma das permissões: diz-se qual é o problema em vez da resposta crua
    msg = 'O token do site não tem permissão para isto. No GitHub, edite o token e confirme: Contents e Pull requests em «Read and write».';
  }
  return Object.assign(new Error(msg || `GitHub respondeu ${r.status}: ${texto}`),
    { estado: r.status, publico: !!msg, detalhe: `GitHub ${r.status}: ${texto}`, problema });
}

export async function gh(env, caminho, opcoes = {}) {
  const r = await pedirGithub(env, caminho, opcoes);
  if (!r.ok) throw erroDoGithub(r, (await r.text()).slice(0, 300));
  return r.status === 204 ? null : (opcoes.headers?.Accept || '').includes('raw') ? r.text() : r.json();
}

/** Consulta GraphQL (um só pedido ao GitHub para o que em REST seriam dezenas). Se o GraphQL falhar (erro na consulta,
 *  ou o token sem acesso a ele), a exceção leva «graphql» e quem chama faz o mesmo em REST; o token expirado e o
 *  limite de pedidos não: aí o REST também falhava. */
export async function ghQL(env, query, variables = {}) {
  let r;
  try { r = await gh(env, '/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) }); } catch (e) {
    if (e.problema === 'token' || e.problema === 'limite') throw e;
    throw Object.assign(new Error(`GraphQL: ${e.message}`), { graphql: true });
  }
  if (r?.errors?.length || !r?.data) throw Object.assign(new Error(`GraphQL: ${(r?.errors || []).map((e) => e.message).join('; ').slice(0, 300)}`), { graphql: true });
  return r.data;
}

/** Ficheiro JSON do ramo principal do repositório (null se não existir). */
export async function lerFicheiro(env, caminho) {
  try {
    return JSON.parse(await gh(env, `/repos/${repositorio(env)}/contents/${caminho}?ref=main`, { headers: { Accept: 'application/vnd.github.raw+json' } }));
  } catch (e) {
    if (e.estado === 404) return null;
    throw e;
  }
}

const descodificar = (b64) => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, '')), (c) => c.charCodeAt(0)));

/** Vários ficheiros em várias versões (ramo ou commit), de uma vez: [{ ref, caminho }] → [{ oid, conteudo }] pela mesma
 *  ordem (oid = versão do ficheiro no git; null nos dois se o ficheiro não existir nessa versão). */
export async function lerVersoes(env, pedidos) {
  if (!pedidos.length) return [];
  const [dono, nome] = repositorio(env).split('/');
  try {
    const campos = pedidos.map((p, i) => `f${i}: object(expression: ${JSON.stringify(`${p.ref}:${p.caminho}`)}) { ... on Blob { oid text isTruncated } }`);
    const d = await ghQL(env, `query($dono: String!, $nome: String!) { repository(owner: $dono, name: $nome) { ${campos.join(' ')} } }`, { dono, nome });
    return await Promise.all(pedidos.map(async (p, i) => {
      const b = d.repository[`f${i}`];
      if (!b) return { oid: null, conteudo: null };
      if (!b.isTruncated && b.text != null) return { oid: b.oid, conteudo: JSON.parse(b.text) };
      return { oid: b.oid, conteudo: JSON.parse(await gh(env, `/repos/${dono}/${nome}/git/blobs/${b.oid}`, { headers: { Accept: 'application/vnd.github.raw+json' } })) };
    }));
  } catch (e) {
    if (!e.graphql) throw e;
    if (pedidos.length > 25) throw erroSite('Não foi possível ler as fichas para conferir a alteração; tente daqui a pouco.', 503, e.message);
    return Promise.all(pedidos.map(async (p) => { // sem GraphQL: um pedido por ficheiro
      try {
        const f = await gh(env, `/repos/${dono}/${nome}/contents/${p.caminho}?ref=${encodeURIComponent(p.ref)}`);
        return { oid: f.sha, conteudo: JSON.parse(f.content ? descodificar(f.content)
          : await gh(env, `/repos/${dono}/${nome}/git/blobs/${f.sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } })) };
      } catch (x) {
        if (x.estado === 404) return { oid: null, conteudo: null };
        throw x;
      }
    }));
  }
}

// O registo dos contribuidores lê-se a cada pedido; fica na memória durante 60 s e, depois, pergunta-se ao GitHub se
// mudou (as respostas «não mudou», 304, não gastam o limite de pedidos do token). Quem perde o acesso perde-o em 60 s.
const REGISTO = { dados: null, etag: null, em: 0 };
export const esquecerRegisto = () => { REGISTO.em = 0; };

export async function lerRegisto(env) {
  if (REGISTO.dados && Date.now() - REGISTO.em < 60_000) return REGISTO.dados;
  const r = await pedirGithub(env, `/repos/${repositorio(env)}/contents/dados/contribuidores.json?ref=main`, {
    headers: { Accept: 'application/vnd.github.raw+json', ...(REGISTO.dados && REGISTO.etag ? { 'If-None-Match': REGISTO.etag } : {}) },
  });
  if (r.status === 304 && REGISTO.dados) { REGISTO.em = Date.now(); return REGISTO.dados; }
  if (r.status === 404) return { contribuidores: [] };
  if (!r.ok) throw erroDoGithub(r, (await r.text()).slice(0, 300));
  Object.assign(REGISTO, { dados: JSON.parse(await r.text()), etag: r.headers.get('etag'), em: Date.now() });
  return REGISTO.dados;
}

/** Contribuidor registado com a conta do GitHub desta sessão ({ login, id }) e com acesso, ou null. Se o registo
 *  guarda o número da conta (github_id), compara-se por ele: o nome de utilizador muda-se, e o antigo fica livre para
 *  outra pessoa o registar. Sem número, compara-se pelo nome, como antes. */
export async function contribuidorDe(env, s) {
  const reg = await lerRegisto(env);
  const login = String(s?.login || '').toLowerCase();
  return (reg?.contribuidores || []).find((c) => c.github && c.papel !== 'antigo'
    && (c.github_id ? Number(c.github_id) === Number(s?.id) : c.github.toLowerCase() === login)) || null;
}

/** Contribuidor da sessão, ou uma resposta de erro pronta a devolver. */
export async function exigirContribuidor(pedido, env) {
  const s = await sessao(pedido, env);
  if (!s) return { erro: json({ erro: 'Precisa de entrar com a sua conta do GitHub.' }, 401) };
  const c = await contribuidorDe(env, s);
  if (!c) return { erro: json({ erro: `A conta @${s.login} não foi convidada para contribuir; fale com o fundador do arquivo.` }, 403) };
  return { s, c };
}

// ---------------------------------------------------------------- propostas

const ESTADO_FICHEIRO = { ADDED: 'added', DELETED: 'removed', RENAMED: 'renamed', COPIED: 'added' };

/** Uma proposta, no formato que as rotas usam (venha do GraphQL ou do REST). */
const proposta = (p) => ({ ...p, login: p.ramo.split('/')[1] || '' });

/** A consulta das propostas abertas. O GitHub conta cada consulta pelo tamanho das listas que pede (o token tem 5000
 *  pontos por hora): a leve (as fichas e a cabeça de cada proposta, para ler e gravar fichas e para a contagem do menu)
 *  custa 1 ponto; a completa (a página Propostas: também o conflito e a última verificação «validar» do último commit),
 *  4. Os erros da validação só se pedem das propostas em que ela falhou (errosDaValidacao). */
export const consultaAbertas = (completa) => `query($dono: String!, $nome: String!) { repository(owner: $dono, name: $nome) {
  pullRequests(states: OPEN, baseRefName: "main", first: 50, orderBy: { field: CREATED_AT, direction: ASC }) { nodes {
    number title body createdAt url headRefName headRefOid baseRefOid headRepository { nameWithOwner }${completa ? ' mergeable' : ''}
    commits(last: 1) { totalCount nodes { commit { committedDate${completa ? ` checkSuites(first: 5) { nodes {
      checkRuns(first: 1, filterBy: { checkName: "validar", checkType: LATEST }) { nodes { id name status conclusion startedAt } } } }` : ''} } } }
    files(first: 100) { nodes { path changeType } } } } } }`;

/** As mensagens de erro que o validar.py anotou, só nas verificações que falharam (uma consulta pequena: 1 ponto). Se
 *  não se conseguirem ler, a proposta mostra só que a validação falhou. */
async function errosDaValidacao(env, lista) {
  const falhadas = lista.flatMap((p) => p.verificacoes).filter((v) => v.id && v.estado === 'completed' && v.conclusao === 'failure').slice(0, 20);
  if (!falhadas.length) return;
  try {
    const d = await ghQL(env, `query { ${falhadas.map((v, i) => `a${i}: node(id: ${JSON.stringify(v.id)}) { ... on CheckRun {
      annotations(first: 10) { nodes { message annotationLevel } } } }`).join(' ')} }`);
    falhadas.forEach((v, i) => { v.erros = (d[`a${i}`]?.annotations?.nodes || []).filter((a) => a.annotationLevel === 'FAILURE').map((a) => a.message); });
  } catch { /* sem os erros */ }
}

async function abertasPorGraphQL(env, completa) {
  const [dono, nome] = repositorio(env).split('/');
  const d = await ghQL(env, consultaAbertas(completa), { dono, nome });
  const lista = d.repository.pullRequests.nodes
    .filter((p) => p.headRefName.startsWith('proposta/') && p.headRepository?.nameWithOwner === repositorio(env))
    .map((p) => proposta({
      numero: p.number, titulo: p.title, corpo: p.body || '', criada: p.createdAt, url: p.url, ramo: p.headRefName,
      // a hora do último commit: uma proposta que continua tem uma validação nova, que arranca a partir daí
      ultimo: p.commits.nodes[0]?.commit.committedDate || p.createdAt,
      head: p.headRefOid, base: p.baseRefOid, conflito: p.mergeable === 'CONFLICTING', n_commits: p.commits.totalCount,
      ficheiros: p.files.nodes.map((f) => ({ caminho: f.path, estado: ESTADO_FICHEIRO[f.changeType] || 'modified' })),
      verificacoes: (p.commits.nodes[0]?.commit.checkSuites?.nodes || []).flatMap((s) => s.checkRuns.nodes).map((v) => ({
        id: v.id, nome: v.name, estado: String(v.status).toLowerCase(), conclusao: v.conclusion && String(v.conclusion).toLowerCase(), inicio: v.startedAt,
        erros: [] })),
    }));
  if (completa) await errosDaValidacao(env, lista);
  return lista;
}

/** Sem GraphQL: a lista em REST, com os ficheiros (e, na completa, as verificações) das primeiras 20 (o limite da
 *  Cloudflare são 50 pedidos por pedido). */
async function abertasPorRest(env, { de = null, completa = false } = {}) {
  const R = repositorio(env);
  const lista = (await gh(env, `/repos/${R}/pulls?state=open&per_page=50`))
    .filter((p) => propostaDoSite(p, env) && (!de || p.head.ref.split('/')[1] === de)).slice(0, de ? 10 : 20);
  return Promise.all(lista.map(async (p) => {
    const [ficheiros, verificacoes] = await Promise.all([
      gh(env, `/repos/${R}/pulls/${p.number}/files?per_page=100`),
      completa ? gh(env, `/repos/${R}/commits/${p.head.sha}/check-runs?check_name=validar`).catch(() => ({ check_runs: [] })) : { check_runs: [] },
    ]);
    return proposta({
      numero: p.number, titulo: p.title, corpo: p.body || '', criada: p.created_at, url: p.html_url, ramo: p.head.ref,
      ultimo: p.updated_at || p.created_at, head: p.head.sha, base: p.base.sha, conflito: false, n_commits: null,
      ficheiros: ficheiros.map((f) => ({ caminho: f.filename, estado: f.status, anterior: f.previous_filename })),
      verificacoes: (verificacoes.check_runs || []).map((v) => ({ nome: v.name, estado: v.status, conclusao: v.conclusion, inicio: v.started_at, erros: [] })),
    });
  }));
}

// a lista das propostas abertas fica 5 s na memória: o modo de edição lê várias fichas seguidas (/api/dados); a
// completa também serve a quem só precisa da leve
const ABERTAS = { leve: null, completa: null }; // { lista, em }
export const esquecerPropostas = () => { ABERTAS.leve = null; ABERTAS.completa = null; };

/** As propostas abertas feitas no site (ramos proposta/<conta>/…), da mais antiga para a mais recente, com os
 *  ficheiros e a cabeça de cada uma. `completa`: também o estado da validação e se estão em conflito (a página
 *  Propostas). `fresca`: sem a cópia na memória (para gravar). `de`: só as de uma conta. */
export async function propostasAbertas(env, { fresca = false, de = null, completa = false } = {}) {
  const deQuem = (lista) => (de ? lista.filter((p) => p.login === de) : lista);
  const guardada = fresca ? null : [ABERTAS.completa, completa ? null : ABERTAS.leve].find((x) => x && Date.now() - x.em < 5_000);
  if (guardada) return deQuem(guardada.lista);
  let lista;
  try { lista = await abertasPorGraphQL(env, completa); } catch (e) {
    if (!e.graphql) throw e;
    // em REST, quem grava ou lê uma ficha só precisa das suas propostas: menos pedidos
    if (de) return abertasPorRest(env, { de, completa });
    lista = await abertasPorRest(env, { completa });
  }
  ABERTAS[completa ? 'completa' : 'leve'] = { lista, em: Date.now() };
  return deQuem(lista);
}

/** O estado da validação de uma proposta. Só conta a verificação «validar» (o validar.py, .github/workflows/validar.yml):
 *  a construção de pré-visualização da Cloudflare, por exemplo, não tem nada a ver com os dados.
 *  'passou' | 'falhou' | 'a-verificar' | 'por-verificar'; e os erros que o validar.py anotou. */
export function validacaoDe(p) {
  const v = p.verificacoes.filter((x) => x.nome === 'validar').sort((a, b) => String(a.inicio || '').localeCompare(String(b.inicio || '')));
  const ultima = v[v.length - 1];
  if (!ultima) return { estado: 'por-verificar', erros: [] };
  if (ultima.estado !== 'completed') return { estado: 'a-verificar', erros: [] };
  return { estado: ultima.conclusao === 'success' ? 'passou' : 'falhou', erros: ultima.erros || [] };
}

/** Proposta feita pelo próprio site: ramo «proposta/…» deste repositório (nunca de uma cópia/fork de outra pessoa). */
export const propostaDoSite = (pr, env) => pr.head?.ref?.startsWith('proposta/') && pr.head?.repo?.full_name === repositorio(env)
  && pr.base?.ref === 'main';

/** Ficheiros de uma proposta que não são dados editáveis (o site nunca aprova código, só fichas e fontes). */
export async function ficheirosProibidos(env, numero) {
  const ficheiros = await gh(env, `/repos/${repositorio(env)}/pulls/${numero}/files?per_page=100`);
  return ficheiros.flatMap((f) => [f.filename, f.previous_filename]).filter((f) => f && !RE_EDITAVEL.test(f));
}

/** Mesmo formato que scripts/comum.py escrever_json (indentação de 2, acentos tal como estão, linha final). */
export const textoJson = (dados) => `${JSON.stringify(dados, null, 2)}\n`;
