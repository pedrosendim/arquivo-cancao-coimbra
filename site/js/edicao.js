// Modo de edição: contribuições assinadas de quem os administradores do arquivo convidaram (fichas novas, dados,
// nascimento e morte, factos, referências, fotografias, notas, famílias, revisão, fontes, blogue). Cada ação lê o
// ficheiro original de dados/, altera-o e envia-o para gravar.
// Na cópia local o servidor grava, valida e reconstrói o site; online, a mesma alteração seguirá como
// proposta, que um editor aprova. Nada aqui é fonte: tudo fica assinado (quem, quando, porquê) e à vista.
import { E, carregar, juntarPendentes, REL, CAMPOS, nomeDe } from './estado.js';
import { $, api, aviso, guardar, ler, fmtData, norm, classificar } from './util.js';
import { ESPECIES, lerCampos, fichaVazia } from './fichas.js';

export const sessao = () => E.sessao?.contribuidor || null;
export const editando = () => !!sessao() && E.editando;
// papéis: o fundador («dono») e os administradores gerem os contribuidores; com os editores, aprovam; os contribuidores propõem
export const ADMINS = ['dono', 'administrador'];
export const eAdmin = () => ADMINS.includes(sessao()?.papel);
export const podeAprovar = () => [...ADMINS, 'editor'].includes(sessao()?.papel);
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
const texto = (v) => String(v ?? '').trim();

/** Altera uma ficha («pessoas/<id>», «obras/<id>»…). `alterar` recebe a ficha e um contexto onde as fontes novas
 *  (propostas ao citar um site que ainda não é fonte) se juntam, para irem na mesma gravação. */
async function comFicha(alvo, alterar) {
  const [tipo, id] = String(alvo || '').split('/');
  exigir(ESPECIES[tipo] && id, 'Ficha desconhecida.');
  const caminho = `dados/${tipo}/${id}.json`;
  const f = await lerFicheiro(caminho);
  const ctx = {};
  const resumo = await alterar(f, ctx);
  const alteracoes = [[caminho, f]];
  if (ctx.fontes) alteracoes.push(['fontes/fontes.json', ctx.fontes]);
  return { alteracoes, resumo: `${f[ESPECIES[tipo].titulo] || id}: ${resumo}` };
}
const comPessoa = (id, alterar) => comFicha(`pessoas/${id}`, alterar);

/** AAAA, AAAA-MM ou AAAA-MM-DD a partir dos campos dia, mês e ano (vazio se não houver ano). */
function dataDe(d) {
  const ano = texto(d.ano), mes = texto(d.mes), dia = texto(d.dia);
  if (!ano) { exigir(!mes && !dia, 'Falta o ano.'); return ''; }
  exigir(/^\d{4}$/.test(ano), 'O ano escreve-se com quatro algarismos (ex.: 1925).');
  if (!mes) { exigir(!dia, 'Escolha também o mês.'); return ano; }
  const m = mes.padStart(2, '0');
  if (!dia) return `${ano}-${m}`;
  exigir(/^\d{1,2}$/.test(dia) && +dia >= 1 && +dia <= 31, 'O dia vai de 1 a 31.');
  return `${ano}-${m}-${dia.padStart(2, '0')}`;
}

function imagemDe(p, url) {
  const im = (p.imagens || []).find((x) => x.url === url);
  exigir(im, 'Esta imagem já não está na ficha: recarregue a página.');
  return im;
}

const semProtocolo = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();

/** A fonte registada a que pertence um endereço: a de endereço mais comprido que seja o início dele; senão, a do
 *  mesmo site. */
function fonteDoEndereco(fontes, url) {
  const u = semProtocolo(url), site = u.split('/')[0];
  const prefixo = fontes.filter((f) => f.url && u.startsWith(semProtocolo(f.url)))
    .sort((a, b) => semProtocolo(b.url).length - semProtocolo(a.url).length)[0];
  return prefixo || fontes.find((f) => f.url && semProtocolo(f.url).split('/')[0] === site) || null;
}

