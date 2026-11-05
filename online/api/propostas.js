// /api/propostas: propostas à espera de decisão (os editores veem todas; um contribuidor vê as suas) e as decididas
// nos últimos 30 dias, com quem decidiu e porquê (o motivo de uma recusa fica à vista de quem propôs).
// ?contar=1: só quantas esperam (para o menu), sem o resto. ?minhas=1: as abertas de quem pergunta, só com as fichas
// e a versão de cada uma (o site mostra-lhas já nas fichas, minhas-propostas.js).
// Lê-se em consultas GraphQL ao GitHub (poucos pedidos, com qualquer número de propostas; o limite da Cloudflare é de
// 50 pedidos por pedido). Se o GraphQL falhar, a lista vem em REST (comum.js).
import { APROVAM, RE_EDITAVEL, exigirContribuidor, ghQL, json, lerRegisto, propostasAbertas, repositorio, validacaoDe } from '../comum.js';

// por páginas de 100 (1 ponto do limite do token cada uma)
const CONSULTA_DECIDIDAS = `query($dono: String!, $nome: String!, $depois: String) { repository(owner: $dono, name: $nome) {
  pullRequests(states: [CLOSED, MERGED], baseRefName: "main", first: 100, after: $depois, orderBy: { field: UPDATED_AT, direction: DESC }) {
    pageInfo { hasNextPage endCursor } nodes {
    number title createdAt updatedAt closedAt merged url headRefName headRepository { nameWithOwner }
    comments(last: 5) { nodes { body createdAt } } } } } }`;
const RE_DECISAO = /^(Aprovada|Recusada|Retirada) por (.+?)(?:: ([\s\S]*)|\.)\s*$/;

/** As propostas do site decididas nos últimos 30 dias por alguém (as gravações dos editores, que entram logo, não
 *  contam): aprovadas, recusadas (com o motivo) ou retiradas. As gravações dos editores também são propostas fechadas:
 *  lê-se por páginas até passar dos 30 dias (no máximo 500 propostas), para elas não empurrarem as decididas para fora
 *  da lista. Sem GraphQL, fica vazia. */
async function decididas(env) {
  const [dono, nome] = repositorio(env).split('/');
  const desde = Date.now() - 30 * 864e5;
  const nos = [];
  let depois = null;
  try {
    for (let pagina = 0; pagina < 5; pagina++) {
      const { pullRequests: pr } = (await ghQL(env, CONSULTA_DECIDIDAS, { dono, nome, depois })).repository;
      nos.push(...pr.nodes);
      const ultima = pr.nodes[pr.nodes.length - 1];
      if (!pr.pageInfo?.hasNextPage || !ultima || Date.parse(ultima.updatedAt) < desde) break;
      depois = pr.pageInfo.endCursor;
    }
  } catch { /* fica com as páginas que já leu */ }
  try {
    return nos
      .filter((p) => p.headRefName.startsWith('proposta/') && p.headRepository?.nameWithOwner === repositorio(env) && Date.parse(p.closedAt) > desde)
      .map((p) => {
        const c = [...p.comments.nodes].reverse().map((x) => ({ m: x.body.replace(/\u200b/g, '').trim().match(RE_DECISAO), em: x.createdAt })).find((x) => x.m);
        return c && { numero: p.number, titulo: p.title.replace(/\u200b/g, ''), url: p.url, login: p.headRefName.split('/')[1],
          decisao: c.m[1].toLowerCase(), por: c.m[2], motivo: c.m[3]?.trim() || '', em: p.closedAt || c.em };
      }).filter(Boolean);
  } catch { return []; }
}

export async function onRequestGet({ request, env }) {
  const { s, c, erro } = await exigirContribuidor(request, env);
  if (erro) return erro;
  const editor = APROVAM.includes(c.papel), login = s.login.toLowerCase();
  const q = new URL(request.url).searchParams, contar = q.get('contar'), minhas = q.get('minhas') && !editor;
  // a página Propostas pede a lista completa (com a validação e o conflito); a contagem e as minhas, a leve (comum.js)
  const visiveis = await propostasAbertas(env, { ...(editor ? {} : { de: login }), completa: !contar && !minhas });
  if (contar) return json({ editor, n: visiveis.length });
  if (minhas) {
    return json({ editor, propostas: [...visiveis].reverse().map((p) => ({ numero: p.numero, titulo: p.titulo.replace(/​/g, ''), url: p.url,
      head: p.head, ficheiros: p.ficheiros.map(({ caminho, estado }) => ({ caminho, estado })) })) });
  }
  const [reg, feitas] = await Promise.all([lerRegisto(env), decididas(env)]);
  const porGithub = Object.fromEntries((reg?.contribuidores || []).filter((x) => x.github).map((x) => [x.github.toLowerCase(), x]));
  const porId = Object.fromEntries((reg?.contribuidores || []).map((x) => [x.id, x]));
  // o ramo diz de quem é a proposta: a conta do GitHub, ou «conta-<id>» com uma conta própria (api/contas.js)
  const autor = (l) => {
    const x = l.startsWith('conta-') ? porId[l.slice(6)] : porGithub[l];
    return { github: l.startsWith('conta-') ? null : l, nome: x?.nome || `@${l}`, id: x?.id || null };
  };
  const propostas = [...visiveis].reverse().map((p) => {
    const v = validacaoDe(p);
    return {
      numero: p.numero, titulo: p.titulo.replace(/\u200b/g, ''), data: p.criada, url: p.url, base: p.base, head: p.head,
      autor: autor(p.login), ficheiros: p.ficheiros.map(({ caminho, estado }) => ({ caminho, estado })),
      validacao: v.estado, erros_validacao: v.erros.slice(0, 10),
      // ainda sem nenhuma verificação 5 minutos depois do último commit: o GitHub Actions não arrancou (ver no GitHub)
      nao_arrancou: v.estado === 'por-verificar' && Date.now() - Date.parse(p.ultimo || p.criada) > 5 * 60_000,
      conflito: p.conflito, n_alteracoes: p.n_commits,
      soDados: p.ficheiros.every((f) => RE_EDITAVEL.test(f.caminho) && (!f.anterior || RE_EDITAVEL.test(f.anterior))),
    };
  });
  return json({ editor, propostas, decididas: feitas.filter((p) => editor || p.login === login).map((p) => ({ ...p, autor: autor(p.login) })) });
}
