// Formulários e marcas do modo de edição usados nas fichas (as ações estão em edicao.js). Cada formulário fica fechado
// numa dobra (<details>) com um resumo do que faz, na secção a que pertence; o topo da ficha tem atalhos para eles.
import { E, TIPOS_FONTE, nomeContribuidor, comArquivo, catalogado } from './estado.js';
import { html, fmtData, compararPt, ler } from './util.js';
import { podeAprovar, sessao, editando } from './edicao.js';
import { seletorPessoa } from './seletor.js';
import { botaoNovoMedia } from './fichas.js';
import { botaoLetraMedia } from './letras.js';

/** Sinal ✎ de uma contribuição assinada (sem fonte), com quem, quando e porquê no título. */
export function marcaEditorial(a, oque = 'Indicado') {
  if (!a) return '';
  const titulo = `${oque} por ${nomeContribuidor(a.por)} em ${fmtData(a.data)}${a.nota ? ` — ${a.nota}` : ''}. Decisão editorial, sem fonte.`;
  return html`<span class="marca-editorial" title="${titulo}">✎</span>`;
}

/** Nota assinada sobre um facto («✎ Nome: texto»). */
export const notaEditorial = (n) => (n ? html` <span class="nota-editorial" title="Nota de ${nomeContribuidor(n.por)} (${fmtData(n.data)}), não é fonte">✎ ${nomeContribuidor(n.por)}: ${n.texto}</span>` : '');

// ------------------------------------------------------------------ dobras e atalhos

/** Chave (no browser) das dobras do modo de edição que quem edita deixou abertas. */
export const ABERTOS = 'edicaoAbertos';

/** Um formulário do modo de edição numa dobra fechada (<details>), com um resumo do que faz. As dobras que se abrem
 *  ficam lembradas neste browser (fichas.js); com `lembrar: false`, a dobra abre sempre fechada. */
export function dobra(id, resumo, conteudo, { lembrar = true } = {}) {
  const aberta = lembrar && ler(ABERTOS, []).includes(id);
  return html`<details class="dobra-edicao" id="${id}" ${aberta ? 'open' : ''} ${lembrar ? 'data-lembrar' : ''}><summary>${resumo}</summary>${conteudo}</details>`;
}

/** Botão que abre uma dobra da ficha e a traz à vista (fichas.js). */
export const atalho = (id, texto) => html`<button type="button" class="botao peq" data-abrir="${id}">${texto}</button>`;

/** «Mais opções» dentro de um formulário: o que raramente se usa (data aproximada, local, página…). Nada se perde: os
 *  campos de uma dobra fechada também se gravam. */
export const maisOpcoes = (conteudo, resumo = 'Mais opções') => html`<details class="mais-opcoes"><summary>${resumo}</summary>
  <div class="mais-opcoes-campos">${conteudo}</div></details>`;

/** Topo da ficha de uma pessoa no modo de edição: atalhos para os formulários da ficha (cada um fechado na sua secção)
 *  e o que se faz à ficha inteira. */
export function caixaTopo(p) {
  const revisto = p.estado_revisao === 'revisto', grupo = p.tipo === 'grupo';
  // (fichas de pessoas; nas outras, o botão «Corrigir os dados» e a revisão estão no topo da ficha)
  return html`<div class="caixa-edicao atalhos-edicao">
    <p class="atalhos"><span class="mudo">Acrescentar:</span> ${atalho('ed-facto', 'Facto')}
      ${grupo ? '' : html`${atalho('ed-nascimento', 'Nascimento')}${atalho('ed-morte', 'Morte')}`}${atalho('ed-relacao', 'Relação')}
      ${atalho('ed-imagem', 'Fotografia')}${botaoNovoMedia({ pessoas: [p.id] }, 'Vídeo ou áudio')}${atalho('ed-ligacao', 'Ligação')}${atalho('ed-referencia', 'Referência')}
      ${atalho('ed-nota', '✎ Nota')}</p>
    <div class="acoes"><a class="botao peq" href="#/editar/pessoas/${p.id}">✎ Corrigir nome, outros nomes e atributos</a>
      ${podeAprovar() ? html`<button type="button" class="botao peq" data-acao="revisao" data-id="${p.id}" data-estado="${revisto ? 'rascunho' : 'revisto'}">
        ${revisto ? 'Voltar a pôr como rascunho' : 'Marcar a ficha como revista'}</button>` : ''}
      ${atalho('ed-desambiguar', 'Desambiguar…')}
      ${p.editorial && !p.factos?.length && (p.editorial.por === sessao()?.id || podeAprovar())
        ? html`<button type="button" class="botao peq" data-acao="apagar-ficha" data-id="${p.id}"
          data-confirmar="Apagar a ficha «${p.nome}» e as relações indicadas para ela?">Apagar esta ficha</button>` : ''}</div>
  </div>`;
}

