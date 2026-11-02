// Contribuidores convidados pelo dono do arquivo (com o que cada um fez) e o guia «Como contribuir».
import { E } from '../estado.js';
import { html, fmtData, plural } from '../util.js';
import { editando, eAdmin, sessao } from '../edicao.js';

export const PAPEIS_CONTRIBUIDOR = { dono: 'Administrador (fundador)', administrador: 'Administrador/a', editor: 'Editor/a', contribuidor: 'Contribuidor/a',
  antigo: 'Antigo contribuidor (sem acesso)' };
const O_QUE_FAZ = {
  administrador: 'convida pessoas e escolhe o papel de cada uma; aprova propostas e fontes',
  editor: 'aprova ou recusa as propostas e as fontes novas; o que altera entra logo',
  contribuidor: 'propõe: cria e corrige fichas, acrescenta factos, fontes, fotografias, famílias; um editor aprova',
};

/** Tudo o que está assinado por cada contribuidor (notas e revisões sem assinatura são do dono, anteriores ao registo). */
function contributos() {
  const dono = Object.values(E.contribuidores).find((c) => c.papel === 'dono')?.id;
  const res = {};
  const juntar = (por, tipo, ficha) => { ((res[por || dono] ||= {})[tipo] ||= new Map()).set(ficha.id, ficha); };
  for (const p of E.base.pessoas) {
    const ficha = { id: p.id, nome: p.nome, rota: `#/pessoa/${p.id}` };
    if (p.editorial) juntar(p.editorial.por, 'Fichas criadas', ficha);
    if (p.nota_editor) juntar(p.nota_editor_por, 'Notas', ficha);
    if (p.estado_revisao === 'revisto') juntar(p.revisto_por, 'Fichas revistas', ficha);
    for (const r of p.relacoes || []) {
      if (r.editorial) juntar(r.editorial.por, 'Relações', ficha);
      for (const c of r.fontes || []) if (c.acrescentada) juntar(c.acrescentada.por, 'Relações com fonte', ficha);
    }
    for (const im of [...(p.imagens || []), ...(p.imagens_ocultas || [])]) {
      if (im.editorial) juntar(im.editorial.por, 'Fotografias acrescentadas', ficha);
      if (im.escolhida) juntar(im.escolhida.por, 'Retratos escolhidos', ficha);
      if (im.oculta) juntar(im.oculta.por, 'Imagens escondidas', ficha);
    }
    for (const f of p.factos || []) if (f.nota_editorial) juntar(f.nota_editorial.por, 'Notas sobre factos', ficha);
  }
  for (const f of E.base.fontes) {
    const ficha = { id: f.id, nome: f.nome, rota: '#/fontes' };
    if (f.proposta_por) juntar(f.proposta_por, 'Fontes propostas', ficha);
    if (f.decidido_por) juntar(f.decidido_por, 'Fontes decididas', ficha);
  }
  for (const t of E.base.blogue) if (t.estado === 'publicado') juntar(t.autor, 'Textos no blogue', { id: t.id, nome: t.titulo, rota: `#/blogue/${t.id}` });
  return res;
}

function formContribuidor(c) {
  const novo = !c;
  c ||= { id: '', nome: '', github: '', papel: 'contribuidor', apresentacao: '' };
  return html`<form class="caixa-edicao" data-acao="guardar-contribuidor">
    ${novo ? html`<h3>Convidar uma pessoa</h3>
      <p class="mudo" style="margin:0 0 8px">Peça-lhe que crie uma conta gratuita no GitHub e lhe diga o nome de utilizador
        (ver <a href="#/contribuir">Como contribuir</a>). Quando o site estiver online, é esse nome que lhe dá entrada.</p>` : ''}
    <input type="hidden" name="id" value="${c.id}">
    <div class="linha-campos">
      <label>Nome <input class="campo" name="nome" required value="${c.nome}"></label>
      <label>Utilizador do GitHub <input class="campo" name="github" value="${c.github}" placeholder="ex.: maria-silva"></label>
      <label>Papel <select class="campo" name="papel">${Object.entries(PAPEIS_CONTRIBUIDOR)
        .filter(([k]) => (c.papel === 'dono' ? k === 'dono' : k !== 'dono'))
        .map(([k, t]) => html`<option value="${k}" ${k === c.papel ? 'selected' : ''}>${t}</option>`)}</select></label>
    </div>
    <label>Apresentação <small>opcional, aparece nesta página (ex.: guitarrista, investigador da família Grácio)</small>
      <textarea class="campo" name="apresentacao" rows="2">${c.apresentacao}</textarea></label>
    <div class="acoes"><button class="botao peq primario">${novo ? 'Convidar' : 'Guardar'}</button></div>
  </form>`;
}

