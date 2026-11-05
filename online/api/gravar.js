// /api/gravar: o que se altera no modo de edição vai para o repositório como proposta (pull request).
// A proposta de um contribuidor espera por um editor; a de um editor ou do fundador é aprovada logo. Em ambos os
// casos o GitHub corre o validar.py, e a Cloudflare só publica se a validação passar.
// As alterações seguidas de um contribuidor juntam-se à proposta dele ainda aberta que já mexe nas mesmas fichas (um
// ramo «proposta/<conta>/<ficha>» por pessoa e por ficha): assim não ficam em conflito umas com as outras, e o editor
// aprova-as de uma vez. Antes de gravar confere-se (regras.js e citacoes.js): endereços, assinaturas e papéis; que
// nenhum ficheiro mudou desde que foi lido (versao_base); e, nas frases novas citadas de posts dos blogues, que estão
// mesmo no post. Com «origem» (repor uma versão antiga ou desfazer uma alteração, só editores), cada ficheiro volta a ser
// exatamente o que era nesse commit do main: confere-se que é mesmo igual, e o resto das regras já valeu quando entrou.
import { ADMINS, APROVAM, RE_EDITAVEL, autorDoCommit, esquecerPropostas, esquecerRegisto, exigirContribuidor, gh, guardarRecentes, json, lerVersoes,
  mesmaOrigem, propostasAbertas, referenciaGithub, repositorio, semMencoes, textoJson } from '../comum.js';
import { conferir, conferirApagar, estavel } from '../regras.js';
import { citacoesNovasDeBlogues, conferirNosPosts } from '../citacoes.js';

const MUDOU = 'Outra pessoa alterou esta ficha enquanto a editava. Recarregue a página para ver a versão nova e volte a fazer a alteração.';
const JA_CRIADA = 'Entretanto alguém criou uma ficha com o mesmo nome. Recarregue a página para a ver: se for a mesma, acrescente-lhe lá o que queria; se for outra, volte a criar a sua.';
const NADA = 'Não foi possível gravar (erro no servidor). Nada foi alterado.';

/** O ramo de uma proposta nova: a conta e a ficha principal da alteração (o primeiro ficheiro). */
function ramoNovo(login, caminho) {
  const m = caminho.match(/^dados\/([a-z]+)\/([a-z0-9-]+)\.json$/);
  return `proposta/${login}/${m ? `${m[1]}-${m[2]}` : caminho.split('/').pop().replace(/\.json$/, '')}`.slice(0, 200);
}