/** ✎ Nota do editor de uma pessoa (o que se sabe sem fonte): depois dos factos, fechada. A nota nova junta-se às que
 *  já houver, cada uma com o seu autor (notas.js); a caixa vem sempre vazia, para nunca se reescrever a nota de outra pessoa. */
export function formNotaEditor(p) {
  const n = (p.nota_editor ? 1 : 0) + (p.notas_editor || []).length;
  const resumo = html`✎ Acrescentar uma nota <small>${n ? `já ${n === 1 ? 'tem uma nota' : `tem ${n} notas`} (no topo da ficha)` : 'o que sabe sem fonte'}</small>`;
  return dobra('ed-nota', resumo, html`<form class="caixa-edicao" data-acao="nota-editor">
    <input type="hidden" name="id" value="${p.id}">
    <label for="nota-editor">✎ Nota nova <small>o que sabe sem fonte (como é conhecido, uma identificação, uma dúvida). Fica assinada com o seu nome
      e junta-se às notas que já houver.</small></label>
    <textarea class="campo" id="nota-editor" name="texto" rows="3" required></textarea>
    <div class="acoes"><button class="botao peq primario">Guardar nota</button></div>
  </form>`);
}

const TIPOS_PROVA = [['site', 'Site ou página da Internet'], ['livro', 'Livro'], ['artigo', 'Artigo de jornal ou revista'], ['documento', 'Documento (carta, programa, disco, fotografia…)']];
let nListas = 0;

/** «Como sabe?»: numa fonte ou por conhecimento próprio (testemunho assinado ✎). Nenhuma das duas vem marcada: quem grava
 *  escolhe sempre. Com fonte, primeiro o tipo, e só aparecem os campos desse tipo: um site pede o endereço; um livro, um
 *  artigo ou um documento pede o título (a escolher entre as fontes registadas ou novo) e a página. A CSS mostra-os
 *  (data-so). Com `opcional`, pode não se indicar nada («Não indicar agora» vem marcado). `prefixo` distingue os campos
 *  quando há mais de um «Como sabe?» no mesmo formulário; `obrigatorio: false` deixa gravar sem escolher (a ação confirma);
 *  `mesmaDe` acrescenta «A mesma fonte do …»; `semFrase` tira o campo da frase (a letra de uma música é ela própria a
 *  frase); `inicial` preenche (como, fonte_url, fonte, citacao, referencia). */
