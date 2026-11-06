// Criar e corrigir fichas no modo de edição: pessoas e grupos, obras, discos, instrumentos, vídeos e áudios.
// Cada tipo descreve os seus campos (ESPECIES) e o mesmo formulário serve para criar e para corrigir; as ações
// que gravam estão em edicao.js. Nascimento e morte, factos e referências têm formulários próprios, sempre com
// «Como sabe?»: uma fonte (o endereço da página e a frase copiada à letra) ou um testemunho assinado (✎).
// Os formulários das fichas ficam fechados, cada um na sua secção, com atalhos no topo; e nada do que se escreve se
// perde em silêncio: o que não foi escolhido na lista fica assinalado e é confirmado antes de gravar (iniciarFichas).
import { E, PAPEIS, CAMPOS, FORMATOS, GENEROS, nomeDe, procurarEntidades, catalogadosDe, chaveMedia } from './estado.js';
import { $, $$, html, api, aviso, debounce, classificar, capaMedia, miniatura, NOME_PLATAFORMA, enderecoSeguro, termosProcura, guardar, ler, fmtData, plural } from './util.js';
import { seletorPessoa, seletorFicha, candidatosDe, detalheFicha, escolherEm, porEscolher, limparSeletor, tituloDe } from './seletor.js';
import { camposProva, marcaEditorial, dobra, maisOpcoes, ABERTOS } from './formularios.js';
import { editando, sessao, podeAprovar, dataDe, lerData, botaoRetirarCatalogo } from './edicao.js';
import { marcas } from './citacoes.js';
import { iniciarRascunhos } from './rascunhos.js';
import { esquecerFoto, prepararFoto } from './fotos.js';

const TIPOS_INSTRUMENTO = ['guitarra de Coimbra', 'guitarra de Lisboa', 'guitarra portuguesa', 'viola', 'bandolim', 'outro'];

/** Os campos de cada tipo de ficha. `t`: texto, ano, url, lista (separada por ;), escolha, varios, pessoa, pessoas,
 *  obras, gravacao, linhas (uma linha por intérprete ou faixa). */