export function contribuidores(el, params) {
  const feito = contributos();
  const ordem = { dono: 0, administrador: 1, editor: 2, contribuidor: 3, antigo: 4 };
  const lista = Object.values(E.contribuidores).sort((a, b) => ordem[a.papel] - ordem[b.papel] || a.nome.localeCompare(b.nome));
  const gerir = editando() && eAdmin();
  const podeGerir = (c) => gerir && (c.papel !== 'dono' || sessao()?.papel === 'dono'); // o fundador só ele próprio
  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Sobre o arquivo</p><h1>Contribuidores</h1>
      <p class="lead">Quem ajuda a construir o arquivo, por convite do seu dono. Cada contributo fica assinado com o nome de
        quem o fez e a data, e marcado com ✎ nas fichas.</p>
      <ul class="papeis-lista">${Object.entries(O_QUE_FAZ).map(([k, t]) => html`<li><b>${PAPEIS_CONTRIBUIDOR[k]}</b>: ${t}.</li>`)}</ul>
      <p style="margin-top:16px"><a class="botao primario" href="#/contribuir">Como contribuir</a></p></header>
    <div class="grelha larga">${lista.map((c) => {
      const f = feito[c.id] || {};
      const total = Object.values(f).reduce((n, m) => n + m.size, 0);
      return html`<article class="cartao contribuidor ${params.quem === c.id ? 'destaque' : ''}" id="c-${c.id}"><div class="cartao-corpo">
        <p class="meta"><span class="selo ${c.papel === 'antigo' ? '' : 'ouro'}">${PAPEIS_CONTRIBUIDOR[c.papel] || c.papel}</span>
          ${c.desde ? html` desde ${fmtData(c.desde)}` : ''}</p>
        <h3>${c.nome}</h3>
        ${c.apresentacao ? html`<p class="resumo">${c.apresentacao}</p>` : ''}
        ${total ? html`<dl class="contributos">${Object.entries(f).map(([tipo, fichas]) => html`<dt>${tipo} <span class="n">${fichas.size}</span></dt>
          <dd>${[...fichas.values()].slice(0, 6).map((x, i) => html`${i ? ', ' : ''}<a href="${x.rota}">${x.nome}</a>`)}${fichas.size > 6 ? ` e mais ${fichas.size - 6}` : ''}</dd>`)}</dl>`
          : html`<p class="mudo">Ainda sem contributos assinados.</p>`}
        ${podeGerir(c) ? html`<details class="gerir"><summary>Alterar</summary>${formContribuidor(c)}</details>` : ''}
      </div></article>`;
    })}</div>
    ${gerir ? html`<section class="seccao estreito">${formContribuidor(null)}</section>` : ''}
  </div>`.s;
  if (params.quem) document.getElementById(`c-${params.quem}`)?.scrollIntoView({ block: 'center' });
}

export function contribuir(el) {
  const n = Object.values(E.contribuidores).filter((c) => c.papel !== 'antigo').length;
  el.innerHTML = html`<div class="conteudo estreito guia">
    <header class="cabecalho"><p class="sobretitulo"><a href="#/contribuidores">Contribuidores</a></p><h1>Como contribuir</h1>
      <p class="lead">O arquivo cresce com quem conhece a Canção de Coimbra. Não precisa de saber programar: tudo se faz
        nas próprias páginas do site, com botões e formulários.</p></header>

    <section class="seccao"><h2>O que pode fazer</h2>
      <div class="principios">
        <div><h3>Contribuidor</h3><p>Escolher ou corrigir fotografias, acrescentar parentescos e parcerias, deixar notas
          assinadas nas fichas e nos factos com dúvidas, propor fontes novas e escrever no blogue.</p></div>
        <div><h3>Editor</h3><p>Tudo o que um contribuidor faz e ainda aprovar as propostas dos outros, aprovar ou rejeitar
          fontes e marcar fichas como revistas.</p></div>
        <div><h3>Só por convite</h3><p>Quem decide quem entra, e com que papel, é o dono do arquivo.
          ${n > 1 ? `Hoje são ${n} pessoas.` : ''}</p></div>
      </div></section>

    <section class="seccao"><h2>1. Na primeira vez: criar a conta</h2>
      <p>O arquivo usa o GitHub, um serviço gratuito, só para saber quem é cada pessoa e guardar o histórico das alterações.
        Não vai precisar de usar o GitHub para mais nada.</p>
      <ol class="passos">
        <li>Abra <a href="https://github.com/signup" target="_blank" rel="noopener">github.com/signup</a>.</li>
        <li>Escreva o seu email, crie uma palavra-passe e escolha um nome de utilizador (por exemplo <i>maria-silva</i>).</li>
        <li>O GitHub envia-lhe um código por email. Copie-o para a página e a conta fica criada.</li>
        <li>Envie o seu <b>nome de utilizador</b> ao dono do arquivo. Ele regista-o como contribuidor ou editor.</li>
      </ol></section>

    <section class="seccao"><h2>2. Entrar e ligar o modo de edição</h2>
      <ol class="passos">
        <li>No fundo do menu, à esquerda, carregue em <b>Entrar</b> e depois em <b>Entrar com o GitHub</b>.
          Na primeira vez, o GitHub pergunta se autoriza o arquivo: carregue em <b>Authorize</b>.</li>
        <li>Ainda no fundo do menu, carregue em <b>Modo de edição</b> para o ligar. Nas fichas aparecem os botões ✎ e os formulários.</li>
        <li>Para sair do modo de edição, carregue de novo no mesmo botão.</li>
      </ol></section>

    <section class="seccao"><h2>3. Tarefas mais comuns</h2>
      <h3>Nascimento, morte e outros factos</h3>
      <ul><li>Na ficha da pessoa, em <b>Factos</b>, há duas caixas iguais em todas as fichas: <b>Nascimento</b> e <b>Morte</b>.
        Escreva o dia, o mês, o ano e o local (o que souber) e diga como sabe.</li>
        <li>Para outro facto (uma estreia, uma atuação, um prémio, uma profissão), use <b>Acrescentar um facto</b>, mais abaixo.</li>
        <li>Se uma fonte disser outra data, acrescente-a na mesma: as duas versões ficam lado a lado, em <b>As fontes divergem</b>.</li></ul>
      <h3>Como sabe? A fonte de cada informação</h3>
      <ul><li><b>Está escrito numa fonte</b>: cole o endereço da página (o artigo, o post, a página do catálogo) e copie à letra a frase
        que o diz. Se o site ainda não for uma fonte do arquivo, fica proposto e um editor decide; até lá, aparece como «pendente».
        Para um livro ou disco sem endereço, escolha a fonte na lista e indique a página.</li>
        <li><b>Sei por conhecimento próprio</b>: fica como testemunho, assinado com o seu nome e marcado com ✎. Diga como sabe
        (por exemplo, «sou neto»).</li></ul>
      <h3>Pessoas, grupos, obras, discos, instrumentos e vídeos novos</h3>
      <ul><li>Nas listas (Pessoas, Grupos, Discografia, Obras e letras, Instrumentos, Mediateca) há o botão <b>+ Nova…</b>.
        Antes, procure (Ctrl K) se já existe: se existir, acrescente lá.</li>
        <li>Se já houver uma ficha com o mesmo nome mas for outra pessoa (ou outra música), marque a caixa <b>é outra</b>: as duas
        ficam marcadas para não se confundirem.</li>
        <li>Para corrigir o título, os autores, as faixas de um disco ou os papéis de uma pessoa, use <b>✎ Corrigir os dados</b> no topo da ficha.</li>
        <li>Artigos e páginas onde a pessoa aparece entram em <b>Artigos e referências</b>, no fim da ficha.</li></ul>
      <h3>Trocar a fotografia de uma ficha</h3>
      <ul>
        <li>Na ficha, desça até <b>Imagens</b>. A primeira é o retrato. Noutra imagem, carregue em <b>Usar como retrato</b>.</li>
        <li>Se uma imagem estiver errada (não é a pessoa, má qualidade), carregue em <b>Esconder</b> e diga porquê. Não se apaga: pode voltar.</li>
        <li>Para uma fotografia nova que encontrou na internet: clique nela com o botão direito do rato, escolha
          <b>Copiar endereço da imagem</b> e cole-o em <b>Acrescentar uma fotografia</b>. Cole também o endereço da página onde ela está:
          o arquivo não guarda cópias e mostra sempre de onde vem cada imagem.</li>
      </ul>
      <h3>Família, mestres e parcerias</h3>
      <ul><li>Na ficha, em <b>Relações</b>, use <b>Acrescentar uma relação</b>: escolha o tipo (por exemplo «é pai/mãe de»), comece
        a escrever o nome da outra pessoa e escolha-a na lista. A árvore da família atualiza-se sozinha.</li>
        <li>Se a pessoa ainda não estiver no arquivo, a última opção da lista é <b>Criar a ficha</b>: fica uma ficha com o nome, assinada por si.</li>
        <li>Em <b>Como sabe?</b>, indique a fonte (o endereço e a frase) ou escolha <b>Sei por conhecimento próprio</b>.</li></ul>
      <h3>Casos de dúvida</h3>
      <ul><li>Quando as fontes não concordam, a ficha mostra a caixa <b>As fontes divergem</b>. Carregue em ✎ ao lado de um facto
        para deixar a sua nota: qual versão lhe parece certa e porquê. As versões das fontes continuam todas à vista.</li>
        <li>Para o que sabe sobre a pessoa e não está em nenhuma fonte (como era conhecida, onde tocou), use a <b>Nota do editor</b>, no topo da ficha.</li></ul>
      <h3>Propor uma fonte</h3>
      <ul><li>Em <b>Fontes e método</b>, no fim da página, preencha <b>Propor uma fonte</b>: um livro, um jornal, o site de uma instituição
        ou de um artista. Redes sociais, fóruns e lojas não servem.</li></ul>
      <h3>Escrever no blogue</h3>
      <ul><li>Em <b>Blogue</b>, carregue em <b>Escrever um texto</b>. Pode ligar o texto às fichas com a caixa <b>Ligar a uma ficha</b>.
        Guarde como rascunho até estar pronto e depois escolha <b>Publicar</b>.</li></ul>
    </section>

    <section class="seccao"><h2>4. O que acontece depois</h2>
      <p>O que um contribuidor altera chega aos editores como proposta. Depois de aprovado aparece no site, com o seu nome.
        Fica registado quem fez cada alteração, quando e porquê, e qualquer alteração pode ser desfeita.</p></section>

    <section class="seccao"><h2>As regras do arquivo</h2>
      <ul>
        <li><b>Nada inventado.</b> O arquivo organiza o que dizem as fontes. O que acrescenta sem fonte fica assinado com o seu nome e marcado com ✎.</li>
        <li><b>De onde vem.</b> Cada fotografia leva a página onde foi publicada.</li>
        <li><b>Divergências à vista.</b> Quando as fontes discordam, nenhuma versão se apaga.</li>
        <li><b>O blogue não é fonte.</b> É para memórias, opiniões e novidades; as fichas não o citam.</li>
        <li><b>Pessoas vivas.</b> Só informação artística e pública.</li>
      </ul>
      <p>Dúvidas? Fale com o dono do arquivo.</p></section>
  </div>`.s;
}
