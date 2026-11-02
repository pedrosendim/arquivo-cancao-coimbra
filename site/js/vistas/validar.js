// «Por validar»: a lista de trabalho de quem edita. O que os dados sugerem que precisa de uma decisão humana —
// fichas que parecem repetidas, fichas que parecem misturar duas pessoas, divergências entre fontes por comentar,
// fontes propostas, fichas e testemunhos de contribuidores à espera de revisão. Nada aqui muda os dados sozinho.
import { E, PAPEIS, CAMPOS, vida, nomeDe, nomeContribuidor } from '../estado.js';
import { html, norm, plural, fmtData } from '../util.js';
import { editando, podeAprovar } from '../edicao.js';
import { ESPECIES } from '../fichas.js';

const chave = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const distintas = (x, y) => (x.distinta_de || []).some((d) => d.id === y.id);
const riqueza = (x) => (x.factos?.length || 0) + (x.biografia?.length || 0) * 2 + (x.relacoes?.length || 0) + (x.imagens?.length || 0)
  + (x.fontes?.length || 0) + (x.faixas?.length || 0);

/** Pares de fichas com o mesmo nome (ou com o nome de uma igual a outro nome da outra), sem a marca «não confundir». */
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
  const vistos = new Set(), res = [];
  for (const [k, grupo] of indice) {
    const l = [...grupo];
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const [a, b] = [l[i], l[j]].sort((x, y) => riqueza(y) - riqueza(x)); // a primeira é a que fica, se se juntarem
      const id = `${a.id}|${b.id}`;
      if (vistos.has(id) || distintas(a, b) || distintas(b, a)) continue;
      vistos.add(id);
      res.push({ a, b, k });
    }
  }
  return res;
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
    if (vistos.has(`${a.id}|${b.id}`) || distintas(a, b) || distintas(b, a)) continue;
    vistos.add(`${a.id}|${b.id}`);
    res.push({ a, b });
  }
  return res;
}

/** Pessoas que parecem misturar duas: atividade antes de nascer, depois de morrer ou 95 anos depois do nascimento,
 *  ou datas de nascimento a mais de 15 anos umas das outras. */
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
    const motivos = [];
    if (n.length > 1 && Math.max(...n) - Math.min(...n) > 15) motivos.push(`nascimentos a ${Math.max(...n) - Math.min(...n)} anos de distância (${[...new Set(n)].join(', ')})`);
    for (const f of estranhos.slice(0, 3)) motivos.push(`${CAMPOS[f.campo]} em ${f.data.slice(0, 4)}: «${f.valor.slice(0, 70)}»`);
    if (motivos.length) res.push({ p, motivos });
  }
  return res;
}

const cartaoFicha = (tipo, x) => {
  const esp = ESPECIES[tipo];
  const detalhe = tipo === 'pessoas' ? [vida(x), (x.papeis || []).filter((k) => k !== 'outro').map((k) => PAPEIS[k] || k).join(', ')]
    : tipo === 'obras' ? [(x.musica || []).map(nomeDe).join(', '), x.ano] : [x.ano, x.editora, (x.interpretes || []).map((i) => nomeDe(i.pessoa)).join(', ')];
  const n = [x.factos?.length && plural(x.factos.length, 'facto', 'factos'), x.relacoes?.length && plural(x.relacoes.length, 'relação', 'relações'),
    x.faixas?.length && plural(x.faixas.length, 'faixa', 'faixas'), x.fontes?.length && plural(x.fontes.length, 'fonte', 'fontes')];
  return html`<div class="par-ficha"><a href="#/${esp.rota}/${x.id}"><b>${x[esp.titulo]}</b></a>
    <small>${[...detalhe, ...n].filter(Boolean).join(' · ') || 'ficha quase vazia'}</small></div>`;
};

function seccaoPares(tipo, lista, titulo, explicacao) {
  if (!lista.length) return '';
  const ed = editando();
  return html`<section class="seccao"><h2>${titulo} <small>${plural(lista.length, 'caso', 'casos')} · ${explicacao}</small></h2>
    <div class="pares">${lista.slice(0, 60).map(({ a, b }) => html`<div class="par">${cartaoFicha(tipo, a)}<span class="par-e">e</span>${cartaoFicha(tipo, b)}
      ${ed ? html`<div class="acoes">
        <button class="botao peq" data-acao="juntar" data-tipo="${tipo}" data-manter="${a.id}" data-outra="${b.id}"
          data-confirmar="Juntar «${b[ESPECIES[tipo].titulo]}» em «${a[ESPECIES[tipo].titulo]}»? A segunda deixa de existir e o que tinha passa para a primeira.">São a mesma: juntar</button>
        <button class="botao peq" data-acao="distintas" data-tipo="${tipo}" data-a="${a.id}" data-b="${b.id}">São diferentes</button></div>` : ''}</div>`)}</div>
    ${lista.length > 60 ? html`<p class="mudo">E mais ${lista.length - 60}.</p>` : ''}</section>`;
}

