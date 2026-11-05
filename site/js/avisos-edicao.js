// Avisos para quem edita, numa faixa no topo de cada página até se fechar (fecha-se só neste separador do browser):
// a cópia local atrás do site online, o site online sem acesso ao GitHub (token expirado ou limite de pedidos) e o
// token do site perto do fim do prazo. Vêm de /api/sessao (scripts/servidor.py na cópia local, online/api/sessao.js).
// Numa ficha com alterações de quem contribui ainda à espera de um editor, a faixa diz que só essa pessoa as vê
// (minhas-propostas.js).
import { E } from './estado.js';
import { html, fmtData } from './util.js';
import { propostaDaPagina } from './minhas-propostas.js';

const FECHADOS = 'avisosFechados';
const fechados = () => { try { return JSON.parse(sessionStorage.getItem(FECHADOS) || '[]'); } catch { return []; } };
const fechar = (id) => { try { sessionStorage.setItem(FECHADOS, JSON.stringify([...fechados(), id])); } catch { /* sem armazenamento */ } };

/** Os avisos que se aplicam agora: [{ id, tipo ('erro' | 'atencao'), texto }]. */
function avisos() {
  const s = E.sessao || {}, quem = s.contribuidor, lista = [];
  if (s.modo === 'local' && quem && s.atras > 0) {
    lista.push({ id: `atras-${s.atras}`, tipo: 'atencao', texto: `O site online tem ${s.atras === 1 ? '1 alteração que ainda não está'
      : `${s.atras} alterações que ainda não estão`} nesta cópia. Para as trazer, feche esta janela e o servidor e abra de novo o iniciar.bat (ou peça ao Claude que faça «git pull»). Até lá, o que gravar aqui pode chocar com elas.` });
  }
  if (s.modo === 'online' && s.problema && s.mensagem) lista.push({ id: `problema-${s.problema}`, tipo: 'erro', texto: s.mensagem });
  if (s.modo === 'online' && s.token_expira && ['dono', 'administrador'].includes(quem?.papel)) {
    const dias = Math.ceil((Date.parse(s.token_expira) - Date.now()) / 864e5);
    if (dias <= 15) {
      lista.push({ id: `token-${s.token_expira.slice(0, 10)}`, tipo: dias <= 3 ? 'erro' : 'atencao', texto: `${dias > 0 ? `O token do site (GITHUB_TOKEN) expira a ${fmtData(s.token_expira.slice(0, 10))}`
        : 'O token do site (GITHUB_TOKEN) expirou'}: depois disso ninguém consegue gravar nem aprovar. No GitHub, crie um token novo (Contents e Pull requests em «Read and write») e ponha-o na Cloudflare, em Settings › Variables and Secrets.` });
    }
  }
  const n = s.modo === 'online' ? propostaDaPagina() : null;
  if (n) {
    lista.push({ id: `proposta-${n}-${location.hash}`, tipo: 'atencao', texto: `Esta página já mostra alterações suas à espera de aprovação (proposta n.º ${n}). `
      + 'Só você as vê; os outros visitantes veem a versão publicada até um editor a aprovar. O que acrescentar a esta ficha junta-se à mesma proposta.' });
  }
  return lista.filter((a) => !fechados().includes(a.id));
}

let observador = null;

/** Põe a faixa no topo da vista e volta a pô-la sempre que a página muda (cada página tem um <main id="vista"> novo,
 *  que a vista reescreve). Sem avisos, não fica nada à escuta. */
export function avisosDaSessao() {
  const precisa = () => avisos().length || E.minhasPropostas?.length; // os da página mudam com a página
  const desenhar = () => {
    const vista = document.getElementById('vista');
    const lista = avisos();
    if (!lista.length) {
      document.querySelector('.faixa-avisos')?.remove();
      if (!precisa()) { observador?.disconnect(); observador = null; }
      return;
    }
    if (!vista) return;
    const atual = vista.querySelector(':scope > .faixa-avisos');
    if (atual && atual.dataset.ids === lista.map((a) => a.id).join(' ')) return;
    const faixa = document.createElement('div');
    faixa.className = 'faixa-avisos';
    faixa.dataset.ids = lista.map((a) => a.id).join(' ');
    faixa.innerHTML = html`${lista.map((a) => html`<p class="faixa-aviso ${a.tipo}" role="${a.tipo === 'erro' ? 'alert' : 'status'}">
      <span>${a.texto}</span><button type="button" data-fechar-aviso="${a.id}" aria-label="Fechar este aviso">×</button></p>`)}`.s;
    faixa.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fechar-aviso]');
      if (!b) return;
      fechar(b.dataset.fecharAviso);
      desenhar();
    });
    if (atual) atual.replaceWith(faixa); else vista.prepend(faixa);
  };
  if (!precisa()) return desenhar();
  if (!observador) {
    let visto = null; // a página (o <main> e o endereço) já tratada: as outras mudanças no ecrã não contam
    observador = new MutationObserver(() => {
      const vista = document.getElementById('vista');
      if (!vista || vista.querySelector(':scope > .faixa-avisos') || (visto?.[0] === vista && visto[1] === location.hash && vista.firstChild === visto[2])) return;
      visto = [vista, location.hash, vista.firstChild];
      desenhar();
    });
    observador.observe(document.body, { childList: true, subtree: true });
  }
  desenhar();
}
