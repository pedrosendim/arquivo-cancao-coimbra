// «Por validar»: a lista de trabalho de quem edita. No separador «Por decidir», o que os dados sugerem que precisa de
// uma decisão humana — fichas que parecem repetidas, fichas que parecem misturar duas pessoas, divergências entre
// fontes por comentar, fontes propostas, fichas e testemunhos de contribuidores à espera de revisão, citações por
// confirmar, faixas que podem ser de uma obra; no separador «Rever as fichas», a fila das fichas por rever
// (revisao.js). Nada aqui muda os dados sozinho: cada caso abre a ficha ou tem os botões para quem decide.
import { E, PAPEIS, CAMPOS, REL, vida, nomeDe, nomeContribuidor } from '../estado.js';
import { html, raw, norm, plural, fmtData, definirParams, compararPt, enderecoSeguro } from '../util.js';
import { editando, podeAprovar, sessao } from '../edicao.js';
import { ESPECIES } from '../fichas.js';
import { marcas, estadoCitacao } from '../citacoes.js';
import { notaEditorial } from '../formularios.js';
import { notasDoFacto } from '../notas.js';
import { porQueDiferentes, papeisIncompativeis } from '../desambiguar.js';
import { riqueza, rotaFicha, seccaoFila, TIPOS_REVISAO, revista, botaoRevisao, assinadaPor, comNota, camposPorComentar } from '../revisao.js';

const chave = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** As duas fichas estão marcadas «não confundir com» (em qualquer das duas)? */
const distintas = (x, y) => (x.distinta_de || []).some((d) => d.id === y.id) || (y.distinta_de || []).some((d) => d.id === x.id);
const chavePar = (a, b) => [a.id, b.id].sort().join('|');

/** Pares de fichas com o mesmo nome (ou com o nome de uma igual a outro nome da outra), sem a marca «não confundir».
 *  Nas pessoas, os pares que as próprias fichas já distinguem (pai e filho, pais diferentes, filha e mulher da mesma
 *  pessoa…) ficam à parte, em `distinguidos`, sem o botão «juntar». */
function pares(tipo, minPalavras) {
  const esp = ESPECIES[tipo], alt = tipo === 'pessoas' ? 'nomes_alternativos' : 'titulos_alternativos';
  const indice = new Map();
  for (const x of E.base[tipo] || []) {
    for (const n of [x[esp.titulo], ...(x[alt] || [])]) {
      const k = chave(n);
      if (k.length < 4 || k.split(' ').length < minPalavras) continue;
      if (!indice.has(k)) indice.set(k, new Set());
      indice.get(k).add(x);
    }
  }
  const vistos = new Set(), res = [], distinguidos = [];
  for (const [k, grupo] of indice) {
    const l = [...grupo];
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const [a, b] = [l[i], l[j]].sort((x, y) => riqueza(y) - riqueza(x)); // a primeira é a que fica, se se juntarem
      if (vistos.has(chavePar(a, b)) || distintas(a, b)) continue;
      vistos.add(chavePar(a, b));
      const motivo = tipo === 'pessoas' ? porQueDiferentes(a, b) : '';
      (motivo ? distinguidos : res).push({ a, b, k, motivo });
    }
  }
  return { res, distinguidos, vistos };
}

// ------------------------------------------------------------------ nomes parecidos (menos certos)

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const palavras = (n) => chave(n).split(' ').filter((w) => w && !PARTICULAS.has(w));

/** Semelhança de grafia entre dois textos, de 0 a 1: o dobro da maior sequência de letras em comum (pela mesma ordem)
 *  a dividir pelo total de letras. «presenca coimbra» e «presenca de coimbra» dão 0,91. */
function semelhanca(a, b) {
  let ant = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? ant[j - 1] + 1 : Math.max(ant[j], cur[j - 1]);
    ant = cur;
  }
  return (2 * ant[b.length]) / (a.length + b.length || 1);
}

/** Porque é que dois nomes diferentes podem ser da mesma pessoa ('' se não parecem): um é parte do outro, com o mesmo
 *  primeiro e último nome («José Santos» e «José Maria dos Santos»), ou a grafia é quase igual. */
