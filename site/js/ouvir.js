// Secção «Ouvir e ver» da ficha de pessoa: os discos com som (faixa a faixa, um botão por plataforma), os programas de
// rádio e televisão (abrem no site da RTP) e os outros vídeos e áudios. Só arruma o que as fichas de media dizem.
import { E, visivel, derivarMedia, chaveMedia, dataMedia, anoDoDisco, FORMATOS } from './estado.js';
import { html, raw, plural, preferencias, compararPt } from './util.js';
import { marcas } from './citacoes.js';
import { itemCurado, itensDaFaixa, botaoOuvir, cartoesMedia, dadosItem, AVISO_IDENTIFICACOES } from './componentes.js';
import { tocaAqui } from './leitor.js';

const DISCOS_A_VER = 5; // os outros discos ficam em «Mostrar os outros N discos»

/** Mostrar ou esconder os vídeos e áudios com link morto (preferência do visitante): refaz os índices, sem recarregar a página. */
export function alternarMortos() {
  preferencias.mostrarIndisponiveis = !preferencias.mostrarIndisponiveis;
  try { localStorage.setItem('mostrarIndisponiveis', JSON.stringify(preferencias.mostrarIndisponiveis)); } catch { /* sem armazenamento */ }
  derivarMedia();
}

/** Botão «+ N com link morto» / «Esconder os N com link morto» (só aparece se houver). */
export const botaoMortos = (n, alvo = '') => (n ? html`<button class="botao peq botao-mortos" data-mostrar-mortos="${alvo}"
  title="Vídeos e áudios cujo link já não funciona (assinalados)">${preferencias.mostrarIndisponiveis ? `Esconder os ${n} com link morto` : `+ ${n} com link morto`}</button>` : '');

const semRepetir = (lista, chave) => { const vistos = new Set(); return lista.filter((x) => { const k = chave(x); return !vistos.has(k) && vistos.add(k); }); };
const fontesDe = (media) => semRepetir(media.flatMap((m) => m.fontes || []), (c) => `${c.fonte}|${c.url}|${c.citacao || ''}`);

/** As faixas de um disco com som desta pessoa, pela ordem do disco; os media do disco sem faixa vão no fim. */
function faixasComSom(g, meus) {
  const ids = new Set(meus.map((m) => m.id)), usados = new Set(), linhas = [];
  for (const f of g.faixas || []) {
    const desta = (f.media || []).map((x) => E.por.media[x]).filter((m) => m && visivel(m));
    if (!desta.some((m) => ids.has(m.id))) continue;
    desta.forEach((m) => usados.add(m.id));
    linhas.push({ n: f.n, titulo: f.titulo || E.por.obras[f.obra]?.titulo || desta[0].titulo, obra: f.obra, media: desta });
  }
  for (const m of meus) if (!usados.has(m.id)) linhas.push({ n: '', titulo: m.titulo, obra: m.obras?.length === 1 ? m.obras[0] : '', media: [m] });
  return linhas;
}

function linhaFaixa(l) {
  const itens = semRepetir(l.media, chaveMedia).map(itemCurado);
  const revisto = l.media.every((m) => m.estado_revisao === 'revisto');
  return html`<li><span class="n mono mudo">${l.n || ''}</span>
    <span class="t">${l.obra && E.por.obras[l.obra] ? html`<a href="#/obra/${l.obra}">${l.titulo}</a>` : l.titulo}${marcas(fontesDe(l.media))}${revisto ? html` <span class="selo verde">revisto</span>` : ''}</span>
    <span class="b">${itens.map(botaoOuvir)}</span></li>`;
}

function blocoDisco(g, meus) {
  const linhas = faixasComSom(g, meus);
  // numa faixa com vários media entram todos (podem ser atuações diferentes): o botão diz quantas faixas e quantos itens
  const porFaixa = linhas.map((l) => itensDaFaixa(l.media.map((m) => m.id))).filter((x) => x.length);
  const ouvir = semRepetir(porFaixa.flat(), (it) => `${it.plataforma}|${it.chave}`);
  const rotuloOuvir = `▶ Ouvir ${plural(porFaixa.length, 'faixa', 'faixas')}${ouvir.length > porFaixa.length ? ` (${ouvir.length} vídeos e áudios)` : ''}`;
  const notas = semRepetir(linhas.flatMap((l) => l.media.filter((m) => m.nota).map((m) => [l.titulo, m.nota])), ([, n]) => n);
  return html`<article class="disco-ouvir">
    <header><div><a class="titulo-disco" href="#/gravacao/${g.id}">${g.titulo}</a>
      <span class="mudo">${[anoDoDisco(g), FORMATOS[g.formato] || g.formato, g.editora, g.referencia].filter(Boolean).join(' · ')}</span></div>
      ${ouvir.length > 1 ? html`<button class="botao peq primario" data-fila="${raw(dadosItem(ouvir))}">${rotuloOuvir}</button>` : ''}</header>
    <ol class="faixas-ouvir">${linhas.map(linhaFaixa)}</ol>
    ${notas.length ? html`<details class="nota-media"><summary class="nota-agente" title="Notas do agente, não são factos">${notas.length === 1 ? 'nota do agente' : `notas do agente (${notas.length})`}</summary>
      <ul>${notas.map(([t, n]) => html`<li class="nota-agente"><b>${t}</b>: ${n}</li>`)}</ul></details>` : ''}
  </article>`;
}