export const ESPECIES = {
  pessoas: {
    nome: 'pessoa', nova: 'Nova pessoa', titulo: 'nome', rota: 'pessoa', lista: '#/pessoas', campos: [
      { k: 'nome', r: 'Nome por que é conhecido/a', t: 'texto', obrig: true },
      { k: 'tipo', r: 'É', t: 'escolha', opcoes: { pessoa: 'uma pessoa', grupo: 'um grupo (grupo de fados, tuna, quarteto, orfeão…)' } },
      { k: 'nomes_alternativos', r: 'Outros nomes', t: 'lista', ajuda: 'nome completo, alcunhas, outras grafias; separados por ponto e vírgula' },
      { k: 'papeis', r: 'Atributos', t: 'varios', opcoes: PAPEIS, ajuda: 'Pode escolher vários, ou nenhum. Cada um aparece como um ícone na ficha e nas árvores.' },
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
      { k: 'data', r: 'Data', t: 'data', ajuda: 'basta o ano, se não souber o dia e o mês' },
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
/** Texto de uma obra ou disco na lista de escolha: o título e o que distingue as que têm o mesmo título (nos discos,
 *  a referência). Também usado em desambiguar.js. */
export function rotulos(tipo) {
  const lista = E.base[tipo] || [];
  const base = (x) => (tipo === 'obras' ? `${x.titulo}${autores(x) ? ` — ${autores(x)}` : ''}${x.ano ? ` (${x.ano})` : ''}`
    : `${x.titulo}${x.ano ? ` (${x.ano})` : ''}${x.editora ? ` · ${x.editora}` : ''}${x.referencia ? ` · ${x.referencia}` : ''}`);
  const vistos = {};
  return lista.map((x) => { let r = base(x); vistos[r] = (vistos[r] || 0) + 1; if (vistos[r] > 1) r += ` [${vistos[r]}]`; return [r, x.id]; });
}
/** id de uma obra ou disco a partir do texto escolhido na lista (vazio se não corresponder a nenhum). */
export const idDeRotulo = (tipo, texto) => rotulos(tipo).find(([r]) => r === String(texto || '').trim())?.[1] || '';

/** As obras com este título (ou com um dos outros títulos), sem contar acentos, maiúsculas nem pontuação. */
export function obrasComTitulo(titulo) {
  const k = termosProcura(titulo).join(' ');
  return k ? E.base.obras.filter((o) => [o.titulo, ...(o.titulos_alternativos || [])].some((t) => termosProcura(t).join(' ') === k)) : [];
}

/** Fichas do mesmo tipo com este nome ou título, também pelos outros nomes (ex.: «Zeca Afonso» é José Afonso). */
export function fichasIguais(tipo, titulo) {
  const k = termosProcura(titulo).join(' '), esp = ESPECIES[tipo];
  if (!k || !esp) return [];
  const alt = tipo === 'pessoas' ? 'nomes_alternativos' : 'titulos_alternativos';
  return (E.base[tipo] || []).filter((x) => [x[esp.titulo], ...(x[alt] || [])].some((n) => termosProcura(n).join(' ') === k));
}

// ------------------------------------------------------------------ campos

const chip = (k, id, nome) => html`<span class="chip">${nome}<input type="hidden" name="${k}[]" value="${id}">
  <button type="button" data-tirar title="Tirar" aria-label="Tirar ${nome}">×</button></span>`;
/** Etiqueta de uma pessoa ainda sem ficha («+ Criar a ficha»): a ficha cria-se ao gravar, assinada por quem grava. */
const chipNova = (k, nome) => html`<span class="chip nova">${nome} <small>(ficha nova)</small><input type="hidden" name="${k}_novas[]" value="${nome}">
  <button type="button" data-tirar title="Tirar" aria-label="Tirar ${nome}">×</button></span>`;

function campo(c, v, tipo) {
  const ajuda = c.ajuda ? html`<small>${c.ajuda}</small>` : '';
  switch (c.t) {
    case 'ano': return html`<label>${c.r}${ajuda}<input class="campo curto" name="${c.k}" value="${v || ''}" inputmode="numeric" pattern="\\d{4}" placeholder="AAAA"></label>`;
    case 'data': return camposData(c.r, { prefixo: `${c.k}.`, valor: v, ajuda: c.ajuda });
    case 'url': return html`<label>${c.r}${ajuda}<input class="campo" type="url" name="${c.k}" value="${v || ''}" placeholder="https://…" ${c.obrig ? 'required' : ''}></label>
      ${tipo === 'media' && c.k === 'url' ? html`<div class="previa-media" data-previa-media aria-live="polite" hidden></div>` : ''}`;
    case 'lista': return html`<label>${c.r}${ajuda}<input class="campo" name="${c.k}" value="${(v || []).join('; ')}"></label>`;
    case 'escolha': return html`<label>${c.r}${ajuda}<select class="campo" name="${c.k}"><option value="">—</option>
      ${Object.entries(c.opcoes).map(([k, t]) => html`<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`)}
      ${v && !c.opcoes[v] ? html`<option value="${v}" selected>${v} (como está na ficha)</option>` : ''}</select>
      ${v && !c.opcoes[v] ? html`<input type="hidden" name="${c.k}.atual" value="${v}">` : ''}</label>`; // um valor que a lista não tem («valsa») não se perde
    case 'varios': return html`<fieldset class="varios"><legend>${c.r}${ajuda}</legend>${Object.entries(c.opcoes).map(([k, t]) => html`<label class="opcao">
      <input type="checkbox" name="${c.k}[]" value="${k}" ${(v || []).includes(k) ? 'checked' : ''}> ${t}</label>`)}</fieldset>`;
    // pessoas: se ainda não tiver ficha, «+ Criar a ficha» cria-a na mesma gravação
    case 'pessoa': return html`<label>${c.r}${ajuda}${seletorPessoa({ nome: c.k, nomeNova: `${c.k}_nova`, valor: v || '', rotulo: c.r })}</label>`;
    case 'pessoas': return html`<div class="rotulo-campo">${c.r}${ajuda}<div class="escolha-varios" data-chips="pessoas" data-nome="${c.k}">
      <span class="chips">${(v || []).filter((id) => E.por.pessoas[id]).map((id) => chip(c.k, id, nomeDe(id)))}</span>
      ${seletorPessoa({ nome: '_escolha', nomeNova: '_escolha_nova', placeholder: 'Escreva um nome e escolha na lista', rotulo: c.r })}</div></div>`;
    case 'obras': return html`<div class="rotulo-campo">${c.r}${ajuda}<div class="escolha-varios" data-chips="obras" data-nome="${c.k}">
      <span class="chips">${(v || []).filter((id) => E.por.obras[id]).map((id) => chip(c.k, id, E.por.obras[id].titulo))}</span>
      ${seletorFicha('obras', { nome: '_escolha', nomeNova: '_escolha_nova', rotulo: c.r })}</div></div>`;
    case 'gravacao': return html`<label>${c.r}${ajuda}${seletorFicha('gravacoes', { nome: c.k, nomeNova: `${c.k}_nova`, valor: v || '', rotulo: c.r })}</label>`;
    case 'linhas': return html`<div class="rotulo-campo">${c.r}${ajuda}<div class="linhas" data-linhas="${c.k}">
      ${(v || []).map((linha) => linhaCampos(c, linha))}</div>
      <template data-modelo="${c.k}">${linhaCampos(c, {})}</template>
      <div class="acoes"><button type="button" class="botao peq" data-linha-mais="${c.k}">${c.mais}</button></div>
      ${c.k === 'faixas' ? html`<details class="colar-alinhamento"><summary>Colar o alinhamento <small>todas as faixas de uma vez, uma por linha</small></summary>
        <label>Títulos das faixas <small>um por linha, pela ordem do disco; números («1.», «A1») e durações («3:25») tiram-se sozinhos.
          A obra fica proposta quando há uma só com esse título.</small>
          <textarea class="campo" rows="6" data-alinhamento placeholder="1. Balada de Coimbra&#10;2. Fado Hilário&#10;…"></textarea></label>
        <div class="acoes"><button type="button" class="botao peq" data-colar-alinhamento>Acrescentar estas faixas</button></div></details>` : ''}</div>`;
    default: return html`<label>${c.r}${ajuda}<input class="campo" name="${c.k}" value="${v || ''}" ${c.obrig ? 'required' : ''}></label>`;
  }
}

/** Uma linha de intérprete ou de faixa (com o número, nas faixas, e setas para mudar a ordem). Os campos levam «[]»
 *  para chegarem como listas alinhadas. */
function linhaCampos(c, linha) {
  return html`<div class="linha">${c.k === 'faixas' ? html`<span class="n-faixa" aria-hidden="true"></span>` : ''}${c.colunas.map((col) => {
    const nome = `${c.k}.${col.k}[]`, v = linha[col.k];
    if (col.t === 'pessoa') return seletorPessoa({ nome, nomeNova: `${c.k}.${col.k}_nova[]`, valor: v || '', placeholder: col.r, rotulo: c.r });
    if (col.t === 'obra') return seletorFicha('obras', { nome, nomeNova: `${c.k}.${col.k}_nova[]`, valor: v || '', placeholder: col.r, rotulo: `${c.r} (obra)` });
    return html`<input class="campo" name="${nome}" value="${v || ''}" placeholder="${col.r}${col.ajuda ? ` (${col.ajuda})` : ''}" aria-label="${col.r}">`;
  })}${c.k === 'faixas' ? html`<input type="hidden" name="faixas.media[]" value="${JSON.stringify(linha.media || [])}">` : ''}
    <span class="mover-linha"><button type="button" class="botao-nota" data-linha-mover="-1" title="Subir esta linha" aria-label="Subir esta linha">↑</button><button
      type="button" class="botao-nota" data-linha-mover="1" title="Descer esta linha" aria-label="Descer esta linha">↓</button></span>
    <button type="button" class="botao-nota" data-linha-tirar title="Tirar esta linha" aria-label="Tirar esta linha">×</button>
    ${c.k === 'faixas' ? html`<small class="obra-proposta" data-obra-proposta></small>` : ''}</div>`;
}

/** Valores do formulário para os campos do tipo (o que não está no formulário fica como estava na ficha).
 *  `novaPessoa(nome)` cria a ficha de uma pessoa escrita com «+ Criar a ficha» e devolve o id; sem ela, ignoram-se. */
export function lerCampos(tipo, d, novaPessoa = null) {
  const lista = (k) => [].concat(d[k] ?? []);
  const pessoa = (id, nova) => (E.por.pessoas[id] ? id : String(nova || '').trim() && novaPessoa ? novaPessoa(String(nova).trim()) : '');
  const res = {};
  for (const c of ESPECIES[tipo].campos) {
    const v = typeof d[c.k] === 'string' ? d[c.k].trim() : d[c.k];
    switch (c.t) {
      case 'ano':
        if (v && !/^\d{4}$/.test(v)) throw new Error(`${c.r}: escreva o ano com quatro algarismos (ex.: 1956).`);
        res[c.k] = v || ''; break;
      case 'data': // AAAA, AAAA-MM ou AAAA-MM-DD
        try { res[c.k] = dataDe({ data_texto: d[`${c.k}.data_texto`] }); }
        catch (e) { throw new Error(`${c.r}: ${e.message}`); }
        break;
      case 'url':
        if (v && !/^https?:\/\/\S+$/.test(v)) throw new Error(`${c.r}: o endereço começa por https://`);
        res[c.k] = v || ''; break;
      case 'lista': res[c.k] = String(v || '').split(';').map((x) => x.trim()).filter(Boolean); break;
      case 'escolha': res[c.k] = c.opcoes[v] || (v && v === d[`${c.k}.atual`]) ? v : ''; break; // o valor que a ficha já tinha fica
      case 'varios': res[c.k] = lista(c.k).filter((x) => c.opcoes[x]); break;
      case 'pessoa': res[c.k] = pessoa(v, d[`${c.k}_nova`]); break;
      case 'pessoas': res[c.k] = [...new Set([...lista(c.k).filter((x) => E.por.pessoas[x]), ...lista(`${c.k}_novas`).map((n) => pessoa('', n))].filter(Boolean))]; break;
      case 'obras': res[c.k] = [...new Set(lista(c.k).filter((x) => E.por.obras[x]))]; break;
      case 'gravacao': res[c.k] = E.por.gravacoes[v] ? v : ''; break;
      case 'linhas': {
        const col = (k) => lista(`${c.k}.${k}`);
        const n = Math.max(0, ...c.colunas.map((x) => col(x.k).length));
        const linhas = [];
        for (let i = 0; i < n; i++) {
          const l = {};
          for (const x of c.colunas) {
            const valor = String(col(x.k)[i] || '').trim();
            if (x.t === 'pessoa') { const id = pessoa(valor, col(`${x.k}_nova`)[i]); if (id) l[x.k] = id; }
            else if (x.t === 'obra') { if (E.por.obras[valor]) l[x.k] = valor; }
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

/** Nascimento e morte escritos no formulário de uma pessoa nova: os factos e os dados da prova de cada um, para a
 *  ação os juntar à ficha na mesma gravação. «A mesma fonte do nascimento» repete a prova do nascimento. */
export function factosDaFichaNova(tipo, ficha, d) {
  if (tipo !== 'pessoas' || ficha.tipo === 'grupo') return [];
  const res = [];
  const prova = {};
  for (const campo of ['nascimento', 'morte']) {
    const v = (k) => String(d[`${campo}.${k}`] ?? '').trim();
    const nome = CAMPOS[campo];
    if (!v('data_texto') && !v('local')) {
      // secção por preencher; mas o que se escreveu no «Como sabe?» sem a data nem o local não se perde em silêncio
      if (['como', 'fonte_url', 'fonte', 'fonte_titulo', 'citacao', 'referencia', 'nota_testemunho'].some(v)) {
        throw new Error(`${nome}: indique a data, o local ou os dois (ou apague o que escreveu em «Como sabe?»).`);
      }
      continue;
    }
    let lida;
    try { lida = lerData(v('data_texto')); } catch (e) { throw new Error(`${nome}: ${e.message}`); }
    const { data, aprox } = lida, local = v('local');
    const quando = data ? (aprox ? `c. ${data.slice(0, 4)}` : fmtData(data)) : '';
    const facto = { campo, valor: [quando, local].filter(Boolean).join(', '), ...(data && !aprox ? { data } : {}), ...(local ? { local } : {}) };
    const como = v('como');
    if (!como) throw new Error(`${nome}: diga como sabe (numa fonte ou por conhecimento próprio).`);
    if (como === 'mesma') {
      if (!prova.nascimento) throw new Error(`${nome}: «a mesma fonte do nascimento» precisa do nascimento preenchido.`);
      res.push({ facto, dados: { ...prova.nascimento } });
      continue;
    }
    prova[campo] = Object.fromEntries(['como', 'tipo_fonte', 'fonte_url', 'fonte', 'fonte_nome', 'fonte_titulo', 'fonte_autor', 'citacao', 'referencia', 'nota_testemunho'].map((k) => [k, v(k)]));
    res.push({ facto, dados: { ...prova[campo] } });
  }
  return res;
}

// ------------------------------------------------------------------ formulários

/** O endereço de uma ficha no site (os vídeos e áudios não têm página: a ficha da primeira pessoa, ou a lista). */
const rotaDe = (tipo, x) => (ESPECIES[tipo].rota ? `#/${ESPECIES[tipo].rota}/${x.id}` : x.pessoas?.[0] ? `#/pessoa/${x.pessoas[0]}` : ESPECIES[tipo].lista);

export function formFicha(tipo, f = null, extra = {}) {
  const esp = ESPECIES[tipo];
  const valor = (k) => (f ? f[k] : extra[k]);
  const volta = voltaSegura(extra.volta);
  const outra = tipo === 'pessoas' && valor('tipo') === 'grupo' ? 'outro grupo' : `${concordancia(tipo).outro} ${esp.nome}`;
  return html`<form class="caixa-edicao larga" data-acao="guardar-ficha">
    <input type="hidden" name="especie" value="${tipo}"><input type="hidden" name="id" value="${f?.id || ''}">
    ${volta ? html`<input type="hidden" name="volta" value="${volta}">` : ''}
    ${esp.campos.map((c) => html`${campo(c, valor(c.k), tipo)}${!f && c.k === esp.titulo && tipo !== 'media'
      ? html`<div class="parecidas" data-parecidas="${tipo}" aria-live="polite" hidden></div>` : ''}`)}
    ${!f ? html`<label class="opcao"><input type="checkbox" name="homonimo" value="1"> Já existe uma ficha com este nome, mas é ${outra}
      <small>(para não as confundir, as duas ficam marcadas «não confundir com»)</small></label>` : ''}
    ${!f && tipo === 'pessoas' ? seccoesVida() : ''}
    ${esp.fonte ? html`<h3 style="margin-top:6px">Onde está registado? <small>opcional: a página (discografia, catálogo, artigo) que o confirma</small></h3>
      ${camposProva({ opcional: true, uso: esp.fonte, inicial: extra.prova || {} })}` : ''}
    ${!f && tipo === 'pessoas' ? html`<p class="mudo" style="margin:0">Factos, família e fotografias acrescentam-se depois, na própria ficha.</p>` : ''}
    <div class="acoes"><button class="botao primario">${f ? 'Guardar' : esp.nova.replace(/^Nov[oa]/, 'Criar')}</button>
      <a class="botao" href="${volta || (f ? rotaDe(tipo, f) : esp.lista)}">Cancelar</a></div>
  </form>`;
}

/** A data num só campo, escrita como se escreve à mão (edicao.js, lerData); por baixo, o site diz como a percebeu.
 *  `prefixo` distingue os nomes quando há mais de uma data no formulário; `valor` (AAAA, AAAA-MM ou AAAA-MM-DD) preenche. */
function camposData(rotulo = 'Data', { prefixo = '', valor = '', ajuda = '' } = {}) {
  const [ano, mes, dia] = String(valor || '').split('-');
  const escrita = !valor ? '' : dia ? `${+dia}/${+mes}/${ano}` : mes ? `${+mes}/${ano}` : ano;
  return html`<label class="campo-data"><span data-rotulo-data>${rotulo}</span><small>${ajuda || 'ex.: 10/5/1899, maio de 1899, 1899 ou c. 1920'}</small>
    <input class="campo" name="${prefixo}data_texto" value="${escrita}" autocomplete="off" data-campo-data>
    <small class="leitura-data" data-leitura-data aria-live="polite"></small></label>`;
}

/** Nascimento e morte no formulário de uma pessoa nova (opcionais e fechados), cada um com o seu «Como sabe?»:
 *  gravam-se na mesma operação que a ficha. */
const seccoesVida = () => html`<div class="so-pessoa">${['nascimento', 'morte'].map((campo) => dobra(`nova-${campo}`,
  html`+ ${CAMPOS[campo]} <small>opcional${campo === 'nascimento' ? ': data, local e como sabe' : ''}</small>`, html`<div class="caixa-dobrada">
    ${camposData('Data', { prefixo: `${campo}.` })}
    <label>Local <small>terra, freguesia ou cidade</small><input class="campo" name="${campo}.local"></label>
    ${camposProva({ prefixo: `${campo}.`, obrigatorio: false, mesmaDe: campo === 'morte' ? 'do nascimento' : '' })}</div>`, { lembrar: false }))}</div>`;

/** Nascimento e morte de uma pessoa: os mesmos campos em todas as fichas, cada um com a sua fonte. Fechados; o resumo
 *  diz o que já está registado. */
export function formVida(p, campo) {
  const atuais = (p.factos || []).filter((f) => f.campo === campo);
  const nome = CAMPOS[campo];
  const resumo = atuais.length
    ? html`${nome} <small>já registado: ${atuais.map((f, i) => html`${i ? ' · ' : ''}${f.valor}${f.editorial ? ' ✎' : ''}`)} · acrescentar outra versão</small>`
    : html`+ ${nome} <small>ainda sem registo</small>`;
  return dobra(`ed-${campo}`, resumo, html`<form class="caixa-edicao" data-acao="vida">
    ${atuais.length ? html`<p class="mudo">Acrescente outra versão só se uma fonte disser outra coisa: ficam lado a lado, como divergência.</p>` : ''}
    <input type="hidden" name="alvo" value="pessoas/${p.id}"><input type="hidden" name="campo" value="${campo}">
    ${camposData()}
    <label>Local <small>terra, freguesia ou cidade</small><input class="campo" name="local"></label>
    ${camposProva()}
    <div class="acoes"><button class="botao peq primario">Guardar ${nome.toLowerCase()}</button></div>
  </form>`);
}

/** O que cada tipo de facto pergunta. `valor`: [rótulo, exemplo], ou nada quando o facto é a data e o local; `data` e
 *  `local`: o rótulo, ou nada quando esse tipo de facto não os tem. */
const FORMA_FACTO = {
  nome_completo: { valor: ['Nome completo', 'como consta na fonte'] },
  nascimento: { data: 'Data de nascimento', local: 'Onde nasceu' },
  morte: { data: 'Data da morte', local: 'Onde morreu' },
  naturalidade: { local: 'Terra natural' },
  formacao: { valor: ['Curso ou escola', 'ex.: Direito, na Universidade de Coimbra'], data: 'Ano ou data', local: 'Onde' },
  profissao: { valor: ['Profissão', 'ex.: médico, professor do liceu'], data: 'Desde quando, se souber', local: 'Onde' },
  atividade: { valor: ['O que fazia', 'ex.: guitarrista da Tuna Académica'], data: 'Quando', local: 'Onde' },
  estreia: { valor: ['Em que se estreou', 'ex.: Serenata Monumental da Queima das Fitas'], data: 'Data da estreia', local: 'Onde' },
  gravacao: { valor: ['O que gravou', 'ex.: EP «Fados de Coimbra»'], data: 'Quando', local: 'Onde (estúdio ou cidade)' },
  atuacao: { valor: ['Que atuação', 'ex.: concerto com Luiz Goes'], data: 'Data', local: 'Onde' },
  premio: { valor: ['Prémio ou distinção', 'ex.: Medalha de Mérito Cultural'], data: 'Ano', local: 'Onde' },
  homenagem: { valor: ['Que homenagem, e de quem', 'ex.: homenagem da Câmara Municipal de Coimbra'], data: 'Data', local: 'Onde' },
  ensino: { valor: ['O que ensinou, e a quem', 'ex.: aulas de guitarra na Secção de Fado'], data: 'Quando', local: 'Onde' },
  instrumento: { valor: ['Instrumento', 'ex.: guitarra de Coimbra de Raul Simões'], data: 'Quando, se souber' },
  afinacao: { valor: ['Afinação', 'como consta na fonte'] },
  residencia: { data: 'Desde quando, se souber', local: 'Onde viveu' },
  publicacao: { valor: ['Título do livro ou artigo', 'o que publicou'], data: 'Ano' },
  outro: { valor: ['O facto', 'curto e fiel ao que se sabe'], data: 'Data, se houver', local: 'Local, se houver' },
};
const SO_PESSOAS = ['nome_completo', 'nascimento', 'morte', 'naturalidade', 'formacao', 'profissao', 'ensino', 'residencia'];
const SO_INDIVIDUOS = ['nome_completo', 'nascimento', 'morte', 'naturalidade', 'profissao'];
// num grupo, a «formação» é como se formou
const FORMA_GRUPO = { formacao: { valor: ['Como se formou', 'com quem e porquê'], data: 'Quando', local: 'Onde' } };

/** Mostra só os campos do tipo de facto escolhido, com os rótulos desse tipo. O que deixa de se aplicar apaga-se. */
function ajustarFacto(form) {
  const corpo = $('[data-facto-corpo]', form), campo = form.elements.campo.value;
  const forma = (form.dataset.grupo && FORMA_GRUPO[campo]) || FORMA_FACTO[campo];
  corpo.hidden = !forma;
  if (!forma) return;
  const valor = $('[data-facto-valor]', form), data = $('[data-facto-data]', form), local = $('[data-facto-local]', form);
  [valor, data, local].forEach((x, i) => {
    x.hidden = !forma[['valor', 'data', 'local'][i]];
    if (x.hidden) $('input', x).value = '';
  });
  form.elements.valor.required = !!forma.valor;
  if (forma.valor) {
    $('span', valor).textContent = forma.valor[0];
    $('small', valor).textContent = forma.valor[1];
  }
  if (forma.data) { $('[data-rotulo-data]', data).textContent = forma.data; $('[data-leitura-data]', data).textContent = ''; }
  if (forma.local) $('span', local).textContent = forma.local;
}

/** Um facto numa ficha de qualquer tipo: primeiro o tipo de facto, e o formulário ajusta-se a esse tipo. */
export function formFacto(alvo) {
  const [tipo, id] = alvo.split('/'), grupo = tipo === 'pessoas' && E.por.pessoas[id]?.tipo === 'grupo';
  const tipos = Object.entries(CAMPOS).filter(([k]) => (grupo ? !SO_INDIVIDUOS.includes(k) : tipo === 'pessoas' || !SO_PESSOAS.includes(k)));
  return dobra('ed-facto', html`+ Acrescentar um facto <small>nascimento, formação, atuação, prémio, homenagem…</small>`, html`<form class="caixa-edicao" data-acao="novo-facto" ${grupo ? 'data-grupo="1"' : ''}>
    <input type="hidden" name="alvo" value="${alvo}">
    <label>Que facto quer acrescentar? <select class="campo" name="campo" required data-tipo-facto><option value="">— escolha —</option>
      ${tipos.map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select></label>
    <div class="facto-corpo" data-facto-corpo hidden>
      <label data-facto-valor><span>O facto</span> <small></small><input class="campo" name="valor"></label>
      <div data-facto-data>${camposData()}</div>
      <label data-facto-local><span>Local</span> <input class="campo" name="local"></label>
      ${camposProva()}
      <div class="acoes"><button class="botao peq primario">Acrescentar facto</button></div>
    </div>
  </form>`);
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
    ${ed ? dobra('ed-referencia', html`+ Acrescentar um artigo ou referência <small>uma leitura sobre esta ficha (não conta como fonte)</small>`, html`<form class="caixa-edicao" data-acao="nova-referencia">
      <input type="hidden" name="alvo" value="${alvo}">
      <label>Título <input class="campo" name="titulo" required placeholder="Ex.: «Morreu o guitarrista …»"></label>
      <label>Endereço <input class="campo" type="url" name="url" required placeholder="https://…"></label>
      <div class="linha-campos"><label>Publicação <input class="campo" name="publicacao" placeholder="Jornal, revista, livro, site"></label>
        <label>Autor <input class="campo" name="autor"></label>
        <label>Ano <input class="campo curto" name="ano" inputmode="numeric" placeholder="AAAA"></label></div>
      <label>Nota <small>opcional: o que lá se encontra</small><input class="campo" name="nota"></label>
      <div class="acoes"><button class="botao peq primario">Acrescentar referência</button></div></form>`) : ''}
  </section>`;
}

/** A secção «Desambiguação» (desambiguar.js) fechada, no modo de edição: usa-se pouco e é comprida. */
export const dobraDesambiguar = (conteudo) => (editando() && String(conteudo || '').trim()
  ? dobra('ed-desambiguar', html`Desambiguação <small>juntar fichas repetidas, separar, «não confundir com»</small>`, conteudo) : '');

/** Botões de edição no topo das fichas de obras, discos e instrumentos. */
export const botaoCorrigir = (tipo, id) => (editando()
  ? html`<a class="botao" href="#/editar/${tipo}/${id}">✎ Corrigir os dados</a>` : '');

/** «+ Nova …» nas listas, para quem está no modo de edição (um grupo é uma ficha de pessoas com tipo «grupo»). */
export const botaoNova = (tipo, grupo = false) => (editando()
  ? html`<a class="botao primario" href="#/nova/${tipo}${grupo ? '?tipo=grupo' : ''}">+ ${grupo ? 'Novo grupo' : ESPECIES[tipo].nova}</a>` : '');

/** «+ Vídeo ou áudio» numa ficha de pessoa, disco ou obra: o formulário abre com esta ficha já escolhida e, depois de
 *  gravar, volta aqui. (Só se preenche a ficha de onde se vem: o resto escreve-o quem cataloga.) */
export function botaoNovoMedia({ pessoas = [], obras = [], gravacao = '' } = {}, texto = '+ Vídeo ou áudio') {
  if (!editando()) return '';
  const params = new URLSearchParams({ ...(pessoas.length ? { pessoas: pessoas.join(',') } : {}), ...(obras.length ? { obras: obras.join(',') } : {}),
    ...(gravacao ? { gravacao } : {}), volta: location.hash || '#/' });
  return html`<a class="botao peq" href="#/nova/media?${params}">${texto}</a>`;
}

/** «outro» ou «outra», «o mesmo» ou «a mesma», conforme o tipo de ficha (tirado de «Novo …» ou «Nova …»). */
export function concordancia(tipo) {
  const m = /^Novo\b/.test(ESPECIES[tipo]?.nova || '');
  return { outro: m ? 'outro' : 'outra', mesmo: m ? 'o mesmo' : 'a mesma' };
}

/** Destino seguro de «volta» (um endereço deste site, #/…), ou ''. */
export const voltaSegura = (v) => (/^#\/[\w\-./?=&%,+~:]*$/.test(String(v || '')) ? String(v) : ''); // («:» nos documentos: #/doc/gc-v:…)

// ------------------------------------------------------------------ páginas «nova» e «editar»

function semEdicao(el, titulo) {
  el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Modo de edição</p><h1>${titulo}</h1></header>
    <div class="vazio"><h3>Precisa do modo de edição</h3><p>Entre como contribuidor (no fundo do menu, «Entrar») e ligue o
      <b>Modo de edição</b>. Veja <a href="#/contribuir">como contribuir</a>.</p></div></div>`.s;
}

/** Valores iniciais de uma ficha nova vindos do endereço (#/nova/media?url=…&pessoas=…): só fichas que existem e
 *  endereços http(s); a fonte (fonte_url) abre «Como sabe?» em «Está escrito numa fonte», mas a frase escreve-a quem
 *  cataloga. */
function valoresIniciais(tipo, params) {
  const ids = (k, t) => String(params[k] || '').split(',').filter((x) => E.por[t][x]);
  const v = { volta: voltaSegura(params.volta) };
  if (tipo === 'pessoas' && params.tipo === 'grupo') Object.assign(v, { tipo: 'grupo', papeis: ['agrupamento'] });
  if (tipo === 'media') {
    Object.assign(v, { url: enderecoSeguro(params.url) || '', titulo: String(params.titulo || '').trim().slice(0, 200),
      pessoas: ids('pessoas', 'pessoas'), obras: ids('obras', 'obras'), gravacao: E.por.gravacoes[params.gravacao] ? params.gravacao : '' });
    const fonte = enderecoSeguro(params.fonte_url);
    if (fonte) v.prova = { como: 'fonte', fonte_url: fonte };
  }
  return v;
}

export function novaFicha(el, tipo, params) {
  const esp = ESPECIES[tipo];
  if (!esp) { el.innerHTML = '<div class="conteudo"><h1>Tipo de ficha desconhecido</h1></div>'; return; }
  const grupo = tipo === 'pessoas' && params.tipo === 'grupo';
  const titulo = grupo ? 'Novo grupo' : esp.nova;
  if (!editando()) return semEdicao(el, titulo);
  el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Modo de edição</p><h1>${titulo}</h1>
    <p class="lead">Fica assinada com o seu nome. ${podeAprovar() ? 'Como editor, entra logo no arquivo.' : 'Um editor revê a proposta antes de entrar no arquivo.'}
      ${tipo === 'media' ? 'Ao colar o endereço, o formulário diz se esse vídeo ou áudio já está catalogado.'
        : 'Antes de criar, procure se já existe (na caixa Procurar, no topo; o formulário também avisa ao escrever o nome): se existir, acrescente lá o que sabe.'}</p></header>
    ${formFicha(tipo, null, valoresIniciais(tipo, params))}</div>`.s;
  if (tipo === 'media') previaMedia($('form[data-acao="guardar-ficha"]', el)); // o endereço que veio de «+ Catalogar»
}

export function editarFicha(el, tipo, id, params = {}) {
  const esp = ESPECIES[tipo], f = E.por[tipo]?.[id];
  if (!esp || !f) { el.innerHTML = '<div class="conteudo"><h1>Ficha não encontrada</h1></div>'; return; }
  if (!editando()) return semEdicao(el, `Corrigir: ${f[esp.titulo]}`);
  const revisto = f.estado_revisao === 'revisto';
  // os vídeos e áudios não têm página própria: a revisão e o histórico ficam aqui
  const extra = tipo === 'media' ? html`<div class="acoes-topo"><a class="botao" href="${enderecoSeguro(f.url) || '#'}" target="_blank" rel="noopener">Ver no site original ↗</a>
      <a class="botao" href="#/historico/media/${f.id}">Histórico</a>
      ${podeAprovar() ? html`<button type="button" class="botao" data-acao="revisao" data-alvo="media/${f.id}" data-estado="${revisto ? 'rascunho' : 'revisto'}">
        ${revisto ? 'Voltar a pôr como rascunho' : 'Marcar como revisto'}</button>` : ''}
      ${botaoRetirarCatalogo(f)}
      ${revisto ? html`<span class="selo verde">revisto</span>` : html`<span class="selo ouro">por rever</span>`}</div>` : '';
  el.innerHTML = html`<div class="conteudo estreito"><header class="cabecalho"><p class="sobretitulo">Modo de edição</p><h1>Corrigir: ${f[esp.titulo]}</h1>
    <p class="lead">Altere o que estiver errado ou em falta. ${tipo === 'media' ? 'Se uma pessoa não está neste vídeo, tire-a da lista «Quem toca ou canta».'
      : 'Factos, fontes e relações acrescentam-se na própria ficha.'}</p>${extra}</header>
    ${formFicha(tipo, f, { volta: params.volta })}</div>`.s;
  if (tipo === 'media') previaMedia($('form[data-acao="guardar-ficha"]', el));
}

// ------------------------------------------------------------------ ajudas ao preencher

const detalheDe = (tipo, x) => (tipo === 'instrumentos' ? [x.tipo, x.ano, x.construtor && nomeDe(x.construtor)].filter(Boolean).join(' · ') : detalheFicha(tipo, x));

/** Fichas parecidas com o nome ou o título que se está a escrever (também pelos outros nomes), para não se criarem
 *  repetidas: «É esta» abre-a para lá se acrescentar o que se sabe; «É outra» tira-a da lista (e, se o nome for o
 *  mesmo, marca a caixa «é outra»). */
function mostrarParecidas(form) {
  const caixa = $('[data-parecidas]', form);
  if (!caixa) return;
  const tipo = caixa.dataset.parecidas, esp = ESPECIES[tipo];
  const texto = form.elements[esp.titulo]?.value.trim() || '';
  const recusadas = new Set((caixa.dataset.recusadas || '').split(',').filter(Boolean));
  const lista = [], vistas = new Set();
  if (texto.length >= 3) {
    const iguais = fichasIguais(tipo, texto), ids = new Set(iguais.map((x) => x.id));
    const juntar = (x) => { if (x && !vistas.has(x.id) && !recusadas.has(x.id)) { vistas.add(x.id); lista.push({ x, igual: ids.has(x.id) }); } };
    iguais.forEach(juntar);
    // (um disco não é parecido só por ter uma faixa com este nome)
    procurarEntidades(texto, 30).filter((r) => r?.coincidiu?.como !== 'faixa').map((r) => r?.x).filter((x) => x && E.por[tipo]?.[x.id] === x).forEach(juntar);
    if (['pessoas', 'obras', 'gravacoes'].includes(tipo)) candidatosDe(tipo, texto, 5).forEach(juntar);
  }
  const mostrar = lista.slice(0, 5);
  caixa.hidden = !mostrar.length;
  caixa.innerHTML = mostrar.length ? html`<p><b>Já existem fichas parecidas.</b> Se for uma delas, acrescente lá o que sabe em vez de criar outra.</p>
    <ul>${mostrar.map(({ x, igual }) => html`<li><span><b>${x[esp.titulo]}</b> <small class="mudo">${[igual ? 'o mesmo nome' : '', detalheDe(tipo, x)].filter(Boolean).join(' · ')}</small></span>
      <span class="acoes"><a class="botao peq" href="#/${esp.rota}/${x.id}">É esta: abrir e acrescentar lá</a>
      <button type="button" class="botao peq" data-parecida-outra="${x.id}">É outra</button></span></li>`)}</ul>`.s : '';
}

/** Outra ficha com este vídeo ou áudio (`c` de classificar(): compara a plataforma e a chave, não o texto do endereço).
 *  Ao corrigir uma ficha que já tinha este vídeo, não conta: o mesmo vídeo pode estar em várias fichas, uma por disco
 *  ou edição; só se procura quando o endereço passa a ser o de outro vídeo. Também usado em edicao.js. */
export function outraFichaDoMedia(c, id = '') {
  if (!c) return null;
  const antes = id && E.por.media?.[id];
  if (antes && chaveMedia(antes) === `${c.plataforma}|${c.chave}`) return null;
  return catalogadosDe(c).find((m) => m.id !== id) || null;
}

/** Este vídeo ou áudio já está catalogado (noutra ficha)? */
function mediaRepetida(form) {
  if (form.elements.especie?.value !== 'media') return null;
  return outraFichaDoMedia(classificar(form.elements.url?.value.trim() || ''), form.elements.id.value);
}

/** Ao colar o endereço de um vídeo ou áudio: a plataforma e a miniatura oficial, para confirmar que é esse, e o aviso
 *  (com a ligação) se já estiver catalogado. */
function previaMedia(form) {
  const caixa = $('[data-previa-media]', form), url = form.elements.url?.value.trim() || '';
  if (!caixa) return;
  if (!url) { caixa.hidden = true; caixa.innerHTML = ''; return; }
  const c = classificar(url), tocavel = c && ['video', 'audio'].includes(c.tipo), ja = mediaRepetida(form);
  caixa.hidden = false;
  caixa.classList.toggle('erro', !tocavel || !!ja);
  if (!tocavel) {
    caixa.innerHTML = html`<p>Este endereço não é de um vídeo ou áudio que o arquivo saiba tocar (YouTube, Vimeo, SoundCloud, Spotify, Internet Archive, RTP…).</p>`.s;
    return;
  }
  const capa = capaMedia(c);
  caixa.innerHTML = html`${capa ? html`<img src="${capa}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
    <div><p><b>${NOME_PLATAFORMA[c.plataforma] || c.plataforma}</b> ✓${c.url !== url ? html` <small class="mudo">grava-se como ${c.url}</small>` : ''}</p>
    ${ja ? html`<p>Este ${c.tipo === 'audio' ? 'áudio' : 'vídeo'} já está catalogado: «${ja.titulo}».</p>
      <p><a class="botao peq" href="#/editar/media/${ja.id}">✎ Corrigir a ficha que já existe</a></p>` : ''}</div>`.s;
}

/** O endereço da própria imagem a partir da página de um ficheiro da Wikimedia Commons ou da Wikipédia
 *  (…/wiki/File:X.jpg ou …#/media/Ficheiro:X.jpg), pelo Special:FilePath do mesmo site; null se não for uma dessas. */
function imagemDaWiki(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  if (!/(^|\.)(wikimedia|wikipedia)\.org$/.test(url.hostname)) return null;
  const deco = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  const re = (onde) => new RegExp(`^${onde}(?:File|Ficheiro|Imagem|Image|Arquivo):(.+)$`, 'i');
  const nome = (deco(url.hash).match(re('#/media/')) || deco(url.pathname).match(re('/wiki/')) || [])[1];
  return nome ? `https://${url.hostname.replace('.m.', '.')}/wiki/Special:FilePath/${encodeURIComponent(nome.replace(/ /g, '_'))}` : null;
}

/** A fotografia colada, para confirmar antes de gravar («Não consegui abrir» se o endereço não for de uma imagem). A
 *  página de uma imagem da Wikimedia mostra logo a imagem; com `trocar` (ao sair do campo), o endereço passa a ser o da
 *  imagem, e a página fica como página de origem. */
function previaImagem(form, trocar = false) {
  const entrada = form.elements.url, caixa = $('[data-previa-imagem]', form);
  if (!entrada || !caixa) return;
  let url = entrada.value.trim();
  const wiki = imagemDaWiki(url);
  if (wiki && trocar) {
    if (!form.elements.origem.value.trim()) form.elements.origem.value = url;
    entrada.value = url = wiki;
  }
  if (!url) { caixa.hidden = true; caixa.innerHTML = ''; return; }
  caixa.hidden = false;
  // as ligações diretas às imagens do Facebook e do Instagram trazem um prazo: passado ele, a fotografia desaparece da ficha
  const caduca = /(^|\.)(fbcdn\.net|cdninstagram\.com)(\/|$)/i.test(url.replace(/^https?:\/\//, ''));
  caixa.innerHTML = html`${caduca ? html`<p class="erro">Atenção: as ligações às imagens do Facebook e do Instagram deixam de funcionar ao fim de algum tempo, e a fotografia
    desaparece da ficha. Se puder, procure a mesma fotografia num site público (jornal, instituição, Wikimedia).</p>` : ''}${wiki ? html`<p class="mudo">${trocar ? 'Era a página da imagem na Wikimedia: o endereço passou a ser o da própria imagem, e a página ficou como origem.'
    : 'É a página da imagem na Wikimedia: ao sair do campo, o endereço passa a ser o da própria imagem, e a página fica como origem.'}</p>` : ''}
    <img src="${miniatura(wiki || url, 400)}" alt="Pré-visualização da fotografia" referrerpolicy="no-referrer">`.s;
  $('img', caixa).onerror = () => {
    caixa.innerHTML = html`<p class="erro">Não consegui abrir esta imagem. Confirme que o endereço é o da imagem (acaba muitas vezes em .jpg ou .png)
      e não o da página onde ela aparece.</p>`.s;
  };
}

/** «Escolher uma imagem do arquivo» (cópia local): as fotografias dos posts que referem a pessoa pelo nome. */
async function imagensDoArquivo(form) {
  const caixa = $('[data-lista-imagens]', form);
  caixa.hidden = false;
  caixa.innerHTML = '<p class="carregando">A procurar</p>';
  try {
    // há imagens com endereço relativo ao documento (páginas arquivadas): resolvem-se contra ele; as outras ficam de fora
    const absoluto = (m) => { try { return enderecoSeguro(new URL(m.url, m.url_doc || undefined).href); } catch { return null; } };
    let imagens = [];
    for (let pagina = 1; pagina <= 3 && imagens.length < 30; pagina++) {
      const r = await api('media', { tipo: 'imagem', q: form.dataset.nomes, frase: 1, pagina });
      // só as dos posts (e comentários) dos blogues: as páginas web arquivadas trazem logótipos e ícones
      imagens.push(...r.resultados.filter((m) => !m.tipo_doc || ['post', 'comentario'].includes(m.tipo_doc))
        .map((m) => ({ ...m, url: absoluto(m) })).filter((m) => m.url));
      if (r.resultados.length < (r.por_pagina || 30)) break;
    }
    imagens = imagens.slice(0, 30);
    caixa.innerHTML = imagens.length ? html`${imagens.map((m) => html`<button type="button" class="imagem-arquivo" data-url="${m.url}"
      data-origem="${m.url_doc || ''}" title="${m.legenda || m.titulo_doc || ''}"><img src="${miniatura(m.url, 200)}" alt="${m.legenda || ''}" loading="lazy" referrerpolicy="no-referrer"></button>`)}`.s
      : '<p class="mudo">Nenhuma fotografia nos posts com este nome.</p>';
  } catch { caixa.innerHTML = '<p class="mudo">Servidor local desligado.</p>'; }
}

/** Por baixo da relação, a frase que vai ficar registada («Carlos Paredes é filho/a de Artur Paredes»). */
function fraseRelacao(form) {
  const p = $('[data-frase-relacao]', form), sel = form.elements.relacao, caixa = $('[data-seletor-pessoa]', form);
  if (!p || !sel || !caixa) return;
  const rel = sel.value ? sel.selectedOptions[0].textContent.trim() : '';
  const id = caixa.querySelector('[data-papel=id]').value, nova = caixa.querySelector('[data-papel=nova]').value;
  const outro = id ? nomeDe(id) : nova ? `${nova} (ficha nova)` : '';
  p.hidden = !(rel && outro);
  p.textContent = rel && outro ? `Vai ficar registado: ${form.dataset.nome} ${rel} ${outro}.` : '';
}

/** O número da faixa no início de uma linha, quando é mesmo o número: com separador («1.», «1)», «01 -», «1:»), com o lado
 *  do disco («A1», «B2.») ou com «Faixa 3». Um número seguido só de espaço («25 de Abril», «1 de Dezembro») ou de «.ª»
 *  («1.ª Balada») faz parte do título. */
const NUMERO_FAIXA = /^\s*(?:(?:faixa\s+)?\d{1,3}\s*(?:[.)](?![ªº\d])|[-–—:](?=\s))|[A-Da-d]\d{1,2}(?:\s*[.)\-–—:])?(?=\s)|faixa\s+\d{1,3}(?=\s))\s*/i;
/** Número seguido só de espaço («01 Balada»): só se tira quando todas as linhas coladas o têm, em sequência. */
const NUMERO_SO = /^\s*(\d{1,3})\s+(?:[-–—:.]\s*)?/;

/** As linhas coladas estão todas numeradas em sequência, a começar em 1 («1 …», «2 …», ou a recomeçar em 1 no outro
 *  lado do disco)? */
export function numeradasEmSequencia(linhas) {
  const n = linhas.map((l) => +(String(l).match(NUMERO_SO) || [])[1]);
  return n.length > 1 && n[0] === 1 && n.every((x, i) => i === 0 || x === n[i - 1] + 1 || x === 1);
}

/** O título de uma linha de um alinhamento colado, sem o número da faixa nem a duração («3:25»). Com `numeradas`
 *  (numeradasEmSequencia), também sai o número seguido só de espaço. */
export const tituloDaLinha = (linha, numeradas = false) => String(linha)
  .replace(numeradas && NUMERO_SO.test(linha) ? NUMERO_SO : NUMERO_FAIXA, '')
  .replace(/\s*[([]?\d{1,2}:\d{2}(?::\d{2})?[)\]]?\s*$/, '')
  .replace(/\s*[-–—|·]\s*$/, '')
  .trim();

/** A obra de uma faixa colada: escolhida só quando há exatamente uma com esse título (o título ou um dos outros);
 *  com várias, «escolher»; sem nenhuma, fica em branco. */
function proporObra(linha, titulo) {
  const caixa = $('[data-seletor-pessoa][data-tipo="obras"]', linha), nota = $('[data-obra-proposta]', linha);
  const obras = obrasComTitulo(titulo);
  if (obras.length === 1) {
    escolherEm(caixa, { id: obras[0].id });
    nota.innerHTML = html`obra proposta pelo título: <b>${obras[0].titulo}</b>${detalheFicha('obras', obras[0]) ? ` (${detalheFicha('obras', obras[0])})` : ''} ✓ confirme`.s;
  } else if (obras.length > 1) {
    nota.innerHTML = html`${obras.length} obras com este título: <button type="button" class="botao-texto" data-escolher-obra="${titulo}">escolher</button>`.s;
  } else nota.textContent = 'nenhuma obra com este título no arquivo';
}

function colarAlinhamento(form, dobraColar) {
  const area = $('[data-alinhamento]', dobraColar);
  const linhasColadas = area.value.split(/\r?\n/).filter((l) => l.trim());
  const numeradas = numeradasEmSequencia(linhasColadas);
  const titulos = linhasColadas.map((l) => tituloDaLinha(l, numeradas)).filter(Boolean);
  if (!titulos.length) { area.focus(); return; }
  const linhas = $('[data-linhas="faixas"]', form), modelo = $('template[data-modelo="faixas"]', form);
  // as linhas ainda vazias (de «+ Faixa») saem, para a numeração bater certo
  $$('.linha', linhas).filter((l) => !$('input[name="faixas.titulo[]"]', l).value.trim() && !$('[data-papel=id]', l).value
    && $('input[name="faixas.media[]"]', l).value === '[]').forEach((l) => l.remove());
  for (const t of titulos) {
    linhas.append(modelo.content.cloneNode(true));
    const linha = linhas.lastElementChild;
    $('input[name="faixas.titulo[]"]', linha).value = t;
    proporObra(linha, t);
  }
  area.value = '';
  dobraColar.open = false;
  aviso(`${plural(titulos.length, 'faixa acrescentada', 'faixas acrescentadas')}: confira as obras propostas`);
}

/** Onde está um campo de escolha, para o dizer na confirmação («Intérpretes, linha 2»). */
function ondeEsta(caixa) {
  const linhas = caixa.closest('[data-linhas]');
  const n = linhas ? [...linhas.children].indexOf(caixa.closest('.linha')) + 1 : 0;
  return [caixa.dataset.rotulo, n ? `linha ${n}` : ''].filter(Boolean).join(', ');
}

/** Antes de gravar: o que se escreveu num campo de escolha e não se escolheu na lista não se perde em silêncio. O envio
 *  pára e, para cada um, propõe escolher a ficha parecida, criar a ficha (pessoas) ou deixar em branco. Um vídeo já
 *  catalogado também pára, com a ligação para a ficha que existe. */
function confirmarAntesDeGravar(e) {
  const form = e.target.closest?.('form[data-acao="guardar-ficha"], form[data-acao="nova-relacao"]');
  if (!form) return;
  const pendentes = $$('[data-seletor-pessoa]', form).filter(porEscolher);
  const repetida = mediaRepetida(form);
  if (!pendentes.length && !repetida) return;
  e.preventDefault();
  e.stopImmediatePropagation(); // não chega a edicao.js: nada se grava ainda
  if (repetida) { previaMedia(form); $('[data-previa-media]', form)?.scrollIntoView({ block: 'center' }); return; }
  // as marcas da confirmação anterior saem: cada botão aponta só para o campo desta
  $$('[data-pendente]', form).forEach((c) => c.removeAttribute('data-pendente'));
  pendentes.forEach((c, i) => { c.dataset.pendente = i; });
  let caixa = $('.confirme', form);
  if (!caixa) {
    caixa = Object.assign(document.createElement('div'), { className: 'confirme', tabIndex: -1 });
    caixa.setAttribute('role', 'alert');
    const fim = [...form.children].filter((x) => x.matches('.acoes')).pop();
    form.insertBefore(caixa, fim || null);
  }
  caixa.innerHTML = html`<h4>Confirme antes de gravar</h4>
    <p>${pendentes.length === 1 ? 'Este nome foi escrito mas não foi escolhido na lista, e não ficaria gravado:'
      : 'Estes nomes foram escritos mas não foram escolhidos na lista, e não ficariam gravados:'}</p>
    <ul>${pendentes.map((c, i) => {
      const tipo = c.dataset.tipo || 'pessoas', texto = $('input.campo', c).value.trim();
      // como na lista do seletor: com uma ficha deste nome exato (ou com este entre os outros nomes, «Zeca Afonso»),
      // propõe-se essa primeiro e não se propõe criar outra igual
      const iguais = fichasIguais(tipo, texto), exato = iguais.length > 0;
      const sugestoes = [...new Set([...iguais, ...candidatosDe(tipo, texto, 2)])].slice(0, Math.max(2, iguais.length));
      return html`<li><b>«${texto}»</b> <small class="mudo">${ondeEsta(c)}</small>
        <span class="acoes">${sugestoes.map((x) => html`<button type="button" class="botao peq" data-resolver="${i}" data-id="${x.id}">Escolher
          ${tituloDe(tipo, x)}${detalheFicha(tipo, x) ? ` (${detalheFicha(tipo, x)})` : ''}</button>`)}
          ${c.dataset.criar && !exato ? html`<button type="button" class="botao peq" data-resolver="${i}" data-nova="${texto}">Criar a ficha «${texto}»</button>` : ''}
          <button type="button" class="botao peq" data-resolver="${i}" data-branco="1">Deixar em branco</button></span></li>`;
    })}</ul>`.s;
  caixa.scrollIntoView({ block: 'center' });
  caixa.focus({ preventScroll: true });
}

/** Resolve uma linha da confirmação (escolher, criar ou deixar em branco); sem mais nenhuma, volta-se a gravar. */
function resolver(b) {
  const form = b.closest('form'), c = $(`[data-pendente="${b.dataset.resolver}"]`, form);
  if (c) escolherEm(c, b.dataset.id ? { id: b.dataset.id } : b.dataset.nova ? { nova: b.dataset.nova } : {});
  b.closest('li').remove();
  const caixa = $('.confirme', form);
  if (caixa && !$('li', caixa)) {
    const gravar = [...form.querySelectorAll('button')].filter((x) => x.type === 'submit').pop();
    caixa.innerHTML = html`<p>Pronto. Carregue outra vez em «${gravar?.textContent.trim() || 'Guardar'}» para gravar.</p>`.s;
    gravar?.focus();
  }
}

// ------------------------------------------------------------------ escolhas múltiplas, linhas e dobras

/** Depois de um atalho abrir uma dobra: enquanto a página ainda cresce por cima dela (no telemóvel, as fotografias da
 *  galeria só carregam ao passar por elas), volta a pô-la no topo do ecrã. Pára ao fim de 2,5 s ou quando quem lê
 *  mexe na página. */
function manterAVista(d) {
  if (typeof ResizeObserver !== 'function') return;
  let fim = null, primeira = true;
  const repor = () => d.scrollIntoView({ block: 'start', behavior: 'auto' });
  const obs = new ResizeObserver(() => { // (a primeira chamada é a do início: deixa acabar a deslocação suave)
    if (primeira) { primeira = false; return; }
    if (Math.abs(d.getBoundingClientRect().top - (parseFloat(getComputedStyle(d).scrollMarginTop) || 0)) > 4) repor();
  });
  const parar = () => {
    obs.disconnect();
    clearTimeout(fim);
    for (const t of ['wheel', 'touchstart', 'keydown', 'pointerdown']) removeEventListener(t, parar, true);
  };
  obs.observe(document.body);
  for (const t of ['wheel', 'touchstart', 'keydown', 'pointerdown']) addEventListener(t, parar, { capture: true, passive: true });
  fim = setTimeout(parar, 2500);
}

export function iniciarFichas() {
  // o formulário do facto ajusta-se ao tipo escolhido; a data diz como foi percebida, enquanto se escreve
  document.addEventListener('change', (e) => { if (e.target.matches?.('[data-tipo-facto]')) ajustarFacto(e.target.form); });
  document.addEventListener('input', (e) => {
    if (!e.target.matches?.('[data-campo-data]')) return;
    const leitura = e.target.parentElement.querySelector('[data-leitura-data]');
    leitura.classList.remove('erro');
    try {
      const { data, aprox } = lerData(e.target.value);
      leitura.textContent = data ? `Fica: ${aprox ? `c. ${data.slice(0, 4)}` : fmtData(data)}` : '';
    } catch (x) { leitura.textContent = x.message; leitura.classList.add('erro'); }
  });
  // escolher pessoas ou obras (várias): cada escolha vira uma etiqueta, e o campo fica livre para a seguinte
  document.addEventListener('escolha', (e) => {
    const relacao = e.target.closest('form[data-acao="nova-relacao"]');
    if (relacao) fraseRelacao(relacao);
    const caixa = e.target.closest('[data-chips]');
    if (!caixa || (!e.detail.id && !e.detail.nova)) return;
    const sel = e.target.closest('[data-seletor-pessoa]'), chips = $('.chips', caixa), k = caixa.dataset.nome, tipo = caixa.dataset.chips;
    const ja = (v) => $$('input[type=hidden]', chips).some((x) => x.value === v);
    if (e.detail.id && !ja(e.detail.id)) chips.insertAdjacentHTML('beforeend', chip(k, e.detail.id, tituloDe(tipo, E.por[tipo][e.detail.id])).s);
    if (e.detail.nova && !ja(e.detail.nova)) chips.insertAdjacentHTML('beforeend', chipNova(k, e.detail.nova).s);
    limparSeletor(sel);
  });
  const atualizarParecidas = debounce(mostrarParecidas, 250), atualizarImagem = debounce(previaImagem, 500);
  document.addEventListener('input', (e) => {
    const form = e.target.closest?.('form[data-acao]');
    if (!form) return;
    const nome = e.target.name, tipo = form.elements.especie?.value;
    if (form.dataset.acao === 'guardar-ficha') {
      if (nome && nome === ESPECIES[tipo]?.titulo && !form.elements.id?.value) atualizarParecidas(form);
      if (tipo === 'media' && nome === 'url') previaMedia(form);
    } else if (form.dataset.acao === 'nova-imagem' && nome === 'url') {
      if (imagemDaWiki(e.target.value.trim())) previaImagem(form); else atualizarImagem(form); // a página da Wikimedia mostra-se já
    }
    else if (form.dataset.acao === 'nova-relacao') fraseRelacao(form);
  });
  document.addEventListener('change', (e) => {
    const form = e.target.closest?.('form[data-acao]');
    if (form?.dataset.acao === 'nova-imagem' && e.target.name === 'url') previaImagem(form, true);
    if (form?.dataset.acao === 'nova-relacao') fraseRelacao(form);
  });
  // fotografia carregada do computador: substitui o endereço; só se envia ao gravar (fotos.js)
  document.addEventListener('change', async (e) => {
    if (!e.target.matches?.('[data-carregar-foto]')) return;
    const form = e.target.closest('form'), ficheiro = e.target.files[0], erro = $('[data-erro-foto]', form), previa = $('[data-foto-carregada]', form);
    if (!ficheiro) return;
    erro.hidden = true;
    try {
      previa.src = await prepararFoto(ficheiro, form.elements.id.value);
      previa.hidden = false;
      $('[data-retirar-foto]', form).hidden = false;
      $('[data-por-endereco]', form).hidden = true;
      form.elements.url.required = false;
      form.elements.url.value = '';
      previaImagem(form);
    } catch (x) { erro.textContent = x.message; erro.hidden = false; }
    e.target.value = '';
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-retirar-foto]');
    if (!b) return;
    const form = b.closest('form');
    esquecerFoto();
    b.hidden = true;
    $('[data-foto-carregada]', form).hidden = true;
    $('[data-por-endereco]', form).hidden = false;
    form.elements.url.required = true;
  });
  document.addEventListener('rascunho-recuperado', (e) => {
    const form = e.target;
    if (form.dataset.acao === 'nova-relacao') fraseRelacao(form);
    if (form.dataset.acao === 'nova-imagem') previaImagem(form);
    if (form.dataset.acao === 'guardar-ficha') previaMedia(form);
  });
  document.addEventListener('submit', confirmarAntesDeGravar, true);
  // as dobras abertas ficam lembradas neste browser
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches?.('details.dobra-edicao[data-lembrar]')) return;
    const abertos = new Set(ler(ABERTOS, []));
    if (d.open) abertos.add(d.id); else abertos.delete(d.id);
    guardar(ABERTOS, [...abertos]);
  }, true);
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
    if (menos) { menos.closest('.linha').remove(); return; }
    const mover = e.target.closest('[data-linha-mover]');
    if (mover) {
      const linha = mover.closest('.linha'), subir = +mover.dataset.linhaMover < 0;
      const vizinha = subir ? linha.previousElementSibling : linha.nextElementSibling;
      if (vizinha) { if (subir) vizinha.before(linha); else vizinha.after(linha); mover.focus(); }
      return;
    }
    const colar = e.target.closest('[data-colar-alinhamento]');
    if (colar) { colarAlinhamento(colar.closest('form'), colar.closest('details')); return; }
    const obra = e.target.closest('[data-escolher-obra]');
    if (obra) {
      const entrada = $('[data-seletor-pessoa][data-tipo="obras"] input.campo', obra.closest('.linha'));
      entrada.value = obra.dataset.escolherObra;
      entrada.focus();
      entrada.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) {
      const d = document.getElementById(abrir.dataset.abrir);
      if (!d) return;
      d.open = true;
      d.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      $('summary', d)?.focus({ preventScroll: true });
      manterAVista(d);
      return;
    }
    const outra = e.target.closest('[data-parecida-outra]');
    if (outra) {
      const form = outra.closest('form'), caixa = outra.closest('[data-parecidas]'), tipo = caixa.dataset.parecidas;
      caixa.dataset.recusadas = [caixa.dataset.recusadas, outra.dataset.parecidaOutra].filter(Boolean).join(',');
      if (fichasIguais(tipo, form.elements[ESPECIES[tipo].titulo].value).some((x) => x.id === outra.dataset.parecidaOutra)) form.elements.homonimo.checked = true;
      mostrarParecidas(form);
      return;
    }
    const resolve = e.target.closest('[data-resolver]');
    if (resolve) { resolver(resolve); return; }
    const imagens = e.target.closest('[data-imagens-arquivo]');
    if (imagens) { imagensDoArquivo(imagens.closest('form')); return; }
    const imagem = e.target.closest('.imagem-arquivo');
    if (imagem) {
      const form = imagem.closest('form');
      form.elements.url.value = imagem.dataset.url;
      if (imagem.dataset.origem) form.elements.origem.value = imagem.dataset.origem;
      $$('.imagem-arquivo', form).forEach((x) => x.setAttribute('aria-pressed', String(x === imagem)));
      previaImagem(form);
    }
  });
  iniciarRascunhos({
    // volta a pôr uma etiqueta escolhida (pessoa, obra ou ficha nova) ao recuperar um rascunho
    refazerEtiqueta: (caixa, nome, valor) => {
      const k = caixa.dataset.nome, tipo = caixa.dataset.chips, chips = $('.chips', caixa);
      if (nome === `${k}_novas[]`) chips.insertAdjacentHTML('beforeend', chipNova(k, valor).s);
      else if (E.por[tipo]?.[valor]) chips.insertAdjacentHTML('beforeend', chip(k, valor, tituloDe(tipo, E.por[tipo][valor])).s);
    },
  });
}

/** Linha «nasceu… morreu…» no topo da ficha de uma pessoa, a partir dos factos. Quando as fontes divergem, ficam todas
 *  as versões lado a lado, por ordem de data (as sem data no fim), sem escolher nenhuma, e um salto para a tabela de
 *  factos. Num grupo, a formação: o valor literal de cada facto, com as marcas de citação. */
export function linhaVida(p) {
  const deCampo = (campo) => (p.factos || []).filter((f) => f.campo === campo);
  const porData = (lista) => [...lista].sort((a, b) => !a.data - !b.data || (a.data || '').localeCompare(b.data || ''));
  const verFactos = (campo) => html` — as fontes divergem (<button type="button" class="ligacao-texto" data-saltar="facto-${campo}">ver Factos</button>)`;
  if (p.tipo === 'grupo') {
    const formacao = porData(deCampo('formacao'));
    return formacao.length ? html`<p class="alt vida-linha">Formação: ${formacao.map((f, i) => html`${i ? ' · ' : ''}${f.valor}${marcas(f.fontes)}`)}${
      formacao.some((f) => f.conflito) ? verFactos('formacao') : ''}</p>` : '';
  }
  const parte = (campo, certo, divergente) => {
    const lista = deCampo(campo);
    if (!lista.length) return '';
    if (!lista.some((f) => f.conflito)) return html`<span class="vida-parte">${certo}: ${lista[0].valor}${marcaEditorial(lista[0].editorial)}</span>`;
    return html`<span class="vida-parte diverge">${divergente}: ${porData(lista).map((f, i) => html`${i ? ' · ' : ''}${f.valor}${marcaEditorial(f.editorial)}`)}${verFactos(campo)}</span>`;
  };
  const partes = [parte('nascimento', 'Nasceu', 'Nascimento'), parte('morte', 'Morreu', 'Morte')].filter(Boolean);
  return partes.length ? html`<p class="alt vida-linha">${partes}</p>` : '';
}

