// Criar e corrigir fichas no modo de edição: pessoas e grupos, obras, discos, instrumentos, vídeos e áudios.
// Cada tipo descreve os seus campos (ESPECIES) e o mesmo formulário serve para criar e para corrigir; as ações
// que gravam estão em edicao.js. Nascimento e morte, factos e referências têm formulários próprios, sempre com
// «Como sabe?»: uma fonte (o endereço da página e a frase copiada à letra) ou um testemunho assinado (✎).
import { E, PAPEIS, CAMPOS, FORMATOS, GENEROS, nomeDe } from './estado.js';
import { $, $$, html } from './util.js';
import { seletorPessoa } from './seletor.js';
import { camposProva, marcaEditorial } from './formularios.js';
import { editando, sessao, podeAprovar } from './edicao.js';

const TIPOS_INSTRUMENTO = ['guitarra de Coimbra', 'guitarra de Lisboa', 'guitarra portuguesa', 'viola', 'bandolim', 'outro'];

/** Os campos de cada tipo de ficha. `t`: texto, ano, url, lista (separada por ;), escolha, varios, pessoa, pessoas,
 *  obras, gravacao, linhas (uma linha por intérprete ou faixa). */
export const ESPECIES = {
  pessoas: {
    nome: 'pessoa', nova: 'Nova pessoa', titulo: 'nome', rota: 'pessoa', lista: '#/pessoas', campos: [
      { k: 'nome', r: 'Nome por que é conhecido/a', t: 'texto', obrig: true },
      { k: 'tipo', r: 'É', t: 'escolha', opcoes: { pessoa: 'uma pessoa', grupo: 'um grupo (grupo de fados, tuna, quarteto, orfeão…)' } },
      { k: 'nomes_alternativos', r: 'Outros nomes', t: 'lista', ajuda: 'nome completo, alcunhas, outras grafias; separados por ponto e vírgula' },
      { k: 'papeis', r: 'Papéis', t: 'varios', opcoes: PAPEIS, ajuda: '«Outro» para familiares e pessoas sem papel musical' },
    ],
  },
  obras: {
    nome: 'obra', nova: 'Nova obra', titulo: 'titulo', rota: 'obra', lista: '#/obras', fonte: 'factos', campos: [
      { k: 'titulo', r: 'Título', t: 'texto', obrig: true },
      { k: 'titulos_alternativos', r: 'Outros títulos', t: 'lista', ajuda: 'títulos por que também é conhecida; separados por ponto e vírgula' },
      { k: 'genero', r: 'Género', t: 'escolha', opcoes: GENEROS },
      { k: 'musica', r: 'Música de', t: 'pessoas' },
      { k: 'letra', r: 'Letra de', t: 'pessoas' },
      { k: 'ano', r: 'Ano', t: 'ano' },
    ],
  },
  gravacoes: {
    nome: 'disco ou gravação', nova: 'Novo disco ou gravação', titulo: 'titulo', rota: 'gravacao', lista: '#/discografia', fonte: 'factos', campos: [
      { k: 'titulo', r: 'Título', t: 'texto', obrig: true },
      { k: 'formato', r: 'Formato', t: 'escolha', opcoes: FORMATOS },
      { k: 'editora', r: 'Editora', t: 'texto' },
      { k: 'referencia', r: 'Referência do disco', t: 'texto', ajuda: 'ex.: Alvorada MEP 60280' },
      { k: 'ano', r: 'Ano', t: 'ano' },
      { k: 'local', r: 'Local da gravação', t: 'texto' },
      { k: 'interpretes', r: 'Intérpretes', t: 'linhas', mais: '+ Intérprete', colunas: [
        { k: 'pessoa', r: 'Pessoa ou grupo', t: 'pessoa' }, { k: 'funcao', r: 'Função', t: 'texto', ajuda: 'guitarra, viola, voz…' }] },
      { k: 'faixas', r: 'Faixas', t: 'linhas', mais: '+ Faixa', colunas: [
        { k: 'titulo', r: 'Título da faixa', t: 'texto' }, { k: 'obra', r: 'Obra (se já tiver ficha)', t: 'obra' }] },
    ],
  },
  instrumentos: {
    nome: 'instrumento', nova: 'Novo instrumento', titulo: 'designacao', rota: 'instrumento', lista: '#/instrumentos', fonte: 'factos', campos: [
      { k: 'designacao', r: 'Designação', t: 'texto', obrig: true, ajuda: 'ex.: Guitarra de Coimbra de Artur Paredes (Grácio, 1930)' },
      { k: 'tipo', r: 'Tipo', t: 'escolha', opcoes: Object.fromEntries(TIPOS_INSTRUMENTO.map((x) => [x, x])) },
      { k: 'construtor', r: 'Construtor (luthier)', t: 'pessoa' },
      { k: 'ano', r: 'Ano', t: 'ano' },
    ],
  },
  media: {
    nome: 'vídeo ou áudio', nova: 'Novo vídeo ou áudio', titulo: 'titulo', rota: null, lista: '#/mediateca?estado=catalogados', fonte: 'media', campos: [
      { k: 'url', r: 'Endereço do vídeo ou do áudio', t: 'url', obrig: true, ajuda: 'YouTube, Vimeo, SoundCloud, Spotify, RTP Arquivos, Internet Archive…' },
      { k: 'titulo', r: 'Título', t: 'texto', obrig: true, ajuda: 'o que se ouve e quem toca (ex.: «Balada da Despedida» — Coimbra Quintet, 2015)' },
      { k: 'data', r: 'Ano', t: 'ano' },
      { k: 'pessoas', r: 'Quem toca ou canta', t: 'pessoas' },
      { k: 'obras', r: 'Obras que se ouvem', t: 'obras' },
      { k: 'gravacao', r: 'Disco a que pertence', t: 'gravacao' },
    ],
  },
};

