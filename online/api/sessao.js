// /api/sessao: quem está a usar o site (para mostrar «Entrar», «Sair» e o modo de edição).
import { contribuidorDe, json, repositorio, sessao } from '../comum.js';

export async function onRequestGet({ request, env }) {
  const s = await sessao(request, env);
  const base = { modo: 'online', entrada: !!env.GITHUB_CLIENT_ID, repositorio: repositorio(env) };
  if (!s) return json({ ...base, contribuidor: null });
  const contribuidor = await contribuidorDe(env, s.login).catch(() => null);
  return json({ ...base, github: s.login, contribuidor });
}
