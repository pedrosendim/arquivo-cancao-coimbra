// /api/propostas: propostas à espera de decisão. Os editores veem todas; um contribuidor vê as suas.
import { APROVAM, exigirContribuidor, gh, json, lerFicheiro, repositorio } from '../../online/comum.js';

export async function onRequestGet({ request, env }) {
  const { s, c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  const R = repositorio(env);
  const editor = APROVAM.includes(c.papel);
  const reg = await lerFicheiro(env, 'dados/contribuidores.json');
  const porGithub = Object.fromEntries((reg?.contribuidores || []).filter((x) => x.github).map((x) => [x.github.toLowerCase(), x]));

  const abertas = (await gh(env, `/repos/${R}/pulls?state=open&per_page=50`)).filter((p) => p.head.ref.startsWith('proposta/'));
  const visiveis = abertas.filter((p) => editor || p.head.ref.split('/')[1] === s.login.toLowerCase());
  const propostas = await Promise.all(visiveis.map(async (p) => {
    const login = p.head.ref.split('/')[1];
    const [ficheiros, verificacoes] = await Promise.all([
      gh(env, `/repos/${R}/pulls/${p.number}/files?per_page=50`),
      gh(env, `/repos/${R}/commits/${p.head.sha}/check-runs`).catch(() => ({ check_runs: [] })),
    ]);
    const corridas = verificacoes.check_runs || [];
    const validacao = !corridas.length ? 'por-verificar'
      : corridas.some((v) => v.status !== 'completed') ? 'a-verificar'
        : corridas.every((v) => ['success', 'neutral', 'skipped'].includes(v.conclusion)) ? 'passou' : 'falhou';
    return {
      numero: p.number, titulo: p.title, data: p.created_at, url: p.html_url,
      autor: { github: login, nome: porGithub[login]?.nome || `@${login}`, id: porGithub[login]?.id || null },
      ficheiros: ficheiros.map((f) => ({ caminho: f.filename, estado: f.status })), validacao,
    };
  }));
  return json({ editor, propostas });
}