export function camposProva({ opcional = false, uso = 'factos', prefixo = '', obrigatorio = true, mesmaDe = '', inicial = {}, semFrase = false } = {}) {
  const fontes = E.base.fontes.filter((f) => f.estado === 'aprovada' && (f.uso || []).includes(uso) && f.tipo !== 'blogue').sort((a, b) => compararPt(a.nome, b.nome));
  const lista = `fontes-registadas-${++nListas}`;
  const como = inicial.como || (opcional ? 'nada' : '');
  const n = (k) => `${prefixo}${k}`;
  const radio = (v, rotulo) => html`<label class="opcao"><input type="radio" name="${n('como')}" value="${v}" ${v === como ? 'checked' : ''}
    ${obrigatorio && !opcional ? 'required' : ''}> ${rotulo}</label>`;
  return html`<fieldset class="como-sabe"><legend>Como sabe?</legend>
    <div class="linha-campos">
      ${opcional ? radio('nada', 'Não indicar agora') : ''}
      ${radio('fonte', html`Está escrito numa fonte <small>(site, livro, artigo, documento)</small>`)}
      ${opcional ? '' : radio('proprio', html`Sei por conhecimento próprio <small>(testemunho assinado ✎)</small>`)}
      ${mesmaDe ? radio('mesma', `A mesma fonte ${mesmaDe}`) : ''}
    </div>
    <div class="com-fonte">
      <label>Que tipo de fonte é? <select class="campo" name="${n('tipo_fonte')}" data-tipo-fonte>
        ${TIPOS_PROVA.map(([v, t]) => html`<option value="${v}">${t}</option>`)}</select></label>
      <label data-so="livro artigo documento">Título <small>escreva e escolha na lista; se ainda não existir, fica proposto e um editor decide</small>
        <input class="campo" name="${n('fonte_titulo')}" list="${lista}" autocomplete="off">
        <datalist id="${lista}">${fontes.map((f) => html`<option value="${f.nome}">${f.autor || TIPOS_FONTE[f.tipo] || ''}</option>`)}</datalist></label>
      <label data-so="livro artigo">Autor <small>opcional; só se a publicação ainda não estiver registada</small><input class="campo" name="${n('fonte_autor')}"></label>
      <label data-so="site artigo documento"><span data-so="site">Endereço da página</span><span data-so="artigo documento">Endereço, se estiver na Internet</span>
        <small data-so="site">o artigo, o post, a página do catálogo. Se esse site ainda não for fonte do arquivo, fica proposto e um editor aprova-o.</small>
        <input class="campo" type="url" name="${n('fonte_url')}" value="${inicial.fonte_url || ''}" placeholder="https://…"></label>
      <input type="hidden" name="${n('fonte')}" value="${inicial.fonte || ''}">
      ${semFrase ? '' : html`<label>Frase copiada à letra <small>é a prova: o que a fonte diz, palavra por palavra</small>
        <textarea class="campo" name="${n('citacao')}" rows="2">${inicial.citacao || ''}</textarea></label>`}
      <label data-so="livro artigo documento">Página ou referência <small>ex.: p. 45, edição de 1987, n.º 12</small>
        <input class="campo" name="${n('referencia')}" value="${inicial.referencia || ''}"></label>
    </div>
    ${opcional ? '' : html`<div class="sem-fonte"><label>Como sabe? <small>opcional: «sou neto», «conversa com o próprio, 2019», «programa do concerto»</small>
      <input class="campo" name="${n('nota_testemunho')}"></label></div>`}</fieldset>`;
}

/** Uma ligação da pessoa ou grupo: a página de artista numa plataforma de música (botão no topo da ficha) ou outro site. */
export const formNovaLigacao = (id) => dobra('ed-ligacao', html`+ Acrescentar uma ligação <small>Spotify, Apple Music, YouTube, SoundCloud ou outro site</small>`,
  html`<form class="caixa-edicao" data-acao="nova-ligacao"><input type="hidden" name="id" value="${id}">
    <label>Endereço <input class="campo" name="url" type="url" required placeholder="https://open.spotify.com/artist/…"></label>
    <label>Nome <small>só se não for uma plataforma de música; ex.: Site oficial</small><input class="campo" name="rotulo"></label>
    <div class="acoes"><button class="botao peq primario">Acrescentar ligação</button></div></form>`);

