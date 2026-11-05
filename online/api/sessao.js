// /api/sessao: quem está a usar o site (para mostrar «Entrar», «Sair» e o modo de edição).
// Se o GitHub falhar (token do site expirado, limite de pedidos), diz-se qual é o problema («problema», «mensagem»)
// em vez de parecer que a conta não foi convidada. Ao fundador e aos administradores vai também o fim do prazo do
// token do site (token_expira), para o site avisar 15 dias antes (site/js/avisos-edicao.js).
import { ADMINS, contribuidorDe, fimDoPrazoDoToken, json, repositorio, sessao } from '../comum.js';

export async function onRequestGet({ request, env }) {
  const s = await sessao(request, env);
  const base = { modo: 'online', entrada: !!env.GITHUB_CLIENT_ID, repositorio: repositorio(env) };
  if (!s) return json({ ...base, contribuidor: null });
  try {
    const contribuidor = await contribuidorDe(env, s);
    const fim = fimDoPrazoDoToken();
    return json({ ...base, github: s.login, contribuidor, ...(fim && ADMINS.includes(contribuidor?.papel) ? { token_expira: fim } : {}) });
  } catch (e) {
    return json({ ...base, github: s.login, contribuidor: null, problema: e.problema || 'github',
      mensagem: e.publico ? e.message : 'O site não conseguiu falar com o GitHub agora, por isso o modo de edição não está disponível. Tente daqui a pouco.' });
  }
}
