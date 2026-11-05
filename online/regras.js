// Regras que o Worker confere em cada gravação, comparando cada ficheiro com as suas versões anteriores (a do main e,
// quando a alteração continua uma proposta aberta, a desse ramo). Até aqui estavam só no browser (site/js/edicao.js), e
// quem tem conta podia pedir ao servidor o que o site não deixa fazer.
//   - Endereços (url, miniatura, origem e as ligações de uma gravação): só http:// ou https:// (um javascript: no
//     leitor ou numa ligação corria código) e sem caracteres de controlo; nas
//     fotografias e capas, também sem aspas, barras invertidas nem < >, que deixam sair do url('…') (CSS injetado).
//     Só se conferem os endereços novos: os que já estavam nas fichas ficam como estão.
//   - Assinaturas: cada um assina por si. Uma assinatura de outra pessoa só pode vir, igual, de uma das fichas da
//     mesma gravação (é o que acontece ao juntar e ao separar fichas).
//   - Papéis: só um editor marca uma ficha como revista, muda a nota antiga do editor, aprova, rejeita ou corrige
//     fontes; quem não é editor só altera ou apaga os seus próprios textos do blogue e as fichas que criou.
//   - Apagar uma ficha juntada a outra só na gravação em que quem grava a junta (uma entrada nova em «juntou»).

