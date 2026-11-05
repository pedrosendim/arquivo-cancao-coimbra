// Mensagens de quem visita o site (página Contacto): ficam só no armazém, fora do repositório público, e só os
// administradores as leem. Qualquer pessoa pode enviar: por isso há limites (online/armazem.js) e um campo-isco para robôs.
import { ADMINS, armazem, exigirContribuidor, json, mesmaOrigem } from '../comum.js';

const FORA = 'Pedido recusado: só o próprio site pode fazer isto.';
const INDISPONIVEL = 'As mensagens ainda não estão disponíveis.';
const curto = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

export const enviar = { onRequestPost: async ({ request, env }) => {
  if (!env.ARMAZEM) return json({ erro: INDISPONIVEL }, 503);
  if (!mesmaOrigem(request)) return json({ erro: FORA }, 403);
  const d = await request.json().catch(() => ({}));
  if (curto(d.site, 200)) return json({ ok: true }); // o campo-isco só os robôs o preenchem: finge-se que correu bem
  const texto = curto(d.texto, 4000);
  if (texto.length < 5) return json({ erro: 'Escreva a sua mensagem.' }, 400);
  const r = await armazem(env, 'guardarMensagem', { nome: curto(d.nome, 120), contacto: curto(d.contacto, 200), texto, ip: request.headers.get('CF-Connecting-IP') });
  return r.erro ? json({ erro: 'Já enviou várias mensagens. Tente outra vez daqui a uma hora.' }, 429) : json({ ok: true });
} };

async function soAdmin(request, env) {
  if (!env.ARMAZEM) return { resposta: json({ erro: INDISPONIVEL }, 503) };
  const { c, erro } = await exigirContribuidor(request, env);
  if (erro) return { resposta: erro };
  return ADMINS.includes(c.papel) ? { c } : { resposta: json({ erro: 'Só os administradores veem as mensagens.' }, 403) };
}

export const lista = {
  onRequestGet: async ({ request, env }) => {
    const { resposta } = await soAdmin(request, env);
    return resposta || json(await armazem(env, 'mensagens'));
  },
  /** Marcar como lida ou por ler, e apagar. */
  onRequestPost: async ({ request, env }) => {
    if (!mesmaOrigem(request)) return json({ erro: FORA }, 403);
    const { resposta } = await soAdmin(request, env);
    if (resposta) return resposta;
    const { id, apagar, lida } = await request.json().catch(() => ({}));
    if (typeof id !== 'string' || !/^[0-9a-z-]{10,60}$/.test(id)) return json({ erro: 'Mensagem desconhecida.' }, 400);
    return json(await armazem(env, apagar ? 'apagarMensagem' : 'marcarMensagem', { id, lida: !!lida }));
  },
};
