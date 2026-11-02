// Modo de edição: contribuições assinadas de quem o dono do arquivo convidou (fotografias, notas, famílias,
// revisão, fontes, blogue). Cada ação lê o ficheiro original de dados/, altera-o e envia-o para gravar.
// Na cópia local o servidor grava, valida e reconstrói o site; online, a mesma alteração seguirá como
// proposta, que um editor aprova. Nada aqui é fonte: tudo fica assinado (quem, quando, porquê) e à vista.
import { E, carregar, juntarPendentes, REL, nomeDe } from './estado.js';
import { $, api, aviso, guardar, ler } from './util.js';

export const sessao = () => E.sessao?.contribuidor || null;
export const editando = () => !!sessao() && E.editando;
export const podeAprovar = () => ['dono', 'editor'].includes(sessao()?.papel);
export const eDono = () => sessao()?.papel === 'dono';
export const hoje = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD na hora local
const assinar = (extra = {}) => ({ por: sessao().id, data: hoje(), ...extra });

/** Igual ao slug() de scripts/comum.py, para ids novos (textos do blogue, fontes, contribuidores). */
export const slug = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const unico = (base, existe) => { let id = base, k = 2; while (existe(id)) id = `${base}-${k++}`; return id; };

const lerFicheiro = async (caminho) => (await api('dados', { caminho })).conteudo;
const fichaPessoa = (id) => `dados/pessoas/${id}.json`;
const urlValida = (u) => /^https?:\/\/\S+$/.test(u || '');
const exigir = (cond, msg) => { if (!cond) throw new Error(msg); };

async function comPessoa(id, alterar) {
  const caminho = fichaPessoa(id);
  const p = await lerFicheiro(caminho);
  const resumo = alterar(p);
  return { alteracoes: [[caminho, p]], resumo: `${p.nome}: ${resumo}` };
}

function imagemDe(p, url) {
  const im = (p.imagens || []).find((x) => x.url === url);
  exigir(im, 'Esta imagem já não está na ficha: recarregue a página.');
  return im;
}

/** A prova de uma afirmação: uma fonte aprovada com a frase copiada à letra, ou a assinatura de quem o sabe. */
function prova({ como, fonte, fonte_url, citacao, referencia, nota }) {
  nota = String(nota || '').trim();
  if (como !== 'fonte') return { fontes: [], nota: '', editorial: assinar(nota ? { nota } : {}) };
  const f = E.fontes[fonte];
  exigir(f?.estado === 'aprovada', 'Escolha uma fonte aprovada (ou proponha-a primeiro em Fontes e método).');
  citacao = String(citacao || '').trim();
  exigir(citacao, 'Copie à letra a frase da fonte que o diz: é a prova.');
  const url = String(fonte_url || '').trim() || f.url;
  exigir(urlValida(url), 'O endereço da página tem de começar por https://');
  referencia = String(referencia || '').trim();
  return { fontes: [{ fonte, url, citacao, ...(referencia ? { referencia } : {}), acrescentada: assinar() }], nota };
}

/** Ficha mínima de uma pessoa que ainda não está no arquivo, criada a partir de uma relação. */
function fichaNova(nome) {
  const base = slug(nome);
  exigir(base, 'Escreva o nome da pessoa.');
  return { id: unico(base, (x) => !!E.por.pessoas[x]), tipo: 'pessoa', nome, nomes_alternativos: [], papeis: [], biografia: [],
    factos: [], relacoes: [], imagens: [], ligacoes: [], estado_revisao: 'rascunho',
    editorial: assinar({ nota: 'Ficha criada no modo de edição, a partir de uma relação.' }) };
}

/** Relação sem fonte própria (indicada no modo de edição ou com citações aí acrescentadas): pode ser retirada. */
const relacaoDeContribuidor = (r) => r.editorial || (r.fontes?.length && r.fontes.every((c) => c.acrescentada));

