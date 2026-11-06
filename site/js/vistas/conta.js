// Entrar no arquivo: com uma conta própria (nome de utilizador e palavra-passe) ou com o GitHub, à escolha de cada pessoa.
// A palavra-passe nunca sai deste browser: transforma-se aqui numa chave (PBKDF2, 600 000 iterações) e só essa chave vai
// para o servidor, que guarda um resumo dela (online/api/contas.js, online/armazem.js). Quem a esquecer pede a um
// administrador um link novo: não há emails.
import { E } from '../estado.js';
import { $, html, aviso, fmtData } from '../util.js';
import { sessao, slug, perguntar } from '../edicao.js';
import { barraReservada } from './reservada.js';
import { PAPEIS_CONTRIBUIDOR } from './contribuidores.js';

const ITERACOES = 600_000, MINIMO = 8;
const cod = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function chaveDe(utilizador, palavra) {
  const base = await crypto.subtle.importKey('raw', cod.encode(palavra.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return b64url(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: cod.encode(`arquivo-cancao-coimbra:${utilizador}`),
    iterations: ITERACOES }, base, 256));
}

async function pedirConta(rota, corpo) {
  const r = await fetch(`/api/contas/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }));
  if (!r.ok || j.erro) throw new Error(j.erro || 'Não foi possível. Tente daqui a pouco.');
  return j;
}

/** Depois de entrar, recarrega o site: o menu e o modo de edição dependem de quem entrou. */
function seguir(destino) {
  location.hash = destino.startsWith('#/') ? destino : '#/';
  location.reload();
}

/** Trata de um formulário destas páginas: mostra o erro por baixo e bloqueia o botão enquanto trabalha. */
function aoEnviar(form, trabalhar) {
  const erro = $('.erro-conta', form), botao = $('button[type=submit]', form), texto = botao.textContent;
  form.onsubmit = async (e) => {
    e.preventDefault();
    erro.textContent = '';
    botao.disabled = true;
    botao.textContent = 'Um momento…';
    try { await trabalhar(Object.fromEntries(new FormData(form))); } catch (x) {
      erro.textContent = x.message;
      botao.disabled = false;
      botao.textContent = texto;
    }
  };
}

const novaPalavra = (d) => {
  if ((d.nova || '').length < MINIMO) throw new Error(`A palavra-passe tem de ter pelo menos ${MINIMO} caracteres.`);
  if (d.nova !== d.repetir) throw new Error('As duas palavras-passe não são iguais.');
  return d.nova;
};

const camposNova = (rotulo) => html`
  <label>${rotulo} <small>pelo menos ${MINIMO} caracteres</small>
    <input class="campo" type="password" name="nova" required minlength="${MINIMO}" autocomplete="new-password"></label>
  <label>Repita a palavra-passe <input class="campo" type="password" name="repetir" required autocomplete="new-password"></label>`;

/** O ecrã de entrar da área reservada: com a conta própria ou com o GitHub. Depois de entrar, segue para a página pedida. */
export function entrar(el, params = {}) {
  const s = E.sessao || {}, volta = String(params.volta || '').startsWith('#/') ? params.volta : '#/reservada';
  const moldura = (corpo) => { el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Para contribuidores</p><h1>Área reservada</h1></header>${corpo}</div>`.s; };
  if (s.modo !== 'online') { moldura(html`<p class="lead">Nesta cópia local não é preciso entrar.</p>`); return; }
  if (s.github && !s.problema) { // entrou com um GitHub que não está no registo
    moldura(html`<p class="lead">A conta @${s.github} ainda não foi convidada para contribuir.</p><p><a class="botao" href="/api/sair">Sair</a></p>`);
    return;
  }
  moldura(html`<p class="lead">Para quem foi convidado a contribuir. Para consultar o arquivo, não é preciso entrar.</p>
    ${params.entrada === 'falhou' ? html`<p class="erro" role="alert">Não foi possível entrar com o GitHub. Tente outra vez.</p>` : ''}
    ${s.entrada_conta ? html`<form class="caixa-edicao entrada" id="entrar-conta">
      <label>Nome de utilizador <input class="campo" name="utilizador" required autocomplete="username" autocapitalize="none" spellcheck="false"></label>
      <label>Palavra-passe <input class="campo" type="password" name="palavra" required autocomplete="current-password"></label>
      <p class="erro-conta" role="alert"></p>
      <div class="acoes"><button type="submit" class="botao primario">Entrar</button></div>
      <p class="mudo">Esqueceu-se da palavra-passe? Peça um link novo a um administrador do arquivo.</p></form>` : ''}
    ${s.entrada_github ? html`<p class="ou-github">${s.entrada_conta ? 'Ou, se tiver conta no GitHub: ' : ''}
      <a class="botao" href="/api/entrar?volta=${encodeURIComponent(volta)}">Entrar com o GitHub</a></p>` : ''}`);
  const f = $('#entrar-conta');
  if (f) {
    aoEnviar(f, async (d) => {
      const utilizador = slug(d.utilizador);
      await pedirConta('entrar', { utilizador, chave: await chaveDe(utilizador, d.palavra) });
      seguir(volta);
    });
  }
}

