// Notas assinadas (✎) de quem edita: o que sabe sem fonte, sobre uma ficha ou sobre um facto. Nunca são fonte.
// Cada nota é de quem a escreveu: só o autor a corrige ou a retira; um editor pode escondê-la (com o motivo), mas não a
// reescreve. Ficam em listas (`notas_editor` na ficha, `notas_editoriais` em cada facto, ver dados/ESQUEMA.md). As notas
// de antes (`nota_editor` de uma ficha, `nota_editorial` de um facto) mostram-se como estavam; só o autor as pode mudar.
import { E, nomeContribuidor } from './estado.js';
import { html, fmtData } from './util.js';
import { editando, sessao, podeAprovar } from './edicao.js';

const idDono = () => Object.values(E.contribuidores).find((c) => c.papel === 'dono')?.id;
/** Quem escreveu a nota antiga de uma ficha: as que não dizem quem são do dono do arquivo (ver dados/ESQUEMA.md). */
export const autorNotaAntiga = (f) => f.nota_editor_por || idDono();
const quem = (autor) => (autor && autor !== idDono() ? `Nota de ${nomeContribuidor(autor)}` : 'Nota do editor');

/** O que identifica uma nota nos botões e nos formulários (a ação confirma que ninguém a mudou entretanto). */
const ids = (o) => ({ alvo: o.alvo, onde: o.onde, indice: o.indice ?? '', facto: o.facto ?? '', 'valor-facto': o.valorFacto ?? '' });
const atributos = (o) => html`${Object.entries(ids(o)).map(([k, v]) => html` data-${k}="${v}"`)}`;

/** Botões de quem pode mudar uma nota: o autor corrige-a ou retira-a; um editor esconde a de outra pessoa (ou volta a mostrá-la). */
function botoes(n, o) {
  const eu = sessao()?.id;
  if (!editando() || !o.alvo) return '';
  if (o.autor === eu) {
    return html`<button type="button" class="botao-nota" data-nota-editar${atributos(o)} data-texto-antes="${n.texto}" title="Corrigir a sua nota">✎</button>
      <button type="button" class="botao-nota" data-acao="retirar-nota"${atributos(o)} data-texto-antes="${n.texto}"
        data-confirmar="Retirar a sua nota?" title="Retirar a sua nota">×</button>`;
  }
  if (!podeAprovar() || o.onde === 'antiga' || o.onde === 'facto-antiga') return '';
  return n.oculta
    ? html`<button type="button" class="botao peq" data-acao="esconder-nota"${atributos(o)} data-texto-antes="${n.texto}" data-mostrar="1">Voltar a mostrar</button>`
    : html`<button type="button" class="botao peq" data-acao="esconder-nota"${atributos(o)} data-texto-antes="${n.texto}"
      data-pedir="Porque esconde esta nota? (fica registado; a nota não se apaga e pode voltar a mostrar-se)" data-pedir-campo="motivo">Esconder</button>`;
}

/** Uma nota escondida só aparece, no modo de edição, ao autor e aos editores (com quem a escondeu e porquê). */
const visivel = (n, autor) => !n.oculta || (editando() && (podeAprovar() || autor === sessao()?.id));
const escondida = (n) => (n.oculta ? html`<small class="nota-escondida">escondida por ${nomeContribuidor(n.oculta.por)} em ${fmtData(n.oculta.data)}${n.oculta.nota ? `: ${n.oculta.nota}` : ''}</small>` : '');
const titulo = (autor, data) => `${quem(autor)}${data ? `, ${fmtData(data)}` : ''}: decisão de quem edita o arquivo, não de uma fonte`;

/** As notas de uma ficha (no topo): a antiga, se houver, e as da lista, cada uma com quem a escreveu. */
export function notasDaFicha(f, alvo) {
  const linha = (n, o) => (visivel(n, o.autor) ? html`<p class="alt nota-editor-linha ${n.oculta ? 'oculta' : ''}" title="${titulo(o.autor, n.data)}">✎ ${quem(o.autor)}: ${n.texto}
    ${n.data && o.onde === 'ficha' ? html`<small class="mudo">· ${fmtData(n.data, true)}</small>` : ''}${escondida(n)}${botoes(n, o)}</p>` : '');
  const antiga = f.nota_editor ? linha({ texto: f.nota_editor, data: f.nota_editor_em }, { alvo, onde: 'antiga', autor: autorNotaAntiga(f) }) : '';
  const lista = (f.notas_editor || []).map((n, i) => linha(n, { alvo, onde: 'ficha', indice: i, autor: n.por }));
  return antiga || lista.some((x) => x) ? html`<div class="notas-editor">${antiga}${lista}</div>` : '';
}

