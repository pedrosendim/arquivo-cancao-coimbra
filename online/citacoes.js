// Online não há a cópia dos blogues (arquivo/), e o validar.py do GitHub não consegue confirmar as citações novas.
// Por isso, ao gravar, as citações novas de posts dos blogues (Blogger) confirmam-se no próprio post, pelo feed
// oficial do Blogger, o mesmo de onde vem a cópia local (scripts/recolher_blogger.py): o título e o texto do post ou,
// num endereço «#c…», o texto desse comentário. Procura-se a frase com as mesmas regras de scripts/comum.py
// (normalizar, trocos, troco_em_falta, html_para_texto, url_do_post). Se o post abre e a frase não está lá, a gravação
// é recusada, com o troço que falta. Se o post não abrir (rede, Blogger em baixo, feed só com resumos), a citação fica
// por confirmar, como nos outros sites, até o validar.py a verificar na cópia local. Nada daqui se guarda.

/** Igual a normalizar() de scripts/comum.py. */
export function normalizar(texto) {
  return String(texto || '').normalize('NFC').toLowerCase()
    .replace(/[“”«»„"]/g, '"').replace(/[‘’`´]/g, "'").replace(/[–—‒−]/g, '-')
    .replace(/\u00a0/g, ' ').replace(/\u200b/g, '')
    // os mesmos espaços do \s do Python: sem U+FEFF (que o JS conta e o Python não), com U+001C–U+001F e U+0085
    .replace(/(?:(?!﻿)\s|[\x1c-\x1f\x85])+/g, ' ').trim();
}

/** Igual a trocos(): os troços da citação separados por «...», «…» ou «[…]», sem as aspas nem os espaços das pontas. */
export const trocos = (citacao) => normalizar(citacao).split(/\.\.\.|…|\[\s*\.\.\.\s*\]|\[…\]/)
  .map((x) => x.replace(/^[ "']+|[ "']+$/g, '')).filter(Boolean);

/** Igual a troco_em_falta(): null se a citação está no texto (cada troço, por ordem); senão [troço, início que bate]. */
export function trocoEmFalta(citacao, texto) {
  const partes = trocos(citacao);
  // uma citação sem palavras (só aspas, reticências ou pontuação: «», "", …) nunca aparece: sem palavras não há prova
  if (!partes.some((p) => /[\p{L}\p{N}]/u.test(p))) return [normalizar(citacao), ''];
  let pos = 0;
  for (const p of partes) {
    const i = texto.indexOf(p, pos);
    if (i < 0) {
      let bate = 0, n = p.length;
      while (bate < n) {
        const m = Math.floor((bate + n + 1) / 2);
        if (texto.indexOf(p.slice(0, m), pos) >= 0) bate = m; else n = m - 1;
      }
      return [p, p.slice(0, bate)];
    }
    pos = i + p.length;
  }
  return null;
}

// as entidades com nome que aparecem nos posts antigos (o resto vem já em UTF-8 ou em &#…;)
const LATIM = 'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde '
  + 'Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml '
  + 'aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide '
  + 'oslash ugrave uacute ucirc uuml yacute thorn yuml';
const ENTIDADES = {
  ...Object.fromEntries(LATIM.split(' ').map((n, i) => [n, String.fromCharCode(0xc0 + i)])),
  nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘',
  rsquo: '’', sbquo: '‚', bdquo: '„', ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•', deg: '°', ordm: 'º',
  ordf: 'ª', copy: '©', reg: '®', trade: '™', sect: '§', para: '¶', iexcl: '¡', iquest: '¿', cent: '¢', pound: '£', euro: '€',
  shy: '\u00ad', acute: '´', cedil: '¸', uml: '¨', OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', circ: 'ˆ',
  tilde: '˜', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d', lsaquo: '‹', rsaquo: '›',
  prime: '′', Prime: '″', frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³', plusmn: '±',
};
const entidade = (m, n) => {
  if (n[0] === '#') {
    const c = n[1] === 'x' || n[1] === 'X' ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10);
    return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : m;
  }
  return ENTIDADES[n] ?? m;
};

const BLOCOS = 'p|div|br|li|tr|h[1-6]|blockquote|table|hr';

/** Como html_para_texto(): sem scripts, estilos nem comentários; os blocos mudam de linha; as entidades descodificadas. */
export function textoDeHtml(html) {
  return String(html || '').slice(0, 3_000_000).replace(/\\\//g, '/')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(new RegExp(`</?(?:${BLOCOS})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, entidade);
}

/** Igual a url_do_post(): o endereço de um post do Blogger (https, .blogspot.com, sem «?…» nem «#…»), ou null. */
export function urlDoPost(url) {
  let u = `https://${String(url || '').trim().split('://').slice(-1)[0]}`;
  u = u.split('#')[0].split('?')[0];
  const partes = u.split('/');
  if (partes.length < 4 || !partes[2].toLowerCase().includes('.blogspot.')) return null;
  return u.replace(/\.blogspot\.(?!com\/)[a-z]{2,3}(?:\.[a-z]{2})?\//, '.blogspot.com/');
}

const ehObjeto = (x) => x && typeof x === 'object' && !Array.isArray(x);
/** Todas as citações (objetos com «citacao» e «url») de um conteúdo. */
function citacoesDe(x, lista = []) {
  if (Array.isArray(x)) x.forEach((y) => citacoesDe(y, lista));
  else if (ehObjeto(x)) {
    if (typeof x.citacao === 'string' && x.citacao.trim() && typeof x.url === 'string') lista.push(x);
    Object.values(x).forEach((y) => citacoesDe(y, lista));
  }
  return lista;
}
const chave = (c) => `${c.fonte || ''}|${c.url}|${normalizar(c.citacao)}`;

/** As citações novas (que não estavam em nenhuma versão anterior das fichas da gravação) de posts do Blogger:
 *  Map «post|comentário» → { post, comentario, citacoes }. Um endereço «?showComment=…» sem «#c…» não diz que
 *  comentário é: fica por confirmar, como na cópia local (comum.py procurar_documento). */
export function citacoesNovasDeBlogues(alteracoes, anteriores) {
  const velhas = new Set();
  for (const vs of anteriores.values()) for (const v of vs) for (const c of citacoesDe(v)) velhas.add(chave(c));
  const grupos = new Map();
  for (const { conteudo } of alteracoes) {
    for (const c of conteudo ? citacoesDe(conteudo) : []) {
      const post = urlDoPost(c.url), comentario = (c.url.match(/#c(\d+)$/) || [])[1] || '';
      if (!post || !/\.html$/.test(post) || velhas.has(chave(c)) || (!comentario && c.url.includes('showComment='))) continue;
      const k = `${post}|${comentario}`;
      if (!grupos.has(k)) grupos.set(k, { post, comentario, citacoes: [] });
      grupos.get(k).citacoes.push(c);
    }
  }
  return grupos;
}

const PEDIDO = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; arquivo-cancao-coimbra; conferir citação)' }, redirect: 'follow' };

/** O texto onde a citação tem de estar, lido do feed oficial do Blogger: { titulo, texto } (normalizado), ou null se
 *  não se conseguiu ler. O número do post vem da própria página do post. Usa 2 ou 3 pedidos. */
async function textoNoBlogger(post, comentario, ler) {
  const obter = async (u, comoJson) => {
    const r = await ler(u, { ...PEDIDO, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${r.status}`);
    return comoJson ? r.json() : r.text();
  };
  try {
    const pagina = await obter(post, false);
    const id = (pagina.match(/feeds\/(\d{5,})\/comments\/default/) || pagina.match(/'postId':\s*'?(\d{5,})/) || [])[1];
    if (!id) return null;
    const blog = new URL(post).origin;
    if (comentario) {
      const f = await obter(`${blog}/feeds/${id}/comments/default?alt=json&max-results=500`, true);
      const e = (f.feed?.entry || []).find((x) => String(x.id?.$t || '').endsWith(`.post-${comentario}`));
      return e?.content?.$t ? { titulo: 'comentário', texto: normalizar(textoDeHtml(e.content.$t)) } : null;
    }
    const e = (await obter(`${blog}/feeds/posts/default/${id}?alt=json`, true)).entry;
    if (!e?.content?.$t) return null; // só o resumo no feed: não chega para conferir
    const titulo = textoDeHtml(e.title?.$t || '');
    return { titulo, texto: normalizar(`${titulo}\n${textoDeHtml(e.content.$t)}`) };
  } catch { return null; }
}

/** Confere as citações novas nos posts (no máximo `maximo` posts por gravação; os outros ficam por confirmar).
 *  Devolve null, ou a mensagem de erro para a primeira frase que o post não tem. */
export async function conferirNosPosts(grupos, { maximo = 4, ler = fetch } = {}) {
  for (const { post, comentario, citacoes } of [...grupos.values()].slice(0, maximo)) {
    const lido = await textoNoBlogger(post, comentario, ler);
    if (!lido) continue; // não se conseguiu ler: fica por confirmar
    for (const c of citacoes) {
      const falta = trocoEmFalta(c.citacao, lido.texto);
      if (!falta) continue;
      const [p, bate] = falta;
      return `Não encontrei esta frase ${comentario ? 'no comentário indicado' : `no post «${lido.titulo.trim().slice(0, 120)}»`}: «${p.slice(0, 160)}». `
        + (bate.length >= 12 ? `O texto tem o princípio («${bate.slice(-60)}»), mas não o que vem a seguir. ` : '')
        + 'Copie a frase à letra (maiúsculas, aspas e espaços não contam) e confirme que o endereço é o do post onde ela está'
        + `${comentario ? '' : ' (se a frase for de um comentário, use o endereço do comentário, que acaba em «#c…»)'}.`;
    }
  }
  return null;
}
