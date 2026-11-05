// Arranque e encaminhamento (#/rota?parametros).
import { carregar, E, fonteNome } from './estado.js';
import { $, $$, html, raw, preferencias, miniatura, fmtData } from './util.js';
import { iniciarCitacoes, limparRegisto, fecharPainel, citacaoRegistada, estadoCitacao, PROVA } from './citacoes.js';
import { iniciarLeitor, tocar, enfileirar } from './leitor.js';
import { iniciarPaleta } from './paleta.js';
import { inicio } from './vistas/inicio.js';
import { listaPessoas, pessoa } from './vistas/pessoas.js';
import { linhagens } from './vistas/linhagens.js';
import { grupos } from './vistas/grupos.js';
import { cronologia } from './vistas/cronologia.js';
import { discografia, gravacao, listaObras, obra, listaInstrumentos, instrumento } from './vistas/musica.js';
import { mediateca } from './vistas/mediateca.js';
import { procurar } from './vistas/procurar.js';
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
import { historico } from './historico.js';
import { alteracoes } from './vistas/alteracoes.js';
import { entrar, acesso } from './vistas/conta.js';
import { contacto, mensagens } from './vistas/contacto.js';

const ROTAS = [
  [/^alteracoes$/, alteracoes], [/^entrar$/, entrar], [/^acesso\/([^/]+)$/, acesso], [/^contacto$/, contacto], [/^mensagens$/, mensagens],
  [/^procurar$/, procurar],
  [/^$/, inicio], [/^pessoas$/, listaPessoas], [/^pessoa\/([^/]+)$/, pessoa], [/^grupos$/, grupos], [/^linhagens$/, linhagens],
  [/^cronologia$/, cronologia], [/^discografia$/, discografia], [/^gravacao\/([^/]+)$/, gravacao],
  [/^obras$/, listaObras], [/^obra\/([^/]+)$/, obra], [/^instrumentos$/, listaInstrumentos],
  [/^instrumento\/([^/]+)$/, instrumento], [/^mediateca$/, mediateca], [/^arquivo$/, arquivo],
  [/^doc\/([^/]+)$/, documento], [/^fontes$/, fontes],
  [/^blogue$/, blogue], [/^blogue\/(novo)$/, editarArtigo], [/^blogue\/([^/]+)\/editar$/, editarArtigo], [/^blogue\/([^/]+)$/, artigo],
  [/^contribuidores$/, contribuidores], [/^contribuir$/, contribuir], [/^propostas$/, propostas],
  [/^nova\/([a-z]+)$/, novaFicha], [/^editar\/([a-z]+)\/([^/]+)$/, editarFicha], [/^separar\/([a-z]+)\/([^/]+)$/, separar], [/^validar$/, porValidar], [/^historico\/([a-z]+)\/([^/]+)$/, historico],
];

const TITULO = 'Arquivo da Canção de Coimbra';
const ecraEstreito = matchMedia('(max-width: 900px)'); // o mesmo limite do CSS: cabeçalho numa linha e menu em folha
let cabecalhoH = 0; // altura do cabeçalho fixo (só no telemóvel)
let navegacao = 0; // conta as mudanças de página: uma vista atrasada não escreve por cima da seguinte

/** Lê um pedaço do endereço; um «%» mal escrito dá null em vez de rebentar. */
const decodificar = (s) => { try { return decodeURIComponent(s); } catch { return null; } };

// ------------------------------------------------------------------ voltar atrás devolve o sítio onde se estava
// Cada entrada do histórico tem um número (history.state.id). Ao sair de uma página guarda-se o primeiro cartão,
// linha ou década que estava no topo do ecrã (e a que distância), além do scrollY. Ao voltar ou avançar, repõe-se.
// Guardar o elemento, e não só os píxeis, acerta mesmo quando as listas ainda não desenharam tudo (content-visibility).
const ANCORAS = 'a.cartao, article.cartao, .decada, .lista-simples > li, .resultado, .relacao';
let posicoes = {};
try { posicoes = JSON.parse(sessionStorage.getItem('posicoes') || '{}'); } catch { /* sem armazenamento */ }
let idAtual = null;

