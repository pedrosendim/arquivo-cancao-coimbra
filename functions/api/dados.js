// /api/dados?caminho=…: ficheiro original de dados/ (versão publicada), para o modo de edição o alterar.
import { RE_EDITAVEL, exigirContribuidor, json, lerFicheiro } from '../../online/comum.js';

export async function onRequestGet({ request, env }) {
  const { erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  const caminho = new URL(request.url).searchParams.get('caminho') || '';
  if (!RE_EDITAVEL.test(caminho)) return json({ erro: 'ficheiro não editável' }, 404);
  const conteudo = await lerFicheiro(env, caminho);
  return conteudo ? json({ caminho, conteudo }) : json({ erro: `ficheiro inexistente: ${caminho}` }, 404);
}
