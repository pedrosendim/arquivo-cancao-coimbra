// Rascunhos automáticos dos formulários do modo de edição. O que se escreve fica guardado neste browser, por formulário
// e por ficha; se se sair da página (para criar a ficha que falta, por exemplo), se recarregar ou se a sessão acabar
// antes de gravar, o formulário oferece «Recuperar o que estava a escrever». É só para quem escreve: nada sai do
// browser, e sem armazenamento (janela privada) os formulários funcionam como antes. Depois de gravar, o rascunho
// apaga-se (edicao.js avisa com o evento «gravado»).
import { E } from './estado.js';
import { $, $$, html, aviso } from './util.js';
import { sincronizarSeletor } from './seletor.js';

/** Online, um contribuidor (que não aprova) guarda o rascunho do blogue só neste browser: o editor não recebe uma
 *  proposta a cada rascunho; o texto segue, como proposta, com «Enviar para publicar» (vistas/blogue.js). */
const rascunhoNoBrowser = () => E.sessao?.modo === 'online' && !['dono', 'administrador', 'editor'].includes(E.sessao?.contribuidor?.papel);

const PREFIXO = 'rascunho:';
const LOCAL = 'blogue-local/'; // textos novos do blogue guardados «só neste browser» (cada um com a sua chave)
const VALIDADE = 30 * 24 * 3600 * 1000; // um mês
const ACOES = new Set(['guardar-ficha', 'vida', 'novo-facto', 'nova-relacao', 'nova-imagem', 'nova-referencia', 'nota-editor', 'guardar-texto', 'propor-fonte']);

const lerR = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const guardarR = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
const apagarR = (k) => { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } };

/** Chave do rascunho de um formulário: a ação e a ficha (ou o texto do blogue) a que pertence. Um texto novo do blogue
 *  guardado «só neste browser» tem a sua (rascunho_local), para o texto novo seguinte não lhe escrever por cima. */
function chaveDe(form) {
  const v = (k) => form.querySelector(`input[type=hidden][name="${k}"]`)?.value || '';
  const ficha = v('alvo') || (v('especie') ? `${v('especie')}/${v('id') || 'nova'}` : v('id'))
    || (v('rascunho_local') ? `${LOCAL}${v('rascunho_local')}` : '') || location.hash.split('?')[0];
  return `${PREFIXO}${form.dataset.acao}:${ficha}${v('campo') ? `:${v('campo')}` : ''}`;
}

/** Os campos que contam, pela ordem em que aparecem (os das etiquetas escolhidas guardam-se à parte; «volta» diz só de
 *  onde se abriu o formulário). */
const camposDe = (form) => $$('input, select, textarea', form).filter((x) => !x.closest('.chips') && !['submit', 'button', 'file'].includes(x.type)
  && !(x.type === 'hidden' && x.name === 'volta'));
/** Nome de um campo no rascunho: o name; o texto de um seletor (que não tem name) leva o do campo da escolha. */
function nomeCampo(x) {
  if (x.name) return x.name;
  const sel = x.closest('[data-seletor-pessoa]');
  if (sel) return `seletor:${sel.querySelector('[data-papel=id]')?.name || ''}`;
  return x.id ? `#${x.id}` : x.matches('[data-alinhamento]') ? 'alinhamento' : '';
}
const chaveCampo = (x) => `${x.tagName}:${x.type}:${nomeCampo(x)}`;
const valorDe = (x) => (x.type === 'checkbox' || x.type === 'radio' ? x.checked : x.value);

/** O estado de um formulário: quantas linhas tem cada lista (intérpretes, faixas), as etiquetas escolhidas e o valor
 *  de cada campo, com o nome do campo (repõe-se pelo nome e, entre os do mesmo nome, pela ordem). */
function lerEstado(form) {
  return {
    v: 2,
    linhas: Object.fromEntries($$('[data-linhas]', form).map((c) => [c.dataset.linhas, c.children.length])),
    etiquetas: Object.fromEntries($$('[data-chips]', form).map((c) => [c.dataset.nome, $$('.chips input[type=hidden]', c).map((x) => [x.name, x.value])])),
    campos: camposDe(form).map((x) => [chaveCampo(x), valorDe(x)]),
  };
}

/** Um rascunho guardado antes desta forma (os valores pela ordem e a «forma» à parte), convertido. */
function estadoV2(form, e) {
  if (e?.v === 2) return e;
  const chaves = String(e?.forma || '').split('|');
  const de = (sel, nome, lista) => Object.fromEntries($$(sel, form).map((c, i) => [c.dataset[nome], lista?.[i]]).filter(([, x]) => x != null));
  return { v: 2, linhas: de('[data-linhas]', 'linhas', e?.linhas), etiquetas: de('[data-chips]', 'nome', e?.etiquetas),
    campos: (e?.campos || []).map((x, i) => [chaves[i], x]) };
}

