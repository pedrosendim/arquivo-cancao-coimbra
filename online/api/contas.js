// /api/contas/…: entrar sem conta no GitHub. Um administrador regista a pessoa em Contribuidores e pede um link de
// acesso, que lhe envia; com esse link, ela escolhe a palavra-passe. Se a esquecer, um administrador pede outro link.
// A palavra-passe nunca chega ao servidor: o browser envia uma chave derivada dela (site/js/vistas/conta.js), e no armazém
// fica só o resumo dessa chave (online/armazem.js). O utilizador é o id do contribuidor (dados/contribuidores.json).
import { ADMINS, armazem, assinar, b64url, esquecerRegisto, exigirContribuidor, json, lerRegisto, mesmaOrigem } from '../comum.js';

const TRINTA_DIAS = 30 * 24 * 3600;
const RE_BASE64 = /^[A-Za-z0-9_-]{43}$/; // 32 bytes (a chave derivada e o link)
const RE_UTILIZADOR = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ERRADA = 'Nome de utilizador ou palavra-passe errados.';
const LINK = 'Este link já foi usado ou caducou. Peça um link novo a um administrador do arquivo.';
const FORA = 'Pedido recusado: só o próprio site pode fazer isto.';

/** Uma resposta que deixa a pessoa com sessão iniciada (o «login» é o que identifica as propostas dela, ver gravar.js). */
async function comSessao(env, id, versao, corpo) {
  const valor = await assinar(env, { conta: id, login: `conta-${id}`, v: versao, exp: Date.now() + TRINTA_DIAS * 1000 });
  const r = json(corpo);
  r.headers.append('Set-Cookie', `sessao=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TRINTA_DIAS}`);
  return r;
}

const com = (tratar) => ({ onRequestPost: async ({ request, env }) => {
  if (!env.ARMAZEM) return json({ erro: 'A entrada com conta própria ainda não está disponível.' }, 503);
  if (!mesmaOrigem(request)) return json({ erro: FORA }, 403);
  return tratar({ request, env, dados: await request.json().catch(() => ({})) });
} });

export const entrar = com(async ({ request, env, dados: { utilizador, chave } }) => {
  if (!RE_UTILIZADOR.test(utilizador || '') || !RE_BASE64.test(chave || '')) return json({ erro: ERRADA }, 401);
  const reg = await lerRegisto(env);
  const c = (reg?.contribuidores || []).find((x) => x.id === utilizador && x.papel !== 'antigo');
  const r = await armazem(env, 'entrar', { utilizador, existe: !!c, chave, ip: request.headers.get('CF-Connecting-IP') });
  if (r.erro === 'bloqueado') {
    return json({ erro: `Demasiadas tentativas erradas. Tente daqui a ${r.minutos} ${r.minutos === 1 ? 'minuto' : 'minutos'}, ou peça um link novo a um administrador do arquivo.` }, 429);
  }
  if (r.erro) return json({ erro: ERRADA }, 401);
  return comSessao(env, c.id, r.versao, { ok: true });
});

/** Um administrador pede um link de acesso para uma pessoa registada (conta nova ou palavra-passe esquecida). */
export const link = com(async ({ request, env, dados: { id } }) => {
  const { c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  if (!ADMINS.includes(c.papel)) return json({ erro: 'Só os administradores criam links de acesso.' }, 403);
  esquecerRegisto(); // a pessoa pode ter acabado de ser registada
  const alvo = ((await lerRegisto(env))?.contribuidores || []).find((x) => x.id === id);
  if (!alvo) return json({ erro: 'Esta pessoa ainda não aparece no registo. Tente daqui a uns segundos.' }, 404);
  if (alvo.papel === 'antigo') return json({ erro: 'Esta pessoa já não tem acesso. Mude-lhe primeiro o papel.' }, 400);
  if (alvo.papel === 'dono' && c.papel !== 'dono') return json({ erro: 'O acesso do fundador do arquivo só ele o pode mudar.' }, 403);
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const { expira } = await armazem(env, 'criarLink', { id: alvo.id, token, por: c.id });
  return json({ ok: true, link: `${new URL(request.url).origin}/#/acesso/${token}`, utilizador: alvo.id, nome: alvo.nome, expira });
});

/** A quem pertence um link (a página de escolher a palavra-passe mostra o nome e o utilizador). */
export const verLink = com(async ({ env, dados: { token } }) => {
  if (!RE_BASE64.test(token || '')) return json({ erro: LINK }, 404);
  const r = await armazem(env, 'verLink', { token });
  const c = !r.erro && ((await lerRegisto(env))?.contribuidores || []).find((x) => x.id === r.id && x.papel !== 'antigo');
  if (!c) return json({ erro: LINK }, 404);
  return json({ nome: c.nome, utilizador: c.id, nova: r.nova });
});

export const definir = com(async ({ env, dados: { token, chave } }) => {
  if (!RE_BASE64.test(token || '') || !RE_BASE64.test(chave || '')) return json({ erro: LINK }, 404);
  const v = await armazem(env, 'verLink', { token });
  if (v.erro || !((await lerRegisto(env))?.contribuidores || []).some((x) => x.id === v.id && x.papel !== 'antigo')) return json({ erro: LINK }, 404);
  const r = await armazem(env, 'definir', { token, chave });
  if (r.erro) return json({ erro: LINK }, 404);
  return comSessao(env, r.id, r.versao, { ok: true });
});

/** Mudar a palavra-passe com a sessão iniciada: as outras sessões dessa conta terminam, e esta continua. */
export const mudar = com(async ({ request, env, dados: { atual, nova } }) => {
  const { s, c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  if (!s.conta) return json({ erro: 'Entrou com o GitHub: a palavra-passe muda-se lá.' }, 400);
  if (!RE_BASE64.test(atual || '') || !RE_BASE64.test(nova || '')) return json({ erro: 'Pedido inválido.' }, 400);
  const r = await armazem(env, 'mudar', { id: c.id, atual, nova });
  if (r.erro) return json({ erro: 'A palavra-passe atual não está certa.' }, 403);
  return comSessao(env, c.id, r.versao, { ok: true });
});

/** Quem já tem palavra-passe e quem tem um link por usar: só para os administradores. */
export const estado = { onRequestGet: async ({ request, env }) => {
  if (!env.ARMAZEM) return json({ contas: {}, links: {} });
  const { c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  if (!ADMINS.includes(c.papel)) return json({ erro: 'Só os administradores veem isto.' }, 403);
  return json(await armazem(env, 'estado'));
} };

/** /api/recentes: as fichas publicadas nos últimos minutos, para o site as mostrar logo a todos, enquanto a Cloudflare
 *  constrói o site. É informação pública (já está no repositório). Se o armazém falhar, o site mostra o que está publicado. */
export const recentes = { onRequestGet: async ({ env }) => {
  if (!env.ARMAZEM) return json({ recentes: [] });
  try { return json(await armazem(env, 'recentes')); } catch { return json({ recentes: [] }); }
} };
