// /api/foto: um editor carrega uma fotografia do computador, e ela fica no repositório, em fotos/. O browser já a reduziu e
// a passou a JPEG (site/js/fotos.js), o que também lhe tira os dados escondidos, como o lugar onde foi tirada. Só editores:
// o repositório é público, e o que lá entra fica no histórico mesmo depois de apagado.
import { APROVAM, autorDoCommit, exigirContribuidor, gh, json, mesmaOrigem, repositorio } from '../comum.js';

const RE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAXIMO = 1_200_000; // em base64; o browser reduz a fotografia até caber

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: 'Pedido recusado: só o próprio site pode fazer isto.' }, 403);
  const { s, c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  if (!APROVAM.includes(c.papel)) return json({ erro: 'Só os editores carregam fotografias.' }, 403);
  const { pessoa, dados } = await request.json().catch(() => ({}));
  if (!RE_ID.test(pessoa || '') || pessoa.length > 80) return json({ erro: 'Ficha desconhecida.' }, 400);
  if (typeof dados !== 'string' || !dados.startsWith('/9j/')) return json({ erro: 'Isto não é uma fotografia JPEG.' }, 400); // «/9j/» é o início de um JPEG
  if (dados.length > MAXIMO) return json({ erro: 'A fotografia é demasiado grande.' }, 413);
  const R = repositorio(env), caminho = `fotos/${pessoa}-${crypto.randomUUID().slice(0, 8)}.jpg`;
  await gh(env, `/repos/${R}/contents/${caminho}`, { method: 'PUT', body: JSON.stringify({
    message: `Fotografia de ${pessoa} [skip ci]`, content: dados, branch: 'main', author: autorDoCommit(s, c) }) });
  return json({ ok: true, url: `https://raw.githubusercontent.com/${R}/main/${caminho}` });
}