/** Põe o formulário no estado guardado: as mesmas linhas e etiquetas, e cada valor no campo com o mesmo nome (entre os
 *  do mesmo nome, pela ordem). Campos que só aparecem com outros preenchidos (o nome de uma fonte nova, ao escrever o
 *  endereço) mostram-se primeiro. Devolve quantos valores escritos ficaram por repor, porque o formulário já não os tem. */
function aplicarEstado(form, guardado, refazerEtiqueta) {
  const estado = estadoV2(form, guardado);
  $$('[data-linhas]', form).forEach((c) => {
    const n = estado.linhas[c.dataset.linhas];
    if (n == null) return;
    const modelo = $(`template[data-modelo="${c.dataset.linhas}"]`, form);
    while (c.children.length > n) c.lastElementChild.remove();
    while (modelo && c.children.length < n) c.append(modelo.content.cloneNode(true));
  });
  $$('[data-chips]', form).forEach((c) => {
    const lista = estado.etiquetas[c.dataset.nome];
    if (!lista) return;
    $('.chips', c).innerHTML = '';
    for (const [nome, valor] of lista) refazerEtiqueta(c, nome, valor);
  });
  const agrupar = (lista, chave) => lista.reduce((m, x) => m.set(chave(x), [...(m.get(chave(x)) || []), x]), new Map());
  let faltam = agrupar(estado.campos, ([k]) => k);
  const repor = () => {
    const atuais = agrupar(camposDe(form), chaveCampo), resto = new Map();
    for (const [k, valores] of faltam) {
      const campos = atuais.get(k) || [];
      valores.forEach((par, i) => {
        const x = campos[i], v = par[1];
        if (!x) resto.set(k, [...(resto.get(k) || []), par]);
        else if (x.type === 'checkbox' || x.type === 'radio') x.checked = !!v;
        else x.value = v ?? '';
      });
    }
    faltam = resto;
  };
  repor();
  // o «Como sabe?» volta a dizer a que fonte fica a frase (edicao.js); um site novo acrescenta o campo do nome dela
  $$('input[name$="fonte_url"]', form).filter((x) => x.value.trim()).forEach((x) => x.dispatchEvent(new Event('change', { bubbles: true })));
  if (faltam.size) repor();
  return [...faltam].reduce((n, [k, l]) => n + (k.startsWith('INPUT:hidden:') ? 0 : l.filter(([, v]) => v).length), 0);
}

/** O título de um texto do blogue, guardado com o rascunho para o mostrar na lista. */
const tituloDoTexto = (form) => (form.dataset.acao === 'guardar-texto' ? { titulo: form.elements.titulo?.value.trim() || '' } : {});

/** Os textos novos do blogue guardados «só neste browser» (online, por um contribuidor), do mais recente para o mais
 *  antigo: { id, titulo, em }. Reabrem-se em #/blogue/novo?rascunho=<id> (vistas/blogue.js). */
export function rascunhosDoBlogue() {
  const res = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), m = k?.match(/^rascunho:guardar-texto:blogue-local\/([a-z0-9]+)$/);
      const r = m && lerR(k);
      if (r?.estado) res.push({ id: m[1], titulo: r.titulo || '', em: r.em || 0 });
    }
  } catch { /* sem armazenamento */ }
  return res.sort((a, b) => b.em - a.em);
}

