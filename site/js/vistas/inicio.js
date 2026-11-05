import { E, CAMPOS, comArquivo, visivel, musicoOuGrupo, riqueza, chaveMedia } from '../estado.js';
import { $, html, raw, esc, api, tituloDoc, plural, miniatura, classificar } from '../util.js';
import { cartaoMediaCurado, cartaoPessoa, imagemCartao, agruparMedia } from '../componentes.js';
import { abrirPaleta } from '../paleta.js';

const misturar = (lista) => [...lista].sort(() => Math.random() - 0.5);

export async function inicio(el) {
  const b = E.base;
  const docs = (E.arquivo?.documentos || []).reduce((a, d) => a + (d.tipo === 'post' ? d.n : 0), 0);
  const m = E.arquivo?.media || {};
  const hoje = new Date();
  const md = `${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  // online não há a cópia dos blogues: os números, o «ao acaso» e o «neste dia» vêm só das fichas
  const arquivo = comArquivo();
  // os números batem certo com as páginas: «Pessoas» conta quem tem papel musical (os familiares têm filtro próprio)
  const pessoas = b.pessoas.filter((p) => p.tipo !== 'grupo' && musicoOuGrupo(p));
  // online, os vídeos e áudios catalogados contam-se como nos separadores Vídeos e Áudio da Mediateca: o mesmo vídeo em
  // várias fichas (um por disco), ou a mesma faixa noutra plataforma, conta uma vez
  const catalogados = (tipo) => agruparMedia(b.media.filter((x) => visivel(x) && (x.tipo || classificar(x.url)?.tipo) === tipo)).length;
  const numeros = [
    [pessoas.length, 'pessoas', '#/pessoas'], [b.pessoas.filter((p) => p.tipo === 'grupo').length, 'grupos', '#/grupos'],
    [b.gravacoes.length, 'gravações', '#/discografia'],
    [b.obras.length, 'obras', '#/obras'], [b.instrumentos.length, 'instrumentos', '#/instrumentos'],
    ...(arquivo ? [[docs, 'posts arquivados', '#/arquivo'], [(m.video || 0) + (m.audio || 0), 'vídeos e áudios', '#/mediateca'],
      [m.imagem || 0, 'imagens', '#/mediateca?separador=imagens']]
      : [[catalogados('video') + catalogados('audio'), 'vídeos e áudios', '#/mediateca']]),
  ];

  const comFoto = b.pessoas.filter((p) => p.imagens?.length).sort(() => Math.random() - 0.5).slice(0, 8);
  // em destaque: fichas com retrato e excertos das fontes, tiradas das mais documentadas
  const comTudo = pessoas.filter((p) => p.imagens?.length && p.biografia?.length);
  const destaque = misturar([...(comTudo.length >= 4 ? comTudo : pessoas)].sort((x, y) => riqueza(y) - riqueza(x)).slice(0, 24)).slice(0, 4);
  // online, «Neste dia» vem das fichas; num dia sem factos, mostra os do mês
  const factos = arquivo ? [] : b.pessoas.flatMap((p) => (p.factos || []).filter((f) => !f.conflito && /^\d{4}-\d{2}/.test(f.data || '')).map((f) => ({ p, f })));
  const doDia = factos.filter(({ f }) => f.data.length === 10 && f.data.slice(5) === md);
  const doMes = doDia.length ? [] : factos.filter(({ f }) => f.data.slice(5, 7) === md.slice(0, 2));
  const comecar = [['Procurar uma pessoa', '#/pessoas'], ['Ouvir', arquivo ? '#/mediateca?estado=catalogados' : '#/mediateca'],
    ['Quem aprendeu com quem', '#/linhagens?ver=escolas'], ['Linha do tempo', '#/cronologia'], ['Como funciona este arquivo', '#/fontes']];
  el.innerHTML = html`<div class="conteudo">
    <section class="heroi ${comFoto.length >= 4 ? 'com-mosaico' : ''}">
      <div>
      <p class="sobretitulo">Ferramenta de estudo</p>
      <h1>A Canção de Coimbra, <em>organizada</em> a partir das suas fontes.</h1>
      <p class="lead">Pessoas, linhagens, gravações, instrumentos, letras e vídeos — cada informação ligada à
        frase exata da fonte que a sustenta. Nada é acrescentado: só arrumado.</p>
      <form id="f-heroi" role="search"><input class="campo" name="q" type="search" aria-label="Procurar no arquivo"
        placeholder="Pessoa, grupo, obra, disco…" autocomplete="off">
        <button class="botao primario">Procurar</button></form>
      <nav class="comecar" aria-label="Por onde começar"><span class="sobretitulo">Por onde começar</span>
        ${comecar.map(([t, h]) => html`<a href="${h}">${t}</a>`)}</nav>
      </div>
      ${comFoto.length >= 4 ? html`<div class="mosaico" aria-label="Algumas pessoas do arquivo">${comFoto.map((p) =>
        html`<a href="#/pessoa/${p.id}">${imagemCartao(miniatura(p.imagens[0].url, 300), { im: p.imagens[0] })}<span>${p.nome}</span></a>`)}</div>` : ''}
      <div class="numeros">${numeros.map(([n, r, h]) => html`<a href="${h}"><b>${n.toLocaleString('pt-PT')}</b><span>${r}</span></a>`)}</div>
    </section>

    <div class="duas-colunas">
      <section class="seccao">
        <h2>Ao acaso <small>vídeos catalogados nas fichas</small>
          <button class="botao peq" id="baralhar" style="margin-left:auto">Outros</button></h2>
        <div class="grelha" id="acaso"><p class="carregando">A escolher</p></div>
      </section>
      <section class="seccao">
        <h2>${arquivo ? 'Neste dia, no blogue' : doMes.length ? 'Neste mês' : 'Neste dia'}
          <small>${doMes.length ? `${hoje.toLocaleDateString('pt-PT', { month: 'long' })} · nenhum facto tem data de hoje`
            : hoje.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}</small></h2>
        <ul class="efemerides" id="efemerides"><li class="carregando">A procurar</li></ul>
      </section>
    </div>

    ${destaque.length ? html`<section class="seccao"><h2>Pessoas <small>${plural(pessoas.length, 'pessoa', 'pessoas')} · em destaque, fichas com retrato e excertos das fontes</small>
      <a class="botao peq" href="#/pessoas" style="margin-left:auto">Ver todas</a></h2>
      <div class="grelha">${destaque.map((p) => cartaoPessoa(p))}</div></section>` : ''}
  </div>`.s;

  // a caixa grande abre a procura rápida (a mesma de «Procurar…»), já com o que se escreveu
  const heroi = $('#f-heroi');
  const procurar = (texto) => {
    heroi.querySelector('button').focus(); // ao fechar a procura, o foco volta ao botão (no iPhone, sem abrir o teclado)
    abrirPaleta(texto);
  };
  heroi.onsubmit = (e) => { e.preventDefault(); procurar(heroi.q.value.trim()); };
  heroi.q.onclick = () => procurar(heroi.q.value.trim());
  heroi.q.oninput = () => { const t = heroi.q.value; heroi.q.value = ''; procurar(t); };
  const acaso = () => {
    const caixa = $('#acaso');
    if (!caixa) return;
    const vistos = new Set(); // o mesmo vídeo catalogado em vários discos conta uma vez
    const videos = misturar(b.media.filter((x) => visivel(x) && x.plataforma === 'youtube' && !vistos.has(chaveMedia(x)) && vistos.add(chaveMedia(x)))).slice(0, 4);
    caixa.innerHTML = videos.length ? html`${videos.map(cartaoMediaCurado)}`.s : '<p class="mudo">Ainda não há vídeos catalogados nas fichas.</p>';
  };
  $('#baralhar').onclick = acaso;
  acaso();
  if (!arquivo) { // nascimentos, mortes e outros factos com data neste dia (ou, se não houver, neste mês), tirados das fichas
    const lista = doDia.length ? doDia : misturar(doMes).slice(0, 9);
    $('#efemerides').innerHTML = (lista.length
      ? html`${[...lista].sort((x, y) => x.f.data.localeCompare(y.f.data)).slice(0, 9).map(({ p, f }) => html`<li><span class="ano">${f.data.slice(0, 4)}</span>
          <a href="#/pessoa/${p.id}">${p.nome}</a> · ${CAMPOS[f.campo] || f.campo}: ${f.valor}</li>`)}
        ${doMes.length > 9 ? html`<li class="mudo">9 dos ${doMes.length} factos com data neste mês, escolhidos ao acaso.</li>` : ''}`
      : html`<li class="mudo">Nenhum facto das fichas tem data neste dia.</li>`).s;
    return;
  }
  try {
    const r = await api('efemerides', { md });
    if (!el.isConnected) return; // entretanto mudou-se de página
    $('#efemerides').innerHTML = (r.resultados.length
      ? html`${r.resultados.slice(0, 9).map((d) => html`<li><span class="ano">${d.data.slice(0, 4)}</span>
          <a href="#/doc/${d.doc_id}">${tituloDoc(d.titulo)}</a></li>`)}`
      : html`<li class="mudo">Nenhum post publicado neste dia.</li>`).s;
  } catch { if (el.isConnected) $('#efemerides').innerHTML = '<li class="mudo">Servidor local desligado.</li>'; }
}
