# Arquivo da Canção de Coimbra

Ferramenta de estudo pessoal que **organiza** a informação sobre a Canção/Fado de Coimbra: pessoas, linhagens, gravações, obras e letras, instrumentos e luthiers, vídeos e imagens. Ponto de partida: os blogues *Guitarra de Coimbra* I–V (Octávio Sérgio, António Manuel Nunes e colaboradores).

Comunicar com o utilizador em **português europeu**.

## Princípios (não negociáveis)

- **Não produzir informação nova.** O site só arruma o que as fontes dizem. Nada de resumos escritos pela IA, deduções ou conhecimento próprio do modelo.
- **Só fontes aprovadas** (`fontes/fontes.json`, estado `aprovada`) pelo utilizador (o fundador do arquivo), por um administrador ou por um editor (`dados/contribuidores.json`). Fontes novas são *propostas* (`scripts/fontes.py propor`; um contribuidor que cita um site novo também o propõe, e a citação fica «pendente» até à decisão). A IA nunca aprova.
- **Cada afirmação tem citação literal** verificável no arquivo local; o `scripts/validar.py` tem de passar sem erros.
- **Divergências entre fontes ficam visíveis** (`"conflito": true`), sem escolher versão.
- Fichas escritas pela IA ficam `"estado_revisao": "rascunho"`; só o dono ou um editor marcam `revisto`.
- **Contribuições humanas ficam assinadas** (✎: quem, quando, porquê) e nunca são fonte, tal como o blogue (`dados/blogue/`). A IA não as cria em nome de ninguém nem as altera. Ver «Contribuições humanas» em `dados/ESQUEMA.md`.
- Media: reproduzir apenas pelos leitores oficiais (YouTube, Spotify, Vimeo, Blogger, SoundCloud, Internet Archive, MuseScore) ou ligar ao site original. Não descarregar nem voltar a alojar vídeos/áudio. RTP Arquivos: recolher só as fichas descritivas (`scripts/rtp_arquivos.py`, pelo sitemap e pela pesquisa do site); o vídeo abre no site da RTP. Discogs: só pela API (`scripts/discogs.py`), o site tem proteção anti-robô. Nunca contornar bloqueios.
- Orientações de pesquisa atualizadas (grupos, fotografias, luthiers, discografia, fontes por «pedido geral»): ver o fim de `dados/ESQUEMA.md`.

## Estrutura

```
fontes/fontes.json     registo de fontes (aprovada | pendente | rejeitada)
arquivo/               cópia local das fontes (blogger/, web/) + indice.sqlite. Privado: não publicar.
dados/<tipo>/<id>.json fichas curadas: pessoas, instrumentos, gravacoes, obras, media (ver dados/ESQUEMA.md)
dados/contribuidores.json  contribuidores convidados (dono = fundador | administrador | editor | contribuidor | antigo)
dados/blogue/<id>.json textos assinados do blogue (não são fonte)
site/js/icones.js      ícones dos atributos das pessoas (guitarra, viola, cantor, pena, nota…)
scripts/               recolha, índice, pesquisa, validação, construção, servidor (só biblioteca padrão do Python)
site/                  site estático (HTML/CSS/JS sem build); site/dados/base.json é gerado
online/, wrangler.jsonc  versão online (Cloudflare Worker + ficheiros estáticos + armazém Durable Object): entrar com conta própria ou com o GitHub, propostas (pull requests), repor versões, alterações imediatas
.github/workflows/     validar.py em cada proposta e publicação
dados/verificacao.json, dados/estado_media.json  gerados pelo construir.py local; a versão online (sem arquivo/) usa-os
.claude/agents/investigador-coimbra.md   agente de investigação
.claude/skills/        /investigar <tema>, /atualizar-arquivo
```

## Comandos

```bash
python scripts/servidor.py --abrir         # site em http://localhost:8765 (com o «Modo de edição» do dono)
python scripts/recolher_blogger.py         # recolher blogues aprovados (feed oficial do Blogger)
python scripts/indexar.py                  # reconstruir índice de pesquisa + media (--paginas: só páginas novas)
python scripts/rtp_arquivos.py sitemap|procurar|recolher|pessoa|pesquisar   # fichas do RTP Arquivos
python scripts/rtp_catalogar.py [--simular]  # fichas da RTP da Canção de Coimbra → dados/media/rtp-*.json
python scripts/spotify.py guardar|testar      # chave da API do Spotify, só neste computador (fora do projeto)
python scripts/discogs.py procurar|artista|lancamento|master       # discografia pela API do Discogs
python scripts/verificar_media.py          # marca vídeos YouTube/Blogger que já não tocam
python scripts/pesquisar.py '"Nome"'       # pesquisar o arquivo
python scripts/ler_post.py <doc_id|url>    # ler um documento arquivado
python scripts/validar.py                  # validar fichas e citações
python scripts/construir.py                # gerar site/dados/base.json
python scripts/fontes.py listar|aprovar|rejeitar|propor
```

## Publicação online

- Repositório público `pedrosendim/arquivo-cancao-coimbra` (sem `arquivo/` nem `site/dados/base.json`); a Cloudflare constrói e publica a cada alteração no ramo `main`.
- Antes de trabalhar nos dados: `git pull` (traz as propostas aprovadas online). Depois: `construir.py` (atualiza `dados/verificacao.json`) e, só quando o utilizador pedir, commit e push. O push publica.
- As mensagens da página Contacto ficam só no armazém da Cloudflare (`online/armazem.js`), fora do repositório, e só os administradores as leem (página Mensagens).
- A área reservada é um só botão no fim do menu (`site/js/vistas/reservada.js`): sem sessão mostra o ecrã de entrar; com sessão, os separadores Por validar (questões da IA), Propostas (sugestões de pessoas), Alterações recentes, Mensagens, Contribuidores e A minha conta. O modo de edição só aparece a quem tem acesso.
- No site online, os contribuidores entram com uma conta própria (link de acesso criado por um administrador, palavra-passe guardada só como resumo no armazém da Cloudflare) ou com o GitHub; as alterações deles são propostas que um editor aprova (página Propostas). Quem contribui nunca precisa do GitHub: é o site que lá grava, com a chave dele.

## Convenções de código

- Python só com a biblioteca padrão. A exceção é a parte online (`online/`), em JavaScript, porque corre na Cloudflare. Scripts pequenos com docstring de uso no topo; utilidades comuns em `scripts/comum.py`.
- Site em módulos ES sem build. Gerar HTML com o modelo `html\`\`` de `site/js/util.js` (escapa tudo por omissão; `raw()` só para HTML já seguro). Bibliotecas externas só por CDN com versão fixa (Cytoscape em cdnjs).
- Nomes de variáveis, funções e textos de interface em português.
- O HTML dos posts arquivados passa sempre por `limpar()` (`site/js/vistas/arquivo.js`) antes de ser mostrado.
