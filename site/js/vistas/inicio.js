// Página inicial: desce-se por uma guitarra de Coimbra (vistas/guitarra.js) e entra-se pela boca até à etiqueta, com os
// números do arquivo. No braço, os nomes; à esquerda, memórias tiradas ao acaso das fichas (pessoas, discos, vídeos).
import { E, CAMPOS, comArquivo, visivel, musicoOuGrupo, PAPEIS, vida, nomeDe } from '../estado.js';
import { html, raw, api, tituloDoc, miniatura, classificar, estiloRecorte } from '../util.js';
import { agruparMedia, itemCurado, dadosItem } from '../componentes.js';
import { abrirPaleta } from '../paleta.js';
import { montarGuitarra, VARIANTES } from './guitarra.js';

// Os nomes do braço, um por traste: as três gerações de oiro da Canção de Coimbra segundo Jorge Cravo («Nótula sobre as
// três gerações de oiro da Canção de Coimbra», Revista Fadista, n.º 6, 2024), com Carlos Paredes e António Portugal, que
// ele destaca, e Augusto Hilário e Artur Paredes (escolha do fundador). Por ordem de nascimento.
const NOMES = ['augusto-hilario', 'antonio-menano', 'artur-paredes', 'edmundo-de-bettencourt', 'armando-goes', 'carlos-paredes',
  'jose-afonso', 'fernando-machado-soares', 'fernando-rolim', 'antonio-portugal', 'luiz-goes', 'adriano-correia-de-oliveira'];

const PLATAFORMAS = { youtube: 'YouTube', 'rtp-arquivos': 'RTP Arquivos', vimeo: 'Vimeo', blogger: 'Blogue', 'internet-archive': 'Internet Archive', soundcloud: 'SoundCloud', spotify: 'Spotify', 'apple-music': 'Apple Music' };

/** As memórias: pessoas com retrato, discos e vídeos, baralhados; devolve uma função que dá o elemento seguinte. */
function fonteDeMemorias(b) {
  const pessoas = b.pessoas.filter((p) => p.tipo !== 'grupo' && musicoOuGrupo(p) && p.imagens?.length).map((p) => ({ t: 'p', p }));
  const discos = b.gravacoes.filter((g) => g.titulo).map((g) => ({ t: 'd', g }));
  const vistos = new Set();
  const videos = b.media.filter((m) => visivel(m) && m.titulo && (m.tipo || classificar(m.url)?.tipo) === 'video' && !vistos.has(m.url) && vistos.add(m.url)).map((m) => ({ t: 'v', m }));
  let monte = [];
  const baralhar = () => [...pessoas, ...discos, ...videos].map((x) => [Math.random(), x]).sort((a, c) => a[0] - c[0]).map((x) => x[1]);
  const imagem = (url, estilo = '') => html`<img src="${url}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${estilo ? raw(`style="${estilo}"`) : ''}>`;
  const criar = (x) => {
    const e = document.createElement(x.t === 'v' ? 'button' : 'a');
    e.className = 'g-mem'; e.tabIndex = -1;
    if (x.t === 'p') {
      const p = x.p, im = p.imagens[0];
      e.href = `#/pessoa/${p.id}`;
      e.innerHTML = html`<i class="g-fig g-retrato">${imagem(miniatura(im.url, 160), estiloRecorte(im))}</i><em>Pessoa</em><b>${p.nome}</b>
        <small>${[(p.papeis || []).filter((k) => k !== 'outro').slice(0, 2).map((k) => PAPEIS[k] || k).join(' · '), vida(p)].filter(Boolean).join(' · ')}</small>`.s;
    } else if (x.t === 'd') {
      const g = x.g, capa = g.capa?.url;
      e.href = `#/gravacao/${g.id}`;
      const quem = (g.interpretes || []).slice(0, 2).map((i) => nomeDe(typeof i === 'string' ? i : i.pessoa)).filter(Boolean).join(', ');
      e.innerHTML = html`<i class="g-fig g-capa">${capa ? imagem(miniatura(capa, 160)) : ''}</i><em>Disco</em><b>${g.titulo}</b><small>${[quem, g.ano].filter(Boolean).join(' · ')}</small>`.s;
    } else {
      const m = x.m;
      e.type = 'button'; e.dataset.tocar = JSON.stringify(itemCurado(m));
      e.setAttribute('aria-label', `Tocar: ${m.titulo}`);
      e.innerHTML = html`<i class="g-fig g-ecra">${m.miniatura ? imagem(m.miniatura) : ''}</i><em>Vídeo</em><b>${m.titulo}</b><small>${[PLATAFORMAS[m.plataforma] || m.plataforma, (m.data || '').slice(0, 4)].filter(Boolean).join(' · ')}</small>`.s;
    }
    e.querySelector('img')?.addEventListener('error', function () { this.remove(); }, { once: true });
    return e;
  };
  return () => { if (!monte.length) monte = baralhar(); const x = monte.pop(); return x ? criar(x) : null; };
}

