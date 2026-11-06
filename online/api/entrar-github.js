// /api/entrar/github: o GitHub devolve a pessoa aqui; fica uma sessão assinada com o nome de utilizador.
// O token que o GitHub entrega só serve para saber quem é: não se guarda.
import { armazem, assinar, contribuidorDe, cookie, lerRegisto, sessao } from '../comum.js';

const TRINTA_DIAS = 30 * 24 * 3600;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const volta = cookie(request, 'volta_oauth') || '#/';
  const ir = (destino, cookies = []) => {
    const h = new Headers({ Location: `${url.origin}/${destino.startsWith('#/') ? destino : '#/'}` });
    for (const c of [...cookies, 'estado_oauth=; Path=/api/entrar; Max-Age=0', 'volta_oauth=; Path=/api/entrar; Max-Age=0', 'ligar_oauth=; Path=/api/entrar; Max-Age=0']) h.append('Set-Cookie', c);
    return new Response(null, { status: 302, headers: h });
  };
  const code = url.searchParams.get('code'), estado = url.searchParams.get('state');
  const ligar = cookie(request, 'ligar_oauth') === '1';
  const falhou = ligar ? '#/conta?github=falhou' : '#/reservada?entrada=falhou';
  if (!code || !estado || estado !== cookie(request, 'estado_oauth')) return ir(falhou);

  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'arquivo-cancao-coimbra' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/api/entrar/github` }),
  });
  const { access_token: token } = await r.json().catch(() => ({}));
  if (!token) return ir(falhou);
  const u = await (await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'arquivo-cancao-coimbra' },
  })).json().catch(() => ({}));
  if (!u.login) return ir(falhou);

  // ligar o GitHub à conta de quem já entrou (nunca a uma conta que não seja a da sessão, nem a um GitHub de outra pessoa do registo)
  if (ligar) {
    const s = await sessao(request, env), c = s?.conta ? await contribuidorDe(env, s) : null;
    if (!c) return ir(falhou);
    const login = u.login.toLowerCase();
    const outro = ((await lerRegisto(env))?.contribuidores || []).some((x) => x.id !== c.id && (Number(x.github_id) === u.id || x.github?.toLowerCase() === login));
    const r = outro ? { erro: 'ocupado' } : await armazem(env, 'ligarGithub', { id: c.id, github_id: u.id, login: u.login });
    return ir(`#/conta?github=${r.erro ? 'ocupado' : 'ligado'}`);
  }

  // um GitHub ligado a uma conta própria abre essa conta
  const ligada = env.ARMAZEM ? await armazem(env, 'contaDoGithub', { github_id: u.id }).catch(() => ({})) : {};
  const dados = ligada.id ? { conta: ligada.id, login: `conta-${ligada.id}`, v: ligada.versao } : { login: u.login, id: u.id };
  const valor = await assinar(env, { ...dados, exp: Date.now() + TRINTA_DIAS * 1000 });
  return ir(volta, [`sessao=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TRINTA_DIAS}`]);
}
