// Escolher uma pessoa ou grupo numa lista que se filtra ao escrever (retrato, anos, papéis). O mesmo seletor escolhe
// obras e discos pelo título (e pelos outros títulos), sem acentos, com seletorFicha().
// Se a pessoa ainda não tiver ficha, a última opção cria-a. O formulário recebe dois campos:
// «outro» (id de uma ficha existente) ou «nova_pessoa» (nome da ficha a criar). Ao escolher, o elemento
// emite o evento «escolha» (detail: { id, nova, tipo }). «apenas» limita a lista a estas fichas.
// Num formulário, o texto escrito e não escolhido na lista fica assinalado («não foi escolhido na lista»): ao gravar,
// fichas.js pergunta o que fazer com ele, e nada se perde em silêncio.
import { E, PAPEIS, vida, iniciais, nomeDe, parentescoDe } from './estado.js';
import { $, $$, html, raw, esc, miniatura, compararPt, termosProcura, temTodas, fundo } from './util.js';

const TITULO = { pessoas: 'nome', obras: 'titulo', gravacoes: 'titulo' };
/** O nome (pessoas) ou o título (obras e discos) de uma ficha. */
export const tituloDe = (tipo, x) => x?.[TITULO[tipo]] || '';
/** Dois textos iguais sem contar acentos, maiúsculas, pontuação e espaços a mais. */
const igual = (a, b) => termosProcura(a).join(' ') === termosProcura(b).join(' ');

export function seletorPessoa({ excluir = '', criar = true, apenas = null, nome = 'outro', nomeNova = 'nova_pessoa', valor = '',
  placeholder = 'Escreva um nome e escolha na lista', tipo = 'pessoas', rotulo = '' } = {}) {
  const atual = valor && E.por[tipo]?.[valor];
  const texto = atual ? tituloDe(tipo, atual) : '';
  return html`<div class="seletor-pessoa${atual ? ' escolhido' : ''}" data-seletor-pessoa data-tipo="${tipo}" data-excluir="${excluir}"
    data-criar="${criar && tipo === 'pessoas' ? '1' : ''}" data-apenas="${apenas ? apenas.join(',') : ''}" data-rotulo="${rotulo}"
    data-escolhido-id="${atual ? valor : ''}" data-escolhido-texto="${texto}">
    <input class="campo" type="text" placeholder="${placeholder}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" value="${texto}">
    <input type="hidden" name="${nome}" data-papel="id" value="${atual ? valor : ''}"><input type="hidden" name="${nomeNova}" data-papel="nova">
    <input type="hidden" name="${nomeNova}_papel" data-papel="papel-nova">
    <ul class="seletor-lista" role="listbox" hidden></ul>
    ${criar && tipo === 'pessoas' ? html`<button type="button" class="botao-ligacao criar-pessoa" data-criar-pessoa>Não está na lista? Criar pessoa nova</button>` : ''}
    <small class="aviso-escolha" hidden>Não foi escolhido na lista: escolha uma das opções que aparecem ao escrever, ou apague o texto.</small>
  </div>`;
}

/** O mesmo seletor para uma obra ou um disco, escolhidos pelo título (aqui não se criam fichas). */
export const seletorFicha = (tipo, opcoes = {}) => seletorPessoa({ placeholder: 'Escreva o título e escolha na lista', ...opcoes, criar: false, tipo });

const musical = (p) => p.tipo === 'grupo' || (p.papeis || []).some((x) => x !== 'outro');
const nomesDe = (tipo, x) => (tipo === 'pessoas' ? [x.nome, ...(x.nomes_alternativos || [])]
  : [x.titulo, ...(x.titulos_alternativos || [])]).filter(Boolean);

/** Fichas cujo nome ou título (ou outro nome por que são referidas) tem todas as palavras escritas, por qualquer ordem.
 *  Primeiro as que têm uma palavra a começar pelo que se escreveu, depois (nas pessoas) as de músicos e grupos. */
