// Marcas de citação [1][2] junto de cada facto e painel lateral com a prova literal.
import { E, TIPOS_FONTE, fonteNome, nomeContribuidor, comArquivo } from './estado.js';
import { $, $$, html, aviso, fmtData, api } from './util.js';
// «Copiar como citação» no leitor do arquivo (P5c): copiar a frase ou o endereço, ou usá-la como prova numa ficha
import { procurarEntidades } from './estado.js';
import { debounce } from './util.js';
import { editando, limparEndereco, fontesDoEndereco } from './edicao.js';

let registo = [];
export const limparRegisto = () => { registo = []; };
/** A citação de uma marca (data-cit); serve para imprimir as fontes da página no fim (app.js). */
export const citacaoRegistada = (k) => registo[k];

/** A frase vem de um comentário de leitor a um post (no arquivo, o documento acaba em «:c<número>»), não do texto dos autores. */
export const deComentario = (c) => /:c\d+$/.test(c?.doc || '');

/** Data do documento citado, lida do endereço dos posts do Blogger (/AAAA/MM/): «post de setembro de 2005».
 *  É a data do post, que pode transcrever um texto mais antigo. */
export function dataDocumento(c) {
  const m = /\.blogspot\.[a-z.]+\/(\d{4})\/(\d{2})\//.exec(c?.url || '');
  return m ? `${deComentario(c) ? 'comentário a um post' : 'post'} de ${fmtData(`${m[1]}-${m[2]}`)}` : '';
}

const nomeMarca = (f) => `${fonteNome(f.fonte)}${deComentario(f) ? ' (comentário de leitor)' : ''}`;

/** Marcas de citação. No computador, um número por fonte [1][2]; nos ecrãs de toque, uma só etiqueta («3 fontes»),
 *  com área para o dedo, que abre as citações todas no painel (o CSS mostra uma ou outra forma). */
export function marcas(fontes = []) {
  if (!fontes.length) return '';
  const ks = fontes.map((f) => registo.push(f) - 1);
  const nomes = fontes.map(nomeMarca);
  const resumo = fontes.length === 1 ? `Fonte: ${nomes[0]}` : `${fontes.length} fontes: ${nomes.join('; ')}`;
  return html`<span class="marcas"><span class="marcas-numeros">${fontes.map((f, i) => html`<button class="marca${deComentario(f) ? ' de-comentario' : ''}"
    data-cit="${ks[i]}" title="${nomes[i]}" aria-label="Fonte ${i + 1}: ${nomes[i]} — ver a citação">${i + 1}</button>`)}</span><button
    class="marca marca-grupo" data-cits="${ks.join(',')}" aria-label="${resumo} — ver ${fontes.length === 1 ? 'a citação' : 'as citações'}">${fontes.length === 1 ? '1 fonte' : `${fontes.length} fontes`}</button>${fontes.every(deComentario) ? html`<span class="so-comentario">comentário de leitor</span>` : ''}</span>`;
}

/** Excerto literal como bloco de citação, com a fonte e a data do documento por baixo. */
export function blocoCitacao(c) {
  const k = registo.push(c) - 1;
  const quando = dataDocumento(c) || (deComentario(c) ? 'comentário de leitor' : '');
  return html`<blockquote>${c.citacao}
    <footer>— ${fonteNome(c.fonte)}${quando ? `, ${quando}` : ''}${c.url ? html` · <a href="${c.url}" target="_blank" rel="noopener">original</a>` : ''}${c.doc && comArquivo() ? html` · <a href="#/doc/${c.doc}">arquivo</a>` : ''}
    · <button class="marca" data-cit="${k}" title="Detalhes da fonte" aria-label="Detalhes da fonte: ${nomeMarca(c)}">i</button></footer></blockquote>`;
}

// o foco vai para o painel ao abrir (o leitor de ecrã lê logo a fonte) e volta à marca que o abriu ao fechar
let origemPainel = null, pedidoPor = null;

export function abrirPainel(conteudo) {
  const p = $('#painel');
  const de = pedidoPor || document.activeElement;
  pedidoPor = null;
  if (!p.contains(de)) origemPainel = de; // ao trocar de citação dentro do painel, a origem fica a mesma
  $('#painel-conteudo').innerHTML = conteudo.toString();
  const titulo = $('#painel-conteudo :is(h1, h2, h3)');
  if (titulo) { titulo.id = 'painel-titulo'; titulo.tabIndex = -1; }
  p.classList.add('aberto');
  p.setAttribute('aria-hidden', 'false');
  (titulo || p).focus({ preventScroll: true });
}
export function fecharPainel() {
  const p = $('#painel');
  const aberto = p.classList.contains('aberto');
  p.classList.remove('aberto');
  p.setAttribute('aria-hidden', 'true');
  if (!aberto) return;
  const atual = document.activeElement;
  if (origemPainel?.isConnected && (!atual || atual === document.body || p.contains(atual))) origemPainel.focus({ preventScroll: true });
  origemPainel = null;
}

