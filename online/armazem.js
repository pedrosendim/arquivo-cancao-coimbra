// O armazém do site (um Durable Object da Cloudflare, ver wrangler.jsonc): o que não pode ir para o repositório público
// nem esperar pela construção do site. Há uma só instância, por isso uma escrita fica logo visível para todos.
//   - Contas: quem entra sem GitHub. A palavra-passe nunca chega aqui: o browser transforma-a numa chave (600 000
//     iterações de PBKDF2, site/js/vistas/conta.js) e aqui só se guarda o resumo dessa chave, com um sal de cada conta.
//   - Links de acesso: servem para escolher a palavra-passe (conta nova ou palavra-passe esquecida). Valem uma vez e
//     guarda-se só o resumo do link; um link novo para a mesma pessoa anula o anterior.
//   - Tentativas erradas: ao fim de 5 por conta (ou 20 por endereço IP) numa hora, espera-se 15 minutos.
//   - Mensagens da página Contacto: só os administradores as leem. Até 5 por hora de cada endereço IP e 500 guardadas.
//   - Alterações recentes: as fichas que acabaram de ser publicadas, enquanto a Cloudflare constrói o site. O site de
//     cada visitante junta-as por cima do base.json (site/js/estado.js), e assim uma alteração vê-se logo.

const MINUTO = 60_000, HORA = 60 * MINUTO;
const VALIDADE_LINK = 7 * 24 * HORA;
const VALIDADE_RECENTES = 20 * MINUTO; // a mesma de site/js/estado.js
const ESPERA = 15 * MINUTO, TENTATIVAS_CONTA = 5, TENTATIVAS_IP = 20;
const LINK_INVALIDO = 'link-invalido';
const MENSAGENS_POR_HORA = 5, MENSAGENS_GUARDADAS = 500;

const hex = (bytes) => [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, '0')).join('');
const resumo = async (texto) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
/** Compara dois resumos sem parar na primeira diferença. */
const iguais = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function novaChave(chave) {
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { sal, hash: await resumo(`${sal}:${chave}`), versao: crypto.randomUUID(), em: new Date().toISOString() };
}

export class Armazem {
  constructor(estado) { this.g = estado.storage; }

  async fetch(pedido) {
    const { op, ...dados } = await pedido.json();
    if (!OPERACOES.includes(op)) return Response.json({ erro: 'operação desconhecida' }, { status: 400 });
    return Response.json(await this[op](dados));
  }

  async criarLink({ id, token, por }) {
    const antigo = await this.g.get(`link-de:${id}`);
    if (antigo) await this.g.delete(`link:${antigo}`);
    const h = await resumo(token), expira = Date.now() + VALIDADE_LINK;
    await this.g.put({ [`link:${h}`]: { id, expira, por }, [`link-de:${id}`]: h });
    return { expira };
  }

  async linkValido(token) {
    const h = await resumo(token), l = await this.g.get(`link:${h}`);
    return l && l.expira > Date.now() ? { h, ...l } : null;
  }

  async verLink({ token }) {
    const l = await this.linkValido(token);
    return l ? { id: l.id, nova: !await this.g.get(`conta:${l.id}`) } : { erro: LINK_INVALIDO };
  }

  /** Escolher a palavra-passe com um link: serve uma só vez, e as sessões antigas dessa conta deixam de valer. */
  async definir({ token, chave }) {
    const l = await this.linkValido(token);
    if (!l) return { erro: LINK_INVALIDO };
    const conta = await novaChave(chave);
    await this.g.put(`conta:${l.id}`, conta);
    await this.g.delete([`link:${l.h}`, `link-de:${l.id}`, `falhas:${l.id}`]);
    return { id: l.id, versao: conta.versao };
  }

  async entrar({ utilizador, existe, chave, ip }) {
    const agora = Date.now();
    const contadores = [[`falhas:${utilizador}`, TENTATIVAS_CONTA], [`falhas-ip:${await resumo(ip || '?')}`, TENTATIVAS_IP]];
    const lidos = await Promise.all(contadores.map(([k]) => this.g.get(k)));
    const parado = lidos.find((f) => f?.ate > agora);
    if (parado) return { erro: 'bloqueado', minutos: Math.ceil((parado.ate - agora) / MINUTO) };
    const conta = existe ? await this.g.get(`conta:${utilizador}`) : null;
    if (conta && iguais(await resumo(`${conta.sal}:${chave}`), conta.hash)) {
      await this.g.delete(contadores[0][0]);
      return { versao: conta.versao };
    }
    await Promise.all(contadores.map(([k, limite], i) => {
      const n = lidos[i] && agora - lidos[i].desde < HORA ? lidos[i].n + 1 : 1;
      return this.g.put(k, { n: n >= limite ? 0 : n, desde: n === 1 ? agora : lidos[i].desde, ate: n >= limite ? agora + ESPERA : 0 });
    }));
    return { erro: 'errada' };
  }

