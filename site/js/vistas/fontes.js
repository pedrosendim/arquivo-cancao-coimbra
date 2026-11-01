// Fontes e método: registo de fontes com estado de aprovação e princípios do arquivo.
import { E, TIPOS_FONTE, nomeContribuidor } from '../estado.js';
import { html, fmtData, plural } from '../util.js';
import { editando, podeAprovar } from '../edicao.js';
import { separadoresFontes } from '../componentes.js';

const ESTADOS = { aprovada: ['Aprovadas', 'verde'], pendente: ['Propostas — aguardam a decisão de um editor', 'ouro'], rejeitada: ['Rejeitadas', 'vinho'] };

/** Botões de decisão (só editores, no modo de edição); fora dele, o comando equivalente. */
function decisao(f) {
  if (editando() && podeAprovar()) {
    return html`<div class="acoes" style="margin-top:6px">
      <button class="botao peq primario" data-acao="decidir-fonte" data-id="${f.id}" data-estado="aprovada">${f.estado === 'aprovada' ? 'Confirmar' : 'Aprovar'}</button>
      <button class="botao peq" data-acao="decidir-fonte" data-id="${f.id}" data-estado="rejeitada" data-pedir="Motivo da rejeição (fica registado)">Rejeitar</button></div>`;
  }
  return html`<br><span class="codigo" style="font-size:11px">python scripts/fontes.py aprovar ${f.id}</span>`;
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

export function fontes(el) {
  const docs = {};
  for (const d of E.arquivo?.documentos || []) (docs[d.fonte] ||= {})[d.tipo] = d;
  const v = E.base.validacao || {};
  const grupo = (estado) => (E.base.fontes || []).filter((f) => f.estado === estado);
  const quem = (f) => [f.proposta_por && `proposta por ${nomeContribuidor(f.proposta_por)}`,
    f.decidido_por && `${f.estado === 'rejeitada' ? 'rejeitada' : 'aprovada'} por ${nomeContribuidor(f.decidido_por)}${f.decidido_em ? ` em ${fmtData(f.decidido_em)}` : ''}`]
    .filter(Boolean).join(' · ');

  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Fontes</p><h1>Fontes e método</h1>
      <p class="lead">Este arquivo não produz informação nova. Organiza, cruza e apresenta o que dizem as fontes que aprovou —
        e mostra sempre de onde vem cada coisa.</p></header>
    ${separadoresFontes('fontes')}

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
        ${plural(v.avisos || 0, 'aviso', 'avisos')} · ${plural(v.erros || 0, 'erro', 'erros')}
        ${E.base.gerado_em ? html` · gerado em ${fmtData(E.base.gerado_em)}` : ''}</p></section>

    ${Object.entries(ESTADOS).map(([estado, [titulo, corSelo]]) => {
      const lista = grupo(estado);
      if (!lista.length) return '';
      return html`<section class="seccao"><h2>${titulo} <small>${lista.length}</small></h2><div class="tabela-rolagem"><table class="tabela">
        <thead><tr><th>Fonte</th><th>Tipo</th><th>Uso</th><th>${estado === 'aprovada' ? 'No arquivo' : 'Porquê'}</th><th>Citações</th></tr></thead>
        <tbody>${lista.map((f) => {
          const dd = docs[f.id];
          const arquivado = dd ? [dd.post && plural(dd.post.n, 'post', 'posts'), dd.comentario && plural(dd.comentario.n, 'comentário', 'comentários'),
            dd.pagina && plural(dd.pagina.n, 'página', 'páginas')].filter(Boolean).join(', ')
            + (dd.post ? ` (${dd.post.desde.slice(0, 4)}–${dd.post.ate.slice(0, 4)})` : '') : '—';
          return html`<tr><td><a href="${f.url}" target="_blank" rel="noopener"><b>${f.nome}</b></a>${f.autor ? html`<br><span class="mudo">${f.autor}</span>` : ''}
            ${f.aprovacao === 'pedido-geral' ? html`<br><span class="selo ouro" title="Aprovada ao abrigo de um pedido geral (ex.: procurar fotografias). Confirme ou rejeite.">por confirmar</span>
              ${decisao(f)}` : ''}
            ${quem(f) ? html`<br><span class="mudo" style="font-size:12px">${quem(f)}</span>` : ''}</td>
            <td><span class="selo">${f.tipo}</span></td><td>${(f.uso || []).join(', ')}</td>
            <td style="max-width:380px">${estado === 'aprovada' ? html`${arquivado}${f.notas ? html`<br><span class="mudo" style="font-size:12.5px">${f.notas}</span>` : ''}`
              : html`${f.notas}${estado === 'pendente' ? decisao(f) : ''}`}</td>
            <td><span class="selo ${f.n_citacoes ? corSelo : ''}">${f.n_citacoes || 0}</span></td></tr>`;
        })}</tbody></table></div></section>`;
    })}

    ${editando() ? formPropor() : ''}

    <section class="seccao estreito"><h2>Como funciona</h2>
      <ol style="font:16px/1.7 var(--f-leitura);padding-left:22px">
        <li><b>Recolha</b> — <span class="codigo">recolher_blogger.py</span> copia todos os posts e comentários pelo feed oficial do Blogger; <span class="codigo">guardar_pagina.py</span> arquiva páginas de outras fontes aprovadas (respeitando o robots.txt).</li>
        <li><b>Índice</b> — <span class="codigo">indexar.py</span> cria a pesquisa de texto integral e extrai os vídeos, áudios e imagens de cada post.</li>
        <li><b>Investigação</b> — o agente <i>investigador-coimbra</i> lê o arquivo e escreve fichas em <span class="codigo">dados/</span>, cada afirmação com citação.</li>
        <li><b>Validação</b> — <span class="codigo">validar.py</span> recusa qualquer citação que não exista na fonte, fontes não aprovadas e referências partidas.</li>
        <li><b>Publicação</b> — <span class="codigo">construir.py</span> gera os dados do site; o editor revê e marca as fichas como «revisto».</li>
      </ol></section>
  </div>`.s;
}