/** Estado da prova de uma citação, como o construir.py o deixou no base.json: «verificada», «por-confirmar»,
 *  «nao-arquivado», «nao-encontrada»; uma fonte rejeitada pelos editores deixa de ser prova («fonte-rejeitada»). */
export function estadoCitacao(c) {
  if (E.fontes[c.fonte]?.estado === 'rejeitada') return 'fonte-rejeitada';
  if (c.verificacao) return c.verificacao;
  if (c.verificada) return 'verificada';
  return c.doc ? 'por-confirmar' : 'nao-arquivado';
}
export const PROVA = { // [cor, nome, explicação]; também nas notas ao imprimir (app.js)
  verificada: ['verde', 'verificada', 'O validador confirmou que este texto existe, palavra por palavra, no documento arquivado.'],
  'por-confirmar': ['ouro', 'por confirmar', 'Ainda não foi confirmada na cópia arquivada do documento; confirme no original.'],
  'nao-arquivado': ['ouro', 'documento não arquivado', 'O documento não está no arquivo; confirme no original.'],
  'nao-encontrada': ['vinho', 'não encontrada', 'O validador não encontrou esta frase no documento arquivado; confirme no original.'],
  'fonte-rejeitada': ['vinho', 'fonte rejeitada', 'Os editores rejeitaram esta fonte depois de citada: a frase fica à vista, mas não serve de prova.'],
};

function copiarReferencia(c) {
  const f = E.fontes[c.fonte] || {};
  const t = `«${c.citacao || ''}» — ${f.nome || c.fonte}${c.url ? `, ${c.url}` : ''}`;
  copiar(t, 'Referência copiada');
}

/** Uma citação no painel: a fonte, a frase, de onde vem (post ou comentário, com a data), o estado da prova e as ligações. */
function citacaoNoPainel(c, i, n) {
  const f = E.fontes[c.fonte] || {};
  const cor = { aprovada: 'verde', pendente: 'ouro', rejeitada: 'vinho' }[f.estado] || '';
  const comentario = deComentario(c);
  const quando = dataDocumento(c);
  const original = comentario && !(c.url || '').includes('#') ? `${c.url}#c${c.doc.split(':c')[1]}` : c.url;
  const [corProva, nomeProva, textoProva] = PROVA[estadoCitacao(c)] || [];
  return html`<div class="citacao-painel">
    <p class="sobretitulo">${n > 1 ? `Fonte ${i + 1} de ${n}` : 'Fonte'}</p>
    <h2>${f.nome || c.fonte}</h2>
    <p><span class="selo ${cor}">${f.estado || 'desconhecida'}</span> ${f.tipo ? html`<span class="selo">${TIPOS_FONTE[f.tipo] || f.tipo}</span>` : ''}</p>
    ${comentario ? html`<p class="aviso-comentario">Esta frase vem de um <b>comentário de leitor</b> ao post, não do texto dos autores do blogue.</p>` : ''}
    ${c.citacao ? html`<blockquote>${c.citacao}</blockquote>` : html`<p class="mudo">Sem citação literal (referência de media).</p>`}
    <dl>
      ${comentario ? html`<dt>Comentário</dt><dd data-comentario="${i}">${comArquivo() ? 'a procurar quem o escreveu…' : 'de um leitor do blogue'}</dd>`
        : f.autor ? html`<dt>Autor</dt><dd>${f.autor}</dd>` : ''}
      <dt>Documento</dt><dd>${quando ? html`${quando[0].toUpperCase()}${quando.slice(1)}<br>` : ''}${c.url ? html`<a href="${original}" target="_blank" rel="noopener">${c.url}</a>` : html`<span class="mudo">sem endereço na Internet${c.referencia ? `: ${c.referencia}` : ''}</span>`}</dd>
      ${c.referencia ? html`<dt>Referência</dt><dd>${c.referencia}</dd>` : ''}
      ${c.doc ? html`<dt>Arquivo</dt><dd class="mono">${c.doc}</dd>` : ''}
      ${c.acrescentada ? html`<dt>Acrescentada por</dt><dd>${nomeContribuidor(c.acrescentada.por)}, ${fmtData(c.acrescentada.data)}</dd>` : ''}
    </dl>
    <div class="acoes">
      ${c.doc && comArquivo() ? html`<a class="botao primario peq" href="#/doc/${c.doc}${c.citacao ? '?realce=' + encodeURIComponent(c.citacao.slice(0, 80)) : ''}">Ler no arquivo</a>` : ''}
      <a class="botao peq" href="${original}" target="_blank" rel="noopener">Abrir original</a>
      <button class="botao peq" data-copiar-cit="${i}">Copiar referência</button>
    </div>
    ${c.citacao && nomeProva ? html`<p class="citacao-rodape" style="margin-top:18px"><span class="selo ${corProva}">${nomeProva}</span> ${textoProva}</p>` : ''}</div>`;
}