const RESULTADO_GITHUB = { ligado: 'A conta do GitHub ficou ligada: pode entrar com ela ou com a palavra-passe.',
  ocupado: 'Esse GitHub já está ligado a outra pessoa do arquivo.', falhou: 'Não foi possível ligar o GitHub. Tente outra vez.' };

/** A minha conta: nome de utilizador, palavra-passe e GitHub. */
export function conta(el, params = {}) {
  const s = E.sessao || {}, c = sessao();
  if (s.modo !== 'online') { el.innerHTML = html`<div class="conteudo estreito">${barraReservada('contribuidores')}<p class="lead">Nesta cópia local não há contas.</p></div>`.s; return; }
  const utilizador = s.utilizador || c.id, github = c.github || s.github_ligado || s.github;
  el.innerHTML = html`<div class="conteudo estreito">${barraReservada('conta')}
    ${RESULTADO_GITHUB[params.github] ? html`<p class="${params.github === 'ligado' ? 'mudo' : 'erro'}" role="status">${RESULTADO_GITHUB[params.github]}</p>` : ''}
    <dl class="conta-dados"><dt>Nome</dt><dd>${c.nome}</dd><dt>Papel</dt><dd>${PAPEIS_CONTRIBUIDOR[c.papel] || c.papel}</dd>
      <dt>Entrou com</dt><dd>${s.conta ? `nome de utilizador (${utilizador})` : `GitHub (@${s.github})`}</dd></dl>
    <p><a class="botao" href="/api/sair">Sair</a></p>

    ${s.conta ? html`<form class="caixa-edicao entrada" id="mudar-utilizador"><h3>Nome de utilizador</h3>
      <p class="mudo">É o nome com que entra. O nome que aparece nas suas contribuições não muda.</p>
      <label>Nome novo <small>letras e números, sem acentos nem espaços</small>
        <input class="campo" name="novo" required minlength="3" maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false" value="${utilizador}"></label>
      <label>Palavra-passe atual <input class="campo" type="password" name="atual" required autocomplete="current-password"></label>
      <p class="erro-conta" role="alert"></p>
      <div class="acoes"><button type="submit" class="botao primario">Mudar o nome de utilizador</button></div></form>

    <form class="caixa-edicao entrada" id="mudar"><h3>Palavra-passe</h3>
      <input type="hidden" name="username" value="${utilizador}" autocomplete="username">
      <label>Palavra-passe atual <input class="campo" type="password" name="atual" required autocomplete="current-password"></label>
      ${camposNova('Palavra-passe nova')}
      <p class="erro-conta" role="alert"></p>
      <div class="acoes"><button type="submit" class="botao primario">Mudar a palavra-passe</button></div></form>` : s.tem_conta
    ? html`<p class="mudo">Já tem palavra-passe. Para a mudar, saia e entre com o nome de utilizador ${utilizador}.</p>`
    : html`<form class="caixa-edicao entrada" id="criar"><h3>Criar uma palavra-passe</h3>
      <p class="mudo">Assim pode entrar também sem o GitHub, com o nome de utilizador <b>${utilizador}</b>.</p>
      <input type="hidden" name="username" value="${utilizador}" autocomplete="username">
      ${camposNova('Palavra-passe')}
      <p class="erro-conta" role="alert"></p>
      <div class="acoes"><button type="submit" class="botao primario">Criar a palavra-passe</button></div></form>`}

    <section class="caixa-edicao entrada"><h3>GitHub</h3>
      ${github ? html`<p>Ligado à conta <b>@${github}</b>. Pode entrar com ela.</p>
        ${s.conta && s.github_ligado ? html`<p><button type="button" class="botao peq" id="desligar-github">Desligar o GitHub</button></p>` : ''}`
    : html`<p class="mudo">Opcional: se ligar a sua conta do GitHub, pode entrar também por lá.</p>
        ${s.entrada_github ? html`<p><a class="botao" href="/api/entrar?ligar=1&volta=${encodeURIComponent('#/conta')}">Ligar ao GitHub</a></p>` : ''}`}</section>
  </div>`.s;

  const novamente = (form, texto) => { $('button[type=submit]', form).disabled = false; $('button[type=submit]', form).textContent = texto; };
  const u = $('#mudar-utilizador'), m = $('#mudar'), n = $('#criar'), d = $('#desligar-github');
  if (u) {
    aoEnviar(u, async (x) => {
      const novo = slug(x.novo);
      if (novo === utilizador) throw new Error('Esse já é o seu nome de utilizador.');
      await pedirConta('utilizador', { novo, atual: await chaveDe(utilizador, x.atual), nova: await chaveDe(novo, x.atual) });
      seguir('#/conta');
    });
  }
  if (m) {
    aoEnviar(m, async (x) => {
      const nova = novaPalavra(x);
      await pedirConta('mudar', { atual: await chaveDe(utilizador, x.atual), nova: await chaveDe(utilizador, nova) });
      m.reset();
      aviso('Palavra-passe mudada.');
      novamente(m, 'Mudar a palavra-passe');
    });
  }
  if (n) {
    aoEnviar(n, async (x) => {
      await pedirConta('criar', { chave: await chaveDe(utilizador, novaPalavra(x)) });
      seguir('#/conta');
    });
  }
  if (d) {
    d.onclick = async () => {
      if (!confirm('Desligar o GitHub desta conta? Continua a entrar com o nome de utilizador e a palavra-passe.')) return;
      try { await pedirConta('desligar-github', {}); seguir('#/conta'); } catch (e) { alert(e.message); }
    };
  }
}