/** Ficha nova, com os campos todos vazios (o formato dos ficheiros em dados/, ver ESQUEMA.md). */
export function fichaVazia(tipo) {
  return {
    pessoas: { tipo: 'pessoa', nome: '', nomes_alternativos: [], papeis: [], biografia: [], factos: [], relacoes: [], imagens: [], ligacoes: [] },
    obras: { titulo: '', titulos_alternativos: [], genero: '', musica: [], letra: [], ano: '', factos: [], fontes: [] },
    gravacoes: { titulo: '', formato: '', editora: '', referencia: '', ano: '', local: '', interpretes: [], faixas: [],
      capa: { url: '', fontes: [] }, ligacoes: {}, factos: [], fontes: [] },
    instrumentos: { designacao: '', tipo: '', construtor: '', ano: '', proprietarios: [], factos: [], imagens: [], fontes: [] },
    media: { tipo: '', plataforma: '', url: '', titulo: '', data: '', pessoas: [], obras: [], gravacao: '', fontes: [] },
  }[tipo];
}

// ------------------------------------------------------------------ obras e discos escolhidos pelo título

const autores = (o) => (o.musica || []).map(nomeDe).join(', ');
/** Texto de uma obra ou disco na lista de escolha: o título e o que distingue as que têm o mesmo título. */
function rotulos(tipo) {
  const lista = E.base[tipo] || [];
  const base = (x) => (tipo === 'obras' ? `${x.titulo}${autores(x) ? ` — ${autores(x)}` : ''}${x.ano ? ` (${x.ano})` : ''}`
    : `${x.titulo}${x.ano ? ` (${x.ano})` : ''}${x.editora ? ` · ${x.editora}` : ''}`);
  const vistos = {};
  return lista.map((x) => { let r = base(x); vistos[r] = (vistos[r] || 0) + 1; if (vistos[r] > 1) r += ` [${vistos[r]}]`; return [r, x.id]; });
}
/** id de uma obra ou disco a partir do texto escolhido na lista (vazio se não corresponder a nenhum). */
export const idDeRotulo = (tipo, texto) => rotulos(tipo).find(([r]) => r === String(texto || '').trim())?.[1] || '';
const rotuloDe = (tipo, id) => rotulos(tipo).find(([, x]) => x === id)?.[0] || '';
const listaEscolha = (tipo) => html`<datalist id="dl-${tipo}">${rotulos(tipo).map(([r]) => html`<option value="${r}">`)}</datalist>`;

