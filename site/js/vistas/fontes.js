// Fontes e método: registo de fontes com estado de aprovação e princípios do arquivo.
import { E, TIPOS_FONTE, nomeContribuidor } from '../estado.js';
import { html, fmtData, plural, compararPt, $, $$, enderecoSeguro } from '../util.js';
import { editando, podeAprovar, botaoCorrigirFonte } from '../edicao.js';
import { separadoresFontes } from '../componentes.js';

const ESTADOS = { aprovada: ['Aprovadas', 'verde'], pendente: ['Propostas — aguardam a decisão de um editor', 'ouro'], rejeitada: ['Rejeitadas', 'vinho'] };

/** Botões de decisão (só editores, no modo de edição); fora dele, quem decide (sem comandos de terminal). */
function decisao(f) {
  if (editando() && podeAprovar()) {
    return html`<div class="acoes" style="margin-top:6px">
      <button class="botao peq primario" data-acao="decidir-fonte" data-id="${f.id}" data-estado="aprovada">${f.estado === 'aprovada' ? 'Confirmar' : 'Aprovar'}</button>
      <button class="botao peq" data-acao="decidir-fonte" data-id="${f.id}" data-estado="rejeitada" data-pedir="Motivo da rejeição (fica registado)">Rejeitar</button></div>`;
  }
  return f.estado === 'pendente' ? html`<br><span class="mudo" style="font-size:12px">Aguarda a decisão de um editor.</span>` : '';
}

const USOS = { factos: 'factos', media: 'vídeos, áudios e fotografias' };
const FILTROS_USO = { '': 'Todas', factos: 'Factos', media: 'Vídeos, áudios e fotografias', 'sem-uso': 'Ainda sem citações' };

/** Aprovada só provisoriamente, ao abrigo de um pedido geral do fundador (ex.: «procurar fotografias»): o campo «aprovacao»
 *  ou, nas notas, a marca deixada pelo agente («[Aprovada ao abrigo do pedido do utilizador: … — por confirmar]»), enquanto
 *  ninguém a confirmar. */
export const porConfirmar = (f) => f.estado === 'aprovada'
  && (f.aprovacao === 'pedido-geral' || (!f.decidido_por && /\[Aprovada ao abrigo do pedido[^\]]*por confirmar\]/i.test(f.notas || '')));

/** Quantas vezes cada fonte é citada nas fichas: com frase literal, e só como referência (um vídeo ou áudio, sem frase). */
function contarCitacoes() {
  const n = {};
  const ver = (x) => {
    if (Array.isArray(x)) x.forEach(ver);
    else if (x && typeof x === 'object') {
      if (typeof x.fonte === 'string' && 'url' in x) { const c = (n[x.fonte] ||= { frases: 0, referencias: 0 }); if (String(x.citacao || '').trim()) c.frases++; else c.referencias++; }
      Object.values(x).forEach(ver);
    }
  };
  for (const t of ['pessoas', 'obras', 'gravacoes', 'instrumentos', 'media']) ver(E.base[t] || []);
  return n;
}

function formPropor() {
  return html`<section class="seccao estreito"><h2>Propor uma fonte</h2>
    <form class="caixa-edicao" data-acao="propor-fonte">
      <p class="mudo" style="margin:0 0 8px">Instituições, imprensa, livros, sites oficiais de artistas ou luthiers, bases discográficas.
        Redes sociais, fóruns e lojas não servem. A fonte fica «pendente» até um editor a aprovar.</p>
      <label>Nome <input class="campo" name="nome" required placeholder="Ex.: Arquivo Municipal de Coimbra"></label>
      <label>Endereço <input class="campo" name="url" type="url" required placeholder="https://…"></label>
      <div class="linha-campos">
        <label>Tipo <select class="campo" name="tipo">${Object.entries(TIPOS_FONTE).map(([v, t]) => html`<option value="${v}">${t}</option>`)}</select></label>
        <label>Autor <small>se for um texto de alguém</small><input class="campo" name="autor"></label></div>
      <p class="opcoes">Serve para:
        <label class="opcao"><input type="checkbox" name="uso[]" value="factos" checked> factos (datas, biografias, relações)</label>
        <label class="opcao"><input type="checkbox" name="uso[]" value="media"> fotografias, vídeos e áudios</label></p>
      <label>Porquê <small>porque é séria e o que traz ao arquivo</small><textarea class="campo" name="notas" rows="3" required></textarea></label>
      <div class="acoes"><button class="botao peq primario">Propor fonte</button></div>
    </form></section>`;
}

/** «Estado dos dados»: as citações com frase ainda não verificadas (por confirmar, de documentos não arquivados, não
 *  encontradas) e, à parte, as de fontes rejeitadas, que já não servem de prova: retiram-se ou trocam-se. */
