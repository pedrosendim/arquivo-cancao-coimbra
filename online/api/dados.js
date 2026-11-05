// /api/dados?caminho=…: ficheiro original de dados/ (versão publicada), para o modo de edição o alterar, com a sua
// versão (o «sha» do ficheiro no git), que volta com a gravação (versao_base): se mudou entretanto, não se grava.
// Quem não aprova lê os ficheiros que já estão numa proposta sua ainda aberta tal como os deixou lá: assim a
// alteração seguinte junta-se à anterior, na mesma proposta (ver gravar.js).
import { APROVAM, RE_EDITAVEL, exigirContribuidor, json, lerVersoes, propostasAbertas } from '../comum.js';

export async function onRequestGet({ request, env }) {
  const { s, c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  const caminho = new URL(request.url).searchParams.get('caminho') || '';
  if (!RE_EDITAVEL.test(caminho)) return json({ erro: 'Ficheiro não editável.' }, 404);
  const login = s.login.toLowerCase();
  const proposta = APROVAM.includes(c.papel) ? null
    : [...await propostasAbertas(env, { de: login })].reverse().find((p) => p.ficheiros.some((f) => f.caminho === caminho)) || null;
  const [f] = await lerVersoes(env, [{ ref: proposta ? proposta.head : 'main', caminho }]);
  if (!f.conteudo) return json({ erro: `Ficheiro inexistente: ${caminho}` }, 404);
  return json({ caminho, conteudo: f.conteudo, versao: f.oid, ...(proposta ? { proposta: proposta.numero } : {}) });
}
