// Contacto: qualquer pessoa pode deixar uma mensagem (um problema, uma dúvida); só os administradores a leem, em Mensagens.
// As mensagens ficam no armazém online (online/armazem.js), fora do repositório público.
import { E, comArquivo } from '../estado.js';
import { $, $$, html, plural, enderecoSeguro } from '../util.js';
import { ADMINS, sessao } from '../edicao.js';
import { barraReservada } from './reservada.js';

const pedir = async (caminho, corpo) => {
  const r = await fetch(caminho, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Não foi possível falar com o site. Tente mais tarde.');
  return j;
};

export function contacto(el) {
  el.innerHTML = html`<div class="conteudo estreito">
    <header class="cabecalho"><p class="sobretitulo">Sobre o arquivo</p><h1>Contacto</h1>
      <p class="lead">Encontrou um erro, uma ligação que não abre, ou tem uma dúvida? Deixe aqui a sua mensagem. Só os administradores do arquivo a leem.</p></header>
    ${comArquivo() ? html`<p class="mudo">Esta é a cópia local do arquivo: as mensagens só chegam a partir do site online.</p>` : ''}
    <form id="form-contacto" class="form-contacto">
      <label>A sua mensagem <textarea class="campo" name="texto" rows="7" required minlength="5" maxlength="4000"></textarea></label>
      <label>O seu nome <small>opcional</small><input class="campo" name="nome" maxlength="120" autocomplete="name"></label>
      <label>Como lhe podemos responder <small>opcional: email ou telefone. Nunca fica público.</small><input class="campo" name="contacto" maxlength="200" autocomplete="email"></label>
      <label class="campo-isco" aria-hidden="true">Não preencher <input name="site" tabindex="-1" autocomplete="off"></label>
      <div class="acoes"><button class="botao primario">Enviar mensagem</button></div>
      <p class="resposta-contacto" role="status"></p>
    </form>
    <p class="credito">Developed by Pedro Sendim Miranda with Opus 5.5</p>
  </div>`.s;

  const f = $('#form-contacto', el), estado = $('.resposta-contacto', el);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const botao = $('button', f);
    botao.disabled = true;
    estado.textContent = 'A enviar…';
    try {
      await pedir('/api/mensagem', Object.fromEntries(new FormData(f)));
      f.reset();
      estado.textContent = 'Mensagem enviada. Obrigado!';
    } catch (erro) { estado.textContent = erro.message; }
    botao.disabled = false;
  };
}

const quando = (iso) => new Date(iso).toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short' });
const contactoDe = (c) => {
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { const u = enderecoSeguro(`mailto:${c}`); if (u) return html`<a href="${u}">${c}</a>`; }
  return c;
};

/** Quantas mensagens estão por ler, para o menu (só administradores, online). */
export async function contarPorLer() {
  try { return (await pedir('/api/mensagens')).mensagens.filter((m) => !m.lida).length; } catch { return 0; }
}

export async function mensagens(el) {
  const entrada = (corpo) => { el.innerHTML = html`<div class="conteudo estreito">${barraReservada('mensagens')}${corpo}</div>`.s; };
  if (!ADMINS.includes(sessao()?.papel)) return entrada(html`<p class="vazio">Só os administradores do arquivo veem as mensagens.</p>`);
  if (comArquivo() && E.sessao?.modo !== 'online') return entrada(html`<p class="vazio">As mensagens ficam no site online: veja-as lá.</p>`);
  entrada(html`<p class="carregando">A carregar</p>`);
  let lista;
  try { lista = (await pedir('/api/mensagens')).mensagens; } catch (erro) { return entrada(html`<p class="erro">${erro.message}</p>`); }
  const desenhar = () => {
    entrada(lista.length ? html`<p class="mudo">${plural(lista.length, 'mensagem', 'mensagens')}, ${plural(lista.filter((m) => !m.lida).length, 'por ler', 'por ler')}. Só os administradores as veem. Guardam-se as 500 mais recentes.</p>
      <div class="mensagens">${lista.map((m) => html`<article class="mensagem ${m.lida ? 'lida' : ''}" data-id="${m.id}">
        <p class="meta"><b>${m.nome || 'Sem nome'}</b>${m.contacto ? html` · ${contactoDe(m.contacto)}` : ''} · ${quando(m.em)}</p>
        <p class="texto-mensagem">${m.texto}</p>
        <div class="acoes"><button class="botao peq" type="button" data-marcar>${m.lida ? 'Marcar como por ler' : 'Marcar como lida'}</button>
          <button class="botao peq" type="button" data-apagar>Apagar</button></div></article>`)}</div>`
      : html`<p class="vazio">Ainda não há mensagens.</p>`);
    $$('.mensagem', el).forEach((a) => {
      const m = lista.find((x) => x.id === a.dataset.id);
      $('[data-marcar]', a).onclick = async () => {
        try { await pedir('/api/mensagens', { id: m.id, lida: !m.lida }); m.lida = !m.lida; desenhar(); document.dispatchEvent(new CustomEvent('mensagens-lidas')); } catch (erro) { alert(erro.message); }
      };
      $('[data-apagar]', a).onclick = async () => {
        if (!confirm('Apagar esta mensagem? Não se pode recuperar.')) return;
        try { await pedir('/api/mensagens', { id: m.id, apagar: true }); lista = lista.filter((x) => x !== m); desenhar(); document.dispatchEvent(new CustomEvent('mensagens-lidas')); } catch (erro) { alert(erro.message); }
      };
    });
  };
  desenhar();
}