const ACOES = {
  // ---- fichas de pessoas
  revisao: ({ id, estado }) => comPessoa(id, (p) => {
    exigir(podeAprovar(), 'Só os editores marcam fichas como revistas.');
    p.estado_revisao = estado;
    if (estado === 'revisto') Object.assign(p, { revisto_por: sessao().id, revisto_em: hoje() });
    else { delete p.revisto_por; delete p.revisto_em; }
    return `marcada como ${estado}`;
  }),

  'nota-editor': ({ id, texto }) => comPessoa(id, (p) => {
    texto = String(texto || '').trim();
    if (texto) Object.assign(p, { nota_editor: texto, nota_editor_por: sessao().id, nota_editor_em: hoje() });
    else { delete p.nota_editor; delete p.nota_editor_por; delete p.nota_editor_em; }
    return texto ? 'nota do editor' : 'nota do editor retirada';
  }),

  retrato: ({ id, url }) => comPessoa(id, (p) => {
    const im = imagemDe(p, url);
    p.imagens = [im, ...p.imagens.filter((x) => x !== im)];
    p.imagens.forEach((x) => delete x.escolhida);
    delete im.oculta;
    im.escolhida = assinar();
    return 'retrato escolhido';
  }),

  'ocultar-imagem': ({ id, url, nota }) => comPessoa(id, (p) => {
    const im = imagemDe(p, url);
    delete im.escolhida;
    im.oculta = assinar(nota ? { nota } : {});
    return 'imagem escondida';
  }),

  'mostrar-imagem': ({ id, url }) => comPessoa(id, (p) => {
    delete imagemDe(p, url).oculta;
    return 'imagem de novo visível';
  }),

  'nova-imagem': ({ id, url, origem, legenda, nota, retrato }) => comPessoa(id, (p) => {
    url = String(url || '').trim(); origem = String(origem || '').trim();
    exigir(urlValida(url), 'O endereço da imagem tem de começar por https://');
    exigir(urlValida(origem), 'Indique a página onde a fotografia está publicada (começa por https://).');
    p.imagens ||= [];
    exigir(!p.imagens.some((x) => x.url === url), 'Essa imagem já está na ficha.');
    const im = { url, legenda: String(legenda || '').trim(), fontes: [], editorial: assinar({ origem, ...(nota ? { nota } : {}) }) };
    if (retrato) {
      p.imagens.forEach((x) => delete x.escolhida);
      im.escolhida = assinar();
      p.imagens.unshift(im);
    } else p.imagens.push(im);
    return 'fotografia acrescentada';
  }),

  async 'nova-relacao'({ id, relacao, outro, nova_pessoa, ...resto }) {
    const [tipo, sentido] = String(relacao || '').split('|');
    exigir(REL[tipo], 'Escolha o tipo de relação.');
    nova_pessoa = String(nova_pessoa || '').trim();
    exigir(E.por.pessoas[outro] || nova_pessoa, 'Escolha a pessoa na lista que aparece ao escrever o nome (ou «Criar a ficha», se ainda não existir).');
    const relacao_ = prova(resto);
    const nova = nova_pessoa ? fichaNova(nova_pessoa) : null;
    const outroId = nova ? nova.id : outro;
    exigir(outroId !== id, 'Uma pessoa não se relaciona consigo própria.');
    // a relação guarda-se só num sentido, na ficha de quem «é filho de», «é aluno de», «é membro de»…
    const [dono, alvo] = sentido === 'inv' ? [outroId, id] : [id, outroId];
    const ja = (de, para) => (E.por.pessoas[de]?.relacoes || []).some((r) => r.tipo === tipo && r.alvo === para);
    exigir(!ja(dono, alvo) && !(REL[tipo].sim && ja(alvo, dono)), 'Essa relação já está registada.');
    const rel = { tipo, alvo, ...relacao_ };
    const alteracoes = [];
    if (nova && dono === nova.id) nova.relacoes.push(rel);
    else {
      const p = await lerFicheiro(fichaPessoa(dono));
      (p.relacoes ||= []).push(rel);
      alteracoes.push([fichaPessoa(dono), p]);
    }
    if (nova) alteracoes.push([fichaPessoa(nova.id), nova]);
    const nome = (x) => (nova && x === nova.id ? nova.nome : nomeDe(x));
    return { alteracoes, resumo: `${nome(dono)}: ${REL[tipo].dir} ${nome(alvo)}${nova ? ` (ficha nova: ${nova.nome})` : ''}` };
  },

  'retirar-relacao': ({ dono, tipo, alvo }) => comPessoa(dono, (p) => {
    const i = (p.relacoes || []).findIndex((r) => r.tipo === tipo && r.alvo === alvo && relacaoDeContribuidor(r));
    exigir(i >= 0, 'Só se retiram relações acrescentadas no modo de edição; as que o agente tirou das fontes ficam.');
    p.relacoes.splice(i, 1);
    return `retirada a relação «${REL[tipo].dir} ${nomeDe(alvo)}»`;
  }),

  async 'apagar-ficha'({ id }) {
    const p = await lerFicheiro(fichaPessoa(id));
    exigir(p.editorial && !p.factos?.length && !p.biografia?.length, 'Só se apagam fichas criadas no modo de edição e ainda sem factos.');
    exigir(p.editorial.por === sessao().id || podeAprovar(), 'Só quem criou a ficha ou um editor a pode apagar.');
    const alteracoes = [[fichaPessoa(id), null]];
    for (const q of E.base.pessoas) {
      if (q.id === id || !(q.relacoes || []).some((r) => r.alvo === id)) continue;
      exigir(q.relacoes.filter((r) => r.alvo === id).every(relacaoDeContribuidor), `A ficha de ${q.nome} liga a esta por uma fonte: não se pode apagar.`);
      const f = await lerFicheiro(fichaPessoa(q.id));
      f.relacoes = f.relacoes.filter((r) => r.alvo !== id);
      alteracoes.push([fichaPessoa(q.id), f]);
    }
    return { alteracoes, resumo: `ficha apagada: ${p.nome}`, ir: '#/pessoas' };
  },

  'nota-facto': ({ id, indice, texto }) => comPessoa(id, (p) => {
    const f = p.factos?.[+indice], visto = E.por.pessoas[id]?.factos?.[+indice];
    exigir(f && visto && f.campo === visto.campo && f.valor === visto.valor, 'A ficha mudou entretanto: recarregue a página.');
    texto = String(texto || '').trim();
    if (texto) f.nota_editorial = assinar({ texto }); else delete f.nota_editorial;
    return `nota sobre o facto «${f.valor.slice(0, 60)}»`;
  }),

  // ---- fontes
  async 'decidir-fonte'({ id, estado, nota }) {
    exigir(podeAprovar(), 'Só os editores aprovam ou rejeitam fontes.');
    const caminho = 'fontes/fontes.json', reg = await lerFicheiro(caminho);
    const f = reg.fontes.find((x) => x.id === id);
    exigir(f, 'Fonte inexistente.');
    delete f.aprovacao; // a decisão explícita substitui a aprovação provisória por pedido geral
    Object.assign(f, { estado, decidido_em: hoje(), decidido_por: sessao().id });
    if (estado === 'rejeitada' && nota) f.notas = `${f.notas || ''} [Rejeitada: ${nota}]`.trim();
    return { alteracoes: [[caminho, reg]], resumo: `fonte ${id}: ${estado}` };
  },

  async 'propor-fonte'({ nome, url, tipo, uso, autor, notas }) {
    nome = String(nome || '').trim(); url = String(url || '').trim();
    exigir(nome && urlValida(url), 'Indique o nome e o endereço (https://…) da fonte.');
    exigir(String(notas || '').trim(), 'Explique porque é uma fonte séria e para que serve.');
    const caminho = 'fontes/fontes.json', reg = await lerFicheiro(caminho);
    exigir(!reg.fontes.some((f) => f.url === url), 'Essa fonte já está registada.');
    const id = unico(slug(nome).slice(0, 40).replace(/-+$/, ''), (x) => reg.fontes.some((f) => f.id === x));
    reg.fontes.push({ id, nome, tipo: tipo || 'site', url, autor: String(autor || '').trim(), estado: 'pendente', decidido_em: null,
      uso: [].concat(uso || ['factos']), recolha: { metodo: 'manual' }, notas: String(notas).trim(), proposta_por: sessao().id, proposta_em: hoje() });
    return { alteracoes: [[caminho, reg]], resumo: `fonte proposta: ${nome}` };
  },

  // ---- blogue
  async 'guardar-texto'({ id, titulo, texto, estado }) {
    titulo = String(titulo || '').trim();
    exigir(titulo, 'O texto precisa de um título.');
    let post;
    if (id) {
      post = await lerFicheiro(`dados/blogue/${id}.json`);
      exigir(post.autor === sessao().id || podeAprovar(), 'Só o autor ou um editor alteram este texto.');
    } else {
      id = unico(`${hoje()}-${slug(titulo).slice(0, 60).replace(/-+$/, '')}`, (x) => E.base.blogue.some((p) => p.id === x));
      post = { id, titulo, data: hoje(), autor: sessao().id, estado: 'rascunho' };
    }
    if (estado === 'publicado' && post.estado !== 'publicado') post.data = hoje(); // a data é a da publicação
    Object.assign(post, { titulo, texto: String(texto || '').replace(/\r/g, ''), estado, atualizado_em: hoje() });
    return { alteracoes: [[`dados/blogue/${id}.json`, post]], resumo: `blogue: «${titulo}» (${estado})`, ir: `#/blogue/${id}` };
  },

  async 'apagar-texto'({ id }) {
    const post = await lerFicheiro(`dados/blogue/${id}.json`);
    exigir(post.autor === sessao().id || podeAprovar(), 'Só o autor ou um editor apagam este texto.');
    return { alteracoes: [[`dados/blogue/${id}.json`, null]], resumo: `blogue: apagado «${post.titulo}»`, ir: '#/blogue' };
  },

  // ---- contribuidores (só o dono convida, muda papéis e retira acessos)
  async 'guardar-contribuidor'({ id, nome, github, papel, apresentacao }) {
    exigir(eDono(), 'Só o dono do arquivo gere os contribuidores.');
    nome = String(nome || '').trim(); github = String(github || '').trim().replace(/^@/, '');
    exigir(nome, 'Indique o nome.');
    const caminho = 'dados/contribuidores.json', reg = await lerFicheiro(caminho);
    let c = id && reg.contribuidores.find((x) => x.id === id);
    if (!c) {
      c = { id: unico(slug(nome), (x) => reg.contribuidores.some((y) => y.id === x)), nome, github, papel, desde: hoje(), apresentacao: '' };
      reg.contribuidores.push(c);
    }
    Object.assign(c, { nome, github, papel, apresentacao: String(apresentacao || '').trim() });
    exigir(reg.contribuidores.some((x) => x.papel === 'dono'), 'O arquivo tem de ter um dono.');
    return { alteracoes: [[caminho, reg]], resumo: `contribuidor ${c.nome}: ${papel}` };
  },
};

