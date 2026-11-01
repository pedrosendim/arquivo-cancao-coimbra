// /api/entrar/github: o GitHub devolve a pessoa aqui; fica uma sessão assinada com o nome de utilizador.
// O token que o GitHub entrega só serve para saber quem é: não se guarda.
import { assinar, cookie } from '../../../online/comum.js';

const TRINTA_DIAS = 30 * 24 * 3600;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const volta = cookie(request, 'volta_oauth') || '#/';
  const ir = (destino, cookies = []) => {
    const h = new Headers({ Location: `${url.origin}/${destino.startsWith('#/') ? destino : '#/'}` });
    for (const c of [...cookies, 'estado_oauth=; Path=/api/entrar; Max-Age=0', 'volta_oauth=; Path=/api/entrar; Max-Age=0']) h.append('Set-Cookie', c);
    return new Response(null, { status: 302, headers: h });
  };
  const code = url.searchParams.get('code'), estado = url.searchParams.get('state');
  if (!code || !estado || estado !== cookie(request, 'estado_oauth')) return ir('#/contribuidores?entrada=falhou');

  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'arquivo-cancao-coimbra' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/api/entrar/github` }),
  });
  const { access_token: token } = await r.json().catch(() => ({}));
  if (!token) return ir('#/contribuidores?entrada=falhou');
  const u = await (await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'arquivo-cancao-coimbra' },
  })).json().catch(() => ({}));
  if (!u.login) return ir('#/contribuidores?entrada=falhou');

  const valor = await assinar(env, { login: u.login, id: u.id, exp: Date.now() + TRINTA_DIAS * 1000 });
  return ir(volta, [`sessao=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TRINTA_DIAS}`]);
}