/** A secção inteira (vazia se a pessoa não tiver media catalogado). Volta a desenhar-se no sítio ao mostrar os links mortos. */
export function seccaoOuvir(p) {
  const todos = (E.base.media || []).filter((m) => (m.pessoas || []).includes(p.id));
  if (!todos.length) return '';
  const mortos = todos.filter((m) => m.disponivel === false || m.disponivel === 0).length;
  const media = todos.filter(visivel);
  const rtp = [], porDisco = new Map(), outros = [];
  for (const m of media) {
    const it = itemCurado(m);
    if (!tocaAqui(it) && String(it.plataforma).startsWith('rtp')) { rtp.push(m); continue; }
    const discos = new Set([m.gravacao, ...(E.faixasDeMedia?.[m.id] || []).map((x) => x.gravacao.id)].filter((g) => g && E.por.gravacoes[g]));
    if (!discos.size || !tocaAqui(it)) { outros.push(m); continue; }
    for (const g of discos) { if (!porDisco.has(g)) porDisco.set(g, []); porDisco.get(g).push(m); }
  }
  const ano = (g) => dataMedia({ gravacao: g }) || '9999';
  const discos = [...porDisco.keys()].sort((a, b) => ano(a).localeCompare(ano(b)) || compararPt(E.por.gravacoes[a].titulo, E.por.gravacoes[b].titulo));
  const disco = (g) => blocoDisco(E.por.gravacoes[g], porDisco.get(g));
  return html`<section class="seccao" id="sec-ouvir"><h2>Ouvir e ver <small>${plural(media.length, 'catalogado', 'catalogados')}</small></h2>
    <p class="aviso-identificacoes">${AVISO_IDENTIFICACOES} ${botaoMortos(mortos, p.id)}</p>
    ${discos.length ? html`<h3 class="sub-ouvir">Discos <small class="mudo">${discos.length}, do mais antigo ao mais recente</small></h3>
      <div class="discos-ouvir">${discos.slice(0, DISCOS_A_VER).map(disco)}</div>
      ${discos.length > DISCOS_A_VER ? html`<details class="mais-media"><summary>Mostrar os outros ${discos.length - DISCOS_A_VER} discos</summary>
        <div class="discos-ouvir">${discos.slice(DISCOS_A_VER).map(disco)}</div></details>` : ''}` : ''}
    ${rtp.length ? html`<h3 class="sub-ouvir">Rádio e televisão <small class="mudo">abrem no site da RTP</small></h3>${cartoesMedia(rtp, { limite: 6, aviso: false })}` : ''}
    ${outros.length ? html`<h3 class="sub-ouvir">${discos.length || rtp.length ? 'Outros vídeos e áudios' : 'Vídeos e áudios'}</h3>${cartoesMedia(outros, { limite: 6, aviso: false })}` : ''}
  </section>`;
}

/** Os vídeos do arquivo que referem a pessoa, alternando os documentos (o 1.º de cada um, depois o 2.º…): uma página de canal
 *  com dezenas de vídeos não enche a secção sozinha. */
export function alternarDocumentos(lista, n) {
  const porDoc = new Map();
  for (const m of lista) { if (!porDoc.has(m.doc_id)) porDoc.set(m.doc_id, []); porDoc.get(m.doc_id).push(m); }
  const filas = [...porDoc.values()], res = [];
  for (let i = 0; res.length < n && filas.some((f) => f.length > i); i++) for (const f of filas) if (f[i] && res.length < n) res.push(f[i]);
  return res;
}

// «+ N com link morto» na ficha: redesenha só esta secção
document.addEventListener('click', (e) => {
  const b = e.target.closest('#sec-ouvir [data-mostrar-mortos]');
  if (!b) return;
  alternarMortos();
  const p = E.por.pessoas[b.dataset.mostrarMortos], s = b.closest('#sec-ouvir');
  if (p && s) s.outerHTML = seccaoOuvir(p).toString() || '<span id="sec-ouvir"></span>';
});
