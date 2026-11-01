// Ponto de entrada na Cloudflare (Worker com ficheiros estáticos, ver wrangler.jsonc):
// os pedidos a /api/* correm aqui; tudo o resto é o site publicado a partir de site/.
import { json } from './comum.js';
import * as entrar from './api/entrar.js';
import * as entrarGithub from './api/entrar-github.js';
import * as sair from './api/sair.js';
import * as sessao from './api/sessao.js';
import * as dados from './api/dados.js';
import * as gravar from './api/gravar.js';
import * as propostas from './api/propostas.js';
import * as decidir from './api/propostas-decidir.js';

const ROTAS = {
  '/api/entrar': entrar, '/api/entrar/github': entrarGithub, '/api/sair': sair, '/api/sessao': sessao, '/api/dados': dados,
  '/api/gravar': gravar, '/api/propostas': propostas, '/api/propostas/decidir': decidir,
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const modulo = ROTAS[pathname.replace(/\/+$/, '')];
    const tratar = modulo?.[{ GET: 'onRequestGet', POST: 'onRequestPost' }[request.method]];
    // rotas só da cópia local (pesquisa no arquivo, etc.): o site trata a falta como «sem arquivo»
    if (!tratar) return json({ erro: 'não disponível na versão online' }, 404);
    try {
      return await tratar({ request, env });
    } catch (e) { // qualquer falha chega ao site como JSON com a mensagem, e não como uma página de erro
      return json({ erro: e.message || 'erro no servidor' }, 500);
    }
  },
};
