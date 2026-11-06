// A área reservada: um só lugar para quem tem acesso. Quem não entrou vê o ecrã de entrar (conta.js); quem entrou vê os
// separadores. Cada separador diz numa frase o que é: o que a IA deixou por decidir, o que as pessoas propuseram, o que já
// entrou, o que escreveram de fora.
import { E } from '../estado.js';
import { $$, api, compararPt, definirParams, fmtData, html } from '../util.js';
import { eAdmin, podeAprovar, sessao } from '../edicao.js';
import { abrirLinkDeAcesso, entrar } from './conta.js';
import { formContribuidor, O_QUE_FAZ, PAPEIS_CONTRIBUIDOR } from './contribuidores.js';

const online = () => E.sessao?.modo === 'online';

const SEPARADORES = [
  { id: 'validar', href: '#/validar', nome: 'Por validar',
    explica: 'Questões da IA: o que ela escreveu ou detetou nos dados e só uma pessoa pode decidir.' },
  { id: 'propostas', href: '#/propostas', nome: 'Propostas', contagem: 'propostas', ver: online,
    explica: 'Sugestões de pessoas: o que os contribuidores alteraram. Só entra no site depois de um editor aprovar.' },
  { id: 'alteracoes', href: '#/alteracoes', nome: 'Alterações recentes',
    explica: 'O que já entrou no site: quem fez, quando e o quê. É aqui que se desfaz uma alteração.' },
  { id: 'mensagens', href: '#/mensagens', nome: 'Mensagens', contagem: 'mensagens', ver: () => online() && eAdmin(),
    explica: 'O que pessoas de fora escreveram na página Contacto. Só os administradores veem. Não é um chat entre contribuidores.' },
  { id: 'contribuidores', href: '#/reservada/contribuidores', nome: 'Contribuidores',
    explica: 'Quem tem acesso, com que papel e como entra.' },
  { id: 'conta', href: '#/conta', nome: 'A minha conta', ver: online,
    explica: 'O seu nome de utilizador, a palavra-passe e a ligação ao GitHub.' },
];

/** O topo de todas as páginas da área reservada: quem entrou, os separadores, o título e o que é este separador. */
export function barraReservada(ativo, extra = '') {
  const c = sessao(), s = SEPARADORES.find((x) => x.id === ativo);
  return html`<div class="topo-reservada"><p class="sobretitulo">Área reservada</p>
      ${online() && c ? html`<p class="quem-reservada">${c.nome} · ${PAPEIS_CONTRIBUIDOR[c.papel] || c.papel} · <a href="/api/sair">Sair</a></p>` : ''}</div>
    <nav class="separadores separadores-reservada" aria-label="Área reservada">${SEPARADORES.filter((x) => !x.ver || x.ver()).map((x) => html`<a class="separador"
      href="${x.href}" ${x.id === ativo ? html`aria-current="page"` : ''}>${x.nome}${x.contagem ? html` <span class="n" data-contagem="${x.contagem}">${E.contagens?.[x.contagem] || ''}</span>` : ''}</a>`)}</nav>
    <header class="cabecalho cabecalho-reservada"><h1>${s.nome}</h1><p class="lead">${s.explica}${extra}</p></header>`;
}

/** «Área reservada» no menu: quem não entrou vê o ecrã de entrar; quem entrou segue para o primeiro separador que lhe interessa. */
export function reservada(el, params = {}) {
  if (!sessao()) return entrar(el, params);
  location.replace(online() && !podeAprovar() ? '#/propostas' : '#/validar');
  return undefined;
}

const ORDEM = { dono: 0, administrador: 1, editor: 2, contribuidor: 3, antigo: 4 };

/** Quem tem acesso: todos veem as pessoas e os papéis; os administradores veem também como cada uma entra, e gerem-nas. */
export function gestaoContribuidores(el, params = {}) {
  const gerir = eAdmin();
  const podeGerir = (c) => gerir && (c.papel !== 'dono' || sessao()?.papel === 'dono'); // o fundador só ele próprio
  const acessos = gerir && online() && E.sessao.entrada_conta;
  const lista = Object.values(E.contribuidores).sort((a, b) => ORDEM[a.papel] - ORDEM[b.papel] || compararPt(a.nome, b.nome));
  el.innerHTML = html`<div class="conteudo">${barraReservada('contribuidores')}
    <div class="tabela-rolagem"><table class="tabela tabela-fontes tabela-acessos">
      <thead><tr><th>Pessoa</th><th>Papel</th><th>O que pode fazer</th>${acessos ? html`<th>Como entra</th>` : ''}${gerir ? html`<th></th>` : ''}</tr></thead>
      <tbody>${lista.map((c) => html`<tr id="c-${c.id}" class="${params.quem === c.id ? 'destaque' : ''}">
        <td data-rotulo="Pessoa"><a href="#/contribuidores?quem=${c.id}"><b>${c.nome}</b></a>${c.desde ? html`<br><span class="mudo">desde ${fmtData(c.desde)}</span>` : ''}</td>
        <td data-rotulo="Papel"><span class="selo ${c.papel === 'antigo' ? '' : 'ouro'}">${PAPEIS_CONTRIBUIDOR[c.papel] || c.papel}</span></td>
        <td data-rotulo="O que pode fazer">${O_QUE_FAZ[c.papel === 'dono' ? 'administrador' : c.papel] || 'sem acesso; os contributos ficam'}</td>
        ${acessos ? html`<td data-rotulo="Como entra" data-entrada="${c.id}">${c.github ? html`GitHub @${c.github}` : ''}</td>` : ''}
        ${gerir ? html`<td data-rotulo="">${acessos && podeGerir(c) && c.papel !== 'antigo' ? html`<button type="button" class="botao peq" data-link-acesso="${c.id}">Link de acesso</button>` : ''}
          ${podeGerir(c) ? html`<details class="gerir"><summary>Alterar</summary>${formContribuidor(c)}</details>` : ''}</td>` : ''}</tr>`)}</tbody></table></div>
    ${gerir ? html`<section class="seccao estreito">${formContribuidor(null)}</section>` : ''}
  </div>`.s;
  if (params.quem) document.getElementById(`c-${params.quem}`)?.scrollIntoView({ block: 'center' });
  if (!acessos) return;
  $$('[data-link-acesso]', el).forEach((b) => { b.onclick = () => abrirLinkDeAcesso(b.dataset.linkAcesso); });
  if (params.link && params.quem) { definirParams({ quem: params.quem }); abrirLinkDeAcesso(params.quem); } // acabou de a convidar
  api('contas/estado').then(({ contas, links, nomes = {}, github = {} }) => {
    for (const td of $$('[data-entrada]', el)) {
      const id = td.dataset.entrada, partes = [];
      partes.push(contas[id] ? `utilizador ${nomes[id] || id}` : links[id] ? `link por usar, até ${fmtData(new Date(links[id]).toISOString().slice(0, 10))}` : 'ainda sem palavra-passe');
      if (github[id]) partes.push(`GitHub @${github[id]}`);
      if (E.contribuidores[id]?.github) partes.push(`GitHub @${E.contribuidores[id].github}`);
      td.textContent = [...new Set(partes)].join(' · ');
    }
  }).catch(() => {});
}