/** A página do link de acesso: a pessoa escolhe a palavra-passe e fica logo com a sessão iniciada. */
export async function acesso(el, token) {
  const moldura = (corpo) => { el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Área reservada</p><h1>Escolher a palavra-passe</h1></header>${corpo}</div>`.s; };
  moldura(html`<p class="carregando">A abrir o link</p>`);
  let info;
  try { info = await pedirConta('ver-link', { token }); } catch (e) { moldura(html`<div class="vazio"><p>${e.message}</p></div>`); return; }
  moldura(html`<p class="lead">Olá, ${info.nome}. ${info.nova ? 'Escolha a palavra-passe da sua conta.' : 'Escolha uma palavra-passe nova.'}</p>
    <form class="caixa-edicao entrada" id="escolher">
      <label>O seu nome de utilizador <input class="campo" name="username" value="${info.utilizador}" readonly autocomplete="username"></label>
      ${camposNova('Palavra-passe')}
      <p class="erro-conta" role="alert"></p>
      <div class="acoes"><button type="submit" class="botao primario">Guardar e entrar</button></div>
      <p class="mudo">Guarde bem o nome de utilizador: é com ele que volta a entrar. Este link só serve uma vez.</p></form>`);
  aoEnviar($('#escolher'), async (d) => {
    await pedirConta('definir', { token, chave: await chaveDe(info.utilizador, novaPalavra(d)) });
    seguir('#/contribuir');
  });
}

/** Administradores: cria um link de acesso para uma pessoa e mostra-o, pronto a enviar. */
export async function abrirLinkDeAcesso(id) {
  let r;
  try { r = await pedirConta('link', { id }); } catch (e) { alert(e.message); return; }
  const mensagem = `Olá! Foi convidado/a para contribuir no Arquivo da Canção de Coimbra. O seu nome de utilizador é ${r.utilizador}. `
    + `Escolha a palavra-passe neste link, que só serve uma vez: ${r.link}`;
  const janela = perguntar({ titulo: `Link de acesso para ${r.nome}`, sim: 'Fechar', nao: null, corpo: html`
    <p>Envie este link a ${r.nome}. Serve uma só vez, até ${fmtData(new Date(r.expira).toISOString().slice(0, 10))}, e anula qualquer link anterior.
      A pessoa entra depois com o nome de utilizador <b>${r.utilizador}</b>.</p>
    <p><input class="campo" id="link-acesso" readonly value="${r.link}" aria-label="Link de acesso"></p>
    <p class="acoes"><button type="button" class="botao peq primario" id="copiar-link">Copiar a mensagem</button>
      <a class="botao peq" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(mensagem)}">WhatsApp</a>
      <a class="botao peq" href="mailto:?subject=${encodeURIComponent('Arquivo da Canção de Coimbra')}&body=${encodeURIComponent(mensagem)}">Email</a></p>` });
  $('#copiar-link').onclick = async () => {
    try { await navigator.clipboard.writeText(mensagem); aviso('Mensagem copiada.'); } catch { $('#link-acesso').select(); aviso('Copie o link selecionado.'); }
  };
  await janela;
}