/** Um site que ainda não é fonte do arquivo fica proposto (pendente) na mesma gravação; um editor aprova-o. */
async function proporFonteDe(url, ctx, uso) {
  ctx.fontes ||= await lerFicheiro('fontes/fontes.json');
  const ja = fonteDoEndereco(ctx.fontes.fontes, url);
  if (ja) return ja;
  const origem = new URL(url), site = origem.hostname.replace(/^www\./, '');
  const id = unico(slug(site).slice(0, 40).replace(/-+$/, ''), (x) => ctx.fontes.fontes.some((f) => f.id === x));
  const f = { id, nome: site, tipo: 'site', url: `${origem.protocol}//${origem.hostname}`, autor: '', estado: 'pendente', decidido_em: null,
    uso: [...new Set(['factos', uso])], recolha: { metodo: 'manual' }, notas: `Proposta ao citar ${url}`, proposta_por: sessao().id, proposta_em: hoje() };
  ctx.fontes.fontes.push(f);
  return f;
}

/** A prova de uma afirmação: o endereço da página (ou uma fonte da lista) com a frase copiada à letra, ou o testemunho
 *  assinado de quem o sabe. Se o site ainda não for fonte do arquivo, fica proposto e a citação mostra «fonte pendente». */
async function prova(d, ctx, uso = 'factos') {
  const nota = texto(d.nota_testemunho || d.nota);
  if (d.como !== 'fonte') return { fontes: [], nota: '', editorial: assinar(nota ? { nota } : {}) };
  const citacao = texto(d.citacao), url = texto(d.fonte_url);
  exigir(citacao, 'Copie à letra a frase da fonte que o diz: é a prova.');
  exigir(!url || urlValida(url), 'O endereço da página tem de começar por https://');
  let f = d.fonte ? E.fontes[d.fonte] : url ? fonteDoEndereco(E.base.fontes, url) : null;
  exigir(url || f, 'Indique o endereço da página onde está escrito (ou, se for um livro ou disco, escolha a fonte na lista).');
  if (!f) f = await proporFonteDe(url, ctx, uso);
  exigir(f.estado !== 'rejeitada', `A fonte «${f.nome}» foi rejeitada pelos editores: não se pode citar.`);
  exigir((f.uso || []).includes(uso), `A fonte «${f.nome}» não está aceite para isto (${uso === 'media' ? 'vídeos e áudios' : 'factos'}).`);
  const referencia = texto(d.referencia);
  return { fontes: [{ fonte: f.id, url: url || f.url, citacao, ...(referencia ? { referencia } : {}), acrescentada: assinar() }], nota };
}

/** Datas compatíveis: iguais, ou uma mais precisa do que a outra (1925 e 1925-03-03). */
const compativeis = (a, b) => !a || !b || a.startsWith(b) || b.startsWith(a);

/** Junta um facto à ficha. Se já existir igual, a fonte nova junta-se às dele. Para nascimento, morte, naturalidade e
 *  nome completo, uma versão diferente fica ao lado das outras como divergência («As fontes divergem»). */
function juntarFacto(ficha, facto, pr) {
  ficha.factos ||= [];
  const mesmos = ficha.factos.filter((x) => x.campo === facto.campo);
  const igual = mesmos.find((x) => norm(x.valor) === norm(facto.valor) || ((x.data || facto.data) && x.data === facto.data
    && norm(x.local || '') === norm(facto.local || '')));
  if (igual) {
    exigir(pr.fontes.length, 'Isso já está registado. Para o confirmar, indique a fonte (endereço e frase).');
    igual.fontes = [...(igual.fontes || []), ...pr.fontes];
    return 'confirmado com mais uma fonte';
  }
  const novo = { ...facto, fontes: pr.fontes, ...(pr.editorial ? { editorial: pr.editorial } : {}) };
  const unicos = ['nascimento', 'morte', 'naturalidade', 'nome_completo'];
  const diverge = (x) => !compativeis(x.data, facto.data) || (x.local && facto.local && norm(x.local) !== norm(facto.local));
  if (unicos.includes(facto.campo) && mesmos.some(diverge)) {
    mesmos.forEach((x) => { x.conflito = true; });
    novo.conflito = true;
  }
  ficha.factos.push(novo);
  return novo.conflito ? 'acrescentada outra versão (as fontes divergem)' : 'acrescentado';
}