/** Envia as alterações para /api/gravar. Na cópia local, o servidor grava, valida e reconstrói (e recusa o que
 *  criar erros); online, a alteração vai para o GitHub como proposta, aprovada logo se quem a faz for editor. */
async function gravar(alteracoes, resumo) {
  const r = await fetch('/api/gravar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumo, por: sessao().id, alteracoes: alteracoes.map(([caminho, conteudo]) => ({ caminho, conteudo })) }),
  });
  const j = await r.json().catch(() => ({ erro: 'resposta inválida do servidor' }));
  if (!r.ok || j.erro) throw Object.assign(new Error(j.erro || r.statusText), { erros: j.erros });
  return j;
}

export async function executar(nome, dados) {
  exigir(sessao(), 'Precisa de entrar como contribuidor.');
  exigir(ACOES[nome], `Ação desconhecida: ${nome}`);
  const { alteracoes, resumo, ir } = await ACOES[nome](dados);
  return { ir, alteracoes, resposta: await gravar(alteracoes, resumo) };
}

/** Campos de um formulário; caixas com o mesmo nome terminado em [] dão uma lista. */
function dadosFormulario(form) {
  const d = {};
  for (const [k, v] of new FormData(form)) {
    if (k.endsWith('[]')) (d[k.slice(0, -2)] ||= []).push(v);
    else d[k] = v;
  }
  return d;
}

