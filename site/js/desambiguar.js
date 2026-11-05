// Desambiguação no modo de edição: juntar duas fichas que são a mesma pessoa (ou obra, ou disco), separar uma ficha que
// mistura duas, e marcar fichas com o mesmo nome como diferentes («não confundir com»). As ações estão em edicao.js.
import { E, REL, CAMPOS, nomeDe, vida, nomeContribuidor } from './estado.js';
import { html, fmtData, miniatura } from './util.js';
import { seletorPessoa } from './seletor.js';
import { ESPECIES, rotulos, idDeRotulo, concordancia } from './fichas.js';
import { editando } from './edicao.js';

const DESAMBIGUAVEIS = ['pessoas', 'obras', 'gravacoes'];
/** Como se mostra uma ficha nestas ferramentas. Obras e discos usam os rótulos das listas de escolha de fichas.js
 *  (com a referência do disco e, se ainda houver iguais, [2], [3]…), para cada texto levar sempre à mesma ficha. */
const rotuloFicha = (tipo, id) => {
  const x = E.por[tipo]?.[id];
  if (!x) return id;
  if (tipo === 'pessoas') return `${x.nome}${vida(x) ? ` (${vida(x)})` : ''}`;
  return rotulos(tipo).find(([, i]) => i === id)?.[0] || x.titulo || id;
};
const ligacao = (tipo, id) => html`<a href="#/${ESPECIES[tipo].rota}/${id}">${rotuloFicha(tipo, id)}</a>`;

// ------------------------------------------------------------------ pessoas com o mesmo nome que as fichas já distinguem

const papelFamiliar = (r) => (r.tipo === 'filho_de' ? (r.sentido === 'dir' ? 'filho/a' : 'pai/mãe')
  : r.tipo === 'conjuge_de' ? 'cônjuge' : r.tipo === 'irmao_de' ? 'irmão/ã' : '');

/** Porque é que as fichas já dizem que duas pessoas são diferentes ('' se nada o diz): estão ligadas entre si (pai e
 *  filho com o mesmo nome), têm pais diferentes registados, ou têm papéis que uma só pessoa não pode ter junto de uma
 *  terceira (filha e mulher de Petrónio Ricciulli). Só se lê o que as fichas já registam, com as suas fontes.
 *  Pais diferentes só contam quando, juntos, seriam mais de dois e nenhum é cônjuge de um pai da outra ficha: uma ficha
 *  pode registar só o pai e a outra só a mãe da mesma pessoa. */
export function porQueDiferentes(a, b) {
  if (!a || !b) return '';
  const ra = E.relacoesDe[a.id] || [], rb = E.relacoesDe[b.id] || [];
  const direta = ra.find((r) => r.outro === b.id);
  if (direta) {
    // «a primeira é pai/mãe da segunda» (os nomes podem ser iguais, por isso não se repetem)
    const rel = (direta.sentido === 'dir' ? REL[direta.tipo]?.dir : REL[direta.tipo]?.inv) || direta.tipo;
    const frase = / de$/.test(rel) ? `é ${rel.replace(/ de$/, ' da segunda')}` : / por$/.test(rel) ? `é ${rel.replace(/ por$/, ' pela segunda')}`
      : /^(influenciou|acompanhou|tocou com|tem como membro)$/.test(rel) ? `${rel} a segunda` : `é ${rel} a segunda`;
    return `estão ligadas entre si: a primeira ${frase}`;
  }
  const pais = (rs) => [...new Set(rs.filter((r) => r.tipo === 'filho_de' && r.sentido === 'dir').map((r) => r.outro))];
  const casados = (x, y) => (E.relacoesDe[x] || []).some((r) => r.tipo === 'conjuge_de' && r.outro === y);
  const pa = pais(ra), pb = pais(rb);
  if (pa.length && pb.length && pa.length + pb.length > 2 && !pa.some((x) => pb.includes(x) || pb.some((y) => casados(x, y)))) {
    return `têm pais diferentes registados (${pa.map(nomeDe).join(' e ')}; ${pb.map(nomeDe).join(' e ')})`;
  }
  for (const x of ra) {
    for (const y of rb) {
      const [px, py] = [papelFamiliar(x), papelFamiliar(y)];
      if (x.outro === y.outro && px && py && px !== py) return `uma é ${px} e a outra ${py} de ${nomeDe(x.outro)}`;
    }
  }
  return '';
}

/** Papéis que uma só pessoa não pode ter junto da mesma outra («é filho/a e cônjuge de Petrónio Ricciuli»): sinal de
 *  uma ficha que mistura duas pessoas (por exemplo, depois de juntar duas que eram diferentes). Conta só na ficha que
 *  regista pelo menos uma dessas relações, para não apontar também a outra pessoa. */