function porQueParecidos(na, nb) {
  const wa = palavras(na), wb = palavras(nb);
  const [curto, longo] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (curto.length >= 2 && curto.length < longo.length && curto[0] === longo[0] && curto.at(-1) === longo.at(-1)
    && curto.every((w) => longo.includes(w))) return 'o mesmo primeiro e último nome, e um nome contém o outro';
  const ka = chave(na), kb = chave(nb);
  if (ka !== kb && Math.min(ka.length, kb.length) / Math.max(ka.length, kb.length) >= 0.75 && semelhanca(ka, kb) >= 0.9) return 'grafia quase igual';
  return '';
}

/** Pessoas (ou grupos) com nomes parecidos, comparados só com os do mesmo primeiro nome. Ficam de fora os pares que
 *  já aparecem com o mesmo nome e os marcados «não confundir»; os que as fichas já distinguem (pai e filho…) vão para
 *  `distinguidos`, como nos pares com o mesmo nome. */
function parecidos(jaVistos) {
  const porPrimeiro = new Map();
  for (const x of E.base.pessoas) {
    const w = palavras(x.nome)[0];
    if (w) (porPrimeiro.get(w) || porPrimeiro.set(w, []).get(w)).push(x);
  }
  const res = [], distinguidos = [];
  for (const grupo of porPrimeiro.values()) {
    for (let i = 0; i < grupo.length; i++) for (let j = i + 1; j < grupo.length; j++) {
      const [a, b] = [grupo[i], grupo[j]].sort((x, y) => riqueza(y) - riqueza(x));
      if ((a.tipo || 'pessoa') !== (b.tipo || 'pessoa') || jaVistos.has(chavePar(a, b)) || distintas(a, b)) continue;
      const parecido = porQueParecidos(a.nome, b.nome);
      if (!parecido) continue;
      const motivo = porQueDiferentes(a, b);
      (motivo ? distinguidos : res).push({ a, b, parecido, motivo });
    }
  }
  const ordem = (x, y) => compararPt(x.b.nome, y.b.nome);
  return { res: res.sort(ordem), distinguidos: distinguidos.sort(ordem) };
}

/** Discos repetidos: o mesmo título e os mesmos intérpretes, ou a mesma referência de catálogo. */
function discosRepetidos() {
  const grupos = new Map();
  for (const g of E.base.gravacoes) {
    const quem = (g.interpretes || []).map((i) => i.pessoa).sort().join(',');
    for (const k of [quem && `${chave(g.titulo)}|${quem}`, g.referencia && `ref|${chave(g.referencia)}`].filter(Boolean)) {
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(g);
    }
  }
  const vistos = new Set(), res = [];
  for (const l of grupos.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
    const [a, b] = [l[i], l[j]].sort((x, y) => riqueza(y) - riqueza(x));
    if (vistos.has(chavePar(a, b)) || distintas(a, b)) continue;
    vistos.add(chavePar(a, b));
    res.push({ a, b });
  }
  return { res };
}

/** Pessoas que parecem misturar duas: atividade antes de nascer, depois de morrer ou 95 anos depois do nascimento,
 *  datas de nascimento a mais de 15 anos umas das outras, ou papéis que uma só pessoa não pode ter junto da mesma
 *  outra (filha e cônjuge de alguém: acontece ao juntar duas fichas que eram de pessoas diferentes). */
const ATIVIDADE = new Set(['atuacao', 'gravacao', 'estreia', 'ensino', 'atividade', 'formacao', 'residencia']);
function misturadas() {
  const res = [];
  for (const p of E.base.pessoas) {
    const anos = (c) => (p.factos || []).filter((f) => f.campo === c && f.data).map((f) => +f.data.slice(0, 4));
    const n = anos('nascimento'), m = anos('morte');
    const estranhos = (p.factos || []).filter((f) => ATIVIDADE.has(f.campo) && f.data).filter((f) => {
      const a = +f.data.slice(0, 4);
      return (n.length && a < Math.min(...n)) || (m.length && a > Math.max(...m) + 1) || (n.length && a > Math.min(...n) + 95);
    });
    const motivos = [...papeisIncompativeis(p)];
    if (n.length > 1 && Math.max(...n) - Math.min(...n) > 15) motivos.push(`nascimentos a ${Math.max(...n) - Math.min(...n)} anos de distância (${[...new Set(n)].join(', ')})`);
    for (const f of estranhos.slice(0, 3)) motivos.push(`${CAMPOS[f.campo]} em ${f.data.slice(0, 4)}: «${f.valor.slice(0, 70)}»`);
    if (motivos.length) res.push({ p, motivos });
  }
  return res;
}