// ------------------------------------------------------------------ campos

const chip = (k, id, nome) => html`<span class="chip">${nome}<input type="hidden" name="${k}[]" value="${id}">
  <button type="button" data-tirar title="Tirar">×</button></span>`;

function campo(c, v) {
  const ajuda = c.ajuda ? html`<small>${c.ajuda}</small>` : '';
  switch (c.t) {
    case 'ano': return html`<label>${c.r}${ajuda}<input class="campo curto" name="${c.k}" value="${v || ''}" inputmode="numeric" pattern="\\d{4}" placeholder="AAAA"></label>`;
    case 'url': return html`<label>${c.r}${ajuda}<input class="campo" type="url" name="${c.k}" value="${v || ''}" placeholder="https://…" ${c.obrig ? 'required' : ''}></label>`;
    case 'lista': return html`<label>${c.r}${ajuda}<input class="campo" name="${c.k}" value="${(v || []).join('; ')}"></label>`;
    case 'escolha': return html`<label>${c.r}${ajuda}<select class="campo" name="${c.k}"><option value="">—</option>
      ${Object.entries(c.opcoes).map(([k, t]) => html`<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`)}</select></label>`;
    case 'varios': return html`<fieldset class="varios"><legend>${c.r}${ajuda}</legend>${Object.entries(c.opcoes).map(([k, t]) => html`<label class="opcao">
      <input type="checkbox" name="${c.k}[]" value="${k}" ${(v || []).includes(k) ? 'checked' : ''}> ${t}</label>`)}</fieldset>`;
    case 'pessoa': return html`<label>${c.r}${ajuda}${seletorPessoa({ criar: false, nome: c.k, nomeNova: `${c.k}_nova`, valor: v || '' })}</label>`;
    case 'pessoas': return html`<div class="rotulo-campo">${c.r}${ajuda}<div class="escolha-varios" data-chips="pessoas" data-nome="${c.k}">
      <span class="chips">${(v || []).filter((id) => E.por.pessoas[id]).map((id) => chip(c.k, id, nomeDe(id)))}</span>
      ${seletorPessoa({ criar: false, nome: '_escolha', nomeNova: '_escolha_nova', placeholder: 'Escreva um nome e escolha na lista' })}</div></div>`;
    case 'obras': return html`<div class="rotulo-campo">${c.r}${ajuda}<div class="escolha-varios" data-chips="obras" data-nome="${c.k}">
      <span class="chips">${(v || []).filter((id) => E.por.obras[id]).map((id) => chip(c.k, id, E.por.obras[id].titulo))}</span>
      <input class="campo" list="dl-obras" placeholder="Escreva o título e escolha na lista"></div></div>`;
    case 'gravacao': return html`<label>${c.r}${ajuda}<input class="campo" name="${c.k}" list="dl-gravacoes" value="${v ? rotuloDe('gravacoes', v) : ''}"
      placeholder="Escreva o título e escolha na lista"></label>`;
    case 'linhas': return html`<div class="rotulo-campo">${c.r}${ajuda}<div class="linhas" data-linhas="${c.k}">
      ${(v || []).map((linha) => linhaCampos(c, linha))}</div>
      <template data-modelo="${c.k}">${linhaCampos(c, {})}</template>
      <button type="button" class="botao peq" data-linha-mais="${c.k}">${c.mais}</button></div>`;
    default: return html`<label>${c.r}${ajuda}<input class="campo" name="${c.k}" value="${v || ''}" ${c.obrig ? 'required' : ''}></label>`;
  }
}