/** Abre o painel com uma ou várias citações (as várias fontes de um facto, no telemóvel). */
function mostrarCitacoes(lista) {
  lista = lista.filter(Boolean);
  if (!lista.length) return;
  abrirPainel(html`${lista.map((c, i) => citacaoNoPainel(c, i, lista.length))}`);
  const painel = $('#painel');
  $$('[data-copiar-cit]', painel).forEach((b) => b.addEventListener('click', () => copiarReferencia(lista[+b.dataset.copiarCit || 0])));
  // quem escreveu o comentário e quando: só a cópia local tem o índice dos blogues
  if (comArquivo()) lista.forEach((c, i) => {
    const dd = deComentario(c) && $(`[data-comentario="${i}"]`, painel);
    if (!dd) return;
    const escrever = (t) => { if (dd.isConnected) dd.textContent = t; };
    api('doc', { id: c.doc }).then((d) => escrever([d.autor === 'Anonymous' ? 'leitor anónimo' : d.autor || 'leitor sem nome', fmtData(d.data)].filter(Boolean).join(', ')))
      .catch(() => escrever('de um leitor do blogue'));
  });
}
const mostrarCitacao = (c) => mostrarCitacoes([c]);

export function iniciarCitacoes() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.marca[data-cit]');
    if (b) { e.preventDefault(); pedidoPor = b; mostrarCitacao(registo[+b.dataset.cit]); return; }
    const g = e.target.closest('.marca[data-cits]'); // «3 fontes», nos ecrãs de toque
    if (g) { e.preventDefault(); pedidoPor = g; mostrarCitacoes(g.dataset.cits.split(',').map((k) => registo[+k])); return; }
    if (e.target.closest('[data-fechar-painel]')) fecharPainel();
  });
  // o Esc da paleta e da imagem ampliada fecha só essas janelas
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.target.closest?.('#paleta, #lightbox')) fecharPainel(); });
}

// ------------------------------------------------------------------ citar a partir do arquivo («Copiar como citação»)
// No leitor de documentos do arquivo (só na cópia local), ao escolher um troço do texto: copiar a frase, copiar o endereço
// do documento ou, no modo de edição, usá-la como prova numa ficha, que abre com o formulário já preenchido (o endereço e
// a frase; a fonte segue a regra do endereço, edicao.js). A versão para o agente ({fonte, url, doc, citacao}) fica à parte.

/** Copia para a área de transferência e diz se correu bem (no iPhone, por exemplo, a cópia pode ser recusada). */
export async function copiar(texto, feito = 'Copiado') {
  try {
    await navigator.clipboard.writeText(texto);
    aviso(feito);
  } catch {
    aviso(copiarAntigo(texto) ? feito : 'Não foi possível copiar: selecione o texto e copie-o à mão.');
  }
}
function copiarAntigo(texto) { // sem a área de transferência moderna (ou recusada): a maneira antiga
  const t = Object.assign(document.createElement('textarea'), { value: texto, readOnly: true });
  t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.append(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* recusada */ }
  t.remove();
  return ok;
}

let barra = null, aberto = null, escolhido = null; // a barra de citar, o documento à vista ({ artigo, d }) e o troço escolhido
const estreito = () => matchMedia('(max-width: 700px), (pointer: coarse)').matches;
const esconderBarra = () => { if (barra) barra.hidden = true; };

