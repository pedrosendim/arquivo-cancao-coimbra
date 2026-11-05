// /api/propostas/decidir: um editor aprova (a proposta entra no arquivo) ou recusa (fica registado porquê, e quem
// propôs vê o motivo na página Propostas).
// Só se aprova o que a validação («validar», o validar.py no GitHub) já viu e deu como certo, e a versão que o editor
// reviu: o browser manda a cabeça da proposta que mostrou («head»); se mudou entretanto, recusa-se.
import { APROVAM, exigirContribuidor, ficheirosProibidos, gh, json, mesmaOrigem, propostaDoSite, repositorio, semMencoes,
  validacaoDe, esquecerPropostas } from '../comum.js';

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: 'Pedido recusado: só o próprio site pode decidir.' }, 403);
  const { c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  if (!APROVAM.includes(c.papel)) return json({ erro: 'Só os editores aprovam ou recusam propostas.' }, 403);
  const { numero, decisao, motivo, head } = await request.json().catch(() => ({}));
  const R = repositorio(env);
  const pr = await gh(env, `/repos/${R}/pulls/${Number(numero)}`).catch((e) => { if (e.estado === 404) return null; throw e; });
  if (!pr || pr.state !== 'open' || !propostaDoSite(pr, env)) return json({ erro: 'Esta proposta já não está aberta.' }, 409);
  if (head && head !== pr.head.sha) return json({ erro: 'A proposta mudou desde que a abriu (quem a fez acrescentou-lhe alterações). Recarregue a página para ver tudo o que muda.' }, 409);

  if (decisao === 'aprovar') {
    // o site só aprova dados (fichas, fontes, blogue); código nunca, mesmo que alguém o tente meter numa proposta
    const proibidos = await ficheirosProibidos(env, pr.number);
    if (proibidos.length) return json({ erro: `Esta proposta mexe em ficheiros que não são dados (${proibidos.slice(0, 3).join(', ')}): recuse-a.` }, 409);
    const { check_runs: corridas = [] } = await gh(env, `/repos/${R}/commits/${pr.head.sha}/check-runs?check_name=validar`).catch(() => ({}));
    const v = validacaoDe({ verificacoes: corridas.map((x) => ({ nome: x.name, estado: x.status, conclusao: x.conclusion, inicio: x.started_at })) });
    if (v.estado === 'falhou') return json({ erro: 'A validação desta proposta falhou: não pode ser aprovada assim. Veja os erros por baixo da proposta, ou recuse-a explicando o que corrigir.' }, 409);
    if (v.estado === 'a-verificar') return json({ erro: 'A validação ainda está a correr (menos de um minuto). Tente daqui a pouco.' }, 409);
    if (v.estado !== 'passou') {
      // a partir do último commit (uma proposta que continua tem uma validação nova, que ainda pode estar a arrancar)
      const ultimo = await gh(env, `/repos/${R}/git/commits/${pr.head.sha}`).then((x) => x?.committer?.date).catch(() => null);
      const minutos = (Date.now() - Date.parse(ultimo || pr.created_at)) / 60_000;
      return json({ erro: minutos > 5 ? `A validação não arrancou; veja no GitHub (${pr.html_url}/checks).` : 'A validação ainda não começou. Tente daqui a um minuto.' }, 409);
    }
    try {
      await gh(env, `/repos/${R}/pulls/${pr.number}/merge`, {
        // «rebase»: o commit entra com o nome de quem fez a proposta (o histórico de cada ficha mostra-o); «sha»: só
        // entra a versão que se validou e que o editor viu
        method: 'PUT', body: JSON.stringify({ merge_method: 'rebase', sha: pr.head.sha }),
      });
    } catch (e) {
      if (e.publico) throw e;
      return json({ erro: e.estado === 409 ? 'A proposta mudou entretanto: recarregue a página.'
        : 'Não foi possível aprovar: esta proposta e outra alteração mexeram na mesma ficha. Recuse-a explicando o que juntar, ou peça a quem a fez que a retire e a refaça.', detalhe: e.message }, 409);
    }
    // quem aprovou fica registado na própria proposta (só depois de ela entrar)
    await gh(env, `/repos/${R}/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Aprovada por ${semMencoes(c.nome)}.` }) }).catch(() => null);
  } else if (decisao === 'recusar') {
    await gh(env, `/repos/${R}/issues/${pr.number}/comments`, {
      method: 'POST', body: JSON.stringify({ body: `Recusada por ${semMencoes(c.nome)}${motivo ? `: ${semMencoes(String(motivo).slice(0, 500))}` : '.'}` }),
    });
    await gh(env, `/repos/${R}/pulls/${pr.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
  } else return json({ erro: 'Decisão desconhecida.' }, 400);

  esquecerPropostas();
  await gh(env, `/repos/${R}/git/refs/heads/${pr.head.ref}`, { method: 'DELETE' }).catch(() => null);
  return json({ ok: true });
}
