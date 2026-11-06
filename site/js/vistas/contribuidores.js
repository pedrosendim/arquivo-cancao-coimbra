// Contribuidores convidados pelo dono do arquivo (com o que cada um fez) e o guia «Como contribuir».
import { E } from '../estado.js';
import { html, fmtData, plural } from '../util.js';

export const PAPEIS_CONTRIBUIDOR = { dono: 'Administrador (fundador)', administrador: 'Administrador/a', editor: 'Editor/a', contribuidor: 'Contribuidor/a',
  antigo: 'Antigo contribuidor (sem acesso)' };
export const O_QUE_FAZ = {
  administrador: 'convida pessoas e escolhe o papel de cada uma; aprova propostas e fontes',
  editor: 'aprova ou recusa as propostas e as fontes novas e marca as fichas como revistas; o que altera entra logo',
  contribuidor: 'propõe: cria e corrige fichas, acrescenta factos com fonte, testemunhos, famílias, fotografias, vídeos e discos; um editor aprova',
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
    for (const n of p.notas_editor || []) juntar(n.por, 'Notas', ficha); // as notas em lista, cada uma do seu autor (notas.js)
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
    for (const f of p.factos || []) for (const n of f.notas_editoriais || []) juntar(n.por, 'Notas sobre factos', ficha);
  }
  for (const f of E.base.fontes) {
    const ficha = { id: f.id, nome: f.nome, rota: '#/fontes' };
    if (f.proposta_por) juntar(f.proposta_por, 'Fontes propostas', ficha);
    if (f.decidido_por) juntar(f.decidido_por, 'Fontes decididas', ficha);
  }
  for (const t of E.base.blogue) if (t.estado === 'publicado') juntar(t.autor, 'Textos no blogue', { id: t.id, nome: t.titulo, rota: `#/blogue/${t.id}` });
  return res;
}

