// /api/propostas/decidir: um editor aprova (a proposta entra no arquivo) ou recusa (fica registado porquê).
import { APROVAM, exigirContribuidor, gh, json, mesmaOrigem, repositorio } from '../../../online/comum.js';

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: 'pedido recusado: só o próprio site pode decidir' }, 403);
  const { c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  if (!APROVAM.includes(c.papel)) return json({ erro: 'só os editores aprovam ou recusam propostas' }, 403);
  const { numero, decisao, motivo } = await request.json().catch(() => ({}));
  const R = repositorio(env);
  const pr = await gh(env, `/repos/${R}/pulls/${Number(numero)}`);
  if (pr.state !== 'open' || !pr.head.ref.startsWith('proposta/')) return json({ erro: 'esta proposta já não está aberta' }, 409);

  if (decisao === 'aprovar') {
    const { check_runs: corridas = [] } = await gh(env, `/repos/${R}/commits/${pr.head.sha}/check-runs`).catch(() => ({}));
    if (corridas.some((v) => v.status === 'completed' && !['success', 'neutral', 'skipped'].includes(v.conclusion))) {
      return json({ erro: 'a validação desta proposta falhou: não pode ser aprovada assim' }, 409);
    }
    try {
      await gh(env, `/repos/${R}/pulls/${pr.number}/merge`, {
        method: 'PUT', body: JSON.stringify({ merge_method: 'squash', commit_message: `Aprovada por ${c.nome}.` }),
      });
    } catch (e) {
      return json({ erro: 'não foi possível aprovar (talvez outra alteração à mesma ficha tenha entrado entretanto): recuse e peça para refazer', detalhe: e.message }, 409);
    }
  } else if (decisao === 'recusar') {
    await gh(env, `/repos/${R}/issues/${pr.number}/comments`, {
      method: 'POST', body: JSON.stringify({ body: `Recusada por ${c.nome}${motivo ? `: ${String(motivo).slice(0, 500)}` : '.'}` }),
    });
    await gh(env, `/repos/${R}/pulls/${pr.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
  } else return json({ erro: 'decisão desconhecida' }, 400);

  await gh(env, `/repos/${R}/git/refs/heads/${pr.head.ref}`, { method: 'DELETE' }).catch(() => null);
  return json({ ok: true });
}