/** O texto da proposta: quem a fez, a lista numerada das alterações e a dos ficheiros. */
function corpoDaProposta(c, s, itens, ficheiros) {
  return `Proposta de **${semMencoes(c.nome)}**${referenciaGithub(s)}, feita no modo de edição do site.\n\n**Alterações**\n`
    + itens.map((t, i) => `${i + 1}. ${t}`).join('\n')
    + `\n\n**Ficheiros**\n${ficheiros.map(([cam, apaga]) => `- ${apaga ? 'apaga' : 'altera'} \`${cam}\``).join('\n')}`;
}
const itemDe = (resumo, motivo) => semMencoes(resumo) + (motivo ? ` — motivo: ${semMencoes(motivo).replace(/\s+/g, ' ')}` : '');

/** Ao gravar o registo dos contribuidores, junta o número da conta do GitHub (github_id) de quem ainda não o tem, ou
 *  mudou de nome de utilizador: o nome pode passar a ser de outra pessoa, o número não. Vem do perfil público. */
async function juntarNumerosGithub(env, reg, antes, c) {
  const velhos = new Map((antes?.contribuidores || []).map((x) => [x.id, x]));
  const faltam = (reg?.contribuidores || []).filter((x) => {
    if (!x.github || x.papel === 'antigo' || (x.papel === 'dono' && c.papel !== 'dono')) return false;
    if (x.github_id && String(velhos.get(x.id)?.github || '').toLowerCase() !== x.github.toLowerCase()) delete x.github_id; // outra conta
    return !x.github_id;
  }).slice(0, 5);
  await Promise.all(faltam.map(async (x) => {
    try { const u = await gh(env, `/users/${encodeURIComponent(x.github)}`); if (Number.isInteger(u?.id)) x.github_id = u.id; } catch { /* sem número: compara-se pelo nome */ }
  }));
}

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return json({ erro: 'Pedido recusado: só o próprio site pode gravar.' }, 403);
  const { s, c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  const pedido = await request.json().catch(() => null);
  const alteracoes = Array.isArray(pedido?.alteracoes) ? pedido.alteracoes : [];
  if (!alteracoes.length) return json({ erro: 'Nada para gravar.' }, 400);
  if (alteracoes.length > 80) { // juntar ou separar uma pessoa muito referida mexe em muitas fichas
    return json({ erro: `Esta alteração mexe em ${alteracoes.length} fichas; online o máximo é 80. Junte no sentido contrário (fica a ficha mais referida) ou peça ao fundador para a fazer na cópia local.` }, 400);
  }
  const vistos = new Set();
  for (const a of alteracoes) {
    if (!a || typeof a !== 'object' || !RE_EDITAVEL.test(String(a.caminho))) return json({ erro: `Ficheiro não editável: ${a?.caminho}` }, 400);
    if (vistos.has(a.caminho)) return json({ erro: `O mesmo ficheiro vem duas vezes no pedido: ${a.caminho}` }, 400);
    vistos.add(a.caminho);
    if (a.conteudo !== null && (typeof a.conteudo !== 'object' || Array.isArray(a.conteudo))) return json({ erro: 'Conteúdo inválido.' }, 400);
  }
  const R = repositorio(env), login = s.login.toLowerCase(), editor = APROVAM.includes(c.papel);
  if (pedido.origem && !editor) return json({ erro: 'Só um editor pode repor versões antigas ou desfazer alterações.' }, 403);
  const resumo = String(pedido.resumo || 'Alteração no modo de edição').replace(/\s+/g, ' ').trim().slice(0, 120);
  const motivo = String(pedido.motivo || '').trim().slice(0, 500);
  const caminhos = alteracoes.map((a) => a.caminho);

  // 1. para onde vai: quem não aprova continua a sua proposta aberta que já mexe nestas fichas
  const minhas = editor ? [] : await propostasAbertas(env, { fresca: true, de: login });
  const comEstas = minhas.filter((p) => p.ficheiros.some((f) => caminhos.includes(f.caminho)));
  if (comEstas.length > 1) {
    return json({ erro: `Esta alteração mexe em fichas que estão em ${comEstas.length} propostas suas ainda por decidir (n.º ${comEstas.map((p) => p.numero).join(' e n.º ')}). `
      + 'Para não se baralharem, espere que um editor decida uma delas, ou retire uma delas na página Propostas.' }, 409);
  }
  const alvo = comEstas[0] || null;
  const naProposta = (cam) => !!alvo?.ficheiros.some((f) => f.caminho === cam);

  // 2. as versões anteriores de cada ficheiro, no main e (se continua uma proposta) no ramo dela: um só pedido
  const main = (await gh(env, `/repos/${R}/git/ref/heads/main`)).object.sha;
  const lidos = await lerVersoes(env, [...caminhos.map((caminho) => ({ ref: main, caminho })),
    ...(alvo ? caminhos.map((caminho) => ({ ref: alvo.head, caminho })) : [])]);
  const doMain = new Map(caminhos.map((cam, i) => [cam, lidos[i]]));
  const doRamo = new Map(alvo ? caminhos.map((cam, i) => [cam, lidos[caminhos.length + i]]) : []);
  const atual = (cam) => (naProposta(cam) ? doRamo.get(cam) : doMain.get(cam)); // a versão que quem grava leu (dados.js)
  const anteriores = new Map(caminhos.map((cam) => [cam, [doMain.get(cam)?.conteudo, doRamo.get(cam)?.conteudo].filter(Boolean)]));
  const anterior = new Map(caminhos.map((cam) => [cam, atual(cam)?.conteudo || null]));

  // 3. algum ficheiro mudou desde que foi lido? Gravar por cima apagava, sem aviso, o que outra pessoa lá pôs
  for (const a of alteracoes) {
    if (!('versao_base' in a) || (atual(a.caminho)?.oid || null) === (a.versao_base || null)) continue;
    if (naProposta(a.caminho) && (doMain.get(a.caminho)?.oid || null) === (a.versao_base || null)) {
      return json({ erro: `Esta ficha tem uma alteração sua ainda por aprovar (proposta n.º ${alvo.numero}) que a página ainda não mostrava. `
        + 'Recarregue a página e volte a fazer a alteração: junta-se à mesma proposta.', ficheiros: [a.caminho] }, 409);
    }
    // versao_base null: uma ficha nova, mas entretanto alguém criou uma com o mesmo nome de ficheiro
    return json({ erro: a.versao_base === null ? JA_CRIADA : MUDOU, ficheiros: [a.caminho] }, 409);
  }

  // repor ou desfazer: cada ficheiro tem de ser igual ao que era num commit que já entrou no main
  const origem = pedido.origem ? String(pedido.origem) : null;
  if (origem) {
    if (!/^[0-9a-f]{40}$/.test(origem)) return json({ erro: 'Versão desconhecida.' }, 400);
    const { status } = await gh(env, `/repos/${R}/compare/${origem}...main?per_page=1`).catch((e) => { if (e.publico) throw e; return {}; });
    if (!['ahead', 'identical'].includes(status)) return json({ erro: 'Essa versão não faz parte do histórico do arquivo.' }, 400);
    const antigos = await lerVersoes(env, caminhos.map((caminho) => ({ ref: origem, caminho })));
    if (alteracoes.some((a, i) => estavel(a.conteudo) !== estavel(antigos[i].conteudo))) {
      return json({ erro: 'O que foi enviado não é igual a essa versão antiga. Recarregue a página e tente outra vez.' }, 400);
    }
  }

  // 4. quem pode fazer o quê, e cada um assina por si
  const registo = alteracoes.find((a) => a.caminho === 'dados/contribuidores.json');
  if (registo) {
    if (!ADMINS.includes(c.papel)) return json({ erro: 'Só os administradores gerem os contribuidores.' }, 403);
    if (c.papel !== 'dono') { // o fundador do arquivo só ele próprio o muda
      const fundador = (reg) => JSON.stringify((reg?.contribuidores || []).filter((x) => x.papel === 'dono'));
      if (fundador(doMain.get(registo.caminho)?.conteudo) !== fundador(registo.conteudo)) return json({ erro: 'Os dados do fundador do arquivo só ele os pode mudar.' }, 403);
    }
  }
  const recusa = origem ? null : conferir({ alteracoes, anteriores, anterior, c, editor }) || conferirApagar({ alteracoes, anterior, c, editor });
  if (recusa) return json({ erro: recusa.erro }, recusa.estado);

  // 5. as frases novas citadas de posts dos blogues estão mesmo no post? (se o post não abrir, ficam por confirmar)
  const falta = origem ? null : await conferirNosPosts(citacoesNovasDeBlogues(alteracoes, anteriores));
  if (falta) return json({ erro: falta }, 400);
  if (registo?.conteudo) await juntarNumerosGithub(env, registo.conteudo, doMain.get(registo.caminho)?.conteudo, c);

  // 6. gravar: um commit sobre o main (proposta nova) ou sobre a proposta que continua
  let commit, ramo, pr;
  try {
    const pai = alvo ? alvo.head : main;
    const arvoreBase = (await gh(env, `/repos/${R}/git/commits/${pai}`)).tree.sha;
    const arvore = await gh(env, `/repos/${R}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: arvoreBase, tree: alteracoes.map((a) => (a.conteudo === null
        ? { path: a.caminho, mode: '100644', type: 'blob', sha: null }
        : { path: a.caminho, mode: '100644', type: 'blob', content: textoJson(a.conteudo) })) }),
    });
    commit = await gh(env, `/repos/${R}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: `${resumo}\n\n${motivo ? `Motivo: ${motivo}\n\n` : ''}Proposta de ${c.nome}${referenciaGithub(s)} no modo de edição do site.`,
        tree: arvore.sha, parents: [pai], author: autorDoCommit(s, c),
      }),
    });
    if (alvo) { // só avança se ninguém mexeu no ramo entretanto (sem «force»)
      await gh(env, `/repos/${R}/git/refs/heads/${alvo.ramo}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
    } else {
      ramo = ramoNovo(login, caminhos[0]);
      try {
        await gh(env, `/repos/${R}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${ramo}`, sha: commit.sha }) });
      } catch (e) {
        if (e.estado !== 422) throw e; // o ramo já existe (de uma proposta antiga): outro nome
        ramo = `${ramo}-${Date.now()}`;
        await gh(env, `/repos/${R}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${ramo}`, sha: commit.sha }) });
      }
    }
  } catch (e) {
    if (e.publico) throw e; // token, limite do GitHub: a mensagem já diz o que fazer
    const avancou = alvo && /fast.?forward/i.test(e.message);
    return json({ erro: avancou ? 'A sua proposta mudou entretanto (noutra janela?). Recarregue a página e repita.' : NADA, detalhe: e.message }, avancou ? 409 : 500);
  } finally { esquecerPropostas(); }
  if (registo) esquecerRegisto();

  if (alvo) { // a proposta continua: o título e o texto passam a dizer quantas alterações tem
    const itens = [...(alvo.corpo.match(/^\d+\. .*$/gm) || []).map((l) => l.replace(/^\d+\. /, '')), itemDe(resumo, motivo)];
    const principal = (itens[0] || alvo.titulo).split(': ')[0];
    const ficheiros = new Map(alvo.ficheiros.map((f) => [f.caminho, f.estado === 'removed']));
    for (const a of alteracoes) ficheiros.set(a.caminho, a.conteudo === null);
    await gh(env, `/repos/${R}/pulls/${alvo.numero}`, { method: 'PATCH', body: JSON.stringify({
      title: `${semMencoes(c.nome)}: ${principal} (${Math.max(itens.length, (alvo.n_commits || 0) + 1)} alterações)`.slice(0, 200),
      body: corpoDaProposta(c, s, itens, [...ficheiros]) }) }).catch(() => null);
    return json({ ok: true, publicado: false, proposta: alvo.url, numero: alvo.numero, head: commit.sha, juntada: true });
  }

  try {
    pr = await gh(env, `/repos/${R}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title: semMencoes(resumo), head: ramo, base: 'main',
        body: corpoDaProposta(c, s, [itemDe(resumo, motivo)], alteracoes.map((a) => [a.caminho, a.conteudo === null])) }),
    });
  } catch (e) { // sem proposta, o ramo não serve para nada: não deixar ramos soltos no repositório
    await gh(env, `/repos/${R}/git/refs/heads/${ramo}`, { method: 'DELETE' }).catch(() => null);
    if (e.publico) throw e;
    return json({ erro: NADA, detalhe: e.message }, 500);
  }

  if (!editor) return json({ ok: true, publicado: false, proposta: pr.html_url, numero: pr.number, head: commit.sha });
  try {
    // um segundo antes de entrar: o commit que o GitHub cria tem esta hora ou mais tarde (o site usa-a, ver estado.js)
    const em = new Date(Math.floor(Date.now() / 1000) * 1000 - 1000).toISOString();
    // «rebase»: o commit entra tal como foi feito, com o nome de quem o fez (o histórico de cada ficha mostra-o)
    await gh(env, `/repos/${R}/pulls/${pr.number}/merge`, { method: 'PUT', body: JSON.stringify({ merge_method: 'rebase', sha: commit.sha }) });
    await gh(env, `/repos/${R}/git/refs/heads/${ramo}`, { method: 'DELETE' }).catch(() => null);
    await guardarRecentes(env, alteracoes.map(({ caminho, conteudo }) => ({ caminho, conteudo })), em); // todos a veem já
    return json({ ok: true, publicado: true, proposta: pr.html_url, numero: pr.number, em });
  } catch (e) { // por exemplo, outra alteração à mesma ficha entrou entretanto: fica como proposta, que o editor aprova lá
    return json({ ok: true, publicado: false, proposta: pr.html_url, numero: pr.number, aviso: e.message });
  }
}
