// /api/propostas/retirar { numero }: quem fez a proposta (ou um editor) retira-a. O pedido fecha-se, fica registado
// quem a retirou, e o ramo apaga-se. Responde { ok: true }, ou { erro } (403 se não é de quem pede).
import { APROVAM, esquecerPropostas, exigirContribuidor, gh, json, mesmaOrigem, propostaDoSite, repositorio, semMencoes } from '../comum.js';

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: 'Pedido recusado: só o próprio site pode retirar propostas.' }, 403);
  const { s, c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  const { numero } = await request.json().catch(() => ({}));
  if (!Number.isInteger(Number(numero)) || Number(numero) <= 0) return json({ erro: 'Proposta desconhecida.' }, 400);
  const R = repositorio(env);
  const pr = await gh(env, `/repos/${R}/pulls/${Number(numero)}`).catch((e) => { if (e.estado === 404) return null; throw e; });
  if (!pr || pr.state !== 'open' || !propostaDoSite(pr, env)) return json({ erro: 'Esta proposta já não está aberta.' }, 409);
  if (pr.head.ref.split('/')[1] !== s.login.toLowerCase() && !APROVAM.includes(c.papel)) {
    return json({ erro: 'Só quem fez a proposta, ou um editor, a pode retirar.' }, 403);
  }
  await gh(env, `/repos/${R}/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Retirada por ${semMencoes(c.nome)}.` }) }).catch(() => null);
  await gh(env, `/repos/${R}/pulls/${pr.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
  esquecerPropostas();
  await gh(env, `/repos/${R}/git/refs/heads/${pr.head.ref}`, { method: 'DELETE' }).catch(() => null);
  return json({ ok: true });
}
