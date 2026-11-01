// Propostas (só na versão online): o que os contribuidores alteraram no modo de edição, à espera de um editor.
import { E, nomeDe } from '../estado.js';
import { $, html, api, fmtData } from '../util.js';
import { sessao, podeAprovar } from '../edicao.js';

const VALIDACAO = {
  passou: ['verde', 'validação passou'], falhou: ['vinho', 'validação falhou'],
  'a-verificar': ['ouro', 'a validar…'], 'por-verificar': ['', 'ainda por validar'],
};

/** Ficha ou página do site que corresponde a um ficheiro alterado. */
function destino(caminho) {
  const m = caminho.match(/^dados\/(pessoas|obras|gravacoes|instrumentos|blogue|media)\/(.+)\.json$/);
  if (!m) return caminho === 'fontes/fontes.json' ? ['#/fontes', 'Registo de fontes'] : ['#/contribuidores', 'Contribuidores'];
  const [, tipo, id] = m;
  if (tipo === 'pessoas') return [`#/pessoa/${id}`, E.por.pessoas[id] ? nomeDe(id) : `${id} (ficha nova)`];
  if (tipo === 'blogue') return [`#/blogue/${id}`, `Blogue: ${E.base.blogue.find((p) => p.id === id)?.titulo || id}`];
  if (tipo === 'media') return ['#/mediateca', `Media: ${E.por.media[id]?.titulo || id}`];
  const rota = { obras: 'obra', gravacoes: 'gravacao', instrumentos: 'instrumento' }[tipo];
  const x = E.por[tipo][id];
  return [`#/${rota}/${id}`, x?.titulo || x?.designacao || id];
}

export async function propostas(el) {
  const cabecalho = html`<header class="cabecalho"><p class="sobretitulo">Sobre o arquivo</p><h1>Propostas</h1>
    <p class="lead">O que os contribuidores alteraram no modo de edição, à espera de um editor. Depois de aprovada,
      uma proposta entra no arquivo e o site atualiza-se em 1 a 2 minutos.</p></header>`;
  if (E.sessao?.modo !== 'online') {
    el.innerHTML = html`<div class="conteudo estreito">${cabecalho}<div class="vazio"><h3>Só na versão online</h3>
      <p>Na cópia local, o que grava no modo de edição fica logo no arquivo. As propostas dos contribuidores chegam pela versão online do site.</p></div></div>`.s;
    return;
  }
  if (!sessao()) {
    el.innerHTML = html`<div class="conteudo estreito">${cabecalho}<div class="vazio"><h3>Entre para ver as propostas</h3>
      <p>No fundo do menu, carregue em <b>Entrar</b>. Veja <a href="#/contribuir">como contribuir</a>.</p></div></div>`.s;
    return;
  }
  el.innerHTML = html`<div class="conteudo estreito">${cabecalho}<div id="lista-propostas"><p class="carregando">A carregar</p></div></div>`.s;
  let r;
  try { r = await api('propostas'); } catch (e) { $('#lista-propostas').innerHTML = html`<p class="mudo">Não foi possível ler as propostas: ${e.message}</p>`.s; return; }
  $('#lista-propostas').innerHTML = (r.propostas.length ? html`${r.propostas.map((p) => {
    const [cor, estado] = VALIDACAO[p.validacao];
    return html`<article class="proposta">
      <p class="meta">${fmtData(p.data.slice(0, 10))} · ${p.autor.nome} <span class="selo ${cor}">${estado}</span></p>
      <h2>${p.titulo}</h2>
      <ul class="lista-simples">${p.ficheiros.map((f) => {
        const [rota, nome] = destino(f.caminho);
        return html`<li><span class="mudo">${{ added: 'novo', removed: 'apagado' }[f.estado] || 'alterado'}</span> <a href="${rota}">${nome}</a></li>`;
      })}</ul>
      ${p.soDados === false ? html`<p class="selo vinho" style="display:block;padding:8px 10px;margin:8px 0;text-transform:none;font-size:13px">Esta proposta mexe em ficheiros que não são dados do arquivo. O site não a deixa aprovar: recuse-a.</p>` : ''}
      <div class="acoes-topo">
        <a class="botao peq" href="${p.url}/files" target="_blank" rel="noopener">Ver as diferenças ↗</a>
        ${r.editor ? html`<button class="botao peq primario" data-decidir="aprovar" data-numero="${p.numero}" ${p.validacao === 'falhou' || p.soDados === false ? 'disabled' : ''}>Aprovar</button>
          <button class="botao peq" data-decidir="recusar" data-numero="${p.numero}">Recusar</button>` : ''}
      </div></article>`;
  })}` : html`<div class="vazio"><h3>Não há propostas à espera</h3><p>${podeAprovar() ? 'Quando um contribuidor alterar alguma coisa, aparece aqui.' : 'As suas propostas aparecem aqui até um editor as decidir.'}</p></div>`).s;

  el.querySelectorAll('[data-decidir]').forEach((b) => {
    b.onclick = async () => {
      const decisao = b.dataset.decidir;
      const motivo = decisao === 'recusar' ? prompt('Porque recusa esta proposta? (fica registado)') : '';
      if (motivo === null || (decisao === 'aprovar' && !confirm('Aprovar esta proposta? Entra no arquivo e aparece no site.'))) return;
      b.disabled = true;
      const resp = await fetch('/api/propostas/decidir', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: +b.dataset.numero, decisao, motivo }) });
      const j = await resp.json().catch(() => ({ erro: 'resposta inválida' }));
      if (!resp.ok || j.erro) { alert(`Não foi possível: ${j.erro}`); b.disabled = false; return; }
      propostas(el);
    };
  });
}
