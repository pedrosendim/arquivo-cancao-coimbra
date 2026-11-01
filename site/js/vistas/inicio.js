import { E, CAMPOS, comArquivo, visivel } from '../estado.js';
import { $, html, raw, esc, api, tituloDoc, plural, miniatura } from '../util.js';
import { cartaoMediaArquivo, cartaoMediaCurado, cartaoPessoa } from '../componentes.js';

export async function inicio(el) {
  const b = E.base;
  const docs = (E.arquivo?.documentos || []).reduce((a, d) => a + (d.tipo === 'post' ? d.n : 0), 0);
  const m = E.arquivo?.media || {};
  const hoje = new Date();
  const md = `${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  // online não há a cópia dos blogues: os números, o «ao acaso» e o «neste dia» vêm só das fichas
  const arquivo = comArquivo();
  const numeros = [
    [b.pessoas.length, 'pessoas', '#/pessoas'], [b.gravacoes.length, 'gravações', '#/discografia'],
    [b.obras.length, 'obras', '#/obras'], [b.instrumentos.length, 'instrumentos', '#/instrumentos'],
    ...(arquivo ? [[docs, 'posts arquivados', '#/arquivo'], [(m.video || 0) + (m.audio || 0), 'vídeos e áudios', '#/mediateca'],
      [m.imagem || 0, 'imagens', '#/mediateca?separador=imagens']]
      : [[b.media.filter(visivel).length, 'vídeos e áudios', '#/mediateca']]),
  ];

  const comFoto = b.pessoas.filter((p) => p.imagens?.length).sort(() => Math.random() - 0.5).slice(0, 8);
  el.innerHTML = html`<div class="conteudo">
    <section class="heroi ${comFoto.length >= 4 ? 'com-mosaico' : ''}">
      <div>
      <p class="sobretitulo">Ferramenta de estudo</p>
      <h1>A Canção de Coimbra, <em>organizada</em> a partir das suas fontes.</h1>
      <p class="lead">Pessoas, linhagens, gravações, instrumentos, letras e vídeos — cada informação ligada à
        frase exata da fonte que a sustenta. Nada é acrescentado: só arrumado.</p>
      <form id="f-heroi"><input class="campo" name="q" type="search" aria-label="${arquivo ? 'Pesquisar no arquivo' : 'Procurar uma pessoa'}"
        placeholder="${arquivo ? `Pesquisar em ${docs.toLocaleString('pt-PT')} posts…` : 'Procurar uma pessoa ou grupo…'}">
        <button class="botao primario">Pesquisar</button></form>
      </div>
      ${comFoto.length >= 4 ? html`<div class="mosaico" aria-label="Algumas pessoas do arquivo">${comFoto.map((p) =>
        html`<a href="#/pessoa/${p.id}" style="background-image:url('${raw(esc(miniatura(p.imagens[0].url, 300)))}')"><span>${p.nome}</span></a>`)}</div>` : ''}
      <div class="numeros">${numeros.map(([n, r, h]) => html`<a href="${h}"><b>${n.toLocaleString('pt-PT')}</b><span>${r}</span></a>`)}</div>
    </section>

    <div class="duas-colunas">
      <section class="seccao">
        <h2>Ao acaso <small>${arquivo ? 'vídeos e áudios do arquivo' : 'vídeos e áudios das fichas'}</small>
          <button class="botao peq" id="baralhar" style="margin-left:auto">Outros</button></h2>
        <div class="grelha" id="acaso"><p class="carregando">A escolher</p></div>
      </section>
      <section class="seccao">
        <h2>${arquivo ? 'Neste dia, no blogue' : 'Neste dia'} <small>${hoje.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}</small></h2>
        <ul class="efemerides" id="efemerides"><li class="carregando">A procurar</li></ul>
      </section>
    </div>

    ${b.pessoas.length ? html`<section class="seccao"><h2>Pessoas <small>${plural(b.pessoas.length, 'ficha', 'fichas')}</small>
      <a class="botao peq" href="#/pessoas" style="margin-left:auto">Ver todas</a></h2>
      <div class="grelha">${[...b.pessoas].sort(() => Math.random() - .5).slice(0, 4).map(cartaoPessoa)}</div></section>` : ''}
  </div>`.s;

  $('#f-heroi').onsubmit = (e) => { e.preventDefault(); location.hash = `#/${arquivo ? 'arquivo' : 'pessoas'}?q=${encodeURIComponent(e.target.q.value)}`; };
  const acaso = async () => {
    const caixa = $('#acaso');
    if (!caixa) return;
    if (!arquivo) {
      const videos = b.media.filter((x) => visivel(x) && x.plataforma === 'youtube').sort(() => Math.random() - 0.5).slice(0, 4);
      caixa.innerHTML = html`${videos.map(cartaoMediaCurado)}`.s;
      return;
    }
    try {
      const r = await api('media', { tipo: 'video', plataforma: 'youtube', ordem: 'aleatorio' });
      caixa.innerHTML = html`${r.resultados.slice(0, 4).map(cartaoMediaArquivo)}`.s;
    } catch { caixa.innerHTML = '<p class="mudo">Ligue o servidor local para ver o arquivo.</p>'; }
  };
  $('#baralhar').onclick = acaso;
  acaso();
  if (!arquivo) { // nascimentos, mortes e outros factos com data completa neste dia, tirados das fichas
    const doDia = b.pessoas.flatMap((p) => (p.factos || []).filter((f) => !f.conflito && f.data?.length === 10 && f.data.slice(5) === md)
      .map((f) => ({ p, f }))).sort((x, y) => x.f.data.localeCompare(y.f.data));
    $('#efemerides').innerHTML = (doDia.length
      ? html`${doDia.slice(0, 9).map(({ p, f }) => html`<li><span class="ano">${f.data.slice(0, 4)}</span>
          <a href="#/pessoa/${p.id}">${p.nome}</a> · ${CAMPOS[f.campo] || f.campo}: ${f.valor}</li>`)}`
      : html`<li class="mudo">Nenhum facto das fichas tem data neste dia.</li>`).s;
    return;
  }
  try {
    const r = await api('efemerides', { md });
    $('#efemerides').innerHTML = (r.resultados.length
      ? html`${r.resultados.slice(0, 9).map((d) => html`<li><span class="ano">${d.data.slice(0, 4)}</span>
          <a href="#/doc/${d.doc_id}">${tituloDoc(d.titulo)}</a></li>`)}`
      : html`<li class="mudo">Nenhum post publicado neste dia.</li>`).s;
  } catch { $('#efemerides').innerHTML = '<li class="mudo">Servidor local desligado.</li>'; }
}