function guardarPosicao() {
  const main = $('#vista');
  if (!idAtual || !main) return;
  const itens = $$(ANCORAS, main);
  let ancora = {};
  for (let i = 0; i < itens.length; i++) {
    const r = itens[i].getBoundingClientRect();
    if (r.bottom > cabecalhoH) { ancora = { i, dy: Math.round(r.top) }; break; }
  }
  delete posicoes[idAtual]; // a mais recente fica no fim; guardam-se as últimas 60
  posicoes[idAtual] = { y: Math.round(window.scrollY), ...ancora };
  const ids = Object.keys(posicoes);
  for (const k of ids.slice(0, Math.max(0, ids.length - 60))) delete posicoes[k];
  try { sessionStorage.setItem('posicoes', JSON.stringify(posicoes)); } catch { /* sem armazenamento */ }
}

/** Repõe a posição guardada; diz se lá chegou (uma vista que ainda espera por dados pode não ter altura que chegue). */
function reporPosicao(main, p) {
  const el = p.i != null && $$(ANCORAS, main)[p.i];
  const alvo = el ? window.scrollY + el.getBoundingClientRect().top - p.dy : p.y;
  window.scrollTo(0, alvo);
  return Math.abs(window.scrollY - alvo) < 2;
}

/** Uma vista que pede os dados ao servidor sem esperar por eles (a Mediateca, na cópia local) só tem altura que chegue
 *  depois: tenta-se outra vez de cada vez que a página cresce, durante uns segundos, até lá chegar. Se entretanto se
 *  rolar, tocar, carregar numa tecla ou mudar de página, fica onde a pessoa a deixou. */
function reporQuandoCrescer(main, p, n) {
  const mexeu = ['wheel', 'touchstart', 'mousedown', 'keydown'];
  const parar = () => {
    observador.disconnect();
    clearTimeout(tempo);
    mexeu.forEach((t) => removeEventListener(t, parar, true));
  };
  const observador = new ResizeObserver(() => { if (n !== navegacao || !main.isConnected || reporPosicao(main, p)) parar(); });
  const tempo = setTimeout(parar, 6000);
  mexeu.forEach((t) => addEventListener(t, parar, { capture: true, passive: true }));
  observador.observe(main);
}

// a barra das décadas da Cronologia muda de altura com a largura (as contagens partem-na em várias linhas): mede-se
// (--decadas-h), para o título fixo de cada década e os saltos ficarem por baixo dela, tenha ela as linhas que tiver
let barraDecadas = null;
function medirDecadas(main) {
  barraDecadas?.disconnect();
  barraDecadas = null;
  const barra = $('.decadas', main);
  if (!barra) return;
  barraDecadas = new ResizeObserver(() => main.style.setProperty('--decadas-h', `${Math.ceil(barra.getBoundingClientRect().height)}px`));
  barraDecadas.observe(barra);
}

function definirTitulo(main, caminho) {
  const h1 = $('h1', main)?.textContent.replace(/\s+/g, ' ').trim();
  document.title = caminho && h1 ? `${h1} · ${TITULO}` : TITULO;
}