function candidatos(tipo, consulta, excluir = '', apenas = null) {
  const termos = termosProcura(consulta);
  if (termos.join('').length < 2) return [];
  const res = [];
  for (const x of E.base[tipo] || []) {
    if (x.id === excluir || (apenas && !apenas.has(x.id))) continue;
    const nomes = nomesDe(tipo, x);
    const achado = nomes.find((n) => temTodas(n, termos));
    if (!achado) continue;
    const inicio = nomes.some((n) => ` ${termosProcura(n).join(' ')}`.includes(` ${termos[0]}`)) ? 0 : 1;
    res.push({ x, tipo, ordem: inicio * 2 + (tipo !== 'pessoas' || musical(x) ? 0 : 1), outroNome: achado === nomes[0] ? '' : achado });
  }
  return res.sort((a, b) => a.ordem - b.ordem || compararPt(tituloDe(tipo, a.x), tituloDe(tipo, b.x))).slice(0, 40);
}

/** As fichas mais parecidas com um texto escrito (para propor a escolha certa a quem não escolheu na lista). */
export const candidatosDe = (tipo, texto, limite = 3) => candidatos(tipo, texto).slice(0, limite).map(({ x }) => x);

/** O que distingue uma ficha das outras com o mesmo nome: anos e papéis; autores e ano; ano, editora e intérpretes. */
export function detalheFicha(tipo, x) {
  if (tipo === 'obras') return [(x.musica || []).map(nomeDe).join(', '), x.ano].filter(Boolean).join(' · ');
  if (tipo === 'gravacoes') return [x.ano, x.editora, (x.interpretes || []).slice(0, 3).map((i) => nomeDe(i.pessoa)).join(', ')].filter(Boolean).join(' · ');
  return [vida(x), x.tipo === 'grupo' ? 'Grupo' : (x.papeis || []).filter((p) => p !== 'outro').map((p) => PAPEIS[p] || p).join(', '),
    parentescoDe(x)?.texto].filter(Boolean).join(' · '); // familiares sem papel musical: «cônjuge de …», para distinguir as várias «Isabel»
}

function opcao({ x, tipo, outroNome }) {
  const img = tipo === 'pessoas' ? x.imagens?.[0]?.url : x.capa?.url;
  const detalhe = [detalheFicha(tipo, x), outroNome && (tipo === 'pessoas' ? `referido/a como ${outroNome}` : `também: ${outroNome}`)];
  return html`<li role="option" data-id="${x.id}">
    <span class="mini" ${img ? raw(`style="background-image:url('${fundo(miniatura(img, 80))}')"`) : ''}>${img ? '' : tipo === 'pessoas' ? iniciais(x.nome) : '♪'}</span>
    <span><b>${tituloDe(tipo, x)}</b><small>${detalhe.filter(Boolean).join(' · ') || (tipo === 'pessoas' ? 'sem papel musical registado' : '')}</small></span></li>`;
}

let nSeletores = 0;
/** A opção escolhida com as setas: a classe para o desenho; aria-selected e aria-activedescendant para o leitor de ecrã. */
function ativar(caixa, j) {
  const entrada = $('input.campo', caixa), lista = $('ul', caixa), ops = $$('[role=option]', lista);
  lista.id ||= `seletor${++nSeletores}`;
  entrada.setAttribute('aria-controls', lista.id);
  ops.forEach((o, k) => { o.id ||= `${lista.id}-o${k}`; o.classList.toggle('ativo', k === j); o.setAttribute('aria-selected', String(k === j)); });
  if (ops[j]) entrada.setAttribute('aria-activedescendant', ops[j].id); else entrada.removeAttribute('aria-activedescendant');
}

function desenhar(caixa) {
  const entrada = $('input.campo', caixa), lista = $('ul', caixa);
  const texto = entrada.value.trim(), tipo = caixa.dataset.tipo || 'pessoas', pessoas = tipo === 'pessoas';
  const achados = candidatos(tipo, texto, caixa.dataset.excluir, caixa.dataset.apenas ? new Set(caixa.dataset.apenas.split(',')) : null);
  // com uma ficha deste nome (ou com este entre os outros nomes: «Zeca Afonso» é José Afonso), não se propõe criar outra
  const exato = achados.some(({ x }) => nomesDe(tipo, x).some((n) => igual(n, texto)));
  const podeCriar = caixa.dataset.criar && texto.length >= 3 && !exato;
  lista.innerHTML = texto.length < 2 ? html`<li class="dica">Escreva pelo menos duas letras ${pessoas ? 'do nome' : 'do título'}</li>`.s
    : html`${achados.map(opcao)}
      ${!achados.length ? html`<li class="dica">Nenhuma ficha com ${pessoas ? 'este nome' : 'este título'}</li>` : ''}
      ${podeCriar ? html`<li role="option" class="criar" data-criar="${texto}">+ Criar a ficha «${texto}»
        <small>se a pessoa ainda não está no arquivo; fica assinada por si e um editor pode completá-la</small></li>` : ''}`.s;
  ativar(caixa, 0);
  lista.hidden = false;
  entrada.setAttribute('aria-expanded', 'true');
}

