// Online, as propostas ainda abertas de quem contribui (e não aprova) aparecem-lhe já nas fichas, só neste browser,
// com a faixa «à espera de aprovação» (avisos-edicao.js): assim vê o que propôs, abre a ficha nova que acabou de criar
// e continua a acrescentar-lhe coisas, que se juntam à mesma proposta (online/api/gravar.js). Os outros visitantes
// continuam a ver a versão publicada até um editor aprovar.
// Os ficheiros de cada proposta leem-se do repositório público, na versão da proposta; aplicam-se por cima dos dados
// publicados como as alterações à espera de publicação (estado.js, E.minhasPropostas).
import { E, carregar } from './estado.js';

const REPOSITORIO = () => E.sessao?.repositorio || 'pedrosendim/arquivo-cancao-coimbra';
const ROTAS = { pessoa: 'pessoas', obra: 'obras', gravacao: 'gravacoes', instrumento: 'instrumentos', blogue: 'blogue' };

/** Aplica as propostas abertas desta pessoa (a resposta de /api/propostas, sem as dos outros). Devolve true se há. */
export async function aplicarMinhasPropostas(r) {
  if (!r || r.editor || !r.propostas?.length) return false;
  const lidos = await Promise.all(r.propostas.flatMap((p) => p.ficheiros.map(async (f) => {
    if (f.estado === 'removed') return { numero: p.numero, caminho: f.caminho, conteudo: null };
    try {
      const x = await fetch(`https://raw.githubusercontent.com/${REPOSITORIO()}/${p.head}/${f.caminho}`);
      return x.ok ? { numero: p.numero, caminho: f.caminho, conteudo: await x.json() } : null;
    } catch { return null; }
  })));
  E.minhasPropostas = lidos.filter(Boolean);
  if (!E.minhasPropostas.length) return false;
  await carregar();
  return true;
}

/** Depois de gravar uma proposta: as alterações aparecem já (sem esperar pelo GitHub). Chamar carregar() a seguir. */
export function juntarMinhaProposta(alteracoes, numero) {
  const m = new Map((E.minhasPropostas || []).map((f) => [f.caminho, f]));
  for (const [caminho, conteudo] of alteracoes) m.set(caminho, { caminho, conteudo, numero });
  E.minhasPropostas = [...m.values()];
}

/** O número da proposta aberta desta pessoa com alterações à ficha (ou página) aberta agora, ou null. */
export function propostaDaPagina() {
  const [rota, id] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  let caminho = rota === 'fontes' ? 'fontes/fontes.json' : rota === 'contribuidores' ? 'dados/contribuidores.json' : null;
  if (ROTAS[rota] && id) { try { caminho = `dados/${ROTAS[rota]}/${decodeURIComponent(id)}.json`; } catch { return null; } }
  return caminho ? (E.minhasPropostas || []).find((f) => f.caminho === caminho)?.numero || null : null;
}
