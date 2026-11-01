# Arquivo da Canção de Coimbra

Um espaço único para estudar a Canção de Coimbra: pessoas, linhagens, cronologia, discografia, obras e letras,
instrumentos e luthiers, vídeos e imagens. Ligado sempre às fontes. **Não produz informação nova: organiza o que as fontes dizem.**

## Abrir

Duplo clique em **`iniciar.bat`** (ou `python scripts/servidor.py --abrir`) e o site abre em <http://localhost:8765>.
É preciso internet para os vídeos, as imagens dos blogues e as letras de tipo.

| Secção | O que tem |
|---|---|
| **Pessoas** | Fichas com excertos literais das fontes, factos com citação (clique nos números), relações, gravações, imagens, vídeos e posts que as referem |
| **Linhagens** | Rede interativa de família, ensino/escola e parcerias musicais |
| **Cronologia** | Todos os factos datados, por década, filtráveis por pessoa |
| **Discografia / Obras** | Discos e faixas com leitores; cada obra junta as interpretações para comparar em sequência |
| **Instrumentos** | Guitarras e violas, quem as construiu e quem as tocou |
| **Mediateca** | Mais de 1.300 vídeos e áudios e 14.000 imagens encontrados nos blogues, pesquisáveis pelo texto à volta |
| **Arquivo** | Pesquisa de texto integral nos 8.397 posts e 833 comentários, com leitor limpo |
| **Fontes e método** | Fontes aprovadas e propostas, regras e estado da validação |
| **Blogue** | Textos assinados por quem contribui (novidades, pedidos de ajuda, memórias); ligam às fichas, mas não são fonte |
| **Contribuidores** | Quem ajuda, por convite, e o que cada um fez; **Como contribuir** é o guia para quem não é programador |

Atalhos: `Ctrl+K` ou `/` abre a pesquisa rápida. O leitor em baixo continua a tocar enquanto navega e tem fila de audição.
Num post do arquivo, selecione texto para o **copiar como citação** pronta a usar numa ficha.

## Investigar (com o Claude Code)

- `/investigar Flávio Rodrigues da Silva`: o agente lê o arquivo, cria a ficha com citações e o validador confirma cada uma.
- `/investigar Balada da Despedida; António Brojo`: vários temas em paralelo.
- `/atualizar-arquivo`: vai buscar os posts novos (o blogue V continua ativo).

As fichas do agente ficam como **rascunho**. Depois de as rever, marque-as como revistas no **Modo de edição**.

## Modo de edição

No fundo do menu, **Modo de edição** liga os botões e formulários de edição, sem mexer em ficheiros:
- nas fichas: escolher o retrato, esconder ou acrescentar fotografias, acrescentar parentescos e parcerias, nota do editor, notas sobre factos com dúvidas, marcar como revista;
- em **Fontes e método**: aprovar, confirmar, rejeitar e propor fontes;
- no **Blogue**: escrever, publicar e apagar textos;
- em **Contribuidores**: convidar pessoas e definir o papel de cada uma (editor ou contribuidor).

Tudo o que se acrescenta sem fonte fica assinado e marcado com ✎. Cada gravação é validada e o site atualiza-se logo.
Se a alteração criar erros, nada é gravado.

## Fontes

```bash
python scripts/fontes.py listar --estado pendente     # propostas à espera de decisão (também no Modo de edição)
python scripts/fontes.py aprovar musicbrainz
python scripts/fontes.py rejeitar discogs "motivo"
```

O agente só usa fontes **aprovadas**. Quando encontra uma fonte nova (um livro, um jornal, um site), regista-a como proposta.

O RTP Arquivos recusa acesso automático, por isso os seus vídeos entram pelo URL (ligações nos blogues ou introduzidas por si) e
abrem no site da RTP. Para arquivar uma página que só abre no browser: guarde-a (Ctrl+S) e corra
`python scripts/guardar_pagina.py URL --fonte rtp-arquivos --ficheiro pagina.html`.

## Estrutura

```
fontes/fontes.json   registo de fontes
arquivo/             cópia local dos blogues + índice de pesquisa (privado: não publicar)
dados/               fichas curadas, uma por ficheiro (formato em dados/ESQUEMA.md)
scripts/             recolha, índice, pesquisa, validação, construção, servidor (Python, sem instalar nada)
site/                o site (HTML/CSS/JS)
```

## Versão online

O site publica-se de graça na Cloudflare, a partir do repositório público no GitHub. A cópia dos blogues (`arquivo/`)
nunca vai para lá: online não há a pesquisa nos blogues nem a leitura dos posts arquivados, e as citações levam ao post original.

- **Visitantes:** leem tudo, sem conta.
- **Contribuidores convidados:** carregam em **Entrar**, usam a conta do GitHub e ligam o **Modo de edição**.
  O que alteram fica como proposta, que um editor aprova na página **Propostas**. O que os editores alteram fica publicado logo.
- Em cada proposta, o GitHub corre o `validar.py`. A Cloudflare reconstrói o site depois de cada aprovação, em 1 a 2 minutos.
- As palavras-passe só se escrevem no GitHub. As chaves do site ficam como segredos na Cloudflare e não estão no código.

Configuração da Cloudflare (Workers & Pages › Worker `arquivo`, ligado ao repositório; ver `wrangler.jsonc`):
- Build command `python3 scripts/construir.py`, Deploy command `npx wrangler deploy`;
- segredos (tipo «Secret») `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET` (aplicação OAuth do GitHub, com o endereço de
  regresso `<endereço do site>/api/entrar/github`) e `GITHUB_TOKEN` (token *fine-grained* do dono, só para este
  repositório: Contents e Pull requests em leitura e escrita, Checks em leitura). O token expira: quando o renovar,
  substitua o segredo.

## Direitos

Os textos e imagens dos blogues pertencem aos seus autores. O `arquivo/` é uma cópia privada para estudo.
Se um dia publicar o site, publique só `site/` com as fichas (citações curtas com ligação ao original) e não o `arquivo/`.
