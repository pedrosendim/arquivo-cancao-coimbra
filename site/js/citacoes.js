// Marcas de citação [1][2] junto de cada facto e painel lateral com a prova literal.
import { E, fonteNome, nomeContribuidor, comArquivo } from './estado.js';
import { $, html, aviso, fmtData } from './util.js';

let registo = [];
export const limparRegisto = () => { registo = []; };

export function marcas(fontes = []) {
  if (!fontes.length) return '';
  return html`<span class="marcas">${fontes.map((f, i) => {
    const k = registo.push(f) - 1;
    return html`<button class="marca" data-cit="${k}" title="${fonteNome(f.fonte)}">${i + 1}</button>`;
  })}</span>`;
}

/** Excerto literal como bloco de citação, com a fonte por baixo. */
export function blocoCitacao(c) {
  const k = registo.push(c) - 1;
  return html`<blockquote>${c.citacao}
    <footer>— ${fonteNome(c.fonte)} · <a href="${c.url}" target="_blank" rel="noopener">original</a>${c.doc && comArquivo() ? html` · <a href="#/doc/${c.doc}">arquivo</a>` : ''}
    · <button class="marca" data-cit="${k}" title="Detalhes da fonte">i</button></footer></blockquote>`;
}

export function abrirPainel(conteudo) {
  $('#painel-conteudo').innerHTML = conteudo.toString();
  const p = $('#painel');
  p.classList.add('aberto');
  p.setAttribute('aria-hidden', 'false');
}
export function fecharPainel() {
  const p = $('#painel');
  p.classList.remove('aberto');
  p.setAttribute('aria-hidden', 'true');
}

function mostrarCitacao(c) {
  const f = E.fontes[c.fonte] || {};
  const estado = { aprovada: 'verde', pendente: 'ouro', rejeitada: 'vinho' }[f.estado] || '';
  abrirPainel(html`
    <p class="sobretitulo">Fonte</p>
    <h2>${f.nome || c.fonte}</h2>
    <p><span class="selo ${estado}">${f.estado || 'desconhecida'}</span> <span class="selo">${f.tipo || ''}</span></p>
    ${c.citacao ? html`<blockquote>${c.citacao}</blockquote>` : html`<p class="mudo">Sem citação literal (referência de media).</p>`}
    <dl>
      ${f.autor ? html`<dt>Autor</dt><dd>${f.autor}</dd>` : ''}
      <dt>Documento</dt><dd><a href="${c.url}" target="_blank" rel="noopener">${c.url}</a></dd>
      ${c.referencia ? html`<dt>Referência</dt><dd>${c.referencia}</dd>` : ''}
      ${c.doc ? html`<dt>Arquivo</dt><dd class="mono">${c.doc}</dd>` : ''}
      ${c.acrescentada ? html`<dt>Acrescentada por</dt><dd>${nomeContribuidor(c.acrescentada.por)}, ${fmtData(c.acrescentada.data)}</dd>` : ''}
    </dl>
    <div class="acoes">
      ${c.doc && comArquivo() ? html`<a class="botao primario peq" href="#/doc/${c.doc}${c.citacao ? '?realce=' + encodeURIComponent(c.citacao.slice(0, 80)) : ''}">Ler no arquivo</a>` : ''}
      <a class="botao peq" href="${c.url}" target="_blank" rel="noopener">Abrir original</a>
      <button class="botao peq" data-copiar-cit>Copiar referência</button>
    </div>
    <p class="citacao-rodape" style="margin-top:22px">${c.verificada
      ? html`<span class="selo verde">verificada</span> O validador confirmou que este texto existe, palavra por palavra, no documento arquivado.`
      : c.citacao ? html`<span class="selo ouro">não verificada</span> O documento não está no arquivo local; confirme no original.` : ''}</p>`);
  $('[data-copiar-cit]', $('#painel'))?.addEventListener('click', () => {
    const t = `«${c.citacao || ''}» — ${f.nome || c.fonte}, ${c.url}`;
    navigator.clipboard?.writeText(t).then(() => aviso('Referência copiada'));
  });
}

export function iniciarCitacoes() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.marca[data-cit]');
    if (b) { e.preventDefault(); mostrarCitacao(registo[+b.dataset.cit]); return; }
    if (e.target.closest('[data-fechar-painel]')) fecharPainel();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharPainel(); });
}