function haQuanto(em) {
  const min = Math.round((Date.now() - em) / 60000);
  if (min < 1) return 'há instantes';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

/** Liga os rascunhos a todos os formulários de edição que aparecem. `refazerEtiqueta(caixa, nome, valor)` volta a pôr
 *  uma etiqueta escolhida (pessoa, obra ou ficha nova) numa lista de etiquetas (fichas.js). */
export function iniciarRascunhos({ refazerEtiqueta }) {
  const vistos = new WeakSet(), inicial = new WeakMap(), pendentes = new WeakSet(), adiados = new WeakMap();
  let enviado = null;

  try { // rascunhos automáticos com mais de um mês já não servem (os textos do blogue guardados de propósito ficam)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIXO) && !k.includes(`:${LOCAL}`) && Date.now() - (lerR(k)?.em || 0) > VALIDADE) localStorage.removeItem(k);
    }
  } catch { /* sem armazenamento */ }

  const oferecer = (form, r) => {
    const barra = document.createElement('div');
    barra.className = 'rascunho-guardado';
    barra.setAttribute('role', 'status');
    barra.innerHTML = html`<span>Tem um rascunho deste formulário, guardado neste browser ${haQuanto(r.em)}.</span>
      <span class="acoes"><button type="button" class="botao peq primario" data-rascunho="recuperar">Recuperar o que estava a escrever</button>
      <button type="button" class="botao peq" data-rascunho="descartar">Descartar</button></span>`.s;
    form.prepend(barra);
    const dobra = form.closest('details');
    if (dobra) dobra.open = true; // o rascunho fica à vista
    pendentes.add(form);
  };

  const preparar = (form) => {
    if (vistos.has(form) || !ACOES.has(form.dataset.acao)) return;
    vistos.add(form);
    inicial.set(form, JSON.stringify(lerEstado(form)));
    const r = lerR(chaveDe(form));
    if (r?.estado && JSON.stringify(r.estado) !== inicial.get(form)) oferecer(form, r);
  };

  // enquanto se decide se se recupera, o rascunho antigo não se escreve por cima
  const gravarRascunho = (form) => {
    if (pendentes.has(form) || !form.isConnected) return;
    const estado = lerEstado(form), chave = chaveDe(form);
    if (JSON.stringify(estado) === inicial.get(form)) apagarR(chave); // voltou ao que era: não há rascunho
    else guardarR(chave, { em: Date.now(), estado, ...tituloDoTexto(form) });
  };
  const adiar = (form) => {
    if (!form || !vistos.has(form)) return;
    clearTimeout(adiados.get(form));
    adiados.set(form, setTimeout(() => gravarRascunho(form), 500));
  };

  let marcado = false;
  new MutationObserver(() => {
    if (marcado) return;
    marcado = true;
    requestAnimationFrame(() => { marcado = false; $$('form[data-acao]').forEach(preparar); });
  }).observe(document.body, { childList: true, subtree: true });
  $$('form[data-acao]').forEach(preparar);

  for (const tipo of ['input', 'change', 'escolha']) document.addEventListener(tipo, (e) => adiar(e.target.closest?.('form[data-acao]')));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rascunho]');
    if (b) {
      const form = b.closest('form'), chave = chaveDe(form), r = lerR(chave);
      if (b.dataset.rascunho === 'recuperar' && r?.estado) {
        // o rascunho não se apaga: continua a guardar-se ao escrever, e sai depois de gravar
        const faltam = aplicarEstado(form, r.estado, refazerEtiqueta);
        $$('[data-seletor-pessoa]', form).forEach(sincronizarSeletor);
        form.dispatchEvent(new CustomEvent('rascunho-recuperado', { bubbles: true }));
        aviso(faltam ? `Recuperado o que estava a escrever, menos ${faltam === 1 ? 'um campo que este formulário já não tem' : `${faltam} campos que este formulário já não tem`}`
          : 'Recuperado o que estava a escrever');
      } else apagarR(chave);
      pendentes.delete(form);
      b.closest('.rascunho-guardado').remove();
      return;
    }
    // etiquetas e linhas mudam sem o evento «input»
    if (e.target.closest('[data-tirar], [data-linha-mais], [data-linha-tirar], [data-linha-mover], [data-colar-alinhamento]')) adiar(e.target.closest('form[data-acao]'));
  });

  // gravado: o rascunho deste formulário já não faz falta
  document.addEventListener('submit', (e) => {
    const form = e.target.closest?.('form[data-acao]');
    if (!form || !vistos.has(form)) return;
    if (form.dataset.acao === 'guardar-texto' && rascunhoNoBrowser() && form.querySelector('input[name=estado]:checked')?.value === 'rascunho') {
      e.preventDefault();
      e.stopImmediatePropagation(); // não chega a edicao.js: nada segue para o repositório
      pendentes.delete(form);
      if (!form.querySelector('input[type=hidden][name=id]')?.value && !form.querySelector('input[name=rascunho_local]')) {
        // um texto novo passa a ter a sua chave (o texto novo seguinte não lhe escreve por cima) e fica na lista do blogue
        const automatico = chaveDe(form), rid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        form.insertAdjacentHTML('afterbegin', html`<input type="hidden" name="rascunho_local" value="${rid}">`.s);
        apagarR(automatico);
        history.replaceState(history.state, '', `#/blogue/novo?rascunho=${rid}`);
      }
      guardarR(chaveDe(form), { em: Date.now(), estado: lerEstado(form), ...tituloDoTexto(form) });
      aviso(`Rascunho guardado neste browser${form.querySelector('input[name=rascunho_local]') ? ' (no Blogue, em «Rascunhos neste browser»)' : ''}.`
        + ' Para o enviar, escolha «Enviar para publicar» e carregue em «Guardar».');
      return;
    }
    enviado = { chave: chaveDe(form), acao: form.dataset.acao, em: Date.now() };
  }, true);
  document.addEventListener('gravado', (e) => {
    if (!enviado || enviado.acao !== e.detail?.acao || Date.now() - enviado.em > 10 * 60 * 1000) return;
    apagarR(enviado.chave);
    enviado = null;
  });
}