/** Parentescos de uma pessoa, que ajudam a distinguir quem tem o mesmo nome: «filho/a de Artur Paredes · cônjuge de …». */
const familia = (x) => (E.relacoesDe[x.id] || []).filter((r) => REL[r.tipo]?.grupo === 'familia').slice(0, 3)
  .map((r) => `${r.sentido === 'dir' ? REL[r.tipo].dir : REL[r.tipo].inv} ${nomeDe(r.outro)}`);

const cartaoFicha = (tipo, x) => {
  const esp = ESPECIES[tipo];
  const detalhe = tipo === 'pessoas' ? [vida(x), (x.papeis || []).filter((k) => k !== 'outro').map((k) => PAPEIS[k] || k).join(', ')]
    : tipo === 'obras' ? [(x.musica || []).map(nomeDe).join(', '), x.ano]
      : [x.ano, x.editora, x.referencia, (x.interpretes || []).map((i) => nomeDe(i.pessoa)).join(', ')];
  const n = [x.factos?.length && plural(x.factos.length, 'facto', 'factos'), x.relacoes?.length && plural(x.relacoes.length, 'relação', 'relações'),
    x.faixas?.length && plural(x.faixas.length, 'faixa', 'faixas'), x.fontes?.length && plural(x.fontes.length, 'fonte', 'fontes')];
  const fam = tipo === 'pessoas' ? familia(x) : [];
  return html`<div class="par-ficha"><a href="#/${esp.rota}/${x.id}"><b>${x[esp.titulo]}</b></a>
    <small>${[...detalhe, ...n].filter(Boolean).join(' · ') || 'ficha quase vazia'}</small>
    ${fam.length ? html`<small>${fam.join(' · ')}</small>` : ''}</div>`;
};

/** Um par de fichas, com os botões «São a mesma: juntar» e «São diferentes» (este pergunta, sem obrigar, como se
 *  distinguem). Os pares que as fichas já distinguem não têm o «juntar». Antes de juntar, a janela «Vai ficar assim»
 *  (edicao.js) mostra o que passa da segunda ficha para a primeira. */
function par(tipo, { a, b, parecido, motivo }, ed) {
  return html`<div class="par">${cartaoFicha(tipo, a)}<span class="par-e">e</span>${cartaoFicha(tipo, b)}
    ${parecido ? html`<p class="par-motivo">Porquê aqui: ${parecido}.</p>` : ''}
    ${motivo ? html`<p class="par-motivo">As fichas já as distinguem: ${motivo}.</p>` : ''}
    ${ed ? html`<div class="acoes">
      ${motivo ? '' : html`<button class="botao peq" data-acao="juntar" data-tipo="${tipo}" data-manter="${a.id}" data-outra="${b.id}">São a mesma: juntar</button>`}
      <button class="botao peq" data-acao="distintas" data-tipo="${tipo}" data-a="${a.id}" data-b="${b.id}"
        data-pedir="Como se distinguem? (opcional: fica registado nas duas fichas, assinado por si)">São diferentes</button></div>` : ''}</div>`;
}

const MAX_PARES = 60;
function seccaoPares(id, tipo, { res, distinguidos = [] }, titulo, explicacao, semelhantes = []) {
  if (!res.length && !semelhantes.length && !distinguidos.length) return '';
  const ed = editando();
  const lista = (l) => html`<div class="pares">${l.slice(0, MAX_PARES).map((p) => par(tipo, p, ed))}</div>
    ${l.length > MAX_PARES ? html`<p class="mudo">E mais ${l.length - MAX_PARES}.</p>` : ''}`;
  return html`<section class="seccao" id="${id}"><h2>${titulo} <small>${plural(res.length + semelhantes.length, 'caso', 'casos')} · ${explicacao}</small></h2>
    ${res.length ? lista(res) : ''}
    ${semelhantes.length ? html`<h3 class="subtitulo-validar">Nomes parecidos (menos certos) <small>${plural(semelhantes.length, 'par', 'pares')}: muitas vezes
      são pessoas diferentes. Confira os anos, os papéis e a família antes de decidir.</small></h3>${lista(semelhantes)}` : ''}
    ${distinguidos.length ? html`<details class="distinguidos"><summary>Com o mesmo nome (ou parecido), mas as fichas já dizem que são pessoas diferentes (${distinguidos.length})</summary>
      <p class="mudo">Não se propõe juntá-las. Se as marcar como diferentes, fica dito nas duas fichas e deixam de aparecer aqui.</p>${lista(distinguidos)}</details>` : ''}
  </section>`;
}