export function formContribuidor(c) {
  const novo = !c;
  c ||= { id: '', nome: '', github: '', papel: 'contribuidor', apresentacao: '' };
  return html`<form class="caixa-edicao" data-acao="guardar-contribuidor">
    ${novo ? html`<h3>Convidar uma pessoa</h3>
      <p class="mudo" style="margin:0 0 8px">Escreva o nome e escolha o papel. A seguir, o site dá-lhe um link para enviar à pessoa
        (por WhatsApp ou email): com ele, ela escolhe a palavra-passe. Não precisa de conta no GitHub.</p>` : ''}
    <input type="hidden" name="id" value="${c.id}">
    <div class="linha-campos">
      <label>Nome <input class="campo" name="nome" required value="${c.nome}"></label>
      <label>Utilizador do GitHub <small>opcional: só para quem preferir entrar com o GitHub</small>
        <input class="campo" name="github" value="${c.github || ''}" placeholder="ex.: maria-silva"></label>
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
  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Sobre o arquivo</p><h1>Contribuidores</h1>
      <p class="lead">Quem ajuda a construir o arquivo, por convite do seu dono. Cada contributo fica assinado com o nome de
        quem o fez e a data, e marcado com ✎ nas fichas.</p>
      <ul class="papeis-lista">${Object.entries(O_QUE_FAZ).map(([k, t]) => html`<li><b>${PAPEIS_CONTRIBUIDOR[k]}</b>: ${t}.</li>`)}</ul>
      <p style="margin-top:16px"><a class="botao primario" href="#/contribuir">Como contribuir</a></p></header>
    <h2 class="so-leitor">Lista de contribuidores</h2>
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
      </div></article>`;
    })}</div>
  </div>`.s;
  if (params.quem) document.getElementById(`c-${params.quem}`)?.scrollIntoView({ block: 'center' });
}

/** Um cartão do guia: uma tarefa, de três a cinco passos, e o botão para a começar. */
const tarefa = (titulo, passos, fazer, depois = '') => html`<article class="tarefa"><h3>${titulo}</h3>
  <ol class="passos">${passos.map((p) => html`<li>${p}</li>`)}</ol>
  ${depois ? html`<p class="tarefa-nota">${depois}</p>` : ''}
  ${fazer ? html`<p class="tarefa-fazer"><a class="botao primario peq" href="${fazer[1]}">${fazer[0]}</a></p>` : ''}</article>`;

export function contribuir(el) {
  const n = Object.values(E.contribuidores).filter((c) => c.papel !== 'antigo').length;
  const b = (t) => html`<b>${t}</b>`;
  el.innerHTML = html`<div class="conteudo estreito guia">
    <header class="cabecalho"><p class="sobretitulo"><a href="#/contribuidores">Contribuidores</a></p><h1>Como contribuir</h1>
      <p class="lead">O arquivo cresce com quem conhece a Canção de Coimbra. Não precisa de saber programar: tudo se faz
        nas próprias páginas do site, com botões e formulários. Escolha abaixo o que quer fazer.</p></header>

    <section class="seccao"><h2>Antes de começar</h2>
      <div class="tarefas">
        ${tarefa('Entrar pela primeira vez', [
          'Peça ao fundador do arquivo que o convide: ele envia-lhe um link pessoal, por WhatsApp ou email.',
          'Abra o link e escolha uma palavra-passe. Fica logo com a sessão iniciada.',
          html`Da próxima vez, carregue em ${b('Área reservada')}, no fim do menu, e escreva o seu nome de utilizador e a palavra-passe.`,
          'Esqueceu-se da palavra-passe? Peça um link novo a um administrador do arquivo.',
          html`Em ${b('A minha conta')}, dentro da área reservada, pode mudar o nome de utilizador e a palavra-passe, e ligar o GitHub.`,
        ], null, 'Não precisa de conta no GitHub, nem de email.')}
        ${tarefa('Se preferir entrar com o GitHub', [
          html`Abra <a href="https://github.com/signup" target="_blank" rel="noopener">github.com/signup</a>: o arquivo usa o GitHub, gratuito, só para saber quem é cada pessoa e guardar o histórico.`,
          'Escreva o seu email, crie uma palavra-passe e escolha um nome de utilizador (por exemplo maria-silva).',
          'O GitHub envia-lhe um código por email: copie-o para a página e a conta fica criada.',
          html`Envie o seu ${b('nome de utilizador')} ao dono do arquivo, que o regista como contribuidor ou editor.`,
        ])}
        ${tarefa('Ligar o modo de edição', [
          html`Abra o menu: no computador está à esquerda; no telemóvel, carregue em ${b('Menu')}, no topo do ecrã.`,
          html`No fim do menu, carregue em ${b('Área reservada')} e depois em ${b('Entrar com o GitHub')}: o site leva-o ao GitHub, que está em inglês. Entre na sua conta (${b('Sign in')}) e, na primeira vez, autorize o arquivo em ${b('Authorize')}; depois volta sozinho ao site.`,
          html`No mesmo sítio, carregue em ${b('Modo de edição')} até dizer «ligado». Nas fichas aparecem os botões e os formulários.`,
          'Para sair do modo de edição, carregue de novo no mesmo botão.',
        ], null, 'Na cópia local do arquivo, no computador do dono, não é preciso entrar: basta ligar o modo de edição.')}
      </div></section>

    <section class="seccao"><h2>O que quer fazer?</h2>
      <div class="tarefas">
        ${tarefa('Criar a ficha de uma pessoa', [
          html`Procure primeiro (${b('Procurar…')}, no topo) se já existe: se existir, acrescente lá o que sabe.`,
          html`Em ${b('Pessoas')}, carregue em ${b('+ Nova pessoa')} (num grupo, em ${b('Grupos')}, ${b('+ Novo grupo')}).`,
          'Escreva o nome por que é conhecida, os outros nomes e os papéis (guitarrista, cantor…).',
          html`Se já houver uma ficha com o mesmo nome e for outra pessoa, marque ${b('Já existe uma ficha com este nome, mas é outra pessoa')}.`,
          html`Pode juntar logo o nascimento e a morte (${b('+ Nascimento')}, ${b('+ Morte')}); depois de criar, acrescente na ficha factos, família e fotografias.`,
        ], ['Criar uma pessoa', '#/nova/pessoas'])}
        ${tarefa('Acrescentar ou corrigir uma data', [
          html`Abra a ficha da pessoa e, no topo, em ${b('Acrescentar')}, carregue em ${b('Nascimento')} ou ${b('Morte')}.`,
          'Escreva o dia, o mês e o ano (o que souber) e a terra.',
          html`Em ${b('Como sabe?')}, indique a fonte ou o seu testemunho.`,
          html`Se a ficha já tiver outra data, a sua fica ao lado, em ${b('As fontes divergem')}: nenhuma versão se apaga.`,
        ], ['Escolher uma pessoa', '#/pessoas'], 'Uma data errada corrige-se assim: acrescente a certa, com a fonte, e deixe uma nota a dizer qual lhe parece certa e porquê.')}
        ${tarefa('Acrescentar um facto com fonte', [
          html`Na ficha, em ${b('Acrescentar')}, carregue em ${b('Facto')} e escolha o tipo (atuação, estreia, prémio, ensino…).`,
          'Escreva o facto curto e fiel ao que a fonte diz.',
          html`Em ${b('Como sabe?')}, escolha ${b('Está escrito numa fonte')}: cole o endereço da página e copie à letra a frase que o diz.`,
          'Para um livro ou um disco sem endereço, escolha a fonte na lista e indique a página.',
        ], ['Escolher uma ficha', '#/pessoas'], 'Se o site ainda não for fonte do arquivo, fica proposto e um editor decide; até lá, a citação aparece como «pendente».')}
        ${tarefa('Acrescentar um vídeo ou um áudio', [
          html`Na ficha da pessoa, em ${b('Acrescentar')}, carregue em ${b('Vídeo ou áudio')} (ou, na Mediateca, em ${b('+ Novo vídeo ou áudio')}).`,
          'Cole o endereço: YouTube, Vimeo, SoundCloud, Spotify, RTP Arquivos, Internet Archive…',
          'Escreva o título: o que se ouve e quem toca.',
          'Indique quem toca ou canta, as obras e o disco, se souber.',
        ], ['Acrescentar um vídeo', '#/nova/media'], 'O arquivo não guarda cópias: o vídeo toca sempre no leitor do site de origem.')}
        ${tarefa('Registar um disco e as faixas', [
          html`Em ${b('Discografia')}, carregue em ${b('+ Novo disco ou gravação')}.`,
          'Escreva o título, o formato, a editora, a referência (ex.: Alvorada MEP 60280) e o ano.',
          html`Em ${b('Intérpretes')}, uma linha por pessoa, com a função (guitarra, viola, voz).`,
          html`Em ${b('Faixas')}, uma linha por faixa; se a música já tiver ficha, escolha-a na coluna ${b('Obra')}.`,
          html`Em ${b('Onde está registado?')}, a página do catálogo ou da discografia que o confirma.`,
        ], ['Registar um disco', '#/nova/gravacoes'])}
        ${tarefa('Contar o que sabe por conhecimento próprio', [
          html`Num facto ou numa relação, em ${b('Como sabe?')}, escolha ${b('Sei por conhecimento próprio')}.`,
          'Diga como sabe (por exemplo «sou neto», «conversa com o próprio, 2019»).',
          'Fica como testemunho, assinado com o seu nome e marcado com ✎, à espera de uma fonte.',
          html`Para o que não cabe num facto (como era conhecido, uma identificação), use ${b('✎ Nota')}, no topo da ficha.`,
        ], null)}
        ${tarefa('Ligar duas pessoas: família, mestres, parcerias', [
          html`Na ficha, em ${b('Acrescentar')}, carregue em ${b('Relação')}.`,
          'Escolha o tipo (é filho/a de, foi aluno/a de, tocou com…).',
          html`Comece a escrever o nome da outra pessoa e escolha-a na lista. Se não estiver lá, carregue em ${b('Não está na lista? Criar pessoa nova')}: abre uma janela, sem sair do formulário.`,
          html`Indique como sabe. A árvore da família atualiza-se sozinha.`,
        ], ['Escolher uma pessoa', '#/pessoas'])}
        ${tarefa('Trocar ou acrescentar uma fotografia', [
          html`Na ficha, em ${b('Imagens')}: noutra imagem, ${b('Usar como retrato')}; numa imagem errada, ${b('Desassociar')}, a dizer porquê: deixa de aparecer, fica registado quem o fez e pode voltar.`,
          html`Para ver bem a cara, carregue em ${b('Ajustar o retrato')}, por baixo da fotografia: arraste e aproxime. A fotografia não muda, só o enquadramento.`,
          html`Para uma fotografia nova, em ${b('Acrescentar')}, carregue em ${b('Fotografia')}. Pode usar ${b('Procurar no Facebook')} ou ${b('Procurar imagens')} e depois cole o endereço da imagem.`,
          'Cole também o endereço da página onde ela está publicada: o arquivo mostra sempre de onde vem cada imagem.',
        ], null, 'As ligações às imagens do Facebook e do Instagram deixam de funcionar ao fim de algum tempo. No telemóvel nem sempre se consegue copiar o endereço de uma imagem: cole antes o endereço da página da imagem na Wikimedia Commons.')}
      </div></section>

    <section class="seccao"><h2>Para os editores</h2>
      <div class="tarefas">
        ${tarefa('Rever as fichas', [
          html`Em ${b('Por validar')}, abra o separador ${b('Rever as fichas')} e escolha o tipo (pessoas, obras, discos…).`,
          html`Carregue em ${b('Começar a rever')}: a ficha abre com uma barra no topo, com o que há para conferir.`,
          'Leia a ficha e abra as citações (os números): a fonte diz o que a ficha diz?',
          html`Carregue em ${b('Revista, seguinte')} (fica assinada com o seu nome) ou em ${b('Saltar')}.`,
        ], ['Rever fichas', '#/validar?separador=rever'], html`Em qualquer ficha, o botão ${b('Marcar a ficha como revista')} faz o mesmo; nos vídeos e áudios chama-se
          ${b('Marcar como revisto')}. Depois, o mesmo botão desfaz (${b('Voltar a pôr como rascunho')}, ou ${b('Voltar a rascunho')}).`)}
        ${tarefa('Decidir o que está em «Por validar»', [
          html`Abra ${b('Por validar')}, no menu (aparece a quem entrou). Os atalhos no topo levam a cada tipo de caso.`,
          html`Fichas repetidas: ${b('São a mesma: juntar')} ou ${b('São diferentes')}. Na dúvida, abra as duas fichas; os pares que as fichas já distinguem (pai e filho) não se juntam.`,
          'Divergências: deixe uma nota assinada a dizer qual versão lhe parece certa e porquê; as versões ficam todas.',
          html`Citações por confirmar: abra o original e veja se a frase lá está. ${b('Só o que eu fiz')} mostra só os casos com contributos seus.`,
        ], ['Abrir «Por validar»', '#/validar'])}
        ${tarefa('Aprovar ou recusar propostas', [
          html`Em ${b('Propostas')}, cada proposta mostra o que muda, ficha a ficha, e quem assina cada contributo (✎).`,
          'No topo, a vermelho, o que merece um segundo olhar: fichas apagadas, assinaturas em nome de outra pessoa, endereços estranhos.',
          html`${b('Aprovar')} faz entrar a proposta no arquivo; ${b('Recusar')} pede o motivo, que quem a fez vê.`,
        ], ['Ver as propostas', '#/propostas'])}
      </div></section>

    <section class="seccao"><h2>Mais coisas que pode fazer</h2>
      <ul>
        <li><b>Propor uma fonte</b>: em ${b('Fontes e arquivo')}, no fim da página, ${b('Propor uma fonte')} (um livro, um jornal, o site de uma instituição
          ou de um artista; redes sociais, fóruns e lojas não servem).</li>
        <li><b>Corrigir o nome, o título, os autores ou as faixas</b>: ${b('✎ Corrigir os dados')}, no topo da ficha (nas pessoas, ${b('✎ Corrigir nome, outros nomes e atributos')}).</li>
        <li><b>Juntar duas fichas da mesma pessoa, ou separar uma que mistura duas</b>: na ficha, a secção ${b('Desambiguação')}
          (nas pessoas, também o atalho ${b('Desambiguar…')}, no topo).</li>
        <li><b>Indicar um artigo onde a pessoa aparece</b>: em ${b('Acrescentar')}, ${b('Referência')}. É leitura indicada, não fonte.</li>
        <li><b>Escrever no blogue</b>: em ${b('Blogue')}, ${b('Escrever um texto')}. Pode ligar o texto às fichas com a caixa ${b('Ligar a uma ficha')}.</li>
      </ul></section>

    <section class="seccao"><h2>Depois de enviar</h2>
      <ul>
        <li><b>Contribuidores</b>: o que altera segue como proposta. Um editor vê-a em ${b('Propostas')} e aprova-a ou recusa-a (e diz porquê).
          Depois de aprovada, aparece logo no site, com o seu nome.</li>
        <li><b>Editores</b>: o que gravam entra logo no arquivo, e todos o veem assim que abrem ou recarregam a página.</li>
        <li><b>Enganou-se?</b> Enquanto a proposta espera, pode retirá-la em ${b('Propostas')} (${b('Retirar a minha proposta')}).
          Um facto, uma relação ou uma referência que acrescentou pode retirá-lo com ×. Para o resto, fale com um editor: os editores podem repor qualquer versão antiga de uma ficha (${b('Histórico')}, ${b('Repor esta versão')})
          e desfazer uma alteração inteira (${b('Alterações recentes')}, ${b('Desfazer esta alteração')}). Nada se perde: todas as versões ficam guardadas.</li>
        <li><b>Histórico</b>: cada ficha tem o botão ${b('Histórico')}, com todas as alterações, quem as fez, quando e o quê.</li>
        <li><b>Tudo fica público</b>: o que grava fica no repositório público do arquivo, no GitHub, incluindo as propostas recusadas ou retiradas
          e os rascunhos do blogue que um editor grava (o rascunho de um contribuidor, online, fica só no seu browser até o enviar).
          Não escreva nada que não possa ser público.</li>
      </ul></section>

    <section class="seccao"><h2>As regras do arquivo</h2>
      <ul>
        <li><b>Nada inventado.</b> O arquivo organiza o que dizem as fontes. O que acrescenta sem fonte fica assinado com o seu nome e marcado com ✎.</li>
        <li><b>De onde vem.</b> Cada fotografia leva a página onde foi publicada.</li>
        <li><b>Divergências à vista.</b> Quando as fontes discordam, nenhuma versão se apaga.</li>
        <li><b>O blogue não é fonte.</b> É para memórias, opiniões e novidades; as fichas não o citam.</li>
        <li><b>Pessoas vivas.</b> Só informação artística e pública.</li>
        <li><b>Só por convite.</b> Quem decide quem entra, e com que papel, é o dono do arquivo.${n > 1 ? ` Hoje são ${n} pessoas.` : ''}</li>
      </ul>
      <p>Dúvidas? Fale com o dono do arquivo.</p></section>
  </div>`.s;
}