/** Uma linha de intérprete ou de faixa. Os campos levam «[]» para chegarem como listas alinhadas. */
function linhaCampos(c, linha) {
  return html`<div class="linha">${c.colunas.map((col) => {
    const nome = `${c.k}.${col.k}[]`, v = linha[col.k];
    if (col.t === 'pessoa') return seletorPessoa({ criar: false, nome, nomeNova: `${c.k}.${col.k}_nova[]`, valor: v || '', placeholder: col.r });
    if (col.t === 'obra') return html`<input class="campo" name="${nome}" list="dl-obras" value="${v ? rotuloDe('obras', v) : ''}" placeholder="${col.r}">`;
    return html`<input class="campo" name="${nome}" value="${v || ''}" placeholder="${col.r}${col.ajuda ? ` (${col.ajuda})` : ''}">`;
  })}${c.k === 'faixas' ? html`<input type="hidden" name="faixas.media[]" value="${JSON.stringify(linha.media || [])}">` : ''}
    <button type="button" class="botao-nota" data-linha-tirar title="Tirar esta linha">×</button></div>`;
}

/** Valores do formulário para os campos do tipo (o que não está no formulário fica como estava na ficha). */
export function lerCampos(tipo, d) {
  const lista = (k) => [].concat(d[k] ?? []);
  const res = {};
  for (const c of ESPECIES[tipo].campos) {
    const v = typeof d[c.k] === 'string' ? d[c.k].trim() : d[c.k];
    switch (c.t) {
      case 'ano':
        if (v && !/^\d{4}$/.test(v)) throw new Error(`${c.r}: escreva o ano com quatro algarismos (ex.: 1956).`);
        res[c.k] = v || ''; break;
      case 'url':
        if (v && !/^https?:\/\/\S+$/.test(v)) throw new Error(`${c.r}: o endereço começa por https://`);
        res[c.k] = v || ''; break;
      case 'lista': res[c.k] = String(v || '').split(';').map((x) => x.trim()).filter(Boolean); break;
      case 'escolha': res[c.k] = c.opcoes[v] ? v : ''; break;
      case 'varios': res[c.k] = lista(c.k).filter((x) => c.opcoes[x]); break;
      case 'pessoa': res[c.k] = E.por.pessoas[v] ? v : ''; break;
      case 'pessoas': res[c.k] = [...new Set(lista(c.k).filter((x) => E.por.pessoas[x]))]; break;
      case 'obras': res[c.k] = [...new Set(lista(c.k).filter((x) => E.por.obras[x]))]; break;
      case 'gravacao': res[c.k] = idDeRotulo('gravacoes', v); break;
      case 'linhas': {
        const col = (k) => lista(`${c.k}.${k}`);
        const n = Math.max(0, ...c.colunas.map((x) => col(x.k).length));
        const linhas = [];
        for (let i = 0; i < n; i++) {
          const l = {};
          for (const x of c.colunas) {
            const valor = String(col(x.k)[i] || '').trim();
            if (x.t === 'pessoa') { if (E.por.pessoas[valor]) l[x.k] = valor; }
            else if (x.t === 'obra') { const id = idDeRotulo('obras', valor); if (id) l[x.k] = id; }
            else if (valor) l[x.k] = valor;
          }
          if (c.k === 'faixas') {
            if (!l.titulo && !l.obra) continue;
            l.titulo ||= E.por.obras[l.obra]?.titulo;
            try { const m = JSON.parse(col('media')[i] || '[]'); if (m.length) l.media = m; } catch { /* sem media */ }
            linhas.push({ n: linhas.length + 1, ...l });
          } else if (l.pessoa) linhas.push(l);
        }
        res[c.k] = linhas; break;
      }
      default: res[c.k] = v || '';
    }
  }
  return res;
}

// ------------------------------------------------------------------ formulários

