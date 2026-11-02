// Arranque e encaminhamento (#/rota?parametros).
import { carregar, E } from './estado.js';
import { $, $$, html, preferencias, miniatura } from './util.js';
import { iniciarCitacoes, limparRegisto, fecharPainel } from './citacoes.js';
import { iniciarLeitor, tocar, enfileirar } from './leitor.js';
import { iniciarPaleta } from './paleta.js';
import { inicio } from './vistas/inicio.js';
import { listaPessoas, pessoa } from './vistas/pessoas.js';
import { linhagens } from './vistas/linhagens.js';
import { grupos } from './vistas/grupos.js';
import { cronologia } from './vistas/cronologia.js';
import { discografia, gravacao, listaObras, obra, listaInstrumentos, instrumento } from './vistas/musica.js';
import { mediateca } from './vistas/mediateca.js';
import { arquivo, documento } from './vistas/arquivo.js';
import { fontes } from './vistas/fontes.js';
import { blogue, artigo, editarArtigo } from './vistas/blogue.js';
import { contribuidores, contribuir } from './vistas/contribuidores.js';
import { propostas } from './vistas/propostas.js';
import { iniciarEdicao } from './edicao.js';
import { iniciarSeletores } from './seletor.js';
import { iniciarFiltros } from './filtros.js';
import { iniciarFichas, novaFicha, editarFicha } from './fichas.js';
import { separar } from './desambiguar.js';
import { porValidar } from './vistas/validar.js';

const ROTAS = [
  [/^$/, inicio], [/^pessoas$/, listaPessoas], [/^pessoa\/([^/]+)$/, pessoa], [/^grupos$/, grupos], [/^linhagens$/, linhagens],
  [/^cronologia$/, cronologia], [/^discografia$/, discografia], [/^gravacao\/([^/]+)$/, gravacao],
  [/^obras$/, listaObras], [/^obra\/([^/]+)$/, obra], [/^instrumentos$/, listaInstrumentos],
  [/^instrumento\/([^/]+)$/, instrumento], [/^mediateca$/, mediateca], [/^arquivo$/, arquivo],
  [/^doc\/([^/]+)$/, documento], [/^fontes$/, fontes],
  [/^blogue$/, blogue], [/^blogue\/(novo)$/, editarArtigo], [/^blogue\/([^/]+)\/editar$/, editarArtigo], [/^blogue\/([^/]+)$/, artigo],
  [/^contribuidores$/, contribuidores], [/^contribuir$/, contribuir], [/^propostas$/, propostas],
  [/^nova\/([a-z]+)$/, novaFicha], [/^editar\/([a-z]+)\/([^/]+)$/, editarFicha], [/^separar\/([a-z]+)\/([^/]+)$/, separar], [/^validar$/, porValidar],
];

async function encaminhar({ manterPosicao = false } = {}) {
  const [caminho, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const main = $('#vista');
  limparRegisto();
  fecharPainel();
  const secao = caminho.split('/')[0];
  const grupo = secao === 'pessoa' && E.por.pessoas[decodeURIComponent(caminho.split('/')[1] || '')]?.tipo === 'grupo';
  const equivalente = grupo ? 'grupos' : { pessoa: 'pessoas', gravacao: 'discografia', obra: 'obras', instrumento: 'instrumentos',
    arquivo: 'fontes', doc: 'fontes', contribuir: 'contribuidores' }[secao] || secao;
  $$('#nav a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === equivalente));
  for (const [re, vista] of ROTAS) {
    const m = caminho.match(re);
    if (!m) continue;
    const y = window.scrollY;
    if (!manterPosicao) window.scrollTo(0, 0);
    try {
      await vista(main, ...m.slice(1).map(decodeURIComponent), params);
      if (manterPosicao) window.scrollTo(0, y); // depois de gravar no modo de edição, fica onde estava
    } catch (e) {
      console.error(e);
      main.innerHTML = html`<div class="conteudo"><div class="vazio"><h3>Ocorreu um erro ao abrir esta página</h3><p class="mono">${e.message}</p></div></div>`.s;
    }
    return;
  }
  main.innerHTML = '<div class="conteudo"><h1>Página não encontrada</h1><p><a href="#/">Voltar ao início</a></p></div>';
}

function iniciarDelegacao() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tocar]');
    if (t) { e.preventDefault(); tocar(JSON.parse(t.dataset.tocar)); return; }
    const f = e.target.closest('[data-fila]');
    if (f) { e.preventDefault(); enfileirar(JSON.parse(f.dataset.fila)); return; }
    // o MuseScore não deixa incorporar as partituras noutros sites: abrem no próprio MuseScore
    const part = e.target.closest('[data-partitura]');
    if (part) {
      e.preventDefault();
      window.open(part.dataset.ligacao, '_blank', 'noopener');
      return;
    }
    const fig = e.target.closest('[data-lightbox]');
    if (fig) {
      const lb = $('#lightbox');
      const lig = fig.dataset.ligacao;
      lb.innerHTML = html`<img src="${miniatura(fig.dataset.lightbox, 1600)}" alt="" referrerpolicy="no-referrer"><p class="legenda">${fig.dataset.legenda || ''}
        ${lig ? html` · <a href="${lig}" ${lig.startsWith('#') ? '' : 'target="_blank" rel="noopener"'}>ver no post</a>` : ''}
        · <a href="${fig.dataset.lightbox}" target="_blank" rel="noopener">imagem original ↗</a></p>`.s;
      lb.hidden = false;
      return;
    }
    if (e.target.closest('#lightbox') && (!e.target.closest('a') || e.target.getAttribute('href') === 'javascript:void 0')) fecharLightbox();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharLightbox(); });
}

