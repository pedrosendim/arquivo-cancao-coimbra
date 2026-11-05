// Entrar no arquivo: com uma conta própria (nome de utilizador e palavra-passe) ou com o GitHub, à escolha de cada pessoa.
// A palavra-passe nunca sai deste browser: transforma-se aqui numa chave (PBKDF2, 600 000 iterações) e só essa chave vai
// para o servidor, que guarda um resumo dela (online/api/contas.js, online/armazem.js). Quem a esquecer pede a um
// administrador um link novo: não há emails.
import { E } from '../estado.js';
import { $, html, aviso, fmtData } from '../util.js';
import { sessao, slug, perguntar } from '../edicao.js';

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

export function entrar(el, params = {}) {
  const s = E.sessao || {}, volta = String(params.volta || '').startsWith('#/') ? params.volta : '#/';
  const moldura = (corpo) => { el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Área reservada</p><h1>Entrar</h1></header>${corpo}</div>`.s; };
  if (s.modo !== 'online') { moldura(html`<p class="lead">Nesta cópia local não é preciso entrar: basta ligar o modo de edição, no fim do menu.</p>`); return; }
  if (sessao()) {
    moldura(html`<p class="lead">Entrou como ${sessao().nome}.</p>
      <p><a class="botao" href="/api/sair">Sair</a></p>
      ${s.conta ? html`<form class="caixa-edicao entrada" id="mudar"><h3>Mudar a palavra-passe</h3>
        <input type="hidden" name="username" value="${s.conta}" autocomplete="username">
        <label>Palavra-passe atual <input class="campo" type="password" name="atual" required autocomplete="current-password"></label>
        ${camposNova('Palavra-passe nova')}
        <p class="erro-conta" role="alert"></p>
        <div class="acoes"><button type="submit" class="botao primario">Mudar a palavra-passe</button></div></form>` : ''}`);
    const f = $('#mudar');
    if (f) {
      aoEnviar(f, async (d) => {
        const nova = novaPalavra(d);
        await pedirConta('mudar', { atual: await chaveDe(s.conta, d.atual), nova: await chaveDe(s.conta, nova) });
        f.reset();
        aviso('Palavra-passe mudada.');
        $('button[type=submit]', f).disabled = false;
        $('button[type=submit]', f).textContent = 'Mudar a palavra-passe';
      });
    }
    return;
  }
  moldura(html`<p class="lead">Para quem foi convidado a contribuir. Para consultar o arquivo, não é preciso entrar.</p>
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
