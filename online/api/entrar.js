// /api/entrar: leva ao GitHub para a pessoa se identificar (a palavra-passe só se escreve no GitHub).
import { json } from '../comum.js';

export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) return json({ erro: 'a entrada com o GitHub ainda não está configurada' }, 503);
  const url = new URL(request.url);
  const estado = crypto.randomUUID();
  const volta = (url.searchParams.get('volta') || '').startsWith('#/') ? url.searchParams.get('volta') : '#/';
  const github = new URL('https://github.com/login/oauth/authorize');
  github.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  github.searchParams.set('redirect_uri', `${url.origin}/api/entrar/github`);
  github.searchParams.set('state', estado);
  // sem «scope»: o arquivo só fica a saber o nome de utilizador público; nunca mexe na conta de quem entra
  const h = new Headers({ Location: github.toString() });
  h.append('Set-Cookie', `estado_oauth=${estado}; Path=/api/entrar; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  h.append('Set-Cookie', `volta_oauth=${encodeURIComponent(volta)}; Path=/api/entrar; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return new Response(null, { status: 302, headers: h });
}
