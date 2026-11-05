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
| **Por validar** | Lista de trabalho de quem edita: fichas que parecem repetidas (juntar ou marcar como diferentes), fichas que misturam duas pessoas (separar), divergências por comentar, fontes propostas, fichas e testemunhos por rever |
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

Do RTP Arquivos guarda-se só a ficha descritiva de cada programa (título, data, personalidades, resumo); o vídeo ou o
áudio abre sempre no site da RTP. A recolha respeita o robots.txt e para ao primeiro pedido recusado:

```bash
python scripts/rtp_arquivos.py pesquisar --temas --pessoas-do-arquivo   # pesquisa do site: temas e cada músico do arquivo
python scripts/indexar.py --paginas
python scripts/rtp_catalogar.py --simular                               # o que é da Canção de Coimbra, e quem se liga
python scripts/rtp_catalogar.py                                         # cria dados/media/rtp-*.json (rascunho)
```

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
- **Contribuidores convidados:** um administrador regista a pessoa em **Contribuidores** e envia-lhe um link de acesso; com ele, a pessoa escolhe a palavra-passe. Quem preferir pode entrar com o GitHub. Depois, ligam o **Modo de edição**.
  O que alteram fica como proposta, que um editor aprova na página **Propostas**. O que os editores alteram fica publicado logo.
- Em cada proposta, o GitHub corre o `validar.py`. A Cloudflare reconstrói o site depois de cada aprovação, em poucos minutos; entretanto, o armazém (`online/armazem.js`) entrega as fichas novas a todos os visitantes, por isso uma alteração vê-se logo.
- As palavras-passe nunca saem do browser: o site guarda só um resumo de uma chave derivada delas, no armazém da Cloudflare, fora do repositório. As chaves do site ficam como segredos na Cloudflare e não estão no código.
- Voltar atrás: os editores repõem qualquer versão de uma ficha no **Histórico** e desfazem uma alteração inteira em **Alterações recentes**. Todas as versões ficam guardadas no GitHub.

Configuração da Cloudflare (Workers & Pages › Worker `arquivo-cancao-coimbra`, ligado ao repositório; ver `wrangler.jsonc`):
- Build command `python3 scripts/construir.py`, Deploy command `npx wrangler deploy`;
- segredos (tipo «Secret») `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET` (aplicação OAuth do GitHub, com o endereço de
  regresso `<endereço do site>/api/entrar/github`) e `GITHUB_TOKEN` (token *fine-grained* do dono, só para este
  repositório: Contents e Pull requests em leitura e escrita; a validação lê-se sem permissão porque o repositório é público). O token expira: quando o renovar,
  substitua o segredo.

## Direitos

Os textos e imagens dos blogues pertencem aos seus autores. O `arquivo/` é uma cópia privada para estudo.
Se um dia publicar o site, publique só `site/` com as fichas (citações curtas com ligação ao original) e não o `arquivo/`.