export function iniciarEdicao(redesenhar) {
  E.editando = ler('editando', false);
  const botao = $('#modo-edicao'), entrar = $('#entrar'), navPropostas = $('#nav-propostas');
  const online = () => E.sessao?.modo === 'online';
  const desenhar = () => {
    botao.hidden = !sessao();
    botao.setAttribute('aria-checked', editando());
    botao.querySelector('b').textContent = editando() ? 'ligado' : 'desligado';
    document.documentElement.classList.toggle('a-editar', editando());
    // online: entrar com o GitHub / sair; na cópia local quem usa o site é sempre o dono
    entrar.hidden = !online() || !E.sessao.entrada;
    const dentro = online() && E.sessao.github;
    entrar.querySelector('span').textContent = dentro ? `Sair (${sessao()?.nome || '@' + E.sessao.github})` : 'Entrar';
    entrar.title = dentro ? 'Terminar a sessão neste browser' : 'Entrar com a conta do GitHub (para contribuidores convidados)';
    navPropostas.hidden = !(online() && sessao());
  };
  entrar.onclick = () => { entrar.href = E.sessao?.github ? '/api/sair' : `/api/entrar?volta=${encodeURIComponent(location.hash || '#/')}`; };
  botao.onclick = () => { E.editando = !E.editando; guardar('editando', E.editando); desenhar(); redesenhar(); };
  desenhar();
  if (online() && sessao()) { // quantas propostas esperam (os editores veem todas; cada contribuidor, as suas)
    api('propostas').then((r) => { navPropostas.querySelector('b').textContent = r.propostas.length || ''; }).catch(() => {});
  }
  if (online() && E.sessao.github && !sessao()) {
    aviso(`A conta @${E.sessao.github} ainda não foi convidada para contribuir.`);
  }

  const correr = async (nome, dados, el) => {
    el.setAttribute('aria-busy', 'true');
    el.querySelectorAll?.('button').forEach((b) => { b.disabled = true; });
    if (el.tagName === 'BUTTON') el.disabled = true;
    aviso('A gravar…');
    try {
      const { ir, alteracoes, resposta } = await executar(nome, dados);
      if (online() && !resposta.publicado) { // proposta de um contribuidor: espera pela aprovação de um editor
        el.removeAttribute('aria-busy');
        el.querySelectorAll?.('button').forEach((b) => { b.disabled = false; });
        if (el.tagName === 'BUTTON') el.disabled = false;
        alert('Proposta enviada. Um editor vai revê-la; depois de aprovada, aparece no site com o seu nome.');
        location.hash = '#/propostas';
        return;
      }
      // online, o site publicado só muda quando a Cloudflare o reconstruir; quem gravou vê já a alteração (estado.js)
      if (online()) juntarPendentes(alteracoes, resposta.em || new Date().toISOString());
      await carregar();
      desenhar();
      aviso(online() ? 'Gravado. Os outros visitantes veem a alteração dentro de 1 a 2 minutos.' : 'Gravado');
      if (ir && ir !== location.hash) location.hash = ir; else await redesenhar();
    } catch (e) {
      alert(`Não foi gravado: ${e.message}${e.erros?.length ? '\n\n' + e.erros.join('\n') : ''}`);
      el.removeAttribute('aria-busy');
      el.querySelectorAll?.('button').forEach((b) => { b.disabled = false; });
      if (el.tagName === 'BUTTON') el.disabled = false;
    }
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    e.preventDefault();
    const { acao, confirmar, pedir, pedirCampo, valor, ...dados } = b.dataset;
    if (confirmar && !confirm(confirmar)) return;
    if (pedir) {
      const resposta = prompt(pedir, valor || '');
      if (resposta === null) return;
      dados[pedirCampo || 'nota'] = resposta.trim();
    }
    correr(acao, dados, b);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-acao]');
    if (!f) return;
    e.preventDefault();
    correr(f.dataset.acao, dadosFormulario(f), f);
  });
}