async function encaminhar({ manterPosicao = false } = {}) {
  const n = ++navegacao;
  fecharMenu();
  fecharLightbox(); // «ver no post», dentro da imagem ampliada, leva a outra página: a imagem fecha-se e a página deixa de estar inerte
  // a página que se deixa: guardar onde se estava (depois de gravar, é a mesma página e fica onde está)
  const anterior = idAtual;
  if (!manterPosicao) guardarPosicao();
  let id = history.state?.id;
  const doHistorico = !!id; // voltar, avançar ou recarregar; sem número, é uma página nova
  if (!id) { id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); history.replaceState({ ...history.state, id }, ''); }
  idAtual = id;
  const destino = doHistorico && !manterPosicao ? posicoes[id] : null;
  // o foco vai para o conteúdo quando se muda de página (não no arranque, nem ao redesenhar a mesma página)
  const focar = !manterPosicao && anterior !== null && anterior !== id;

  const [caminho, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const y = window.scrollY; // antes de trocar o conteúdo (a página encolhe e o scroll volta ao topo)
  // um <main> novo em cada página: se a anterior ainda estiver à espera de dados, escreve num elemento que já saiu
  const antigo = $('#vista');
  const main = antigo.cloneNode(false);
  antigo.replaceWith(main);
  limparRegisto();
  fecharPainel();
  const secao = caminho.split('/')[0];
  const grupo = secao === 'pessoa' && E.por.pessoas[decodificar(caminho.split('/')[1] || '')]?.tipo === 'grupo';
  const equivalente = grupo ? 'grupos' : { pessoa: 'pessoas', gravacao: 'discografia', obra: 'obras', instrumento: 'instrumentos',
    arquivo: 'fontes', doc: 'fontes', contribuir: 'contribuidores' }[secao] || secao;
  $$('#nav a').forEach((a) => {
    a.classList.toggle('ativo', a.dataset.rota === equivalente);
    if (a.dataset.rota === equivalente) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (!manterPosicao) window.scrollTo(0, 0);
  const pronto = () => {
    definirTitulo(main, caminho);
    medirDecadas(main);
    if (focar && main.isConnected) main.focus({ preventScroll: true });
  };
  for (const [re, vista] of ROTAS) {
    const m = caminho.match(re);
    if (!m) continue;
    const args = m.slice(1).map(decodificar);
    if (args.includes(null)) break; // «%» mal escrito no endereço
    try {
      // as vistas escrevem o h1 antes da primeira espera: o título e o foco não esperam pelos dados do arquivo
      const espera = vista(main, ...args, params);
      pronto();
      let chegou = destino ? reporPosicao(main, destino) : false;
      // as listas acabam de desenhar à volta do sítio reposto (content-visibility): acerta-se outra vez no elemento guardado
      if (destino?.i != null) requestAnimationFrame(() => requestAnimationFrame(() => { if (n === navegacao && main.isConnected) reporPosicao(main, destino); }));
      if (manterPosicao) window.scrollTo(0, y); // depois de gravar no modo de edição, fica onde estava
      await espera;
      if (n !== navegacao) return; // entretanto mudou-se de página
      definirTitulo(main, caminho);
      if (destino && !chegou) chegou = reporPosicao(main, destino); // a página só agora tem altura que chegue
      if (destino && !chegou) reporQuandoCrescer(main, destino, n); // ou ainda não: a lista chega do servidor depois
      if (manterPosicao) window.scrollTo(0, y);
    } catch (e) {
      console.error(e);
      if (main.isConnected) {
        main.innerHTML = html`<div class="conteudo"><div class="vazio"><h3>Ocorreu um erro ao abrir esta página</h3><p class="mono">${e.message}</p></div></div>`.s;
      }
    }
    return;
  }
  main.innerHTML = caminho.split('/').some((p) => decodificar(p) === null)
    ? '<div class="conteudo"><h1>Endereço inválido</h1><p>Este endereço tem caracteres que não se conseguem ler. Talvez tenha sido cortado ao copiar.</p><p><a href="#/">Voltar ao início</a></p></div>'
    : '<div class="conteudo"><h1>Página não encontrada</h1><p><a href="#/">Voltar ao início</a></p></div>';
  pronto();
}

// ------------------------------------------------------------------ janelas por cima da página
/** Torna inerte (fora do Tab e dos leitores de ecrã) tudo o que não está dentro de `caixa`, menos os avisos e os
 *  elementos com os ids `deixar`; devolve a função que desfaz. */
function inertizarFora(caixa, ...deixar) {
  const lista = [];
  for (let el = caixa; el.parentElement && el !== document.body; el = el.parentElement) {
    for (const irmao of el.parentElement.children) {
      if (irmao !== el && !['SCRIPT', 'STYLE', 'LINK'].includes(irmao.tagName) && ![...deixar, 'aviso'].includes(irmao.id)) lista.push(irmao);
    }
  }
  const antes = lista.map((x) => x.inert);
  lista.forEach((x) => { x.inert = true; });
  return () => lista.forEach((x, i) => { x.inert = antes[i]; });
}

/** Ao fechar uma janela, o foco volta ao botão ou ligação que a abriu (se o foco ficou perdido ou dentro dela). */
function devolverFoco(origem, caixa) {
  const atual = document.activeElement;
  if (origem?.isConnected && origem !== document.body && !origem.closest('[inert]') && (!atual || atual === document.body || caixa.contains(atual))) {
    origem.focus({ preventScroll: true });
  }
}

// ------------------------------------------------------------------ cabeçalho e menu no telemóvel
let desfazerMenu = null;
function mudarMenu(abrir) {
  const raiz = document.documentElement, botao = $('#abrir-menu');
  if (abrir === raiz.classList.contains('menu-aberto')) return;
  raiz.classList.toggle('menu-aberto', abrir);
  botao.setAttribute('aria-expanded', String(abrir));
  botao.querySelector('span').textContent = abrir ? 'Fechar' : 'Menu';
  botao.querySelector('path').setAttribute('d', abrir ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16');
  // a paleta pode abrir-se por cima da folha («Procurar…» fica no cabeçalho)
  if (abrir) { fecharPainel(); desfazerMenu = inertizarFora($('.lateral'), 'paleta'); } else { desfazerMenu?.(); desfazerMenu = null; }
}
const fecharMenu = () => mudarMenu(false);

/** Mede o cabeçalho fixo (--cabecalho-h): a folha do menu abre por baixo dele e os saltos na página não ficam tapados. */
function iniciarCabecalho() {
  const lateral = $('.lateral'), folha = $('#menu-folha');
  const medir = () => {
    cabecalhoH = ecraEstreito.matches ? Math.round(lateral.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--cabecalho-h', cabecalhoH + 'px');
  };
  new ResizeObserver(medir).observe(lateral);
  ecraEstreito.addEventListener('change', () => { medir(); if (!ecraEstreito.matches) fecharMenu(); });
  medir();
  $('#abrir-menu').onclick = () => mudarMenu(!document.documentElement.classList.contains('menu-aberto'));
  // escolher uma secção fecha a folha (também quando já se está nessa página)
  folha.addEventListener('click', (e) => { if (e.target.closest('#nav a')) fecharMenu(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !document.documentElement.classList.contains('menu-aberto') || e.target.closest?.('#paleta, #lightbox')) return;
    const dentro = folha.contains(document.activeElement);
    fecharMenu();
    if (dentro) $('#abrir-menu').focus();
  });
  $('#saltar').onclick = () => $('#vista').focus(); // «Saltar para o conteúdo», o primeiro Tab da página
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
      lb.innerHTML = html`<button type="button" class="lightbox-fechar" aria-label="Fechar a imagem">×</button>
        <img src="${miniatura(fig.dataset.lightbox, 1600)}" alt="${fig.dataset.legenda || ''}" referrerpolicy="no-referrer"><p class="legenda">${fig.dataset.legenda || ''}
        ${lig ? html` · <a href="${lig}" ${lig.startsWith('#') ? '' : raw('target="_blank" rel="noopener"')}>ver no post</a>` : ''}
        · <a href="${fig.dataset.lightbox}" target="_blank" rel="noopener">imagem original ↗</a></p>`.s;
      if (lb.hidden) { // aberta por cima de tudo: o Tab fica lá dentro e, ao fechar, o foco volta à fotografia
        lightbox = { origem: fig.querySelector('button') || fig, desfazer: inertizarFora(lb) };
        lb.hidden = false;
      }
      lb.focus();
      return;
    }
    if (e.target.closest('#lightbox') && (!e.target.closest('a') || e.target.getAttribute('href') === 'javascript:void 0')) fecharLightbox();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharLightbox(); });
}

let lightbox = null; // { origem, desfazer } enquanto a imagem ampliada está aberta

function fecharLightbox() {
  const lb = $('#lightbox');
  lb.hidden = true;
  lb.innerHTML = ''; // pára partituras/áudio que estejam a tocar
  if (!lightbox) return;
  lightbox.desfazer();
  devolverFoco(lightbox.origem, lb);
  lightbox = null;
}

// o que o papel não leva, embora no ecrã se veja (regras de impressão de estilo.css): as marcas daí não entram nas notas
const SO_NO_ECRA = 'form, .caixa-edicao, .dobra-edicao, .mais-opcoes, .acoes-topo, .acoes-lista, .barra-filtros, .separadores, .paginacao, .botao, .so-rato, .so-toque';
const LARGURA_PAPEL = 680; // px úteis de uma folha A4 ou Carta ao alto, com as margens de omissão e alguma folga

/** O que o painel diz da prova de uma citação, para as notas no papel: a fonte que não está aprovada e a frase que não
 *  está confirmada no documento arquivado, cada uma como [nome, explicação]. Sem nada, é uma frase verificada. */
function avisosProva(c) {
  const prova = estadoCitacao(c), estado = E.fontes[c.fonte]?.estado, l = [];
  if (prova !== 'fonte-rejeitada' && estado !== 'aprovada') {
    l.push(estado === 'pendente' ? ['fonte pendente', 'Fonte proposta, ainda por aprovar pelos editores.']
      : ['fonte desconhecida', 'A fonte não está no registo de fontes do arquivo.']);
  }
  if (prova === 'fonte-rejeitada' || (c.citacao && prova !== 'verificada')) l.push(PROVA[prova] ? PROVA[prova].slice(1) : [prova, '']);
  return l;
}

/** Imprimir ou guardar em PDF: as marcas de citação passam a notas numeradas e, no fim, ficam as fontes da página,
 *  cada uma com a frase literal, o endereço e o estado da prova que o painel mostra (no ecrã só se veem no painel),
 *  e a referência da página consultada. */
function iniciarImpressao() {
  const preparar = () => {
    limparImpressao();
    const main = $('#vista');
    // um <details> fechado não sai no papel: abrem-se os que têm marcas de citação (por exemplo, «Mostrar os outros N
    // discos»; os das fichas abre-os leitura.js) e fecham-se depois. As dobras do modo de edição ficam como estão.
    for (const d of $$('details:not([open])', main)) {
      if (d.closest(SO_NO_ECRA) || !$('.marca[data-cit]', d)) continue;
      d.open = true;
      d.dataset.abertoParaImprimir = '';
    }
    // numeram-se só as marcas que ficam no papel (nos ecrãs de toque, os números escondem-se no ecrã, mas imprimem-se)
    const noPapel = $$('.marca[data-cit]', main).filter((b) => {
      const caixa = b.closest('.marcas') || b;
      return citacaoRegistada(+b.dataset.cit) && !b.closest(SO_NO_ECRA)
        && (caixa.checkVisibility ? caixa.checkVisibility() : caixa.getClientRects().length > 0);
    });
    const notas = noPapel.map((b) => citacaoRegistada(+b.dataset.cit));
    noPapel.forEach((b, i) => { b.dataset.nota = i + 1; });
    // as árvores largas encolhem até caberem na largura da folha (no ecrã rolam de lado)
    for (const m of $$('.arvore-caixa .arvore-mundo', main)) {
      const w = parseFloat(m.style.width);
      if (w > 0) m.style.setProperty('--zoom-papel', String(Math.min(0.86, LARGURA_PAPEL / w)));
    }
    const avisos = notas.map(avisosProva), legenda = new Map(avisos.flat());
    const confirmadas = notas.some((c, i) => c.citacao && !avisos[i].length);
    const agora = new Date(); // a data de quem imprime, não a UTC
    const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    const titulo = $('h1', main)?.textContent.replace(/\s+/g, ' ').trim();
    main.insertAdjacentHTML('beforeend', html`<section class="notas-impressao conteudo">
      ${notas.length ? html`<h2>Fontes desta página</h2><ol>${notas.map((c, i) => html`<li>${fonteNome(c.fonte)}${c.citacao ? html` — «${c.citacao}»` : ''}
        — ${c.url}${avisos[i].length ? html` <b>(${avisos[i].map(([nome]) => nome).join('; ')})</b>` : ''}</li>`)}</ol>` : ''}
      ${confirmadas ? html`<p>${legenda.size ? 'As frases sem indicação entre parênteses' : 'Todas as frases'} foram confirmadas, palavra por palavra, nos documentos arquivados.</p>` : ''}
      ${[...legenda].map(([nome, texto]) => html`<p><b>${nome[0].toUpperCase()}${nome.slice(1)}</b> — ${texto}</p>`)}
      <p>${TITULO}${titulo && location.hash.length > 2 ? ` — ${titulo}` : ''}. Consultado em ${fmtData(hoje)}: ${location.href}</p></section>`.s);
  };
  const limparImpressao = () => {
    $$('.notas-impressao').forEach((s) => s.remove());
    $$('.marca[data-nota]').forEach((b) => b.removeAttribute('data-nota'));
    $$('details[data-aberto-para-imprimir]').forEach((d) => { d.open = false; delete d.dataset.abertoParaImprimir; });
    $$('.arvore-mundo').forEach((m) => m.style.removeProperty('--zoom-papel'));
  };
  window.addEventListener('beforeprint', preparar);
  window.addEventListener('afterprint', limparImpressao);
}

function iniciarTema() {
  $('#tema').onclick = () => {
    // sem escolha guardada, o tema visível é o do estilo (o Museu é claro por omissão)
    const atual = getComputedStyle(document.documentElement).colorScheme.includes('dark') ? 'dark' : 'light';
    const novo = atual === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem('tema', novo); } catch { /* sem armazenamento */ }
    // a barra de estado do iPhone (e a do Android) com a cor do fundo do tema escolhido
    const fundo = getComputedStyle(document.documentElement).getPropertyValue('--fundo').trim();
    if (fundo) document.querySelector('meta[name="theme-color"]').content = fundo;
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
  if (!b) return; // P4: o interruptor saiu do menu; está na mediateca e nas fichas («+ N com link morto»), sem recarregar
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
  history.scrollRestoration = 'manual'; // a posição ao voltar atrás é reposta por encaminhar()
  window.addEventListener('pagehide', guardarPosicao); // ao recarregar a página, volta ao mesmo sítio
  iniciarCabecalho();
  iniciarImpressao();
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