function citacoesPorVerificar(v) {
  const rejeitadas = v.citacoes_por_estado?.['fonte-rejeitada'] || 0;
  const falta = (v.citacoes || 0) - (v.citacoes_verificadas || 0) - rejeitadas;
  return html`${falta > 0 ? html`${falta.toLocaleString('pt-PT')} por verificar · ` : ''}${rejeitadas
    ? html`${plural(rejeitadas, 'citação de fonte rejeitada', 'citações de fontes rejeitadas')} · ` : ''}`;
}

export function fontes(el) {
  const docs = {};
  for (const d of E.arquivo?.documentos || []) (docs[d.fonte] ||= {})[d.tipo] = d;
  const v = E.base.validacao || {};
  const citacoes = contarCitacoes();
  const grupo = (estado) => (E.base.fontes || []).filter((f) => f.estado === estado);
  const quem = (f) => [f.proposta_por && `proposta por ${nomeContribuidor(f.proposta_por)}`,
    f.decidido_por && `${f.estado === 'rejeitada' ? 'rejeitada' : 'aprovada'} por ${nomeContribuidor(f.decidido_por)}${f.decidido_em ? ` em ${fmtData(f.decidido_em)}` : ''}`]
    .filter(Boolean).join(' · ');

  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Fontes</p><h1>Fontes e método</h1>
      <p class="lead">Este arquivo não produz informação nova. Organiza, cruza e apresenta o que dizem as fontes que aprovou —
        e mostra sempre de onde vem cada coisa.</p></header>
    ${separadoresFontes('fontes')}

    <h2 class="so-leitor">Princípios do arquivo</h2>
    <div class="principios">
      <div><h3>Só fontes aprovadas</h3><p>O agente investigador só extrai de fontes com estado «aprovada». Fontes novas entram como
        propostas e esperam pela decisão do dono do arquivo ou de um editor que ele convidou.</p></div>
      <div><h3>Citação literal</h3><p>Cada facto, relação, excerto ou letra traz a frase exata da fonte. O validador confirma,
        palavra por palavra, que essa frase existe no documento arquivado.</p></div>
      <div><h3>Divergências visíveis</h3><p>Quando as fontes discordam, mostram-se todas as versões lado a lado. Nenhuma é escolhida
        pelo sistema.</p></div>
      <div><h3>Revisão humana</h3><p>Tudo o que o agente escreve fica como «rascunho» até um editor o marcar como «revisto».</p></div>
      <div><h3>Contributos assinados</h3><p>O que um contribuidor sabe sem fonte (uma fotografia, um parentesco, uma nota) entra com ✎,
        o nome de quem o indicou e a data. Nunca passa por fonte.</p></div>
    </div>

    <section class="seccao"><h2>Estado dos dados</h2>
      <p>${plural(v.citacoes_verificadas || 0, 'citação verificada', 'citações verificadas')} no arquivo local ·
        ${citacoesPorVerificar(v)}
        ${plural(v.avisos || 0, 'aviso', 'avisos')} · ${plural(v.erros || 0, 'erro', 'erros')}
        ${E.base.gerado_em ? html` · gerado em ${fmtData(E.base.gerado_em)}` : ''}</p></section>

    <div class="fichas filtro-uso" role="group" aria-label="Serve para">${Object.entries(FILTROS_USO).map(([k, nome]) =>
      html`<button type="button" class="ficha" data-uso="${k}" aria-pressed="${String(!k)}">${nome}</button>`)}</div>

    ${Object.entries(ESTADOS).map(([estado, [titulo, corSelo]]) => {
      // por tipo (com os nomes de TIPOS_FONTE) e, em cada tipo, pelo nome
      const ordemTipo = Object.keys(TIPOS_FONTE);
      const pos = (t) => { const k = ordemTipo.indexOf(t); return k < 0 ? ordemTipo.length : k; };
      const lista = grupo(estado).sort((a, b) => pos(a.tipo) - pos(b.tipo) || compararPt(a.nome, b.nome));
      if (!lista.length) return '';
      return html`<section class="seccao"><h2>${titulo} <small>${lista.length}</small></h2><div class="tabela-rolagem"><table class="tabela tabela-fontes">
        <thead><tr><th>Fonte</th><th>Tipo</th><th>Serve para</th><th>${estado === 'aprovada' ? 'No arquivo' : 'Porquê'}</th><th>Citações nas fichas</th></tr></thead>
        <tbody>${lista.map((f, k) => {
          const dd = docs[f.id];
          const arquivado = dd ? [dd.post && plural(dd.post.n, 'post', 'posts'), dd.comentario && plural(dd.comentario.n, 'comentário', 'comentários'),
            dd.pagina && plural(dd.pagina.n, 'página', 'páginas')].filter(Boolean).join(', ')
            + (dd.post ? ` (${dd.post.desde.slice(0, 4)}–${dd.post.ate.slice(0, 4)})` : '') : '—';
          const c = citacoes[f.id] || { frases: 0, referencias: 0 };
          const novoTipo = !k || lista[k - 1].tipo !== f.tipo;
          const notas = f.notas ? html`<details class="notas-fonte"><summary>notas</summary>${f.notas}</details>` : '';
          return html`${novoTipo ? html`<tr class="grupo-tipo" data-tipo="${f.tipo}"><th colspan="5">${TIPOS_FONTE[f.tipo] || f.tipo}
              <small>${lista.filter((x) => x.tipo === f.tipo).length}</small></th></tr>` : ''}
            <tr data-tipo="${f.tipo}" data-usos="${(f.uso || []).join(' ')}" data-sem-uso="${String(!c.frases && !c.referencias)}"><td data-rotulo="Fonte">${enderecoSeguro(f.url) ? html`<a href="${enderecoSeguro(f.url)}" target="_blank" rel="noopener"><b>${f.nome}</b></a>` : html`<b>${f.nome}</b>`}${f.autor ? html`<br><span class="mudo">${f.autor}</span>` : ''}
            ${porConfirmar(f) ? html`<br><span class="selo ouro" title="Aprovada ao abrigo de um pedido geral do fundador (ex.: procurar fotografias): falta a decisão dele.">aprovada provisoriamente — por confirmar pelo fundador</span>
              ${decisao(f)}` : ''}
            ${quem(f) ? html`<br><span class="mudo" style="font-size:12px">${quem(f)}</span>` : ''}${botaoCorrigirFonte(f)}</td>
            <td data-rotulo="Tipo"><span class="selo">${TIPOS_FONTE[f.tipo] || f.tipo}</span></td>
            <td data-rotulo="Serve para">${(f.uso || []).map((u) => USOS[u] || u).join('; ')}</td>
            <td data-rotulo="${estado === 'aprovada' ? 'No arquivo' : 'Porquê'}" style="max-width:380px">${estado === 'aprovada' ? html`${arquivado}${notas}`
              : html`${f.notas}${estado === 'pendente' ? decisao(f) : ''}`}</td>
            <td data-rotulo="Citações nas fichas">${c.frases ? html`<span class="selo ${corSelo}">${plural(c.frases, 'citação literal', 'citações literais')}</span>` : ''}
              ${c.referencias ? html` <span class="selo" title="Referências sem frase: identificam um vídeo ou áudio na plataforma">${plural(c.referencias, 'vídeo ou áudio', 'vídeos e áudios')}</span>` : ''}
              ${!c.frases && !c.referencias ? html`<span class="mudo">ainda sem uso</span>` : ''}</td></tr>`;
        })}</tbody></table></div></section>`;
    })}

    ${editando() ? formPropor() : html`<p class="propor-fonte">Conhece uma fonte séria que falta aqui? <a href="#/contribuir">Entre e ligue o modo de edição</a>
      para a propor: fica «proposta» até um editor decidir.</p>`}

    <section class="seccao estreito"><h2>Como funciona</h2>
      <ol style="font:16px/1.7 var(--f-leitura);padding-left:22px">
        <li><b>Recolha</b> — <span class="codigo">recolher_blogger.py</span> copia todos os posts e comentários pelo feed oficial do Blogger; <span class="codigo">guardar_pagina.py</span> arquiva páginas de outras fontes aprovadas (respeitando o robots.txt).</li>
        <li><b>Índice</b> — <span class="codigo">indexar.py</span> cria a pesquisa de texto integral e extrai os vídeos, áudios e imagens de cada post.</li>
        <li><b>Investigação</b> — o agente <i>investigador-coimbra</i> lê o arquivo e escreve fichas em <span class="codigo">dados/</span>, cada afirmação com citação.</li>
        <li><b>Validação</b> — <span class="codigo">validar.py</span> recusa qualquer citação que não exista na fonte, fontes não aprovadas e referências partidas.</li>
        <li><b>Publicação</b> — <span class="codigo">construir.py</span> gera os dados do site; o editor revê e marca as fichas como «revisto».</li>
      </ol></section>
  </div>`.s;

  // «Serve para»: mostra só as fontes desse uso (ou as que ainda não têm nenhuma citação); os títulos de tipo vazios saem
  $('.filtro-uso', el).onclick = (e) => {
    const b = e.target.closest('[data-uso]');
    if (!b) return;
    const uso = b.dataset.uso;
    $$('.filtro-uso [data-uso]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    for (const tabela of $$('.tabela-fontes', el)) {
      const linhas = $$('tbody tr:not(.grupo-tipo)', tabela);
      for (const tr of linhas) {
        tr.hidden = uso === 'sem-uso' ? tr.dataset.semUso !== 'true' : !!uso && !tr.dataset.usos.split(' ').includes(uso);
      }
      for (const g of $$('tr.grupo-tipo', tabela)) g.hidden = !linhas.some((tr) => !tr.hidden && tr.dataset.tipo === g.dataset.tipo);
    }
  };
}
