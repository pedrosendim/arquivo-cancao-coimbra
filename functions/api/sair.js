// /api/sair: apaga a sessão deste browser.
export function onRequestGet({ request }) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${new URL(request.url).origin}/#/`, 'Set-Cookie': 'sessao=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' },
  });
}