// ------------------------------------------------------------------ divergências, citações por confirmar, faixas sem obra

/** Fichas com versões divergentes de um campo ainda por comentar: o campo fica na lista enquanto houver uma versão em
 *  conflito sem nota (revisao.js), porque um campo pode juntar várias divergências. As versões ficam todas. */
function divergencias() {
  const res = [];
  for (const t of ['pessoas', 'obras', 'gravacoes', 'instrumentos']) {
    for (const x of E.base[t] || []) {
      const campos = camposPorComentar(x);
      if (campos.length) res.push({ t, x, campos });
    }
  }
  return res.sort((a, b) => riqueza(b.x) - riqueza(a.x));
}

const nomesFontes = (f) => (f.fontes?.length ? [...new Set(f.fontes.map((c) => E.fontes[c.fonte]?.nome || c.fonte))].join(', ')
  : f.editorial ? `testemunho de ${nomeContribuidor(f.editorial.por)}` : 'sem fonte');

/** Uma ficha com divergências: as versões de cada campo lado a lado, com a fonte de cada uma (os números abrem a
 *  citação) e as notas que já tiverem, e, para quem edita, a nota assinada ali mesmo (de início, junto da primeira
 *  versão ainda sem nota). */
function blocoDivergencia({ t, x, campos }, ed) {
  const esp = ESPECIES[t];
  return html`<article class="divergencia">
    <h3><a href="#/${esp.rota}/${x.id}">${x[esp.titulo]}</a>${t === 'pessoas' ? '' : html` <small>${esp.nome}</small>`}</h3>
    ${campos.map((c) => {
      const versoes = (x.factos || []).map((f, i) => ({ f, i })).filter(({ f }) => f.campo === c && f.conflito);
      const comentadas = versoes.filter(({ f }) => comNota(f)).length;
      const k0 = Math.max(0, versoes.findIndex(({ f }) => !comNota(f)));
      return html`<div class="divergencia-campo"><p class="divergencia-nome">${CAMPOS[c] || c}${comentadas
        ? html` <small>${comentadas} de ${versoes.length} versões com nota</small>` : ''}</p>
        <div class="versoes">${versoes.map(({ f }, k) => html`<div class="versao"><span class="versao-n">${k + 1}</span>
          <p>${f.valor}${marcas(f.fontes)}</p><p class="mudo">${nomesFontes(f)}</p>
          ${f.nota_editorial || f.notas_editoriais?.length ? html`<p class="versao-notas">${notaEditorial(f.nota_editorial)}${notasDoFacto(f)}</p>` : ''}</div>`)}</div>
        ${ed ? html`<form class="caixa-edicao nota-divergencia" data-acao="nota-facto">
          <input type="hidden" name="alvo" value="${t}/${x.id}"><input type="hidden" name="valorFacto" value="${versoes[k0].f.valor}">
          <div class="linha-campos">
            ${versoes.length > 1 ? html`<label>A nota fica junto da versão <select class="campo" name="indice" data-versoes>${versoes.map(({ f, i }, k) => html`<option value="${i}"
              data-valor="${f.valor}" ${k === k0 ? raw('selected') : ''}>${k + 1}. ${f.valor.length > 50 ? `${f.valor.slice(0, 50)}…` : f.valor}${comNota(f) ? ' (já tem nota)' : ''}</option>`)}</select></label>`
              : html`<input type="hidden" name="indice" value="${versoes[0].i}">`}
            <label class="nota-texto">Nota assinada <input class="campo" name="texto" required placeholder="Qual lhe parece certa, e porquê"></label>
          </div>
          <div class="acoes"><button class="botao peq primario">Guardar nota</button>
            <small class="mudo">as versões das fontes ficam todas à vista</small></div></form>` : ''}</div>`;
    })}</article>`;
}

