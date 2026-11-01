// Formulários e marcas do modo de edição usados nas fichas (as ações estão em edicao.js).
import { E, TIPOS_FONTE, nomeContribuidor } from './estado.js';
import { html, fmtData } from './util.js';
import { podeAprovar, sessao } from './edicao.js';
import { seletorPessoa } from './seletor.js';

/** Sinal ✎ de uma contribuição assinada (sem fonte), com quem, quando e porquê no título. */
export function marcaEditorial(a, oque = 'Indicado') {
  if (!a) return '';
  const titulo = `${oque} por ${nomeContribuidor(a.por)} em ${fmtData(a.data)}${a.nota ? ` — ${a.nota}` : ''}. Decisão editorial, sem fonte.`;
  return html`<span class="marca-editorial" title="${titulo}">✎</span>`;
}

/** Nota assinada sobre um facto («✎ Nome: texto»). */
export const notaEditorial = (n) => (n ? html` <span class="nota-editorial" title="Nota de ${nomeContribuidor(n.por)} (${fmtData(n.data)}), não é fonte">✎ ${nomeContribuidor(n.por)}: ${n.texto}</span>` : '');

export function caixaTopo(p) {
  const revisto = p.estado_revisao === 'revisto';
  return html`<form class="caixa-edicao" data-acao="nota-editor">
    <input type="hidden" name="id" value="${p.id}">
    <label for="nota-editor">✎ Nota do editor <small>o que sabe sem fonte (como é conhecido, uma identificação, uma dúvida). Fica assinada com o seu nome.</small></label>
    <textarea class="campo" id="nota-editor" name="texto" rows="3">${p.nota_editor || ''}</textarea>
    <div class="acoes"><button class="botao peq primario">Guardar nota</button>
      ${podeAprovar() ? html`<button type="button" class="botao peq" data-acao="revisao" data-id="${p.id}" data-estado="${revisto ? 'rascunho' : 'revisto'}">
        ${revisto ? 'Voltar a pôr como rascunho' : 'Marcar a ficha como revista'}</button>` : ''}
      ${p.editorial && !p.factos?.length && (p.editorial.por === sessao()?.id || podeAprovar())
        ? html`<button type="button" class="botao peq" data-acao="apagar-ficha" data-id="${p.id}"
          data-confirmar="Apagar a ficha «${p.nome}» e as relações indicadas para ela?">Apagar esta ficha</button>` : ''}</div>
  </form>`;
}

/** «Como sabe?»: por conhecimento próprio (assinado ✎) ou por uma fonte aprovada, com a frase copiada à letra. */
export function camposFonte() {
  const grupos = {};
  E.base.fontes.filter((f) => f.estado === 'aprovada' && (f.uso || []).includes('factos'))
    .sort((a, b) => a.nome.localeCompare(b.nome)).forEach((f) => (grupos[f.tipo] ||= []).push(f));
  return html`<fieldset class="como-sabe"><legend>Como sabe?</legend>
    <div class="linha-campos">
      <label class="opcao"><input type="radio" name="como" value="proprio" checked> Por conhecimento próprio <small>(fica assinado ✎)</small></label>
      <label class="opcao"><input type="radio" name="como" value="fonte"> Está numa fonte <small>(livro, artigo, jornal, site, disco…)</small></label>
    </div>
    <div class="com-fonte">
      <label>Fonte <small>Não está na lista? <a href="#/fontes">Proponha-a em Fontes e método</a>: depois de um editor a aprovar, já a pode citar.</small>
        <select class="campo" name="fonte"><option value="">Escolha a fonte…</option>
          ${Object.entries(grupos).map(([t, lista]) => html`<optgroup label="${TIPOS_FONTE[t] || t}">
            ${lista.map((f) => html`<option value="${f.id}">${f.nome}${f.autor ? ` — ${f.autor}` : ''}</option>`)}</optgroup>`)}</select></label>
      <label>Endereço da página <small>o artigo, o post, a ficha do livro; em branco, fica o endereço geral da fonte</small>
        <input class="campo" type="url" name="fonte_url" placeholder="https://…"></label>
      <label>Frase da fonte, copiada à letra <small>é a prova; se a página estiver no arquivo, o validador confirma-a palavra por palavra</small>
        <textarea class="campo" name="citacao" rows="2"></textarea></label>
      <label>Página ou referência <small>opcional (ex.: p. 45, edição de 1987)</small><input class="campo" name="referencia"></label>
    </div></fieldset>`;
}

export function formNovaImagem(id) {
  return html`<form class="caixa-edicao" data-acao="nova-imagem">
    <h3>Acrescentar uma fotografia</h3>
    <input type="hidden" name="id" value="${id}">
    <label>Endereço da imagem <small>no browser: botão direito sobre a imagem › «Copiar endereço da imagem»</small>
      <input class="campo" name="url" type="url" required placeholder="https://…/fotografia.jpg"></label>
    <label>Página onde a fotografia está publicada <small>para se saber de onde vem (o arquivo não guarda cópias)</small>
      <input class="campo" name="origem" type="url" required placeholder="https://…"></label>
    <label>Legenda <input class="campo" name="legenda" placeholder="Ex.: Carlos Paredes no Coliseu, 1983"></label>
    <label>Nota <small>opcional: como sabe que é esta pessoa, autor da fotografia</small><input class="campo" name="nota"></label>
    <label class="opcao"><input type="checkbox" name="retrato" value="1"> Usar como retrato da ficha</label>
    <div class="acoes"><button class="botao peq primario">Acrescentar fotografia</button></div>
  </form>`;
}

const OPCOES_REL = [
  ['Família', [['filho_de|dir', 'é filho/a de'], ['filho_de|inv', 'é pai/mãe de'], ['irmao_de|dir', 'é irmão/ã de'], ['conjuge_de|dir', 'é cônjuge de'],
    ['neto_de|dir', 'é neto/a de'], ['neto_de|inv', 'é avô/avó de'], ['sobrinho_de|dir', 'é sobrinho/a de'], ['sobrinho_de|inv', 'é tio/a de'], ['primo_de|dir', 'é primo/a de']]],
  ['Ensino e escola', [['aluno_de|dir', 'foi aluno/a de'], ['aluno_de|inv', 'foi professor/a de'], ['influenciado_por|dir', 'foi influenciado/a por'], ['influenciado_por|inv', 'influenciou']]],
  ['Parcerias musicais', [['tocou_com|dir', 'tocou com'], ['acompanhou|dir', 'acompanhou'], ['acompanhou|inv', 'foi acompanhado/a por'],
    ['membro_de|dir', 'é membro de'], ['membro_de|inv', 'tem como membro']]],
];

export function formNovaRelacao(p) {
  return html`<form class="caixa-edicao" data-acao="nova-relacao">
    <h3>Acrescentar uma relação <small>família, ensino ou parceria musical</small></h3>
    <input type="hidden" name="id" value="${p.id}">
    <div class="linha-campos"><b>${p.nome}</b>
      <select class="campo" name="relacao" required>${OPCOES_REL.map(([g, ops]) => html`<optgroup label="${g}">
        ${ops.map(([v, t]) => html`<option value="${v}">${t}</option>`)}</optgroup>`)}</select>
      ${seletorPessoa({ excluir: p.id })}</div>
    ${camposFonte()}
    <label>Nota <small>opcional: porquê, ou um pormenor (ex.: «segundo a família», «no Pico, em 2023»)</small><input class="campo" name="nota"></label>
    <div class="acoes"><button class="botao peq primario">Acrescentar relação</button></div>
  </form>`;
}