function barraCitar() {
  if (barra) return barra;
  barra = document.createElement('div');
  barra.className = 'barra-citar';
  barra.setAttribute('role', 'toolbar');
  barra.setAttribute('aria-label', 'O texto escolhido');
  barra.hidden = true;
  document.body.append(barra);
  barra.addEventListener('mousedown', (e) => e.preventDefault()); // no computador, carregar na barra não desfaz a seleção
  barra.addEventListener('click', (e) => {
    const b = e.target.closest('[data-citar]');
    if (!b || !escolhido) return;
    const { texto, d } = escolhido;
    getSelection().removeAllRanges();
    esconderBarra();
    if (b.dataset.citar === 'frase') copiar(texto, 'Frase copiada');
    else if (b.dataset.citar === 'endereco') copiar(d.url, 'Endereço copiado');
    else if (b.dataset.citar === 'agente') copiar(JSON.stringify({ fonte: d.fonte, url: d.url, doc: d.doc_id, citacao: texto }, null, 2), 'Copiado para o agente');
    else usarNumaFicha(escolhido);
  });
  // a seleção muda com o rato, com o teclado e, no telemóvel, ao arrastar as pegas: selectionchange apanha todas
  document.addEventListener('selectionchange', debounce(atualizarBarra, 250));
  document.addEventListener('pointerup', (e) => { if (!barra.contains(e.target)) setTimeout(atualizarBarra, 0); });
  window.addEventListener('hashchange', esconderBarra);
  window.addEventListener('resize', esconderBarra);
  return barra;
}

function atualizarBarra() {
  if (!aberto?.artigo.isConnected) return esconderBarra();
  const s = getSelection();
  const texto = s.rangeCount ? s.toString().replace(/\s+/g, ' ').trim() : '';
  if (texto.length < 8 || !aberto.artigo.contains(s.anchorNode) || !aberto.artigo.contains(s.focusNode)) return esconderBarra();
  escolhido = { texto, d: aberto.d };
  barra.innerHTML = html`<button type="button" data-citar="frase">Copiar a frase</button>
    <button type="button" data-citar="endereco">Copiar o endereço</button>
    ${editando() ? html`<button type="button" class="destaque" data-citar="ficha">Usar numa ficha…</button>` : ''}
    <button type="button" class="secundario" data-citar="agente" title="A frase com a fonte, o endereço e o documento, no formato das fichas de dados/">Para o agente</button>`.s;
  barra.hidden = false;
  // no telemóvel fica fixa em baixo (o menu do próprio telemóvel aparece junto da seleção); no computador, por cima dela
  barra.classList.toggle('fixa', estreito());
  if (estreito()) { barra.style.left = barra.style.top = ''; return; }
  // mede-se encostada à esquerda (perto da margem direita encolhia e partia-se em duas linhas, e tapava a seleção);
  // a largura útil é a da página sem a barra de deslocamento (clientWidth; innerWidth inclui-a)
  barra.style.left = barra.style.top = '0px';
  const r = s.getRangeAt(0).getBoundingClientRect(), w = barra.offsetWidth, h = barra.offsetHeight;
  const x = Math.max(8, Math.min(document.documentElement.clientWidth - w - 8, r.left + r.width / 2 - w / 2));
  const y = r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10;
  barra.style.left = `${x + scrollX}px`;
  barra.style.top = `${y + scrollY}px`;
}

/** O leitor de documentos chama isto depois de desenhar o documento `d` (vistas/arquivo.js). «Copiar o endereço», no topo,
 *  copia só o endereço, pronto a colar no formulário de uma ficha. */
export function iniciarCitarSelecao(el, d) {
  const artigo = el.querySelector('.documento');
  if (!artigo) return;
  barraCitar();
  aberto = { artigo, d };
  const ref = el.querySelector('#copiar-ref');
  if (ref) ref.onclick = () => copiar(d.url, 'Endereço copiado');
}

const PARA = { facto: 'um facto', nascimento: 'o nascimento', morte: 'a morte', relacao: 'uma relação' };
const SO_PESSOAS = { nascimento: ['pessoas'], morte: ['pessoas'], relacao: ['pessoas', 'grupos'] };

