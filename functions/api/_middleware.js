// Qualquer falha nas funções /api/* chega ao site como JSON com a mensagem, e não como uma página de erro.
import { json } from '../../online/comum.js';

export async function onRequest({ next }) {
  try {
    return await next();
  } catch (e) {
    return json({ erro: e.message || 'erro no servidor' }, 500);
  }
}