/** Facto, relação ou referência acrescentada no modo de edição (e não tirada das fontes pelo agente). */
const deContribuidor = (x) => x.editorial || (x.fontes?.length && x.fontes.every((c) => c.acrescentada));
const autorDe = (x) => x.editorial?.por || x.fontes?.[0]?.acrescentada?.por;

/** Ficha mínima de uma pessoa que ainda não está no arquivo, criada a partir de uma relação. */
function fichaNova(nome) {
  const base = slug(nome);
  exigir(base, 'Escreva o nome da pessoa.');
  return { id: unico(base, (x) => !!E.por.pessoas[x]), tipo: 'pessoa', nome, nomes_alternativos: [], papeis: [], biografia: [],
    factos: [], relacoes: [], imagens: [], ligacoes: [], estado_revisao: 'rascunho',
    editorial: assinar({ nota: 'Ficha criada no modo de edição, a partir de uma relação.' }) };
}

/** Relação sem fonte própria (indicada no modo de edição ou com citações aí acrescentadas): pode ser retirada. */
const relacaoDeContribuidor = deContribuidor;

const ACOES = {
  // ---- fichas de pessoas
  revisao: ({ id, alvo, estado }) => comFicha(alvo || `pessoas/${id}`, (p) => {
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
    const ctx = {};
    const relacao_ = await prova(resto, ctx);
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
    if (ctx.fontes) alteracoes.push(['fontes/fontes.json', ctx.fontes]);
    const nome = (x) => (nova && x === nova.id ? nova.nome : nomeDe(x));
    return { alteracoes, resumo: `${nome(dono)}: ${REL[tipo].dir} ${nome(alvo)}${nova ? ` (ficha nova: ${nova.nome})` : ''}` };
  },

  'retirar-relacao': ({ dono, tipo, alvo }) => comPessoa(dono, (p) => {
    const i = (p.relacoes || []).findIndex((r) => r.tipo === tipo && r.alvo === alvo && relacaoDeContribuidor(r));
    exigir(i >= 0, 'Só se retiram relações acrescentadas no modo de edição; as que o agente tirou das fontes ficam.');
    p.relacoes.splice(i, 1);
    return `retirada a relação «${REL[tipo].dir} ${nomeDe(alvo)}»`;
  }),

  async 'apagar-ficha'({ id, alvo }) {
    const [tipo, idFicha] = String(alvo || `pessoas/${id}`).split('/');
    if (tipo !== 'pessoas') {
      const f = await lerFicheiro(`dados/${tipo}/${idFicha}.json`);
      exigir(f.editorial && !f.factos?.length, 'Só se apagam fichas criadas no modo de edição e ainda sem factos.');
      exigir(f.editorial.por === sessao().id || podeAprovar(), 'Só quem criou a ficha ou um editor a pode apagar.');
      return { alteracoes: [[`dados/${tipo}/${idFicha}.json`, null]], resumo: `ficha apagada: ${f[ESPECIES[tipo].titulo]}`, ir: ESPECIES[tipo].lista };
    }
    id = idFicha;
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

  'nota-facto': ({ id, alvo, indice, valorFacto, texto: nota }) => comFicha(alvo || `pessoas/${id}`, (p) => {
    const f = p.factos?.[+indice];
    exigir(f && (valorFacto === undefined || f.valor === valorFacto), 'A ficha mudou entretanto: recarregue a página.');
    nota = texto(nota);
    if (nota) f.nota_editorial = assinar({ texto: nota }); else delete f.nota_editorial;
    return `nota sobre o facto «${f.valor.slice(0, 60)}»`;
  }),

  // ---- nascimento, morte, factos e referências (em fichas de qualquer tipo)
  vida: ({ alvo, campo, local, aprox, ...d }) => comFicha(alvo, async (p, ctx) => {
    exigir(['nascimento', 'morte'].includes(campo), 'Campo desconhecido.');
    const data = dataDe(d);
    local = texto(local);
    exigir(data || local, 'Indique a data, o local, ou os dois.');
    const quando = data ? (aprox ? `c. ${data.slice(0, 4)}` : fmtData(data)) : '';
    const facto = { campo, valor: [quando, local].filter(Boolean).join(', '), ...(data && !aprox ? { data } : {}), ...(local ? { local } : {}) };
    return `${CAMPOS[campo].toLowerCase()} ${juntarFacto(p, facto, await prova(d, ctx))}: ${facto.valor}`;
  }),

  'novo-facto': ({ alvo, campo, valor, local, aprox, ...d }) => comFicha(alvo, async (f, ctx) => {
    exigir(CAMPOS[campo], 'Escolha o tipo de facto.');
    valor = texto(valor); local = texto(local);
    exigir(valor, 'Escreva o facto (ex.: «Atuou no Coliseu dos Recreios com Luiz Goes»).');
    const data = dataDe(d);
    const facto = { campo, valor: data && aprox ? `${valor} (c. ${data.slice(0, 4)})` : valor, ...(data && !aprox ? { data } : {}), ...(local ? { local } : {}) };
    return `facto ${juntarFacto(f, facto, await prova(d, ctx))} (${CAMPOS[campo].toLowerCase()})`;
  }),

  'retirar-facto': ({ alvo, indice, valor }) => comFicha(alvo, (f) => {
    const fa = f.factos?.[+indice];
    exigir(fa && fa.valor === valor, 'A ficha mudou entretanto: recarregue a página.');
    exigir(deContribuidor(fa), 'Só se retiram factos acrescentados no modo de edição; os que o agente tirou das fontes ficam (pode juntar-lhes uma nota).');
    exigir(autorDe(fa) === sessao().id || podeAprovar(), 'Só quem o acrescentou ou um editor o pode retirar.');
    f.factos.splice(+indice, 1);
    const resto = f.factos.filter((x) => x.campo === fa.campo);
    if (resto.length === 1) delete resto[0].conflito; // ficou uma só versão: já não há divergência
    return `facto retirado: «${valor.slice(0, 60)}»`;
  }),

  'nova-referencia': ({ alvo, titulo, url, publicacao, autor, ano, nota }) => comFicha(alvo, (f) => {
    titulo = texto(titulo); url = texto(url); ano = texto(ano);
    exigir(titulo && urlValida(url), 'Indique o título e o endereço (https://…).');
    exigir(!ano || /^\d{4}$/.test(ano), 'O ano escreve-se com quatro algarismos.');
    f.referencias ||= [];
    exigir(!f.referencias.some((r) => r.url === url), 'Essa referência já está na ficha.');
    f.referencias.push({ titulo, url, ...(texto(publicacao) ? { publicacao: texto(publicacao) } : {}), ...(texto(autor) ? { autor: texto(autor) } : {}),
      ...(ano ? { ano } : {}), editorial: assinar(texto(nota) ? { nota: texto(nota) } : {}) });
    return `referência acrescentada: ${titulo}`;
  }),

  'retirar-referencia': ({ alvo, url }) => comFicha(alvo, (f) => {
    const i = (f.referencias || []).findIndex((r) => r.url === url);
    exigir(i >= 0, 'Essa referência já não está na ficha.');
    exigir(f.referencias[i].editorial?.por === sessao().id || podeAprovar(), 'Só quem a acrescentou ou um editor a pode retirar.');
    const [r] = f.referencias.splice(i, 1);
    return `referência retirada: ${r.titulo}`;
  }),

  // ---- fichas novas e dados das fichas (pessoas e grupos, obras, discos, instrumentos, vídeos e áudios)
  async 'guardar-ficha'({ especie: tipo, id, homonimo, ...d }) { // «tipo» é um campo das pessoas (pessoa ou grupo)
    const esp = ESPECIES[tipo];
    exigir(esp, 'Tipo de ficha desconhecido.');
    const novo = !id;
    const ficha = novo ? fichaVazia(tipo) : await lerFicheiro(`dados/${tipo}/${id}.json`);
    Object.assign(ficha, lerCampos(tipo, d));
    const titulo = ficha[esp.titulo];
    exigir(titulo, `Falta: ${esp.campos.find((c) => c.k === esp.titulo).r}.`);
    if (tipo === 'media') {
      const c = classificar(ficha.url);
      exigir(c && ['video', 'audio'].includes(c.tipo), 'Esse endereço não é de um vídeo ou áudio que o arquivo saiba tocar (YouTube, Vimeo, SoundCloud…).');
      Object.assign(ficha, { tipo: c.tipo, plataforma: c.plataforma });
      exigir(!E.base.media.some((m) => m.id !== id && m.url === ficha.url), 'Esse vídeo ou áudio já está catalogado.');
    }
    const ctx = {};
    if (d.como === 'fonte') (ficha.fontes ||= []).push(...(await prova(d, ctx, esp.fonte)).fontes);
    const alteracoes = [];
    if (novo) {
      // o mesmo nome noutra ficha: ou é a mesma (acrescente-se lá), ou é outra e ficam as duas marcadas «não confundir com»
      const iguais = (E.base[tipo] || []).filter((x) => norm(x[esp.titulo]) === norm(titulo));
      exigir(!iguais.length || homonimo, `Já existe «${iguais[0]?.[esp.titulo]}». Se for a mesma, acrescente lá o que sabe; se for outra com o mesmo nome, marque a caixa «é outra».`);
      ficha.id = unico(slug(titulo).slice(0, 70).replace(/-+$/, '') || tipo, (x) => !!E.por[tipo]?.[x]);
      Object.assign(ficha, { estado_revisao: 'rascunho', editorial: assinar() });
      for (const x of iguais) {
        (ficha.distinta_de ||= []).push({ id: x.id, ...assinar() });
        const outra = await lerFicheiro(`dados/${tipo}/${x.id}.json`);
        (outra.distinta_de ||= []).push({ id: ficha.id, ...assinar() });
        alteracoes.push([`dados/${tipo}/${x.id}.json`, outra]);
      }
    }
    alteracoes.unshift([`dados/${tipo}/${ficha.id}.json`, ficha]);
    if (ctx.fontes) alteracoes.push(['fontes/fontes.json', ctx.fontes]);
    const ir = esp.rota ? `#/${esp.rota}/${ficha.id}` : ficha.pessoas?.[0] ? `#/pessoa/${ficha.pessoas[0]}` : esp.lista;
    return { alteracoes, resumo: novo ? `${esp.nome} nova: ${titulo}` : `${titulo}: dados corrigidos`, ir };
  },

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

  // ---- contribuidores (os administradores convidam, mudam papéis e retiram acessos; o fundador só ele próprio)
  async 'guardar-contribuidor'({ id, nome, github, papel, apresentacao }) {
    exigir(eAdmin(), 'Só os administradores gerem os contribuidores.');
    exigir(papel !== 'dono', 'O arquivo tem um só fundador.');
    nome = String(nome || '').trim(); github = String(github || '').trim().replace(/^@/, '');
    exigir(nome, 'Indique o nome.');
    const caminho = 'dados/contribuidores.json', reg = await lerFicheiro(caminho);
    let c = id && reg.contribuidores.find((x) => x.id === id);
    if (!c) {
      c = { id: unico(slug(nome), (x) => reg.contribuidores.some((y) => y.id === x)), nome, github, papel, desde: hoje(), apresentacao: '' };
      reg.contribuidores.push(c);
    }
    if (c.papel === 'dono') {
      exigir(sessao().papel === 'dono', 'Os dados do fundador do arquivo só ele os pode mudar.');
      papel = 'dono';
    }
    Object.assign(c, { nome, github, papel, apresentacao: String(apresentacao || '').trim() });
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
    } else if (valor !== undefined) dados.valor = valor; // sem pergunta, data-valor é um dado da ação
    correr(acao, dados, b);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-acao]');
    if (!f) return;
    e.preventDefault();
    correr(f.dataset.acao, dadosFormulario(f), f);
  });
}