function fechar(caixa) {
  $('ul', caixa).hidden = true;
  $('input.campo', caixa).setAttribute('aria-expanded', 'false');
  $('input.campo', caixa).removeAttribute('aria-activedescendant');
}

let avisos = 0;
/** Assinala (ou deixa de assinalar) texto escrito que não foi escolhido na lista. */
function assinalar(caixa, sim) {
  const entrada = $('input.campo', caixa), aviso = $('.aviso-escolha', caixa);
  caixa.classList.toggle('por-escolher', sim);
  if (!aviso) return;
  aviso.hidden = !sim;
  aviso.id ||= `aviso-escolha-${++avisos}`;
  if (sim) { entrada.setAttribute('aria-invalid', 'true'); entrada.setAttribute('aria-describedby', aviso.id); }
  else { entrada.removeAttribute('aria-invalid'); entrada.removeAttribute('aria-describedby'); }
}

/** O seletor tem texto escrito que não corresponde a nenhuma escolha (nem a uma ficha a criar)? */
export const porEscolher = (caixa) => !!$('input.campo', caixa).value.trim()
  && !caixa.querySelector('[data-papel=id]').value && !caixa.querySelector('[data-papel=nova]').value;

/** Acerta as cores e a memória da escolha pelos valores atuais (depois de recuperar um rascunho, por exemplo). */
export function sincronizarSeletor(caixa) {
  const tipo = caixa.dataset.tipo || 'pessoas';
  const id = caixa.querySelector('[data-papel=id]').value, nova = caixa.querySelector('[data-papel=nova]').value;
  const valido = id && E.por[tipo]?.[id];
  Object.assign(caixa.dataset, { escolhidoId: valido ? id : '', escolhidoNova: nova, escolhidoTexto: valido ? $('input.campo', caixa).value : nova });
  caixa.classList.toggle('escolhido', !!valido);
  caixa.classList.toggle('nova', !!nova);
  assinalar(caixa, porEscolher(caixa) && !!caixa.closest('form[data-acao]'));
}

/** Escolhe uma ficha (id) ou a ficha nova a criar (nova), como quem toca na opção da lista; sem nenhum dos dois,
 *  deixa o campo em branco. */
export function escolherEm(caixa, { id = '', nova = '' } = {}) {
  const entrada = $('input.campo', caixa), tipo = caixa.dataset.tipo || 'pessoas';
  if (id && !E.por[tipo]?.[id]) id = '';
  caixa.querySelector('[data-papel=id]').value = id;
  caixa.querySelector('[data-papel=nova]').value = nova;
  entrada.value = id ? tituloDe(tipo, E.por[tipo][id]) : nova;
  Object.assign(caixa.dataset, { escolhidoId: id, escolhidoNova: nova, escolhidoTexto: entrada.value });
  caixa.classList.toggle('escolhido', !!id);
  caixa.classList.toggle('nova', !!nova);
  assinalar(caixa, false);
  fechar(caixa);
  caixa.dispatchEvent(new CustomEvent('escolha', { bubbles: true, detail: { id, nova, tipo } }));
}

/** Esvazia o seletor e esquece a escolha (nas listas de etiquetas, para o nome seguinte). */
export function limparSeletor(caixa) {
  $('input.campo', caixa).value = '';
  $$('input[type=hidden]', caixa).forEach((x) => { x.value = ''; });
  Object.assign(caixa.dataset, { escolhidoId: '', escolhidoNova: '', escolhidoTexto: '' });
  caixa.classList.remove('escolhido', 'nova');
  assinalar(caixa, false);
}

/** Janela para criar a pessoa que falta sem sair do formulário: mostra logo as fichas parecidas (pode ser uma delas) e
 *  deixa escolher o papel. A ficha cria-se com o resto, ao gravar. */