/** Os estados de uma citação (estadoCitacao() de citacoes.js, o mesmo do painel) que pedem alguém: confirmar a frase no
 *  original, corrigi-la, ou trocar a fonte. */
const POR_CONFIRMAR = { 'por-confirmar': 'por confirmar', 'nao-encontrada': 'a cópia local não encontrou a frase no documento',
  'fonte-rejeitada': 'fonte rejeitada: o facto precisa de outra fonte' };

/** Citações que ainda não servem de prova verificada: acrescentadas online e ainda não vistas na cópia local, frases que
 *  a cópia local não encontrou no documento e citações de fontes que os editores rejeitaram depois. */
function citacoesPorConfirmar() {
  const res = [];
  for (const t of TIPOS_REVISAO) {
    for (const x of E.base[t] || []) {
      const percorrer = (v) => {
        if (Array.isArray(v)) v.forEach(percorrer);
        else if (v && typeof v === 'object') {
          if ('fonte' in v && String(v.citacao || '').trim()) {
            const estado = estadoCitacao(v);
            if (POR_CONFIRMAR[estado]) res.push({ t, x, c: v, estado });
          }
          Object.values(v).forEach(percorrer);
        }
      };
      percorrer(x);
    }
  }
  return res;
}

/** Faixas ainda sem obra cujo título é igual ao de uma obra (ou a outro título dela, desde que tenha mais de uma
 *  palavra: «Balada» sozinha diz pouco). São só sugestões, agrupadas pelo título; quem edita decide na ficha do disco. */
function faixasSemObra() {
  const porTitulo = new Map();
  const juntar = (titulo, obra, como) => {
    const k = chave(titulo);
    if (k.length < 3) return;
    const l = porTitulo.get(k) || porTitulo.set(k, []).get(k);
    if (!l.some((x) => x.obra === obra)) l.push({ obra, como });
  };
  for (const o of E.base.obras) {
    juntar(o.titulo, o, 'título igual');
    for (const t of o.titulos_alternativos || []) if (chave(t).split(' ').length > 1) juntar(t, o, 'igual a outro título da obra');
  }
  const grupos = new Map();
  for (const g of E.base.gravacoes) {
    for (const fx of g.faixas || []) {
      if (fx.obra || !fx.titulo || !porTitulo.has(chave(fx.titulo))) continue;
      const k = chave(fx.titulo);
      (grupos.get(k) || grupos.set(k, { titulo: fx.titulo, obras: porTitulo.get(k), faixas: [] }).get(k)).faixas.push({ g, fx });
    }
  }
  return [...grupos.values()].sort((a, b) => b.faixas.length - a.faixas.length || compararPt(a.titulo, b.titulo));
}

/** Os controlos da página que não gravam nada: atalhos para as secções, «Só o que eu fiz», «Mostrar mais» e a
 *  versão a que fica junta cada nota. */
function ligarControlos(el, params) {
  const redesenhar = (mudar) => { const p = { ...params, ...mudar }; definirParams(p); porValidar(el, p); };
  el.querySelectorAll('[data-ir]').forEach((b) => { b.onclick = () => document.getElementById(b.dataset.ir)?.scrollIntoView({ block: 'start' }); });
  const so = el.querySelector('[data-so-meu]');
  if (so) so.onchange = () => redesenhar({ meu: so.checked ? '1' : '' });
  el.querySelector('[data-mais-divergencias]')?.addEventListener('click', (e) => redesenhar({ ndiv: e.currentTarget.dataset.maisDivergencias }));
  el.querySelectorAll('select[data-versoes]').forEach((s) => { s.onchange = () => { s.form.elements.valorFacto.value = s.selectedOptions[0].dataset.valor; }; });
}

const POR_PAGINA = 10; // divergências mostradas de cada vez (cada uma tem as versões e a caixa da nota)

