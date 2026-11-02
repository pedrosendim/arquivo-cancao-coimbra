// Utilitários da versão online (Worker da Cloudflare: online/worker.js e as rotas em online/api/).
// A sessão é um cookie assinado com «quem é» (o utilizador do GitHub); o arquivo nunca guarda palavras-passe
// nem o token do contribuidor. As alterações vão para o repositório como propostas (pull requests), feitas com
// o token do dono do arquivo, guardado como segredo na Cloudflare (GITHUB_TOKEN).
//
// Variáveis na Cloudflare: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (aplicação OAuth do GitHub), GITHUB_TOKEN;
// opcional REPOSITORIO (por omissão pedrosendim/arquivo-cancao-coimbra).

export const repositorio = (env) => env.REPOSITORIO || 'pedrosendim/arquivo-cancao-coimbra';
// os mesmos ficheiros que o servidor local deixa editar (scripts/servidor.py)
export const RE_EDITAVEL = /^(dados\/(pessoas|instrumentos|gravacoes|obras|media|blogue)\/[a-z0-9]+(-[a-z0-9]+)*\.json|dados\/contribuidores\.json|fontes\/fontes\.json)$/;
export const APROVAM = ['dono', 'editor'];
const AGENTE = 'arquivo-cancao-coimbra';

export function json(dados, estado = 200) {
  return new Response(JSON.stringify(dados), {
    status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

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

export async function gh(env, caminho, opcoes = {}) {
  const r = await fetch(`https://api.github.com${caminho}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': AGENTE,
      'X-GitHub-Api-Version': '2022-11-28', ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}), ...opcoes.headers },
  });
  if (!r.ok) {
    const texto = (await r.text()).slice(0, 300);
    const erro = new Error(/not accessible by personal access token/i.test(texto)
      // o token do site (segredo GITHUB_TOKEN) não tem uma das permissões: diz-se qual é o problema em vez da resposta crua
      ? 'o token do site não tem permissão para isto. No GitHub, edite o token e confirme: Contents e Pull requests em «Read and write»'
      : `GitHub respondeu ${r.status}: ${texto}`);
    erro.estado = r.status;
    throw erro;
  }
  return r.status === 204 ? null : (opcoes.headers?.Accept || '').includes('raw') ? r.text() : r.json();
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

/** Contribuidor registado com este utilizador do GitHub (e com acesso), ou null. */
export async function contribuidorDe(env, login) {
  const reg = await lerFicheiro(env, 'dados/contribuidores.json');
  return (reg?.contribuidores || []).find((c) => c.github && c.github.toLowerCase() === String(login).toLowerCase() && c.papel !== 'antigo') || null;
}

/** Contribuidor da sessão, ou uma resposta de erro pronta a devolver. */
export async function exigirContribuidor(pedido, env) {
  const s = await sessao(pedido, env);
  if (!s) return { erro: json({ erro: 'precisa de entrar com a sua conta do GitHub' }, 401) };
  const c = await contribuidorDe(env, s.login);
  if (!c) return { erro: json({ erro: `a conta @${s.login} não foi convidada para contribuir; fale com o dono do arquivo` }, 403) };
  return { s, c };
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