  async versao({ id }) { return { versao: (await this.g.get(`conta:${id}`))?.versao || null }; }

  async mudar({ id, atual, nova }) {
    const conta = await this.g.get(`conta:${id}`);
    if (!conta || !iguais(await resumo(`${conta.sal}:${atual}`), conta.hash)) return { erro: 'errada' };
    const nova_ = await novaChave(nova);
    await this.g.put(`conta:${id}`, nova_);
    return { versao: nova_.versao };
  }

  /** Quem já tem palavra-passe e quem tem um link por usar (para a página Contribuidores). */
  async estado() {
    const agora = Date.now(), contas = {}, links = {};
    for (const [k, c] of await this.g.list({ prefix: 'conta:' })) contas[k.slice(6)] = c.em;
    for (const [, l] of await this.g.list({ prefix: 'link:' })) if (l.expira > agora) links[l.id] = l.expira;
    return { contas, links };
  }

  async guardarMensagem({ nome, contacto, texto, ip }) {
    const agora = Date.now(), k = `msg-ip:${await resumo(ip || '?')}`, c = await this.g.get(k);
    const n = c && agora - c.desde < HORA ? c.n + 1 : 1;
    if (n > MENSAGENS_POR_HORA) return { erro: 'muitas' };
    const id = `${String(agora).padStart(15, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    await this.g.put({ [k]: { n, desde: n === 1 ? agora : c.desde }, [`msg:${id}`]: { id, nome, contacto, texto, em: new Date(agora).toISOString(), lida: false } });
    const velhas = [...(await this.g.list({ prefix: 'msg:' })).keys()].slice(0, -MENSAGENS_GUARDADAS);
    const contadores = [...await this.g.list({ prefix: 'msg-ip:' })].filter(([, v]) => agora - v.desde >= HORA).map(([chave]) => chave);
    const fora = [...velhas, ...contadores].slice(0, 128); // a Cloudflare apaga até 128 chaves de cada vez
    if (fora.length) await this.g.delete(fora);
    return { ok: true };
  }

  async mensagens() {
    return { mensagens: [...(await this.g.list({ prefix: 'msg:' })).values()].reverse() };
  }

  async marcarMensagem({ id, lida }) {
    const k = `msg:${id}`, m = await this.g.get(k);
    if (m) await this.g.put(k, { ...m, lida });
    return { ok: true };
  }

  async apagarMensagem({ id }) {
    await this.g.delete(`msg:${id}`);
    return { ok: true };
  }

  async guardarRecentes({ itens, em }) {
    await this.g.put(Object.fromEntries(itens.map(({ caminho, conteudo }) => [`recente:${caminho}`, { caminho, conteudo, em }])));
    return { ok: true };
  }

  async recentes() {
    const agora = Date.now(), recentes = [], velhas = [];
    for (const [k, r] of await this.g.list({ prefix: 'recente:' })) {
      if (agora - Date.parse(r.em) < VALIDADE_RECENTES) recentes.push(r); else velhas.push(k);
    }
    if (velhas.length) await this.g.delete(velhas.slice(0, 100));
    return { recentes: recentes.sort((a, b) => a.em.localeCompare(b.em)) };
  }
}

const OPERACOES = ['criarLink', 'verLink', 'definir', 'entrar', 'versao', 'mudar', 'estado', 'guardarRecentes', 'recentes',
  'guardarMensagem', 'mensagens', 'marcarMensagem', 'apagarMensagem'];

/** Pede uma operação ao armazém (ao Durable Object, a partir do Worker). */
export async function armazem(env, op, dados = {}) {
  const r = await env.ARMAZEM.get(env.ARMAZEM.idFromName('arquivo')).fetch('https://armazem/', {
    method: 'POST', body: JSON.stringify({ op, ...dados }),
  });
  if (!r.ok) throw new Error(`armazém: ${r.status}`);
  return r.json();
}