function fecharLightbox() {
  const lb = $('#lightbox');
  lb.hidden = true;
  lb.innerHTML = ''; // pára partituras/áudio que estejam a tocar
}

function iniciarTema() {
  $('#tema').onclick = () => {
    // sem escolha guardada, o tema visível é o do estilo (o Museu é claro por omissão)
    const atual = getComputedStyle(document.documentElement).colorScheme.includes('dark') ? 'dark' : 'light';
    const novo = atual === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem('tema', novo); } catch { /* sem armazenamento */ }
    if (location.hash.startsWith('#/linhagens')) encaminhar(); // o grafo lê as cores do tema
  };
}

/** Menu lateral recolhível: só os ícones, com o nome de cada secção ao passar o rato. A escolha fica guardada. */
function iniciarMenu() {
  const b = $('#recolher-menu');
  const desenhar = () => {
    const recolhido = document.documentElement.classList.contains('menu-recolhido');
    b.setAttribute('aria-expanded', !recolhido);
    b.title = recolhido ? 'Mostrar o menu completo' : 'Recolher o menu (só os ícones)';
    b.querySelector('span').textContent = recolhido ? 'Mostrar menu' : 'Recolher menu';
    // recolhido, os nomes só aparecem ao passar o rato
    $$('#nav a, #abrir-paleta').forEach((a) => { if (recolhido) a.title = a.querySelector('span').textContent; else a.removeAttribute('title'); });
  };
  b.onclick = () => {
    const recolhido = document.documentElement.classList.toggle('menu-recolhido');
    try { localStorage.setItem('menuRecolhido', recolhido); } catch { /* sem armazenamento */ }
    desenhar();
  };
  desenhar();
}

function iniciarIndisponiveis() {
  const b = $('#mostrar-indisponiveis');
  const desenhar = () => {
    b.setAttribute('aria-checked', preferencias.mostrarIndisponiveis);
    b.querySelector('b').textContent = preferencias.mostrarIndisponiveis ? 'visíveis' : 'escondidos';
  };
  b.onclick = () => {
    preferencias.mostrarIndisponiveis = !preferencias.mostrarIndisponiveis;
    try { localStorage.setItem('mostrarIndisponiveis', JSON.stringify(preferencias.mostrarIndisponiveis)); } catch { /* sem armazenamento */ }
    location.reload(); // todo o site (contagens, fichas, mediateca) passa a usar a nova preferência
  };
  desenhar();
}

async function arrancar() {
  iniciarTema();
  iniciarMenu();
  iniciarIndisponiveis();
  iniciarCitacoes();
  iniciarLeitor();
  iniciarPaleta();
  iniciarDelegacao();
  iniciarSeletores();
  iniciarFiltros();
  iniciarFichas();
  $('#vista').innerHTML = '<div class="conteudo"><p class="carregando">A abrir o arquivo</p></div>';
  await carregar();
  iniciarEdicao(() => encaminhar({ manterPosicao: true }));
  window.addEventListener('hashchange', () => encaminhar());
  encaminhar();
}

arrancar();