export async function inicio(el) {
  const b = E.base;
  const arquivo = comArquivo();
  // os números batem certo com as páginas: «Pessoas» conta quem tem papel musical; os vídeos e áudios contam-se como na Mediateca
  const pessoas = b.pessoas.filter((p) => p.tipo !== 'grupo' && musicoOuGrupo(p));
  const m = E.arquivo?.media || {};
  const catalogados = (tipo) => agruparMedia(b.media.filter((x) => visivel(x) && (x.tipo || classificar(x.url)?.tipo) === tipo)).length;
  const numeros = [[pessoas.length, 'pessoas', '#/pessoas'], [b.gravacoes.length, 'discos', '#/discografia'], [b.obras.length, 'obras', '#/obras'],
    [arquivo ? (m.video || 0) + (m.audio || 0) : catalogados('video') + catalogados('audio'), 'vídeos e áudios', '#/mediateca']];
  const nomes = NOMES.map((id) => E.por.pessoas[id]).filter(Boolean);
  // «Neste dia»: online, os factos das fichas com data de hoje (num dia sem factos, os do mês); no computador, os posts do blogue
  const hoje = new Date();
  const md = `${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const factos = arquivo ? [] : b.pessoas.flatMap((p) => (p.factos || []).filter((f) => !f.conflito && /^\d{4}-\d{2}/.test(f.data || '')).map((f) => ({ p, f })));
  const doDia = factos.filter(({ f }) => f.data.length === 10 && f.data.slice(5) === md);
  const doMes = doDia.length ? [] : factos.filter(({ f }) => f.data.slice(5, 7) === md.slice(0, 2));
  const tituloDia = arquivo ? 'Neste dia, no blogue' : doMes.length ? 'Neste mês' : 'Neste dia';
  const dataDia = hoje.toLocaleDateString('pt-PT', doMes.length ? { month: 'long' } : { day: 'numeric', month: 'long' });
  const vista = { 'data-vis': 236, 'data-larg': 190, 'data-larg-m': 205 };
  const attrs = (o) => raw(Object.entries({ ...vista, ...o }).map(([k, v]) => `${k}="${v}"`).join(' '));

  el.innerHTML = html`<div class="g-inicio">
    <canvas class="g-palco" aria-hidden="true"></canvas>
    <div class="g-nomes" aria-hidden="true">${nomes.map((p) => html`<a class="g-nome" href="#/pessoa/${p.id}" tabindex="-1"><b>${p.nome}<span>${vida(p)}</span></b></a>`)}</div>
    <div class="g-memorias" aria-hidden="true"></div>
    <div class="g-controlos">
      <button type="button" class="g-seguinte" id="g-seguinte" aria-label="Guitarra seguinte"><b aria-hidden="true">→</b><span id="g-n">1/${VARIANTES.length}</span></button>
      <button type="button" class="g-som" id="g-som" aria-pressed="false">Som desligado</button>
    </div>
    <div class="g-acorde" hidden><button type="button" class="botao primario" id="g-tocar">Tocar o acorde</button><button type="button" class="botao" id="g-limpar">Tirar os dedos</button></div>

    <section class="g-abertura" ${attrs({ 'data-y': 104, 'data-y-m': 194 })}>
      <div class="g-texto">
        <h1>A Canção de Coimbra, <em>organizada</em> a partir das suas fontes.</h1>
        <p class="lead">Pessoas, linhagens, gravações, instrumentos, letras e vídeos, cada informação ligada à frase exata da fonte.</p>
        <form id="f-heroi" role="search"><input class="campo" name="q" type="search" aria-label="Procurar no arquivo" placeholder="Pessoa, grupo, obra, disco…" autocomplete="off">
          <button class="botao primario">Procurar</button></form>
        <section class="g-neste-dia" aria-labelledby="g-neste-dia">
          <h2 class="sobretitulo" id="g-neste-dia">${tituloDia} <small>${dataDia}</small></h2>
          <ul class="g-efemerides" id="efemerides"><li class="carregando">A procurar</li></ul>
        </section>
      </div>
    </section>
    <section class="g-descida" ${attrs({ 'data-y': 200, 'data-y-fim': 436 })}>
      <h2 class="g-oculto">Nomes da Canção de Coimbra</h2>
      <ul class="g-oculto">${nomes.map((p) => html`<li><a href="#/pessoa/${p.id}">${p.nome}</a> ${vida(p)}</li>`)}</ul>
    </section>
    <section class="g-corpo" ${attrs({ 'data-y': 436, 'data-y-fim': 550 })}>
      <p class="g-oculto">Guitarra de Coimbra: toque nos trastes para pôr os dedos e ouvir o acorde.</p>
    </section>
    <section class="g-mergulho" ${attrs({ 'data-y': 550 })}>
      <div class="g-dentro">
        <div class="g-etiqueta">
          <h2 class="g-rotulo">Arquivo da Canção de Coimbra</h2>
          <div class="g-numeros">${numeros.map(([n, r, h]) => html`<a href="${h}"><b>${n.toLocaleString('pt-PT')}</b><span>${r}</span></a>`)}</div>
        </div>
      </div>
    </section>
  </div>`.s;

  // a caixa de procura abre a procura rápida (a mesma de «Procurar…»), já com o que se escreveu
  const heroi = el.querySelector('#f-heroi');
  const procurar = (texto) => { heroi.querySelector('button').focus(); abrirPaleta(texto); };
  heroi.onsubmit = (e) => { e.preventDefault(); procurar(heroi.q.value.trim()); };
  heroi.q.onclick = () => procurar(heroi.q.value.trim());
  heroi.q.oninput = () => { const t = heroi.q.value; heroi.q.value = ''; procurar(t); };

  montarGuitarra(el.querySelector('.g-inicio'), { memorias: fonteDeMemorias(b) });
  nesteDia(el, { arquivo, md, doDia, doMes });
}

/** Preenche «Neste dia»: até três linhas, por ordem de data; quando há mais, escolhidas ao acaso e diz-se quantas há. */
async function nesteDia(el, { arquivo, md, doDia, doMes }) {
  const MAX = 3;
  const lista = el.querySelector('#efemerides');
  const escolher = (xs) => (xs.length > MAX ? xs.map((x) => [Math.random(), x]).sort((a, c) => a[0] - c[0]).slice(0, MAX).map((x) => x[1]) : xs);
  const nota = (n, onde) => (n > MAX ? html`<li class="mudo">${MAX} de ${n} ${onde}, escolhidos ao acaso.</li>` : '');
  if (!arquivo) { // nascimentos, mortes e outros factos com data neste dia (ou, se não houver, neste mês), tirados das fichas
    const todos = doDia.length ? doDia : doMes;
    lista.innerHTML = (todos.length
      ? html`${escolher(todos).sort((x, y) => x.f.data.localeCompare(y.f.data)).map(({ p, f }) => html`<li><span class="ano">${f.data.slice(0, 4)}</span>
          <a href="#/pessoa/${p.id}">${p.nome}</a> · ${CAMPOS[f.campo] || f.campo}: ${f.valor}</li>`)}
        ${nota(todos.length, doDia.length ? 'factos com data de hoje' : 'factos com data neste mês')}`
      : html`<li class="mudo">Nenhum facto das fichas tem data neste mês.</li>`).s;
    return;
  }
  try {
    const r = await api('efemerides', { md });
    if (!el.isConnected) return; // entretanto mudou-se de página
    lista.innerHTML = (r.resultados.length
      ? html`${escolher(r.resultados).sort((x, y) => x.data.localeCompare(y.data)).map((d) => html`<li><span class="ano">${d.data.slice(0, 4)}</span>
          <a href="#/doc/${d.doc_id}">${tituloDoc(d.titulo)}</a></li>`)}
        ${nota(r.resultados.length, r.resultados.length >= 40 ? 'posts (ou mais) publicados neste dia' : 'posts publicados neste dia')}`
      : html`<li class="mudo">Nenhum post publicado neste dia.</li>`).s;
  } catch { if (el.isConnected) lista.innerHTML = '<li class="mudo">Servidor local desligado.</li>'; }
}