export function formFicha(tipo, f = null, extra = {}) {
  const esp = ESPECIES[tipo];
  const valor = (k) => (f ? f[k] : extra[k]);
  return html`<form class="caixa-edicao larga" data-acao="guardar-ficha">
    <input type="hidden" name="especie" value="${tipo}"><input type="hidden" name="id" value="${f?.id || ''}">
    ${esp.campos.map((c) => campo(c, valor(c.k)))}
    ${!f ? html`<label class="opcao"><input type="checkbox" name="homonimo" value="1"> Já existe uma ficha com este nome, mas é outra ${esp.nome}
      <small>(para não as confundir, as duas ficam marcadas «não confundir com»)</small></label>` : ''}
    ${esp.fonte ? html`<h3 style="margin-top:6px">Onde está registado? <small>opcional: a página (discografia, catálogo, artigo) que o confirma</small></h3>
      ${camposProva({ opcional: true, uso: esp.fonte })}` : ''}
    ${!f && tipo === 'pessoas' ? html`<p class="mudo" style="margin:0">Depois de criar a ficha, acrescente nela o nascimento, a morte, factos, família e fotografias.</p>` : ''}
    <div class="acoes"><button class="botao primario">${f ? 'Guardar' : esp.nova.replace(/^Nov[oa]/, 'Criar')}</button>
      <a class="botao" href="${f && esp.rota ? `#/${esp.rota}/${f.id}` : esp.lista}">Cancelar</a></div>
    ${listaEscolha('obras')}${listaEscolha('gravacoes')}
  </form>`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const camposData = (rotulo = 'Data') => html`<div class="rotulo-campo">${rotulo}<div class="data-tripla">
  <input class="campo" name="dia" inputmode="numeric" placeholder="dia" aria-label="Dia">
  <select class="campo" name="mes" aria-label="Mês"><option value="">mês</option>${MESES.map((m, i) => html`<option value="${i + 1}">${m}</option>`)}</select>
  <input class="campo" name="ano" inputmode="numeric" placeholder="ano" aria-label="Ano">
  <label class="opcao"><input type="checkbox" name="aprox" value="1"> data aproximada</label></div></div>`;

/** Nascimento e morte de uma pessoa: os mesmos campos em todas as fichas, cada um com a sua fonte. */
export function formVida(p, campo) {
  const atuais = (p.factos || []).filter((f) => f.campo === campo);
  const nome = campo === 'nascimento' ? 'Nascimento' : 'Morte';
  return html`<form class="caixa-edicao" data-acao="vida">
    <h3>${nome} ${atuais.length ? html`<small>já registado: ${atuais.map((f, i) => html`${i ? ' · ' : ''}${f.valor}${f.editorial ? ' ✎' : ''}`)}
      — acrescente outra versão só se uma fonte disser outra coisa (ficam lado a lado, como divergência)</small>` : html`<small>ainda sem registo</small>`}</h3>
    <input type="hidden" name="alvo" value="pessoas/${p.id}"><input type="hidden" name="campo" value="${campo}">
    ${camposData()}
    <label>Local <small>terra, freguesia ou cidade</small><input class="campo" name="local"></label>
    ${camposProva({ padrao: 'fonte' })}
    <div class="acoes"><button class="botao peq primario">Guardar ${nome.toLowerCase()}</button></div>
  </form>`;
}

/** Um facto qualquer (estreia, atuação, prémio, profissão…) numa ficha de qualquer tipo. */
export function formFacto(alvo) {
  return html`<form class="caixa-edicao" data-acao="novo-facto">
    <h3>Acrescentar um facto <small>estreia, atuação, prémio, profissão, formação, ensino…</small></h3>
    <input type="hidden" name="alvo" value="${alvo}">
    <div class="linha-campos">
      <label>Tipo <select class="campo" name="campo">${Object.entries(CAMPOS).map(([k, t]) => html`<option value="${k}" ${k === 'atividade' ? 'selected' : ''}>${t}</option>`)}</select></label>
      <label>Local <input class="campo" name="local"></label></div>
    <label>O facto <small>curto e fiel ao que se sabe (ex.: «Atuou no Coliseu dos Recreios com Luiz Goes»)</small><input class="campo" name="valor" required></label>
    ${camposData('Data (se houver)')}
    ${camposProva({ padrao: 'fonte' })}
    <div class="acoes"><button class="botao peq primario">Acrescentar facto</button></div>
  </form>`;
}

/** Artigos, livros e páginas onde a pessoa (ou a obra, o disco…) aparece: leituras indicadas, que não são fonte. */
export function seccaoReferencias(f, alvo) {
  const refs = f.referencias || [];
  const ed = editando();
  if (!refs.length && !ed) return '';
  const eu = sessao()?.id;
  return html`<section class="seccao"><h2>Artigos e referências <small>leituras indicadas por contribuidores; só contam como fonte quando citadas num facto</small></h2>
    ${refs.length ? html`<ul class="lista-simples">${refs.map((r) => html`<li><a href="${r.url}" target="_blank" rel="noopener">${r.titulo} ↗</a>
      <span class="mudo">${[r.publicacao, r.autor, r.ano].filter(Boolean).join(' · ')}</span>${marcaEditorial(r.editorial, 'Indicada')}
      ${ed && (r.editorial?.por === eu || podeAprovar()) ? html`<button class="botao-nota" data-acao="retirar-referencia" data-alvo="${alvo}" data-url="${r.url}"
        data-confirmar="Retirar esta referência?" title="Retirar">×</button>` : ''}</li>`)}</ul>` : ''}
    ${ed ? html`<form class="caixa-edicao" data-acao="nova-referencia">
      <h3>Acrescentar um artigo ou referência</h3>
      <input type="hidden" name="alvo" value="${alvo}">
      <label>Título <input class="campo" name="titulo" required placeholder="Ex.: «Morreu o guitarrista …»"></label>
      <label>Endereço <input class="campo" type="url" name="url" required placeholder="https://…"></label>
      <div class="linha-campos"><label>Publicação <input class="campo" name="publicacao" placeholder="Jornal, revista, livro, site"></label>
        <label>Autor <input class="campo" name="autor"></label>
        <label>Ano <input class="campo curto" name="ano" inputmode="numeric" placeholder="AAAA"></label></div>
      <label>Nota <small>opcional: o que lá se encontra</small><input class="campo" name="nota"></label>
      <div class="acoes"><button class="botao peq primario">Acrescentar referência</button></div></form>` : ''}
  </section>`;
}

/** Botões de edição no topo das fichas de obras, discos e instrumentos. */
export const botaoCorrigir = (tipo, id) => (editando()
  ? html`<a class="botao" href="#/editar/${tipo}/${id}">✎ Corrigir os dados</a>` : '');

/** «+ Nova …» nas listas, para quem está no modo de edição (um grupo é uma ficha de pessoas com tipo «grupo»). */
export const botaoNova = (tipo, grupo = false) => (editando()
  ? html`<a class="botao primario" href="#/nova/${tipo}${grupo ? '?tipo=grupo' : ''}">+ ${grupo ? 'Novo grupo' : ESPECIES[tipo].nova}</a>` : '');

// ------------------------------------------------------------------ páginas «nova» e «editar»

function semEdicao(el, titulo) {
  el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Modo de edição</p><h1>${titulo}</h1></header>
    <div class="vazio"><h3>Precisa do modo de edição</h3><p>Entre como contribuidor (no fundo do menu, «Entrar») e ligue o
      <b>Modo de edição</b>. Veja <a href="#/contribuir">como contribuir</a>.</p></div></div>`.s;
}