async function criarPessoa(caixa, texto = '') {
  const { perguntar } = await import('./edicao.js');
  let existente = '';
  const janela = perguntar({ titulo: 'Criar pessoa nova', sim: 'Criar', nao: 'Voltar', corpo: html`
    <label>Nome da pessoa <input class="campo" name="nome" required value="${texto}" autocomplete="off" data-nome-novo></label>
    <div class="parecidas" data-parecidas></div>
    <label>Atributo <small>opcional: guitarrista, cantor…</small><select class="campo" name="papel"><option value="">—</option>
      ${Object.entries(PAPEIS).map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select></label>
    <p class="mudo">Fica uma ficha simples, assinada por si. Depois pode completá-la na própria ficha.</p>` });
  const d = document.querySelector('dialog.dialogo-edicao[open]'), nome = $('[data-nome-novo]', d), lista = $('[data-parecidas]', d);
  const parecidas = () => {
    const achados = candidatos('pessoas', nome.value, caixa.dataset.excluir).slice(0, 5);
    lista.innerHTML = achados.length ? html`<p class="mudo">Será uma destas? Se for, escolha-a:</p>
      <ul class="seletor-lista parecidas-lista">${achados.map(opcao)}</ul>`.s : '';
  };
  nome.addEventListener('input', parecidas);
  lista.addEventListener('click', (e) => {
    const li = e.target.closest('[data-id]');
    if (li) { existente = li.dataset.id; d.close('nao'); }
  });
  parecidas();
  nome.focus();
  const r = await janela;
  if (existente) { escolherEm(caixa, { id: existente }); return; }
  if (!r) return;
  escolherEm(caixa, { nova: r.nome.trim() });
  $('[data-papel=papel-nova]', caixa).value = r.papel || '';
}

const escolher = (caixa, li) => {
  if (li.dataset.criar) { fechar(caixa); criarPessoa(caixa, li.dataset.criar); } else escolherEm(caixa, { id: li.dataset.id || '' });
};

export function iniciarSeletores() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-criar-pessoa]');
    if (!b) return;
    e.preventDefault();
    const caixa = b.closest('[data-seletor-pessoa]');
    criarPessoa(caixa, $('input.campo', caixa).value.trim());
  });
  document.addEventListener('input', (e) => {
    const caixa = e.target.closest('[data-seletor-pessoa]');
    if (!caixa || !e.target.matches('input.campo')) return;
    // voltar a ter exatamente o texto escolhido mantém a escolha: tocar no nome e mudar uma letra não a perde de vez
    const mesma = !!caixa.dataset.escolhidoTexto && igual(e.target.value, caixa.dataset.escolhidoTexto);
    caixa.querySelector('[data-papel=id]').value = mesma ? caixa.dataset.escolhidoId || '' : '';
    caixa.querySelector('[data-papel=nova]').value = mesma ? caixa.dataset.escolhidoNova || '' : '';
    caixa.classList.toggle('escolhido', mesma && !!caixa.dataset.escolhidoId);
    caixa.classList.toggle('nova', mesma && !!caixa.dataset.escolhidoNova);
    assinalar(caixa, false);
    desenhar(caixa);
  });
  document.addEventListener('focusin', (e) => {
    const caixa = e.target.closest('[data-seletor-pessoa]');
    if (caixa && e.target.matches('input.campo') && !caixa.matches('.escolhido, .nova')) desenhar(caixa);
  });
  document.addEventListener('focusout', (e) => {
    const caixa = e.target.closest('[data-seletor-pessoa]');
    if (caixa) {
      setTimeout(() => {
        if (caixa.contains(document.activeElement)) return;
        fechar(caixa);
        // num formulário, o que ficou escrito sem ser escolhido fica à vista (não seria gravado)
        if (caixa.closest('form[data-acao]')) assinalar(caixa, porEscolher(caixa));
      }, 150);
    }
  });
  document.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-seletor-pessoa] [role=option]');
    if (!li) return;
    e.preventDefault(); // antes de o campo perder o foco
    escolher(li.closest('[data-seletor-pessoa]'), li);
  });
  document.addEventListener('keydown', (e) => {
    const caixa = e.target.closest('[data-seletor-pessoa]');
    const lista = caixa && $('ul', caixa);
    if (!caixa || !e.target.matches('input.campo') || lista.hidden) return;
    const ops = $$('[role=option]', lista);
    const i = ops.findIndex((o) => o.classList.contains('ativo'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const j = Math.max(0, Math.min(ops.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      ativar(caixa, j);
      ops[j]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && ops[i]) {
      e.preventDefault(); // escolhe a opção em vez de enviar o formulário
      escolher(caixa, ops[i]);
    } else if (e.key === 'Escape') fechar(caixa);
  });
}