export function formNovaImagem(id) {
  const p = E.por.pessoas[id];
  const nomes = [p?.nome, ...(p?.nomes_alternativos || [])].filter(Boolean);
  return dobra('ed-imagem', '+ Acrescentar uma fotografia', html`<form class="caixa-edicao" data-acao="nova-imagem" data-nomes="${nomes.join('|')}">
    <input type="hidden" name="id" value="${id}">
    <div class="procurar-foto"><a class="botao peq" href="https://www.facebook.com/search/photos/?q=${encodeURIComponent(p.nome)}" target="_blank" rel="noopener">Procurar no Facebook</a>
      <a class="botao peq" href="https://www.google.com/search?udm=2&q=${encodeURIComponent(`"${p.nome}" Coimbra`)}" target="_blank" rel="noopener">Procurar imagens</a>
      <small class="mudo">abrem noutro separador; depois cole aqui o endereço da imagem e o da página</small></div>
    <label>Endereço da imagem <small>no computador: botão direito sobre a imagem › «Copiar endereço da imagem». Também serve o endereço da página de
      uma imagem da Wikimedia Commons ou da Wikipédia (…/wiki/File:…): o da imagem preenche-se sozinho.</small>
      <input class="campo" name="url" type="url" required placeholder="https://…/fotografia.jpg"></label>
    <div class="previa-imagem" data-previa-imagem aria-live="polite" hidden></div>
    ${comArquivo() && nomes.length ? html`<div class="imagens-do-arquivo"><button type="button" class="botao peq" data-imagens-arquivo>Escolher uma imagem do arquivo</button>
      <small class="mudo">fotografias dos posts que referem ${p.nome}; a página de origem fica a ser o post</small>
      <div class="grelha-imagens" data-lista-imagens hidden></div></div>` : ''}
    <label>Página onde a fotografia está publicada <small>para se saber de onde vem (o arquivo não guarda cópias)</small>
      <input class="campo" name="origem" type="url" required placeholder="https://…"></label>
    <label>Legenda <input class="campo" name="legenda" placeholder="Ex.: Carlos Paredes no Coliseu, 1983"></label>
    <label>Nota <small>opcional: como sabe que é esta pessoa, autor da fotografia</small><input class="campo" name="nota"></label>
    <label class="opcao"><input type="checkbox" name="retrato" value="1"> Usar como retrato da ficha</label>
    <p class="mudo dica-telemovel">No telemóvel nem sempre é possível copiar o endereço de uma imagem. Cole antes o endereço da página da imagem
      na Wikimedia Commons${comArquivo() ? ', ou escolha uma imagem do arquivo' : ''}.</p>
    <div class="acoes"><button class="botao peq primario">Acrescentar fotografia</button></div>
  </form>`);
}

/** Ações do modo de edição num cartão de vídeo ou áudio catalogado (uma ficha, ou várias com o mesmo vídeo): corrigir
 *  a ficha (e voltar a esta página), ver o histórico, marcar como revisto (editores) e, na ficha de uma pessoa,
 *  tirá-la deste vídeo (com o motivo). */