export function novaFicha(el, tipo, params) {
  const esp = ESPECIES[tipo];
  if (!esp) { el.innerHTML = '<div class="conteudo"><h1>Tipo de ficha desconhecido</h1></div>'; return; }
  const grupo = tipo === 'pessoas' && params.tipo === 'grupo';
  const titulo = grupo ? 'Novo grupo' : esp.nova;
  if (!editando()) return semEdicao(el, titulo);
  el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Modo de edição</p><h1>${titulo}</h1>
    <p class="lead">Fica assinada com o seu nome. ${podeAprovar() ? 'Como editor, entra logo no arquivo.' : 'Um editor revê a proposta antes de entrar no arquivo.'}
      Antes de criar, procure se já existe (Ctrl K): se existir, acrescente lá o que sabe.</p></header>
    ${formFicha(tipo, null, grupo ? { tipo: 'grupo', papeis: ['agrupamento'] } : {})}</div>`.s;
}

export function editarFicha(el, tipo, id) {
  const esp = ESPECIES[tipo], f = E.por[tipo]?.[id];
  if (!esp || !f) { el.innerHTML = '<div class="conteudo"><h1>Ficha não encontrada</h1></div>'; return; }
  if (!editando()) return semEdicao(el, `Corrigir: ${f[esp.titulo]}`);
  el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Modo de edição</p><h1>Corrigir: ${f[esp.titulo]}</h1>
    <p class="lead">Altere o que estiver errado ou em falta. Factos, fontes e relações acrescentam-se na própria ficha.</p></header>
    ${formFicha(tipo, f)}</div>`.s;
}