const CAMPOS_URL = new Set(['url', 'miniatura', 'origem']);
const RE_FORA_DO_ENDERECO = /['"\\<>\u0000-\u001f\u007f]/;
const OBJ_ASSINADOS = ['editorial', 'acrescentada', 'nota_editorial', 'escolhida', 'oculta'];
const LISTAS_ASSINADAS = ['juntou', 'distinta_de', 'notas_editor', 'notas_editoriais'];
const NOTA_ANTIGA = ['nota_editor', 'nota_editor_por', 'nota_editor_em'];
const REVISAO = ['estado_revisao', 'revisto_por', 'revisto_em'];
const RE_FICHA = /^dados\/(pessoas|instrumentos|gravacoes|obras|media)\/[a-z0-9-]+\.json$/;

const ehObjeto = (x) => x && typeof x === 'object' && !Array.isArray(x);
/** JSON com as chaves por ordem: dois objetos iguais dão sempre o mesmo texto. */
export const estavel = (x) => (Array.isArray(x) ? `[${x.map(estavel).join(',')}]`
  : ehObjeto(x) ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${estavel(x[k])}`).join(',')}}` : JSON.stringify(x));
/** Uma assinatura, sem as assinaturas que tem dentro (essas conferem-se à parte) e, nas listas «juntou» e
 *  «distinta_de», sem a ficha a que se refere (ao juntar, «não confundir com B» passa a «não confundir com A»). */
function canonica(o, chave) {
  const resto = Object.fromEntries(Object.entries(o).filter(([k]) => !OBJ_ASSINADOS.includes(k)
    && !((chave === 'juntou' || chave === 'distinta_de') && ['id', 'nome', 'titulo', 'designacao'].includes(k))));
  return estavel(resto);
}

/** Percorre um conteúdo: f(assinatura, chave) para cada objeto assinado, u(valor, imagem) para cada endereço (imagem:
 *  se é o de uma fotografia ou capa, que o site põe dentro de url('…') num estilo). */
function percorrer(x, f, u, pai = '') {
  if (Array.isArray(x)) { x.forEach((y) => percorrer(y, f, u, pai)); return; }
  if (!ehObjeto(x)) return;
  for (const [k, v] of Object.entries(x)) {
    if (OBJ_ASSINADOS.includes(k) && ehObjeto(v)) f(v, k);
    if (LISTAS_ASSINADAS.includes(k) && Array.isArray(v)) v.filter(ehObjeto).forEach((y) => f(y, k));
    if (CAMPOS_URL.has(k) && typeof v === 'string') u(v, k === 'miniatura' || (k === 'url' && ['imagens', 'capa', 'imagens_ocultas'].includes(pai)));
    // as ligações de uma gravação: { discogs, spotify, youtube… } com o endereço como valor (vistas/musica.js põe-nos em href)
    if (k === 'ligacoes' && ehObjeto(v)) Object.values(v).forEach((x) => { if (typeof x === 'string') u(x, false); });
    percorrer(v, f, u, k);
  }
}

/** A nota antiga de uma ficha (uma por ficha, em três campos) como se fosse uma assinatura. */
const notaAntiga = (x) => (x?.nota_editor ? { por: x.nota_editor_por || null, data: x.nota_editor_em || null, texto: x.nota_editor } : null);

const recusa = (estado, erro) => ({ estado, erro });
const NAO_ASSINA = 'Não pode assinar em nome de outra pessoa: cada contribuição fica assinada por quem a faz.';

/** Confere uma gravação. alteracoes: [{ caminho, conteudo }]; anteriores: Map caminho → versões anteriores desse
 *  ficheiro (as que existem); anterior: Map caminho → a versão imediatamente anterior (null se é novo); c: quem grava;
 *  editor: se pode aprovar. Devolve null se está tudo bem, ou { estado, erro }. */
export function conferir({ alteracoes, anteriores, anterior, c, editor }) {
  // o que já existia nas fichas desta gravação: assinaturas, notas antigas e endereços
  const conhecidas = new Set(), notas = [], enderecosAntigos = new Set();
  for (const versoes of anteriores.values()) {
    for (const v of versoes) {
      percorrer(v, (o, k) => conhecidas.add(canonica(o, k)), (u) => enderecosAntigos.add(u));
      for (const x of [v, ...(Array.isArray(v?.factos) ? v.factos : [])]) {
        const n = notaAntiga(x);
        if (n) { notas.push(n); conhecidas.add(canonica(n, 'notas_editor')); }
      }
    }
  }

  for (const { caminho, conteudo } of alteracoes) {
    if (conteudo === null) continue;
    let mal = null;
    percorrer(conteudo, (o, k) => {
      if (!mal && o.por !== c.id && !conhecidas.has(canonica(o, k))) mal = recusa(400, NAO_ASSINA);
    }, (u, imagem) => {
      if (mal || !u || enderecosAntigos.has(u)) return;
      if (!/^https?:\/\//i.test(u)) mal = recusa(400, `O endereço tem de começar por http:// ou https:// («${u.slice(0, 80)}»).`);
      else if (/[\u0000-\u001f\u007f]/.test(u) || (imagem && RE_FORA_DO_ENDERECO.test(u))) {
        mal = recusa(400, `O endereço da imagem tem caracteres que não podem estar num endereço (aspas, < >, \\): «${u.slice(0, 80)}».`);
      }
    });
    if (mal) return mal;
    const antes = anterior.get(caminho) || null;

    if (RE_FICHA.test(caminho)) {
      // a nota antiga do editor: igual, retirada, ou trazida de outra ficha da mesma gravação (ao juntar)
      const n = notaAntiga(conteudo), na = notaAntiga(antes);
      if (n && estavel(n) !== estavel(na)) {
        // (ao juntar duas fichas com notas antigas do mesmo autor, as duas ficam numa só, separadas por « / »)
        const trazida = conhecidas.has(canonica(n, 'notas_editor'))
          || (n.por === (na?.por ?? n.por) && n.texto.split(' / ').every((t) => notas.some((x) => x.texto === t)));
        if (!trazida && !(editor && n.por === c.id)) return recusa(editor ? 400 : 403, editor ? NAO_ASSINA : 'Só um editor pode mudar a nota antiga do editor.');
      }
      if (!editor && !n && na) return recusa(403, 'Só um editor pode retirar a nota antiga do editor.');
      for (const k of REVISAO) {
        const novo = conteudo[k], velho = antes?.[k];
        if (estavel(novo) === estavel(velho) || (k === 'estado_revisao' && !antes && (novo === 'rascunho' || novo === undefined))) continue;
        if (!editor) return recusa(403, 'Só um editor pode marcar uma ficha como revista.');
        if (k === 'revisto_por' && novo && novo !== c.id) return recusa(400, NAO_ASSINA);
      }
    }

    if (caminho === 'fontes/fontes.json') {
      const velhas = new Map((antes?.fontes || []).map((f) => [f.id, f]));
      const novas = Array.isArray(conteudo.fontes) ? conteudo.fontes : [];
      for (const f of novas) {
        const v = velhas.get(f?.id);
        for (const k of ['proposta_por', 'decidido_por', 'corrigida_por']) if (f?.[k] && f[k] !== v?.[k] && f[k] !== c.id) return recusa(400, NAO_ASSINA);
        if (editor) continue;
        if (v ? estavel(v) !== estavel(f) : (f?.estado !== 'pendente' || f?.proposta_por !== c.id)) {
          return recusa(403, 'Só um editor pode aprovar, rejeitar ou corrigir fontes; pode propor fontes novas, que ficam por decidir.');
        }
      }
      if (!editor && [...velhas.keys()].some((id) => !novas.some((f) => f?.id === id))) return recusa(403, 'Só um editor pode retirar fontes do registo.');
    }

    if (caminho === 'dados/excluidos.json') {
      const velhas = new Set((antes?.media || []).map(estavel));
      for (const e of Array.isArray(conteudo.media) ? conteudo.media : []) if (!velhas.has(estavel(e)) && e?.por !== c.id) return recusa(400, NAO_ASSINA);
      if (!editor && (antes?.media || []).some((e) => !(conteudo.media || []).some((x) => estavel(x) === estavel(e)))) {
        return recusa(403, 'Só um editor pode voltar a pôr no catálogo o que foi retirado.');
      }
    }

    if (caminho.startsWith('dados/blogue/')) {
      if (conteudo.autor !== antes?.autor && conteudo.autor !== c.id) return recusa(400, NAO_ASSINA);
      if (!editor && antes && antes.autor !== c.id) return recusa(403, 'Só o autor ou um editor alteram este texto.');
    }
  }
  return null;
}

/** As fichas que esta gravação pode apagar, e porquê; devolve null ou { estado, erro } para a primeira que não pode.
 *  Apaga-se: um texto do blogue (de quem grava, se não for editor); uma ficha criada no modo de edição e ainda sem
 *  factos (criada por quem grava, se não for editor); uma ficha juntada nesta gravação (entrada nova em «juntou»,
 *  assinada por quem grava); um vídeo ou áudio retirado do catálogo nesta gravação (dados/excluidos.json). */
export function conferirApagar({ alteracoes, anterior, c, editor }) {
  const juntadas = new Set(), retiradas = new Set();
  for (const { caminho, conteudo } of alteracoes) {
    if (!conteudo) continue;
    const antes = anterior.get(caminho);
    if (caminho.startsWith('dados/') && Array.isArray(conteudo.juntou)) {
      const ja = new Set((antes?.juntou || []).map(estavel));
      for (const j of conteudo.juntou) if (ehObjeto(j) && !ja.has(estavel(j)) && j.por === c.id) juntadas.add(`dados/${caminho.split('/')[1]}/${j.id}.json`);
    }
    if (caminho === 'dados/excluidos.json') {
      const ja = new Set((antes?.media || []).map(estavel));
      for (const e of conteudo.media || []) if (ehObjeto(e) && e.url && !ja.has(estavel(e))) retiradas.add(e.url);
    }
  }
  for (const { caminho, conteudo } of alteracoes) {
    if (conteudo !== null) continue;
    const antes = anterior.get(caminho);
    if (!antes) continue; // já não existe: nada a apagar
    if (caminho.startsWith('dados/blogue/')) {
      if (!editor && antes.autor !== c.id) return recusa(403, 'Só o autor ou um editor apagam este texto.');
      continue;
    }
    if (juntadas.has(caminho) || (caminho.startsWith('dados/media/') && retiradas.has(antes.url))) continue;
    if (RE_FICHA.test(caminho) && antes.editorial && !antes.factos?.length && !antes.biografia?.length) {
      if (!editor && antes.editorial.por !== c.id) return recusa(403, 'Só quem criou a ficha ou um editor a pode apagar.');
      continue;
    }
    return recusa(400, 'Só se apagam textos do blogue e fichas criadas no modo de edição, ainda sem factos.');
  }
  return null;
}