export function acoesMedia(m) {
  const fichas = [].concat(m || []).filter((x) => x?.id && E.por.media[x.id]);
  if (!editando() || !fichas.length) return '';
  const volta = encodeURIComponent(location.hash || '#/');
  const corrigir = (x, texto) => html`<a class="botao peq" href="#/editar/media/${x.id}?volta=${volta}" title="Corrigir a ficha «${x.titulo || x.id}»">${texto}</a>`;
  if (fichas.length > 1) return html`<div class="acoes acoes-edicao-media">${botaoLetraMedia(fichas)}${fichas.map((x, i) => corrigir(x, `✎ Corrigir a ficha ${i + 1}`))}</div>`;
  const [f] = fichas;
  const naFicha = decodeURIComponent((location.hash.match(/^#\/pessoa\/([^/?]+)/) || [])[1] || '');
  const revisto = f.estado_revisao === 'revisto', nome = E.por.pessoas[naFicha]?.nome || naFicha;
  return html`<div class="acoes acoes-edicao-media">${botaoLetraMedia(f)}${corrigir(f, '✎ Corrigir')}
    <a class="botao peq" href="#/historico/media/${f.id}">Histórico</a>
    ${podeAprovar() ? html`<button type="button" class="botao peq" data-acao="revisao" data-alvo="media/${f.id}" data-estado="${revisto ? 'rascunho' : 'revisto'}"
      title="${revisto ? 'Deixa de constar como revisto' : 'Confirma que viu o vídeo e que a ficha diz o que a fonte diz'}">${revisto ? 'Voltar a rascunho' : 'Marcar como revisto'}</button>` : ''}
    ${naFicha && (f.pessoas || []).includes(naFicha) ? html`<button type="button" class="botao peq" data-acao="tirar-pessoa-media" data-alvo="media/${f.id}" data-pessoa="${naFicha}"
      data-pedir="Porque é que ${nome} não está neste vídeo ou áudio? (o motivo fica no histórico)"
      title="Tirar ${nome} deste vídeo ou áudio (pede o motivo)">Tirar ${nome}</button>` : ''}
  </div>`;
}

/** Num vídeo ou áudio dos blogues (só na cópia local): «+ Catalogar» abre o formulário com o endereço, o título na
 *  plataforma e o post como fonte; se já estiver catalogado, «✎ Corrigir a ficha». O ano, as pessoas e as obras não se
 *  preenchem: escreve-os quem cataloga, e copia a frase do post à letra. */
export function botaoCatalogar(m) {
  if (!editando() || !comArquivo() || !['video', 'audio'].includes(m?.tipo)) return '';
  const volta = location.hash || '#/';
  const ja = catalogado(m);
  if (ja) return html`<a class="botao peq" href="#/editar/media/${ja.id}?volta=${encodeURIComponent(volta)}">✎ Corrigir a ficha</a>`;
  const params = new URLSearchParams({ url: m.url, ...(m.titulo_externo ? { titulo: m.titulo_externo } : {}), ...(m.url_doc ? { fonte_url: m.url_doc } : {}), volta });
  return html`<a class="botao peq" href="#/nova/media?${params}" title="Criar a ficha deste vídeo ou áudio: quem toca, o quê, quando">+ Catalogar</a>`;
}

const OPCOES_REL = [
  ['Família', [['filho_de|dir', 'é filho/a de'], ['filho_de|inv', 'é pai/mãe de'], ['irmao_de|dir', 'é irmão/ã de'], ['conjuge_de|dir', 'é cônjuge de'],
    ['neto_de|dir', 'é neto/a de'], ['neto_de|inv', 'é avô/avó de'], ['sobrinho_de|dir', 'é sobrinho/a de'], ['sobrinho_de|inv', 'é tio/a de'], ['primo_de|dir', 'é primo/a de']]],
  ['Ensino e escola', [['aluno_de|dir', 'foi aluno/a de'], ['aluno_de|inv', 'foi professor/a de'], ['influenciado_por|dir', 'foi influenciado/a por'], ['influenciado_por|inv', 'influenciou']]],
  ['Parcerias musicais', [['tocou_com|dir', 'tocou com'], ['acompanhou|dir', 'acompanhou'], ['acompanhou|inv', 'foi acompanhado/a por'],
    ['membro_de|dir', 'é membro de'], ['membro_de|inv', 'tem como membro']]],
];

export function formNovaRelacao(p) {
  // a relação começa por escolher: nada vem pré-escolhido, e a frase completa aparece por baixo enquanto se preenche
  return dobra('ed-relacao', html`+ Acrescentar uma relação <small>família, ensino ou parceria musical</small>`, html`<form class="caixa-edicao" data-acao="nova-relacao" data-nome="${p.nome}">
    <input type="hidden" name="id" value="${p.id}">
    <div class="linha-campos"><b>${p.nome}</b>
      <select class="campo" name="relacao" required aria-label="Relação"><option value="">— escolha a relação —</option>${OPCOES_REL.map(([g, ops]) => html`<optgroup label="${g}">
        ${ops.map(([v, t]) => html`<option value="${v}">${t}</option>`)}</optgroup>`)}</select>
      ${seletorPessoa({ excluir: p.id, rotulo: 'A outra pessoa' })}</div>
    <p class="frase-relacao" data-frase-relacao aria-live="polite" hidden></p>
    ${camposProva()}
    <label>Nota <small>opcional: porquê, ou um pormenor (ex.: «segundo a família», «no Pico, em 2023»)</small><input class="campo" name="nota"></label>
    <div class="acoes"><button class="botao peq primario">Acrescentar relação</button></div>
  </form>`);
}