export function porValidar(el) {
  const pessoas = pares('pessoas', 2), obras = pares('obras', 1), discos = discosRepetidos(), mistas = misturadas();
  const divergencias = [];
  for (const t of ['pessoas', 'obras', 'gravacoes', 'instrumentos']) {
    for (const x of E.base[t] || []) {
      const campos = [...new Set((x.factos || []).filter((f) => f.conflito && !f.nota_editorial).map((f) => f.campo))];
      if (campos.length) divergencias.push({ t, x, campos });
    }
  }
  divergencias.sort((a, b) => riqueza(b.x) - riqueza(a.x));
  const fontes = E.base.fontes.filter((f) => f.estado === 'pendente');
  const deContribuidores = ['pessoas', 'obras', 'gravacoes', 'instrumentos', 'media'].flatMap((t) => (E.base[t] || [])
    .filter((x) => x.editorial && x.estado_revisao !== 'revisto').map((x) => ({ t, x })));
  const testemunhos = ['pessoas', 'obras', 'gravacoes', 'instrumentos'].flatMap((t) => (E.base[t] || [])
    .flatMap((x) => (x.factos || []).filter((f) => f.editorial && !f.fontes?.length).map((f) => ({ t, x, f }))));
  const total = pessoas.length + obras.length + discos.length + mistas.length + divergencias.length + fontes.length + deContribuidores.length;
  const ligar = (t, x) => html`<a href="#/${ESPECIES[t].rota}/${x.id}">${x[ESPECIES[t].titulo]}</a>`;

  el.innerHTML = html`<div class="conteudo">
    <header class="cabecalho"><p class="sobretitulo">Sobre o arquivo</p><h1>Por validar</h1>
      <p class="lead">O que os dados sugerem que precisa de uma decisão humana. Nada aqui muda sozinho: cada caso abre a ficha
        ou tem os botões para decidir${editando() ? '' : ' (ligue o Modo de edição para os ver)'}. ${plural(total, 'caso', 'casos')} neste momento.</p></header>

    ${seccaoPares('pessoas', pessoas, 'Pessoas que podem estar repetidas', 'o mesmo nome em duas fichas; se forem pessoas diferentes, marque-as e deixam de aparecer aqui')}
    ${seccaoPares('obras', obras, 'Obras com o mesmo título', 'a mesma música em duas fichas, ou músicas diferentes com o mesmo nome?')}
    ${seccaoPares('gravacoes', discos, 'Discos que podem estar repetidos', 'o mesmo título e os mesmos intérpretes, ou a mesma referência')}

    ${mistas.length ? html`<section class="seccao"><h2>Fichas que podem misturar duas pessoas <small>${plural(mistas.length, 'caso', 'casos')} · datas que não batem certo com uma só vida</small></h2>
      <ul class="lista-simples">${mistas.map(({ p, motivos }) => html`<li>${ligar('pessoas', p)} <span class="mudo">${motivos.join(' · ')}</span>
        ${editando() ? html`<a class="botao peq" href="#/separar/pessoas/${p.id}">Separar…</a>` : ''}</li>`)}</ul></section>` : ''}

    ${divergencias.length ? html`<section class="seccao"><h2>Divergências entre fontes por comentar <small>${plural(divergencias.length, 'ficha', 'fichas')} ·
      as versões ficam todas; um editor pode deixar uma nota (✎) a dizer qual lhe parece certa e porquê</small></h2>
      <ul class="lista-simples">${divergencias.slice(0, 80).map(({ t, x, campos }) => html`<li>${ligar(t, x)}
        <span class="mudo">${campos.map((c) => CAMPOS[c] || c).join(', ')}</span></li>`)}</ul>
      ${divergencias.length > 80 ? html`<p class="mudo">E mais ${divergencias.length - 80}.</p>` : ''}</section>` : ''}

    ${fontes.length ? html`<section class="seccao"><h2>Fontes propostas <small>${plural(fontes.length, 'fonte', 'fontes')} à espera de um editor</small></h2>
      <ul class="lista-simples">${fontes.map((f) => html`<li><a href="#/fontes">${f.nome}</a>
        <span class="mudo">${f.proposta_por ? `proposta por ${nomeContribuidor(f.proposta_por)}` : 'proposta pelo agente'}${f.proposta_em ? `, ${fmtData(f.proposta_em)}` : ''}</span></li>`)}</ul>
      ${podeAprovar() ? html`<p><a class="botao" href="#/fontes">Decidir em Fontes e método</a></p>` : ''}</section>` : ''}

    ${deContribuidores.length ? html`<section class="seccao"><h2>Fichas criadas por contribuidores, por rever <small>${plural(deContribuidores.length, 'ficha', 'fichas')}</small></h2>
      <ul class="lista-simples">${deContribuidores.map(({ t, x }) => html`<li>${ligar(t, x)} <span class="mudo">${ESPECIES[t].nome} ·
        ${nomeContribuidor(x.editorial.por)}, ${fmtData(x.editorial.data)}</span></li>`)}</ul></section>` : ''}

    ${testemunhos.length ? html`<section class="seccao"><h2>Testemunhos à espera de uma fonte <small>${plural(testemunhos.length, 'facto', 'factos')} sem fonte,
      assinados por quem os sabe; quando aparecer uma fonte, acrescente-a</small></h2>
      <ul class="lista-simples">${testemunhos.slice(0, 80).map(({ t, x, f }) => html`<li>${ligar(t, x)} <span class="mudo">${CAMPOS[f.campo] || f.campo}: ${f.valor} ·
        ✎ ${nomeContribuidor(f.editorial.por)}</span></li>`)}</ul></section>` : ''}

    ${!total && !testemunhos.length ? html`<div class="vazio"><h3>Nada por validar</h3><p>Não há casos à espera de decisão.</p></div>` : ''}
  </div>`.s;
}
