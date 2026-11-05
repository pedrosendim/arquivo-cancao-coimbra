// Texto simples dos textos do blogue (e de outras notas longas) convertido em HTML seguro.
// Escapa tudo primeiro; só depois reconhece um pequeno conjunto de marcas:
//   ## Título · ### Subtítulo · **negrito** · *itálico* · [texto](https://…) · - lista · > citação
//   ![legenda](https://…imagem) numa linha própria · [[id-da-ficha]] ou [[id-da-ficha|texto]]
import { E } from './estado.js';
import { esc, raw, miniatura } from './util.js';

const ROTAS = [['pessoas', 'pessoa', (x) => x.nome], ['obras', 'obra', (x) => x.titulo],
  ['gravacoes', 'gravacao', (x) => x.titulo], ['instrumentos', 'instrumento', (x) => x.designacao]];

/** Rota e nome de uma ficha pelo id, procurando em pessoas, obras, gravações e instrumentos. */
export function ficha(id) {
  for (const [t, rota, nome] of ROTAS) if (E.por[t][id]) return { rota: `#/${rota}/${id}`, nome: nome(E.por[t][id]) };
  return null;
}

const urlSegura = (u) => /^(https?:\/\/|#\/)/.test(u);

// endereço de uma ligação: sem espaços, com um nível de parênteses (as páginas da Wikipédia: «Coimbra_(cidade)»)
const RE_LIGACAO = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

function linha(s) {
  // s já vem escapado: as marcas reconhecem-se sobre o texto escapado. Os endereços guardam-se à parte enquanto se
  // aplicam o negrito e o itálico, para um «*» dentro de um endereço não o partir.
  const enderecos = [];
  return s.replace(/\u0000/g, '')
    .replace(/\[\[([a-z0-9]+(?:-[a-z0-9]+)*)(?:\|([^\]]*))?\]\]/g, (_, id, texto) => {
      const f = ficha(id);
      return f ? `<a href="${f.rota}">${texto || esc(f.nome)}</a>` : `<span class="ligacao-partida" title="Ficha inexistente: ${id}">${texto || id}</span>`;
    })
    .replace(RE_LIGACAO, (m, texto, url) => {
      const u = url.replace(/&amp;/g, '&');
      if (!urlSegura(u)) return m;
      const href = `\u0000${enderecos.push(url) - 1}\u0000`;
      return u.startsWith('#/') ? `<a href="${href}">${texto}</a>` : `<a href="${href}" target="_blank" rel="noopener">${texto}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => enderecos[+i]);
}

/** Converte o texto em HTML (valor Raw, pronto para os modelos html``). */
export function textoRico(fonte) {
  const blocos = String(fonte || '').replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return raw(blocos.map((b) => {
    const linhas = b.split('\n');
    let m;
    if ((m = b.match(/^(#{2,3})\s+(.+)$/))) return `<h${m[1].length}>${linha(esc(m[2]))}</h${m[1].length}>`;
    if ((m = b.match(/^!\[([^\]]*)\]\((\S+)\)$/)) && urlSegura(m[2]) && !m[2].startsWith('#')) {
      return `<figure><img src="${esc(miniatura(m[2], 1200))}" alt="${esc(m[1])}" loading="lazy" referrerpolicy="no-referrer">`
        + `${m[1] ? `<figcaption>${linha(esc(m[1]))}</figcaption>` : ''}</figure>`;
    }
    if (linhas.every((l) => /^[-•]\s+/.test(l))) return `<ul>${linhas.map((l) => `<li>${linha(esc(l.replace(/^[-•]\s+/, '')))}</li>`).join('')}</ul>`;
    if (linhas.every((l) => l.startsWith('>'))) return `<blockquote>${linhas.map((l) => linha(esc(l.replace(/^>\s?/, '')))).join('<br>')}</blockquote>`;
    return `<p>${linhas.map((l) => linha(esc(l))).join('<br>')}</p>`;
  }).join('\n'));
}

/** Primeiras palavras do texto, sem marcas, para os resumos das listas. */
export function resumoTexto(fonte, n = 220) {
  const t = String(fonte || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[\[[^|\]]+\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, (_, id) => ficha(id)?.nome || id).replace(RE_LIGACAO, '$1')
    .replace(/[#*>]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n).replace(/\s\S*$/, '') + '…' : t;
}