// ------------------------------------------------------------------ escolhas múltiplas e linhas

export function iniciarFichas() {
  // escolher pessoas (várias): cada escolha vira uma etiqueta, e o campo fica livre para a seguinte
  document.addEventListener('escolha', (e) => {
    const caixa = e.target.closest('[data-chips="pessoas"]');
    if (!caixa || !e.detail.id) return;
    const sel = e.target.closest('[data-seletor-pessoa]');
    if (!$$('input[type=hidden]', $('.chips', caixa)).some((x) => x.value === e.detail.id)) {
      $('.chips', caixa).insertAdjacentHTML('beforeend', chip(caixa.dataset.nome, e.detail.id, nomeDe(e.detail.id)).s);
    }
    $('input.campo', sel).value = '';
    sel.classList.remove('escolhido');
    $$('input[type=hidden]', sel).forEach((x) => { x.value = ''; });
  });
  document.addEventListener('change', (e) => {
    const caixa = e.target.closest('[data-chips="obras"]');
    if (!caixa || !e.target.matches('input.campo')) return;
    const id = idDeRotulo('obras', e.target.value);
    if (!id) return;
    if (!$$('input[type=hidden]', caixa).some((x) => x.value === id)) $('.chips', caixa).insertAdjacentHTML('beforeend', chip(caixa.dataset.nome, id, E.por.obras[id].titulo).s);
    e.target.value = '';
  });
  document.addEventListener('click', (e) => {
    const tirar = e.target.closest('[data-tirar]');
    if (tirar) { tirar.closest('.chip').remove(); return; }
    const mais = e.target.closest('[data-linha-mais]');
    if (mais) {
      const k = mais.dataset.linhaMais, form = mais.closest('form');
      $(`[data-linhas="${k}"]`, form).append($(`template[data-modelo="${k}"]`, form).content.cloneNode(true));
      return;
    }
    const menos = e.target.closest('[data-linha-tirar]');
    if (menos) menos.closest('.linha').remove();
  });
}

/** Linha «nasceu… morreu…» no topo da ficha de uma pessoa, a partir dos factos (sem as versões divergentes). */
export function linhaVida(p) {
  const certo = (campo) => (p.factos || []).find((f) => f.campo === campo && !f.conflito);
  const n = certo('nascimento'), m = certo('morte');
  const div = (campo) => (p.factos || []).some((f) => f.campo === campo && f.conflito);
  const partes = [n && `Nasceu: ${n.valor}`, !n && div('nascimento') && 'Nascimento: as fontes divergem', m && `Morreu: ${m.valor}`,
    !m && div('morte') && 'Morte: as fontes divergem'].filter(Boolean);
  return partes.length ? html`<p class="alt vida-linha">${partes.join(' · ')}</p>` : '';
}

