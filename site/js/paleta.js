// Paleta de pesquisa rápida (Ctrl+K ou /): salta para qualquer ficha ou pesquisa o arquivo.
import { procurarEntidades, comArquivo } from './estado.js';
import { $, html } from './util.js';

let itens = [], sel = 0;

function desenhar() {
  const q = $('#paleta-input').value.trim();
  const ents = procurarEntidades(q, 9).map((r) => ({ rotulo: r.nome, tipo: r.tipo, rota: r.rota }));
  // a pesquisa nos blogues só existe na cópia local do arquivo
  const arquivo = comArquivo();
  itens = q ? [...ents,
    ...(arquivo ? [{ rotulo: html`Pesquisar «${q}» no arquivo dos blogues`, tipo: 'Arquivo', rota: `#/arquivo?q=${encodeURIComponent(q)}` }] : []),
    { rotulo: html`Procurar «${q}» na mediateca`, tipo: 'Mediateca', rota: `#/mediateca?q=${encodeURIComponent(q)}` }]
    : [...(arquivo ? [{ rotulo: 'Arquivo dos blogues', tipo: 'Ir para', rota: '#/arquivo' }] : []), { rotulo: 'Mediateca', tipo: 'Ir para', rota: '#/mediateca' },
      { rotulo: 'Linhagens', tipo: 'Ir para', rota: '#/linhagens' }, { rotulo: 'Fontes e método', tipo: 'Ir para', rota: '#/fontes' }];
  sel = Math.min(sel, itens.length - 1);
  $('#paleta-lista').innerHTML = html`${itens.map((it, i) => html`<li data-i="${i}" aria-selected="${i === sel}">${it.rotulo}<span class="tipo">${it.tipo}</span></li>`)}`.s;
}

export function abrirPaleta() {
  $('#paleta').hidden = false;
  const inp = $('#paleta-input');
  inp.value = ''; sel = 0; desenhar(); inp.focus();
}
const fechar = () => { $('#paleta').hidden = true; };
const ir = (i) => { if (itens[i]) { location.hash = itens[i].rota; fechar(); } };

export function iniciarPaleta() {
  $('#abrir-paleta').onclick = abrirPaleta;
  $('#paleta-input').oninput = () => { sel = 0; desenhar(); };
  $('#paleta-input').onkeydown = (e) => {
    if (e.key === 'ArrowDown') { sel = (sel + 1) % itens.length; desenhar(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = (sel - 1 + itens.length) % itens.length; desenhar(); e.preventDefault(); }
    else if (e.key === 'Enter') ir(sel);
    else if (e.key === 'Escape') fechar();
  };
  $('#paleta-lista').onclick = (e) => { const li = e.target.closest('li[data-i]'); if (li) ir(+li.dataset.i); };
  $('#paleta').onclick = (e) => { if (e.target.id === 'paleta') fechar(); };
  document.addEventListener('keydown', (e) => {
    const escrever = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !escrever)) { e.preventDefault(); abrirPaleta(); }
  });
}
