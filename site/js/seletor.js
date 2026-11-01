// Escolher uma pessoa ou grupo numa lista que se filtra ao escrever (retrato, anos, papéis).
// Se a pessoa ainda não tiver ficha, a última opção cria-a. O formulário recebe dois campos:
// «outro» (id de uma ficha existente) ou «nova_pessoa» (nome da ficha a criar).
import { E, PAPEIS, vida, iniciais } from './estado.js';
import { $, $$, html, raw, esc, norm, miniatura } from './util.js';

export function seletorPessoa({ excluir = '', criar = true, placeholder = 'Escreva um nome e escolha na lista' } = {}) {
  return html`<div class="seletor-pessoa" data-seletor-pessoa data-excluir="${excluir}" data-criar="${criar ? '1' : ''}">
    <input class="campo" type="text" placeholder="${placeholder}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false">
    <input type="hidden" name="outro"><input type="hidden" name="nova_pessoa">
    <ul class="seletor-lista" role="listbox" hidden></ul>
  </div>`;
}

const musical = (p) => p.tipo === 'grupo' || (p.papeis || []).some((x) => x !== 'outro');

/** Fichas cujo nome (ou outro nome por que são referidas) tem todas as palavras escritas.
 *  Primeiro as que têm uma palavra a começar pelo que se escreveu, depois as de músicos e grupos. */
function candidatos(consulta, excluir) {
  const q = norm(consulta).trim();
  if (q.length < 2) return [];
  const termos = q.split(/\s+/);
  const res = [];
  for (const p of E.base.pessoas) {
    if (p.id === excluir) continue;
    const nomes = [p.nome, ...(p.nomes_alternativos || [])];
    const achado = nomes.find((n) => termos.every((t) => norm(n).includes(t)));
    if (!achado) continue;
    const inicio = nomes.some((n) => ` ${norm(n)}`.includes(` ${termos[0]}`)) ? 0 : 1;
    res.push({ p, ordem: inicio * 2 + (musical(p) ? 0 : 1), outroNome: achado === p.nome ? '' : achado });
  }
  return res.sort((a, b) => a.ordem - b.ordem || a.p.nome.localeCompare(b.p.nome)).slice(0, 40);
}

function opcao({ p, outroNome }) {
  const img = p.imagens?.[0]?.url;
  const detalhe = [vida(p), p.tipo === 'grupo' ? 'Grupo' : (p.papeis || []).filter((x) => x !== 'outro').map((x) => PAPEIS[x] || x).join(', '),
    outroNome && `referido/a como ${outroNome}`];
  return html`<li role="option" data-id="${p.id}">
    <span class="mini" ${img ? raw(`style="background-image:url('${esc(miniatura(img, 80))}')"`) : ''}>${img ? '' : iniciais(p.nome)}</span>
    <span><b>${p.nome}</b><small>${detalhe.filter(Boolean).join(' · ') || 'sem papel musical registado'}</small></span></li>`;
}

function desenhar(caixa) {
  const entrada = $('input.campo', caixa), lista = $('ul', caixa);
  const texto = entrada.value.trim();
  const achados = candidatos(texto, caixa.dataset.excluir);
  const exato = achados.some(({ p }) => norm(p.nome) === norm(texto));
  const podeCriar = caixa.dataset.criar && texto.length >= 3 && !exato;
  lista.innerHTML = texto.length < 2 ? '<li class="dica">Escreva pelo menos duas letras do nome</li>'
    : html`${achados.map(opcao)}
      ${!achados.length ? html`<li class="dica">Nenhuma ficha com este nome</li>` : ''}
      ${podeCriar ? html`<li role="option" class="criar" data-criar="${texto}">+ Criar a ficha «${texto}»
        <small>se a pessoa ainda não está no arquivo; fica assinada por si e um editor pode completá-la</small></li>` : ''}`.s;
  $$('[role=option]', lista)[0]?.classList.add('ativo');
  lista.hidden = false;
  entrada.setAttribute('aria-expanded', 'true');
}

function fechar(caixa) {
  $('ul', caixa).hidden = true;
  $('input.campo', caixa).setAttribute('aria-expanded', 'false');
}

function escolher(caixa, li) {
  const entrada = $('input.campo', caixa);
  const id = li.dataset.id || '', nova = li.dataset.criar || '';
  caixa.querySelector('[name=outro]').value = id;
  caixa.querySelector('[name=nova_pessoa]').value = nova;
  entrada.value = id ? E.por.pessoas[id].nome : nova;
  caixa.classList.toggle('escolhido', !!id);
  caixa.classList.toggle('nova', !!nova);
  fechar(caixa);
}

export function iniciarSeletores() {
  document.addEventListener('input', (e) => {
    const caixa = e.target.closest('[data-seletor-pessoa]');
    if (!caixa || !e.target.matches('input.campo')) return;
    caixa.querySelector('[name=outro]').value = '';
    caixa.querySelector('[name=nova_pessoa]').value = '';
    caixa.classList.remove('escolhido', 'nova');
    desenhar(caixa);
  });
  document.addEventListener('focusin', (e) => {
    const caixa = e.target.closest('[data-seletor-pessoa]');
    if (caixa && e.target.matches('input.campo') && !caixa.matches('.escolhido, .nova')) desenhar(caixa);
  });
  document.addEventListener('focusout', (e) => {
    const caixa = e.target.closest('[data-seletor-pessoa]');
    if (caixa) setTimeout(() => { if (!caixa.contains(document.activeElement)) fechar(caixa); }, 150);
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
      ops.forEach((o, k) => o.classList.toggle('ativo', k === j));
      ops[j]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && ops[i]) {
      e.preventDefault(); // escolhe a opção em vez de enviar o formulário
      escolher(caixa, ops[i]);
    } else if (e.key === 'Escape') fechar(caixa);
  });
}
