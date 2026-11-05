// Cabeçalhos de segurança da página do site («/», o index.html). Os outros ficheiros levam os de site/_headers; esta
// página passa pelo Worker para a política (CSP) dizer também que scripts pode correr: os do próprio site, o cdnjs
// (dagre, nas linhagens), as APIs oficiais dos leitores (YouTube, Vimeo e SoundCloud, em leitor.js: a fila avança
// quando o vídeo ou o som acaba), os scripts em linha da página, autorizados pelo seu hash, e os dois onerror em linha
// das imagens. O hash calcula-se da página tal como está publicada, por isso nunca fica desatualizado quando a página
// muda. Um endereço javascript:, um script injetado num post ou numa ficha, ou um <base> deixam de correr. Se alguma
// coisa falhar aqui, a página segue como está: o site nunca deixa de abrir por isto.
// O mesmo, na cópia local: scripts/servidor.py (csp_pagina, CSP_SCRIPTS). A lista SCRIPTS tem de ser igual nos dois:
// um script novo de fora (outro leitor, outra biblioteca) acrescenta-se aqui e lá.

export const CSP_BASE = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const SCRIPTS = "'self' https://cdnjs.cloudflare.com https://www.youtube.com https://player.vimeo.com https://w.soundcloud.com";
const ONERROR_EM_LINHA = ["this.closest('figure').remove()", 'this.remove()']; // componentes.js e vistas/linhagens.js

async function hash(texto) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto.replace(/\r\n?/g, '\n')));
  return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(d)))}'`;
}

/** A política de uma página HTML, com os seus scripts em linha. */
export async function cspDaPagina(html) {
  const emLinha = [...html.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const [scripts, eventos] = await Promise.all([Promise.all(emLinha.map(hash)), Promise.all(ONERROR_EM_LINHA.map(hash))]);
  return `script-src ${SCRIPTS} ${scripts.join(' ')} 'unsafe-hashes' ${eventos.join(' ')}; ${CSP_BASE}`;
}

export async function paginaComCsp(request, env) {
  const r = await env.ASSETS.fetch(request);
  try {
    if (r.status !== 200 || !(r.headers.get('Content-Type') || '').includes('text/html')) return r;
    const html = await r.clone().text();
    const h = new Headers(r.headers);
    h.set('Content-Security-Policy', await cspDaPagina(html));
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers: h });
  } catch { return r; }
}