export function porValidar(el, params = {}) {
  const eu = sessao()?.id;
  const soMeu = !!(params.meu && eu);
  const cache = new Map();
  const meu = (x) => { if (!cache.has(x)) cache.set(x, assinadaPor(x, eu)); return cache.get(x); };
  const so = (lista, f) => (soMeu ? lista.filter(f) : lista);
  const doPar = ({ a, b }) => meu(a) || meu(b);
  const ed = editando();

  const p = pares('pessoas', 2), sem = parecidos(p.vistos);
  // os pares (com o mesmo nome ou parecido) que as fichas já distinguem ficam juntos, numa dobra sem «juntar»
  const pessoas = { res: so(p.res, doPar), distinguidos: so([...p.distinguidos, ...sem.distinguidos], doPar) };
  const semelhantes = so(sem.res, doPar);
  const obras = { res: so(pares('obras', 1).res, doPar) };
  const discos = { res: so(discosRepetidos().res, doPar) };
  const mistas = so(misturadas(), ({ p: x }) => meu(x));
  const divs = so(divergencias(), ({ x }) => meu(x));
  const fontes = so(E.base.fontes.filter((f) => f.estado === 'pendente'), (f) => f.proposta_por === eu);
  const deContribuidores = so(TIPOS_REVISAO.flatMap((t) => (E.base[t] || []).filter((x) => x.editorial && !revista(x)).map((x) => ({ t, x }))),
    ({ x }) => x.editorial.por === eu);
  const testemunhos = so(['pessoas', 'obras', 'gravacoes', 'instrumentos'].flatMap((t) => (E.base[t] || [])
    .flatMap((x) => (x.factos || []).filter((f) => f.editorial && !f.fontes?.length).map((f) => ({ t, x, f })))), ({ f }) => f.editorial.por === eu);
  const citacoes = so(citacoesPorConfirmar(), ({ x, c }) => c.acrescentada?.por === eu || meu(x));
  // as sugestões de obras para as faixas são para os editores
  const faixas = !podeAprovar() ? [] : faixasSemObra().map((g) => (soMeu ? { ...g, faixas: g.faixas.filter(({ g: d }) => meu(d)) } : g)).filter((g) => g.faixas.length);
  const nFaixas = faixas.reduce((n, g) => n + g.faixas.length, 0);
  const total = pessoas.res.length + semelhantes.length + obras.res.length + discos.res.length + mistas.length + divs.length + fontes.length
    + deContribuidores.length + testemunhos.length + citacoes.length;
  const porRever = TIPOS_REVISAO.reduce((n, t) => n + (E.base[t] || []).filter((x) => !revista(x) && (!soMeu || meu(x))).length, 0);
  const rever = params.separador === 'rever';
  const ligar = (t, x) => html`<a href="${rotaFicha(t, x)}">${x[ESPECIES[t].titulo] || x.url}</a>`;

  const cabecalho = html`<header class="cabecalho"><p class="sobretitulo">Sobre o arquivo</p><h1>Por validar</h1>
      <p class="lead">A lista de trabalho de quem edita: o que os dados sugerem que precisa de uma decisão humana, e as fichas por rever.
        Nada aqui muda sozinho: cada caso abre a ficha ou tem os botões para decidir${ed ? '' : ' (ligue o Modo de edição para os ver)'}.</p></header>
    <nav class="separadores" aria-label="Por validar">
      <a class="separador" href="#/validar${soMeu ? '?meu=1' : ''}" ${rever ? '' : raw('aria-current="page"')}>Por decidir <span class="n">${total.toLocaleString('pt-PT')}</span></a>
      <a class="separador" href="#/validar?separador=rever${soMeu ? '&meu=1' : ''}" ${rever ? raw('aria-current="page"') : ''}>Rever as fichas <span class="n">${porRever.toLocaleString('pt-PT')}</span></a>
    </nav>
    ${eu ? html`<p class="so-meu"><label class="opcao"><input type="checkbox" data-so-meu ${soMeu ? 'checked' : ''}> Só o que eu fiz
      <small class="mudo">os casos em fichas com contributos assinados por si</small></label></p>` : ''}`;

  if (rever) {
    el.innerHTML = html`<div class="conteudo validar">${cabecalho}${seccaoFila(params, soMeu ? meu : null)}</div>`.s;
    ligarControlos(el, params);
    return;
  }

  const atalhos = [['v-pessoas', 'Pessoas repetidas', pessoas.res.length + semelhantes.length], ['v-obras', 'Obras repetidas', obras.res.length],
    ['v-discos', 'Discos repetidos', discos.res.length], ['v-misturadas', 'Fichas que misturam duas', mistas.length],
    ['v-divergencias', 'Divergências', divs.length], ['v-fontes', 'Fontes propostas', fontes.length],
    ['v-contribuidores', 'Fichas de contribuidores', deContribuidores.length], ['v-testemunhos', 'Testemunhos', testemunhos.length],
    ['v-citacoes', 'Citações por confirmar', citacoes.length], ['v-faixas', 'Faixas sem obra', nFaixas]].filter(([, , n]) => n);
  const nDiv = Math.max(POR_PAGINA, +params.ndiv || 0);

  el.innerHTML = html`<div class="conteudo validar">${cabecalho}
    ${atalhos.length ? html`<div class="fichas resumo-validar" role="group" aria-label="Ir para">${atalhos.map(([id, nome, n]) =>
      html`<button type="button" class="ficha" data-ir="${id}">${nome}<span class="n">${n.toLocaleString('pt-PT')}</span></button>`)}</div>` : ''}

    ${seccaoPares('v-pessoas', 'pessoas', pessoas, 'Pessoas que podem estar repetidas', 'o mesmo nome em duas fichas; se forem pessoas diferentes, marque-as e deixam de aparecer aqui', semelhantes)}
    ${seccaoPares('v-obras', 'obras', obras, 'Obras com o mesmo título', 'a mesma música em duas fichas, ou músicas diferentes com o mesmo nome?')}
    ${seccaoPares('v-discos', 'gravacoes', discos, 'Discos que podem estar repetidos', 'o mesmo título e os mesmos intérpretes, ou a mesma referência')}

    ${mistas.length ? html`<section class="seccao" id="v-misturadas"><h2>Fichas que podem misturar duas pessoas <small>${plural(mistas.length, 'caso', 'casos')} · datas ou parentescos que não batem certo com uma só pessoa</small></h2>
      <ul class="lista-simples">${mistas.map(({ p: x, motivos }) => html`<li>${ligar('pessoas', x)} <span class="mudo">${motivos.join(' · ')}</span>
        ${ed ? html`<a class="botao peq" href="#/separar/pessoas/${x.id}">Separar…</a>` : ''}</li>`)}</ul></section>` : ''}

    ${divs.length ? html`<section class="seccao" id="v-divergencias"><h2>Divergências entre fontes por comentar <small>${plural(divs.length, 'ficha', 'fichas')} ·
      as versões ficam todas; quem edita pode deixar em cada versão uma nota assinada (qual lhe parece certa, e porquê),
      e o campo sai desta lista quando todas as versões tiverem nota</small></h2>
      ${divs.slice(0, nDiv).map((d) => blocoDivergencia(d, ed))}
      ${divs.length > nDiv ? html`<p><button type="button" class="botao" data-mais-divergencias="${nDiv + POR_PAGINA}">Mostrar mais ${Math.min(POR_PAGINA, divs.length - nDiv)}
        <small class="mudo">(faltam ${divs.length - nDiv})</small></button></p>` : ''}</section>` : ''}

    ${fontes.length ? html`<section class="seccao" id="v-fontes"><h2>Fontes propostas <small>${plural(fontes.length, 'fonte', 'fontes')} à espera de um editor</small></h2>
      <ul class="lista-simples">${fontes.map((f) => html`<li><a href="#/fontes">${f.nome}</a>
        <span class="mudo">${f.proposta_por ? `proposta por ${nomeContribuidor(f.proposta_por)}` : 'proposta pelo agente'}${f.proposta_em ? `, ${fmtData(f.proposta_em)}` : ''}</span></li>`)}</ul>
      ${podeAprovar() ? html`<p><a class="botao" href="#/fontes">Decidir em Fontes e método</a></p>` : ''}</section>` : ''}

    ${deContribuidores.length ? html`<section class="seccao" id="v-contribuidores"><h2>Fichas criadas por contribuidores, por rever <small>${plural(deContribuidores.length, 'ficha', 'fichas')}</small></h2>
      <ul class="lista-simples">${deContribuidores.map(({ t, x }) => html`<li>${ligar(t, x)} <span class="mudo">${ESPECIES[t].nome} ·
        ${nomeContribuidor(x.editorial.por)}, ${fmtData(x.editorial.data)}</span>${t === 'media' ? botaoRevisao(t, x, 'botao peq') : ''}</li>`)}</ul></section>` : ''}

    ${testemunhos.length ? html`<section class="seccao" id="v-testemunhos"><h2>Testemunhos à espera de uma fonte <small>${plural(testemunhos.length, 'facto', 'factos')} sem fonte,
      assinados por quem os sabe; quando aparecer uma fonte, acrescente-a</small></h2>
      <ul class="lista-simples">${testemunhos.slice(0, 80).map(({ t, x, f }) => html`<li>${ligar(t, x)} <span class="mudo">${CAMPOS[f.campo] || f.campo}: ${f.valor} ·
        ✎ ${nomeContribuidor(f.editorial.por)}</span></li>`)}</ul></section>` : ''}

    ${citacoes.length ? html`<section class="seccao" id="v-citacoes"><h2>Citações por confirmar <small>${plural(citacoes.length, 'citação', 'citações')} que ainda
      não servem de prova verificada: abra o original e veja se a frase lá está, palavra por palavra; se não estiver, corrija-a na ficha</small></h2>
      <ul class="lista-simples citacoes-confirmar">${citacoes.slice(0, 80).map(({ t, x, c, estado }) => html`<li><div>${ligar(t, x)}
        <span class="selo ${estado === 'por-confirmar' ? 'ouro' : 'vinho'}">${POR_CONFIRMAR[estado]}</span>
        <span class="mudo">${E.fontes[c.fonte]?.nome || c.fonte}${c.acrescentada ? ` · acrescentada por ${nomeContribuidor(c.acrescentada.por)}, ${fmtData(c.acrescentada.data)}` : ''}</span>
        <p class="citacao-frase">«${c.citacao.length > 220 ? `${c.citacao.slice(0, 220)}…` : c.citacao}»${marcas([c])}</p></div>
        ${enderecoSeguro(c.url) ? html`<a class="botao peq" href="${enderecoSeguro(c.url)}" target="_blank" rel="noopener">Abrir o original ↗</a>` : ''}</li>`)}</ul>
      ${citacoes.length > 80 ? html`<p class="mudo">E mais ${citacoes.length - 80}.</p>` : ''}</section>` : ''}

    ${faixas.length ? html`<section class="seccao" id="v-faixas"><h2>Faixas que podem ser de uma obra <small>${plural(nFaixas, 'faixa', 'faixas')} ainda sem obra,
      com o título de uma obra do arquivo · só sugestões: quem edita decide na ficha do disco (✎ Corrigir os dados, coluna «Obra»); nada se liga sozinho</small></h2>
      <details class="faixas-obras"><summary>Ver as sugestões, por título (${faixas.length})</summary>
      ${faixas.map(({ titulo, obras: os, faixas: fs }) => html`<div class="faixa-grupo">
        <p><b>«${titulo}»</b> <span class="mudo">${plural(fs.length, 'faixa', 'faixas')}</span>
          ${os.length > 1 ? html`<span class="selo ouro">${os.length} obras com este título</span>` : ''}<br>
          ${os.map(({ obra: ob, como }, k) => html`${k ? ' · ' : ''}<a href="#/obra/${ob.id}">${ob.titulo}</a>${ob.musica?.length ? ` (${ob.musica.map(nomeDe).join(', ')})` : ''}
            <span class="mudo">— ${como}</span>`)}</p>
        <ul class="lista-simples">${fs.map(({ g, fx }) => html`<li><a href="#/gravacao/${g.id}">${g.titulo}</a>
          <span class="mudo">${[g.ano, (g.interpretes || []).map((i) => nomeDe(i.pessoa)).join(', '), `faixa ${fx.n || '?'}`].filter(Boolean).join(' · ')}</span>
          ${ed ? html`<a class="botao peq" href="#/editar/gravacoes/${g.id}">✎ Corrigir as faixas</a>` : ''}</li>`)}</ul></div>`)}
      </details></section>` : ''}

    ${!total && !faixas.length ? html`<div class="vazio"><h3>Nada por decidir</h3><p>${soMeu ? 'Não há casos em fichas com contributos seus.' : 'Não há casos à espera de decisão.'}
      Veja também as <a href="#/validar?separador=rever">fichas por rever</a>.</p></div>` : ''}
  </div>`.s;
  ligarControlos(el, params);
}