export function papeisIncompativeis(p) {
  const porOutro = new Map();
  for (const r of E.relacoesDe[p.id] || []) {
    const papel = papelFamiliar(r);
    if (!papel) continue;
    const x = porOutro.get(r.outro) || porOutro.set(r.outro, { papeis: new Set(), aqui: false }).get(r.outro);
    x.papeis.add(papel);
    x.aqui ||= r.sentido === 'dir';
  }
  return [...porOutro].filter(([, x]) => x.papeis.size > 1 && x.aqui).map(([outro, x]) => `é ${[...x.papeis].join(' e ')} de ${nomeDe(outro)}`);
}

// Juntar duas pessoas que as fichas dizem ser diferentes pede uma confirmação a mais, com o motivo (o formulário da
// ficha; em «Por validar» estes pares nem têm o botão «juntar»).
document.addEventListener('submit', (e) => {
  const f = e.target.closest?.('form[data-acao="juntar"]');
  if (!f || f.elements.tipo?.value !== 'pessoas') return;
  const a = E.por.pessoas[f.elements.manter?.value], b = E.por.pessoas[f.elements.outra?.value];
  const motivo = porQueDiferentes(a, b);
  if (motivo && !confirm(`As fichas dizem que «${a.nome}» e «${b.nome}» são pessoas diferentes: ${motivo}.\n\nJuntar mesmo assim?`)) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);

/** Escolher outra ficha do mesmo tipo: pessoas pela lista que se filtra ao escrever; obras e discos pelo título. */
const escolherOutra = (tipo, f, nome) => (tipo === 'pessoas'
  ? seletorPessoa({ criar: false, excluir: f.id, nome, nomeNova: `${nome}_nova` })
  : html`<input class="campo" name="${nome}" list="dl-${tipo}" required placeholder="Escreva o título e escolha na lista">`);

/** «Não confundir com …» no topo da ficha (fichas com o mesmo nome que são de pessoas ou obras diferentes). */
export function naoConfundir(tipo, f) {
  if (!f.distinta_de?.length) return '';
  return html`<p class="alt nao-confundir">Não confundir com: ${f.distinta_de.map((d, i) => html`${i ? '; ' : ''}${ligacao(tipo, d.id)}`)}</p>`;
}

/** Secção do modo de edição com as três ferramentas: é a mesma, é diferente, separar. */
export function seccaoDesambiguar(tipo, f) {
  if (!editando() || !DESAMBIGUAVEIS.includes(tipo)) return '';
  const esp = ESPECIES[tipo];
  const quem = tipo === 'pessoas' ? 'pessoa' : esp.nome;
  const { outro, mesmo } = concordancia(tipo); // «o mesmo disco», «a mesma obra» (P5a)
  return html`<section class="seccao"><h2>Desambiguação <small>quando há fichas repetidas, ou uma ficha que mistura duas ${tipo === 'pessoas' ? 'pessoas' : 'coisas'} com o mesmo nome</small></h2>
    ${f.juntou?.length ? html`<p class="mudo">Esta ficha inclui ${f.juntou.map((j, i) => html`${i ? ', ' : ''}«${j[esp.titulo] || j.id}» (juntada por ${nomeContribuidor(j.por)}, ${fmtData(j.data)})`)}.</p>` : ''}
    ${f.distinta_de?.length ? html`<ul class="lista-simples">${f.distinta_de.map((d) => html`<li>Não confundir com ${ligacao(tipo, d.id)}
      <span class="mudo">✎ ${nomeContribuidor(d.por)}, ${fmtData(d.data)}${d.nota ? ` — ${d.nota}` : ''}</span>
      <button class="botao peq" data-acao="distintas" data-tipo="${tipo}" data-a="${f.id}" data-b="${d.id}" data-retirar="1"
        data-confirmar="Retirar a marca «não confundir»? (só se afinal forem ${mesmo} ${quem})">Retirar a marca</button></li>`)}</ul>` : ''}
    <div class="formularios-lado">
      <form class="caixa-edicao" data-acao="juntar">
        <h3>É ${mesmo} ${quem} que outra ficha <small>junta as duas: o que a outra tem passa para esta, a outra deixa de existir e quem a procurar vem parar aqui</small></h3>
        <input type="hidden" name="tipo" value="${tipo}"><input type="hidden" name="manter" value="${f.id}">
        <label>A outra ficha ${escolherOutra(tipo, f, 'outra')}</label>
        <label>Porquê <small>opcional (ex.: «a mesma data de nascimento», «grafia antiga do nome»)</small><input class="campo" name="nota"></label>
        <label class="opcao"><input type="checkbox" name="confirmo" value="1" required> Confirmo que são ${mesmo} ${quem}</label>
        <div class="acoes"><button class="botao peq primario">Juntar a esta ficha</button></div>
      </form>
      <form class="caixa-edicao" data-acao="distintas">
        <h3>Não confundir com… <small>outra ficha com o mesmo nome (ou parecido) que é de ${outro} ${quem}; fica dito nas duas</small></h3>
        <input type="hidden" name="tipo" value="${tipo}"><input type="hidden" name="a" value="${f.id}">
        <label>A outra ficha ${escolherOutra(tipo, f, 'b')}</label>
        <label>Como se distinguem <small>opcional (ex.: «um é do século XIX, o outro dos anos 80»)</small><input class="campo" name="nota"></label>
        <div class="acoes"><button class="botao peq primario">Marcar como diferentes</button></div>
      </form>
    </div>
    ${tipo !== 'gravacoes' ? html`<p style="margin-top:14px"><a class="botao" href="#/separar/${tipo}/${f.id}">Separar: esta ficha mistura duas ${tipo === 'pessoas' ? 'pessoas' : 'obras'}…</a></p>` : ''}
    <datalist id="dl-${tipo}">${tipo !== 'pessoas' ? rotulos(tipo).filter(([, id]) => id !== f.id).map(([r]) => html`<option value="${r}">`) : ''}</datalist>
  </section>`;
}

/** id da ficha escolhida pelo texto da lista (obras e discos): os rótulos são únicos, por isso nunca é outra ficha. */
export const idDoRotulo = (tipo, texto) => idDeRotulo(tipo, texto);

// ------------------------------------------------------------------ página «Separar»

const caixa = (valor, rotulo, extra = '') => html`<label class="opcao item-separar"><input type="checkbox" name="itens[]" value="${valor}"> ${extra}<span>${rotulo}</span></label>`;
const fonteCurta = (fontes) => (fontes?.length ? ` — ${fontes.map((c) => E.fontes[c.fonte]?.nome || c.fonte).join(', ')}` : '');

function itensPessoa(p) {
  const grupos = [];
  const juntar = (titulo, lista) => { if (lista.length) grupos.push([titulo, lista]); };
  juntar('Factos', (p.factos || []).map((f, i) => caixa(`factos:${i}`, `${CAMPOS[f.campo] || f.campo}: ${f.valor}${fonteCurta(f.fontes)}${f.editorial ? ' (testemunho ✎)' : ''}`)));
  juntar('Excertos das fontes', (p.biografia || []).map((c, i) => caixa(`biografia:${i}`, `«${(c.citacao || '').slice(0, 140)}…»${fonteCurta([c])}`)));
  juntar('Outros nomes', (p.nomes_alternativos || []).map((n) => caixa(`nomes_alternativos:${n}`, n)));
  juntar('Relações (nesta ficha)', (p.relacoes || []).map((r, i) => caixa(`relacoes:${i}`, `${REL[r.tipo]?.dir || r.tipo} ${nomeDe(r.alvo)}`)));
  const inversas = new Map();
  for (const r of E.relacoesDe[p.id] || []) if (r.sentido === 'inv') inversas.set(r.outro, `${nomeDe(r.outro)}: ${REL[r.tipo]?.dir || r.tipo} ${p.nome}`);
  juntar('Relações (nas fichas de outras pessoas)', [...inversas].map(([id, t]) => caixa(`pessoas:${id}`, t)));
  juntar('Fotografias', [...(p.imagens || []), ...(p.imagens_ocultas || [])].map((im) => caixa(`imagens:${im.url}`, im.legenda || 'sem legenda',
    html`<img class="mini-separar" src="${miniatura(im.url, 120)}" alt="" loading="lazy" referrerpolicy="no-referrer">`)));
  juntar('Gravações', (E.gravacoesDe[p.id] || []).map(({ gravacao: g, funcao }) => caixa(`gravacoes:${g.id}`, `${g.titulo}${g.ano ? ` (${g.ano})` : ''}${funcao ? ` — ${funcao}` : ''}`)));
  juntar('Obras', (E.obrasDe[p.id] || []).map(({ obra: o, papel }) => caixa(`obras:${o.id}`, `${o.titulo} — ${papel}`)));
  juntar('Vídeos e áudios', (E.mediaDe[p.id] || []).map((m) => caixa(`media:${m.id}`, m.titulo)));
  juntar('Instrumentos', (E.instrumentosDe[p.id] || []).map(({ instrumento: i, papel }) => caixa(`instrumentos:${i.id}`, `${i.designacao} — ${papel}`)));
  juntar('Artigos e referências', (p.referencias || []).map((r) => caixa(`referencias:${r.url}`, r.titulo)));
  return grupos;
}

function itensObra(o) {
  const grupos = [];
  const juntar = (titulo, lista) => { if (lista.length) grupos.push([titulo, lista]); };
  juntar('Autores', [...(o.musica || []).map((id) => caixa(`musica:${id}`, `Música: ${nomeDe(id)}`)),
    ...(o.letra || []).map((id) => caixa(`letra:${id}`, `Letra: ${nomeDe(id)}`))]);
  juntar('Outros títulos', (o.titulos_alternativos || []).map((t) => caixa(`titulos_alternativos:${t}`, t)));
  if (o.letra_texto) juntar('Letra', [caixa('letra_texto', `«${o.letra_texto.citacao.slice(0, 120)}…»`)]);
  juntar('Interpretações em discos', (E.faixasDeObra[o.id] || []).map(({ gravacao: g, faixa }) => caixa(`gravacoes:${g.id}`, `${g.titulo}${g.ano ? ` (${g.ano})` : ''} — faixa «${faixa.titulo || o.titulo}»`)));
  juntar('Vídeos e áudios', (E.mediaDeObra[o.id] || []).map((m) => caixa(`media:${m.id}`, m.titulo)));
  juntar('Factos', (o.factos || []).map((f, i) => caixa(`factos:${i}`, `${CAMPOS[f.campo] || f.campo}: ${f.valor}${fonteCurta(f.fontes)}`)));
  juntar('Fontes', (o.fontes || []).map((c, i) => caixa(`fontes:${i}`, `${E.fontes[c.fonte]?.nome || c.fonte}${c.citacao ? `: «${c.citacao.slice(0, 100)}…»` : ''}`)));
  juntar('Artigos e referências', (o.referencias || []).map((r) => caixa(`referencias:${r.url}`, r.titulo)));
  return grupos;
}

export function separar(el, tipo, id) {
  const esp = ESPECIES[tipo], f = E.por[tipo]?.[id];
  if (!['pessoas', 'obras'].includes(tipo)) {
    el.innerHTML = html`<div class="conteudo estreito"><h1>Separar</h1><p>Só se separam fichas de pessoas e de obras.
      ${f && esp?.rota ? html`<a href="#/${esp.rota}/${id}">Voltar à ficha</a>.` : ''}</p></div>`.s;
    return;
  }
  if (!f) { el.innerHTML = '<div class="conteudo"><h1>Ficha não encontrada</h1></div>'; return; }
  const nome = f[esp.titulo];
  if (!editando()) {
    el.innerHTML = html`<div class="conteudo estreito"><h1>Separar «${nome}»</h1><p>Ligue o <b>Modo de edição</b>, no menu.</p></div>`.s;
    return;
  }
  const grupos = tipo === 'pessoas' ? itensPessoa(f) : itensObra(f);
  const outra = tipo === 'pessoas' ? 'pessoa' : 'obra';
  el.innerHTML = html`<div class="conteudo estreito">
    <header class="cabecalho"><p class="sobretitulo">Modo de edição · Desambiguação</p><h1>Separar «${nome}»</h1>
      <p class="lead">Quando uma ficha junta duas ${tipo === 'pessoas' ? 'pessoas' : 'músicas'} diferentes com o mesmo nome, escolha o que é da outra.
        Passa para uma ficha nova (ou para uma que já exista), e as duas ficam marcadas «não confundir com».</p></header>
    <form class="caixa-edicao larga" data-acao="separar">
      <input type="hidden" name="tipo" value="${tipo}"><input type="hidden" name="id" value="${id}">
      <h3>1. Para onde vai o que escolher?</h3>
      <label class="opcao"><input type="radio" name="destino" value="nova" checked> Uma ficha nova, com o nome
        <input class="campo" name="nome" value="${nome}" style="width:auto;min-width:260px"></label>
      <label class="opcao"><input type="radio" name="destino" value="existente"> Uma ${outra} que já tem ficha:</label>
      ${tipo === 'pessoas' ? seletorPessoa({ criar: false, excluir: id, nome: 'outro' })
        : html`<input class="campo" name="outro" list="dl-obras-separar" placeholder="Escreva o título e escolha na lista">
          <datalist id="dl-obras-separar">${rotulos('obras').filter(([, i]) => i !== id).map(([r]) => html`<option value="${r}">`)}</datalist>`}
      <h3 style="margin-top:8px">2. O que é da outra ${outra}?</h3>
      ${grupos.map(([titulo, lista]) => html`<fieldset class="grupo-separar"><legend>${titulo}</legend>${lista}</fieldset>`)}
      <label>Como se distinguem <small>opcional (ex.: «o fadista do século XIX não é o guitarrista dos anos 60»)</small><input class="campo" name="nota"></label>
      <div class="acoes"><button class="botao primario">Separar</button><a class="botao" href="#/${esp.rota}/${id}">Cancelar</a></div>
    </form></div>`.s;
}