/** As notas da lista de um facto, por baixo dele (a nota antiga, `nota_editorial`, mostra-a formularios.js). Com `editar`
 *  ({ alvo, facto }), os botões de quem as pode mudar, também os da nota antiga para o seu autor. */
export function notasDoFacto(f, editar) {
  const o = (extra) => ({ alvo: editar?.alvo, facto: editar?.facto, valorFacto: f.valor, ...extra });
  const antiga = f.nota_editorial ? botoes(f.nota_editorial, o({ onde: 'facto-antiga', autor: f.nota_editorial.por })) : '';
  const lista = (f.notas_editoriais || []).map((n, i) => (visivel(n, n.por) ? html`<span class="nota-editorial nota-editor-linha ${n.oculta ? 'oculta' : ''}"
    title="Nota de ${nomeContribuidor(n.por)} (${fmtData(n.data)}), não é fonte">✎ ${nomeContribuidor(n.por)}: ${n.texto}${escondida(n)}${botoes(n, o({ onde: 'facto', indice: i, autor: n.por }))}</span>` : ''));
  return html`${antiga}${lista.some((x) => x) ? html`<span class="notas-facto">${lista}</span>` : ''}`;
}

// ------------------------------------------------------------------ formulários no próprio sítio (em vez de prompt())

const campos = (dados) => html`${Object.entries(dados).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v ?? ''}">`)}`;

/** «+ Nota» sobre um facto: o botão ✎ da tabela de factos abre (ou fecha) um formulário por baixo do facto. A nota nova
 *  junta-se às que já lá estão; nunca substitui a de outra pessoa. */
export function abrirNotaNova(b) {
  const linha = b.closest('div');
  const seguinte = linha?.nextElementSibling;
  if (seguinte?.matches('form.nota-forma')) { seguinte.remove(); return; }
  linha.insertAdjacentHTML('afterend', html`<form class="nota-forma caixa-edicao" data-acao="nota-facto">
    ${campos({ alvo: b.dataset.alvo, indice: b.dataset.indice, valorFacto: b.dataset.valorFacto })}
    <label>✎ Nota sobre este facto <small>o que sabe sem fonte (ex.: qual das versões lhe parece certa e porquê). Fica assinada com o seu nome
      e junta-se às notas que já houver.</small>
      <textarea class="campo" name="texto" rows="2" required></textarea></label>
    <div class="acoes"><button class="botao peq primario">Guardar nota</button><button type="button" class="botao peq" data-nota-cancelar>Cancelar</button></div>
  </form>`.s);
  linha.nextElementSibling.querySelector('textarea').focus();
}

/** Corrigir a sua própria nota: o texto passa a um formulário no mesmo sítio. A nota antiga de uma ficha ou de um facto,
 *  ao ser corrigida pelo autor, passa para a lista, assinada por ele com a data de hoje. */
export function abrirEditarNota(b) {
  const nota = b.closest('.nota-editor-linha'); // a nota antiga de um facto não tem caixa própria: o formulário vai por baixo do facto
  const d = b.dataset;
  if (!nota && b.closest('div')?.nextElementSibling?.matches('form.nota-forma')) { b.closest('div').nextElementSibling.remove(); return; }
  const forma = document.createElement('form');
  forma.className = 'nota-forma caixa-edicao';
  forma.dataset.acao = 'editar-nota';
  forma.innerHTML = html`${campos({ alvo: d.alvo, onde: d.onde, indice: d.indice, facto: d.facto, valorFacto: d.valorFacto, textoAntes: d.textoAntes })}
    <label>✎ A sua nota${d.onde.endsWith('antiga') ? html` <small>ao guardar, fica assinada com o seu nome e a data de hoje</small>` : ''}
      <textarea class="campo" name="texto" rows="3" required></textarea></label>
    <div class="acoes"><button class="botao peq primario">Guardar</button><button type="button" class="botao peq" data-nota-cancelar>Cancelar</button></div>`.s;
  forma.querySelector('textarea').value = d.textoAntes || '';
  if (nota) { forma.dataset.antes = nota.outerHTML; nota.replaceWith(forma); } else b.closest('div').after(forma);
  forma.querySelector('textarea').focus();
}

/** «Cancelar» num destes formulários: volta a nota como estava (ou fecha o formulário da nota nova). */
export function fecharNota(b) {
  const forma = b.closest('form.nota-forma');
  if (!forma) return;
  if (forma.dataset.antes) forma.outerHTML = forma.dataset.antes; else forma.remove();
}
