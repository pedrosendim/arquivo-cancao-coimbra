// /api/gravar: o que se altera no modo de edição vai para o repositório como proposta (pull request).
// A proposta de um contribuidor espera por um editor; a de um editor ou do dono é aprovada logo.
// Em ambos os casos o GitHub corre o validar.py e a Cloudflare só publica se a validação passar.
import { ADMINS, APROVAM, RE_EDITAVEL, exigirContribuidor, gh, json, lerFicheiro, mesmaOrigem, repositorio, textoJson } from '../comum.js';

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: 'pedido recusado: só o próprio site pode gravar' }, 403);
  const { s, c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  const pedido = await request.json().catch(() => null);
  const alteracoes = pedido?.alteracoes || [];
  if (!alteracoes.length || alteracoes.length > 80) return json({ erro: 'nada para gravar' }, 400);
  // uma ficha juntada a outra (desambiguação) apaga-se na mesma gravação em que a outra a regista em «juntou»
  const juntadas = new Set(alteracoes.filter((a) => a.conteudo && String(a.caminho).startsWith('dados/'))
    .flatMap((a) => (a.conteudo.juntou || []).map((j) => `dados/${a.caminho.split('/')[1]}/${j.id}.json`)));

  for (const a of alteracoes) {
    if (!RE_EDITAVEL.test(String(a.caminho))) return json({ erro: `ficheiro não editável: ${a.caminho}` }, 400);
    if (a.caminho === 'dados/contribuidores.json') {
      if (!ADMINS.includes(c.papel)) return json({ erro: 'só os administradores gerem os contribuidores' }, 403);
      if (c.papel !== 'dono') { // o fundador do arquivo só ele próprio o muda
        const fundador = (reg) => JSON.stringify((reg?.contribuidores || []).filter((x) => x.papel === 'dono'));
        if (fundador(await lerFicheiro(env, a.caminho)) !== fundador(a.conteudo)) return json({ erro: 'os dados do fundador do arquivo só ele os pode mudar' }, 403);
      }
    }
    if (a.conteudo === null) { // só se apagam textos do blogue e fichas criadas no modo de edição, ainda sem factos
      const atual = /^dados\/(pessoas|obras|gravacoes|instrumentos|media)\//.test(a.caminho) ? await lerFicheiro(env, a.caminho) : null;
      if (!a.caminho.startsWith('dados/blogue/') && !juntadas.has(a.caminho) && !(atual?.editorial && !atual.factos?.length && !atual.biografia?.length)) {
        return json({ erro: 'só se apagam textos do blogue e fichas criadas no modo de edição, sem factos' }, 400);
      }
    } else if (typeof a.conteudo !== 'object' || Array.isArray(a.conteudo)) return json({ erro: 'conteúdo inválido' }, 400);
  }

  const R = repositorio(env);
  const resumo = String(pedido.resumo || 'Alteração no modo de edição').slice(0, 120);
  const base = await gh(env, `/repos/${R}/git/ref/heads/main`);
  const commitBase = await gh(env, `/repos/${R}/git/commits/${base.object.sha}`);
  const arvore = await gh(env, `/repos/${R}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: commitBase.tree.sha,
      tree: alteracoes.map((a) => (a.conteudo === null
        ? { path: a.caminho, mode: '100644', type: 'blob', sha: null }
        : { path: a.caminho, mode: '100644', type: 'blob', content: textoJson(a.conteudo) })),
    }),
  });
  const commit = await gh(env, `/repos/${R}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `${resumo}\n\nProposta de ${c.nome} (@${s.login}) no modo de edição do site.`,
      tree: arvore.sha, parents: [base.object.sha],
      author: { name: c.nome, email: `${s.id}+${s.login}@users.noreply.github.com` },
    }),
  });
  const ramo = `proposta/${s.login.toLowerCase()}/${Date.now()}`;
  await gh(env, `/repos/${R}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${ramo}`, sha: commit.sha }) });
  let pr;
  try {
    pr = await gh(env, `/repos/${R}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: resumo, head: ramo, base: 'main',
        body: `Proposta de **${c.nome}** (@${s.login}), feita no modo de edição do site.\n\n`
          + alteracoes.map((a) => `- ${a.conteudo === null ? 'apaga' : 'altera'} \`${a.caminho}\``).join('\n'),
      }),
    });
  } catch (e) { // sem proposta, o ramo não serve para nada: não deixar ramos soltos no repositório
    await gh(env, `/repos/${R}/git/refs/heads/${ramo}`, { method: 'DELETE' }).catch(() => null);
    throw e;
  }

  if (!APROVAM.includes(c.papel)) return json({ ok: true, publicado: false, proposta: pr.html_url, numero: pr.number });
  try {
    // um segundo antes de entrar: o commit que o GitHub cria tem esta hora ou mais tarde (o site usa-a, ver estado.js)
    const em = new Date(Math.floor(Date.now() / 1000) * 1000 - 1000).toISOString();
    await gh(env, `/repos/${R}/pulls/${pr.number}/merge`, { method: 'PUT', body: JSON.stringify({ merge_method: 'squash' }) });
    await gh(env, `/repos/${R}/git/refs/heads/${ramo}`, { method: 'DELETE' }).catch(() => null);
    return json({ ok: true, publicado: true, proposta: pr.html_url, numero: pr.number, em });
  } catch (e) { // por exemplo, outra alteração à mesma ficha entretanto: fica como proposta
    return json({ ok: true, publicado: false, proposta: pr.html_url, numero: pr.number, aviso: e.message });
  }
}