/** «Usar numa ficha…»: escolhe-se a ficha (e para quê) no painel, e a ficha abre com o formulário preenchido. */
function usarNumaFicha({ texto, d }) {
  const { site } = fontesDoEndereco(d.url);
  const titulo = String(d.titulo || '').replace(/^~/, '') || '(sem título)';
  const doPost = String(d.titulo || '').replace(/^Coment[áa]rio a:\s*/i, '').trim(); // um comentário: «Comentário a: <post>», às vezes sem o post
  const documento = d.tipo === 'comentario' ? (doPost ? `Comentário ao post «${doPost}»` : 'Comentário')
    : `${{ post: 'Post', pagina: 'Página' }[d.tipo] || 'Documento'} «${titulo}»`;
  abrirPainel(html`<p class="sobretitulo">Usar como prova</p><h2>Em que ficha?</h2>
    <blockquote>${texto}</blockquote>
    <p class="mudo">${documento} · ${site?.nome || fonteNome(d.fonte)}</p>
    <form class="usar-numa-ficha" autocomplete="off">
      <fieldset class="opcoes-para"><legend>Para</legend>${Object.entries(PARA).map(([k, t], i) => html`<label class="opcao">
        <input type="radio" name="para" value="${k}" ${i ? '' : 'checked'}> ${t}</label>`)}</fieldset>
      <label>Ficha <small>pessoa, grupo, obra, disco ou instrumento</small>
        <input class="campo" type="search" name="q" placeholder="Escreva um nome ou um título" enterkeyhint="search"></label>
      <ul class="usar-lista"></ul>
    </form>
    <p class="mudo">A ficha abre com o endereço e a frase já no formulário; falta escrever o facto (ou a data) e gravar.</p>`);
  const painel = $('#painel'), form = $('.usar-numa-ficha', painel), lista = $('.usar-lista', painel);
  const desenhar = () => {
    const q = form.q.value.trim(), so = SO_PESSOAS[form.para.value];
    const res = q ? procurarEntidades(q, 40).filter((r) => r.rota && (so ? so.includes(r.grupo) : r.grupo !== 'media')).slice(0, 12) : [];
    lista.innerHTML = res.length ? html`${res.map((r) => html`<li><button type="button" data-usar="${r.rota}"><b>${r.nome}</b>
      <small>${r.tipo}${r.detalhe?.length ? ` · ${r.detalhe.join(' · ')}` : ''}</small></button></li>`)}`.s
      : q ? '<li class="mudo">Nenhuma ficha com esse nome.</li>' : '';
  };
  form.addEventListener('input', debounce(desenhar, 150));
  form.addEventListener('change', desenhar);
  form.addEventListener('submit', (e) => { e.preventDefault(); lista.querySelector('[data-usar]')?.click(); });
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-usar]');
    if (b) preencherFicha(b.dataset.usar, { url: d.url, citacao: texto, para: form.para.value });
  });
  form.q.focus();
}

/** O formulário da ficha aberta para um facto, o nascimento, a morte ou uma relação (vistas das fichas e fichas.js). */
function formularioPara(para) {
  const vista = $('#vista');
  if (para === 'nascimento' || para === 'morte') return $$('form[data-acao="vida"]', vista).find((f) => f.elements.campo?.value === para) || null;
  return $(para === 'relacao' ? 'form[data-acao="nova-relacao"]' : 'form[data-acao="novo-facto"]', vista);
}

/** Abre a ficha e, quando o formulário aparecer, preenche-o: «Está escrito numa fonte», o endereço e a frase. */
function preencherFicha(rota, p) {
  fecharPainel();
  let tempo = null;
  const tentar = () => {
    const form = formularioPara(p.para);
    if (!form) return false;
    preencher(form, p);
    return true;
  };
  if (location.hash === rota && tentar()) return;
  const obs = new MutationObserver(() => { if (tentar()) { obs.disconnect(); clearTimeout(tempo); } });
  obs.observe(document.body, { childList: true, subtree: true }); // cada página tem um #vista novo (app.js)
  tempo = setTimeout(() => { // ficha sem esse formulário (por exemplo, fora do modo de edição); se se saiu dela, nada
    obs.disconnect();
    if (location.hash === rota) copiar(p.citacao, 'Esta ficha não tem esse formulário: a frase ficou copiada, para colar à mão');
  }, 8000);
  location.hash = rota;
}

function preencher(form, { url, citacao }) {
  for (let x = form.parentElement; x; x = x.parentElement) if (x.tagName === 'DETAILS') x.open = true; // a dobra do formulário
  const fs = form.querySelector('.como-sabe'), radio = fs?.querySelector('input[type=radio][value=fonte]');
  if (!radio) return;
  const prefixo = radio.name.replace(/como$/, '');
  const campo = (k, v) => {
    const c = fs.querySelector(`[name="${CSS.escape(prefixo + k)}"]`);
    if (!c) return;
    c.value = v;
    c.dispatchEvent(new Event('input', { bubbles: true }));
  };
  radio.checked = true;
  campo('fonte_url', limparEndereco(url));
  campo('citacao', citacao);
  radio.dispatchEvent(new Event('change', { bubbles: true })); // mostra a fonte e procura a frase no arquivo (edicao.js)
  form.classList.add('preenchido');
  setTimeout(() => form.classList.remove('preenchido'), 2500);
  const primeiro = form.querySelector('[name=valor], [name=dia], .seletor-pessoa input.campo');
  setTimeout(() => { form.scrollIntoView({ block: 'center', behavior: 'smooth' }); primeiro?.focus({ preventScroll: true }); }, 350);
  aviso('O endereço e a frase já estão no formulário: complete-o e grave.');
}
