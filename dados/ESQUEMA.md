# Esquema dos dados

Cada entidade é um ficheiro JSON próprio (o nome do ficheiro é o `id`):

```
dados/pessoas/<id>.json        pessoas e agrupamentos
dados/instrumentos/<id>.json   guitarras, violas, etc.
dados/gravacoes/<id>.json      discos, gravações de rádio/TV, registos inéditos
dados/obras/<id>.json          peças musicais (fados, baladas, guitarradas…) e letras
dados/media/<id>.json          vídeos, áudios e imagens curados
```

`id` = nome em minúsculas, sem acentos, com hífens (`artur-paredes`). Homónimos: acrescentar o ano de nascimento (`joao-silva-1910`).

## Regra de ouro: nada sem citação

Este arquivo **não produz informação nova**. Só organiza o que dizem as fontes aprovadas.
Todo o facto, relação, excerto biográfico ou letra leva uma **Citação**:

```json
{
  "fonte": "gc-v",
  "url": "https://guitarradecoimbra4.blogspot.com/2020/05/exemplo.html",
  "doc": "gc-v:1234567890123456789",
  "citacao": "texto copiado literalmente da fonte, sem alterar uma vírgula"
}
```

- `fonte`: um `id` de `fontes/fontes.json` com estado `aprovada`.
- `doc`: o identificador no arquivo local (aparece no `pesquisar.py` / `ler_post.py`).
- `citacao`: cópia **literal** (pode omitir troços com `...`). O `validar.py` confirma que o texto existe no documento arquivado. Se não existir, é erro, e a mensagem diz até onde a frase bate.
  As aspas e os espaços à volta da frase (ou de cada troço) não contam na comparação; a frase fica guardada como foi escrita.
  Uma «citação» sem palavras (só aspas, reticências ou pontuação, por exemplo `«»`) é erro, como uma citação em falta.
- `url`: o endereço do documento. Encontra-se o mesmo documento arquivado com o endereço copiado no telemóvel (`?m=1`), com `#…`, com `utm_…` ou no domínio do país (`.blogspot.pt`); um comentário reconhece-se pelo `#c<número>` (com ou sem `?showComment=…`) e nunca se confunde com o post: se o comentário não estiver arquivado, a citação fica por verificar.
- Todos os endereços começam por `http://` ou `https://` (citações, `imagens[].url`, `capa.url`, `ligacoes`, `media.url`, `media.miniatura`, `url` das fontes); outro endereço (`javascript:`, `data:`…) é erro.
- Páginas fora dos blogues: arquivar primeiro com `guardar_pagina.py`, para a citação ser verificável.

## Facto

```json
{
  "campo": "nascimento",
  "valor": "Coimbra, 1899",
  "data": "1899",
  "local": "Coimbra",
  "fontes": [ { "...Citação..." } ],
  "conflito": false,
  "nota": ""
}
```

- `campo`: `nome_completo`, `nascimento`, `morte`, `naturalidade`, `formacao`, `profissao`, `atividade`, `estreia`, `gravacao`, `atuacao`, `premio`, `homenagem`, `ensino`, `instrumento`, `afinacao`, `residencia`, `publicacao` (livros, artigos e notas de disco da pessoa: a bibliografia), `outro`.
- `valor`: forma curta e fiel do que a fonte diz. A citação é a prova.
- `data`: só no formato `AAAA`, `AAAA-MM` ou `AAAA-MM-DD`. Datas aproximadas ficam só em `valor` (ex.: "c. 1920").
- **Fontes que divergem**: criar um facto por versão, todos com o mesmo `campo` e `"conflito": true`. Nunca escolher uma versão.

## Pessoa (`dados/pessoas/<id>.json`)

```json
{
  "id": "artur-paredes",
  "tipo": "pessoa",
  "nome": "Artur Paredes",
  "nomes_alternativos": [],
  "papeis": ["guitarrista", "compositor"],
  "biografia": [ { "...Citação: excertos biográficos literais, por ordem cronológica..." } ],
  "factos": [ { "...Facto..." } ],
  "relacoes": [
    { "tipo": "aluno_de", "alvo": "flavio-rodrigues-da-silva", "fontes": [ { "...Citação..." } ], "nota": "" }
  ],
  "imagens": [ { "url": "https://…", "legenda": "texto da fonte", "fontes": [ { "...Citação ou só fonte+url+doc..." } ] } ],
  "ligacoes": [ { "rotulo": "Post de homenagem", "url": "https://…" } ],
  "estado_revisao": "rascunho"
}
```

- `tipo`: `pessoa` | `grupo`.
- `papeis`: `guitarrista`, `violista`, `cantor`, `compositor`, `letrista`, `poeta`, `luthier`, `investigador`, `colecionador`, `editor`, `professor`, `agrupamento`, `outro`.
- `relacoes.tipo` (guarda-se só num sentido, o site mostra o inverso):
  - família: `filho_de`, `irmao_de`, `conjuge_de`, `neto_de`, `sobrinho_de`, `primo_de`
  - ensino/escola: `aluno_de`, `influenciado_por`
  - música: `tocou_com`, `acompanhou`, `membro_de`
- `estado_revisao`: o agente escreve sempre `rascunho`. Só o utilizador muda para `revisto`.

## Instrumento (`dados/instrumentos/<id>.json`)

```json
{
  "id": "guitarra-artur-paredes-1",
  "designacao": "Guitarra de Coimbra usada por Artur Paredes",
  "tipo": "guitarra de Coimbra",
  "construtor": "id-do-luthier",
  "ano": "1930",
  "proprietarios": [ { "pessoa": "artur-paredes", "periodo": "", "fontes": [] } ],
  "factos": [],
  "imagens": [],
  "fontes": [],
  "estado_revisao": "rascunho"
}
```

## Gravação (`dados/gravacoes/<id>.json`)

```json
{
  "id": "…",
  "titulo": "…",
  "formato": "cilindro | disco de massa | 78rpm | EP | LP | single | CD | cassete | radio | televisao | inedito | digital",
  "editora": "", "referencia": "", "ano": "AAAA", "local": "",
  "interpretes": [ { "pessoa": "id", "funcao": "guitarra" } ],
  "faixas": [ { "n": 1, "titulo": "…", "obra": "id-da-obra", "media": ["id-do-media"] } ],
  "capa": { "url": "", "fontes": [] },
  "ligacoes": { "spotify": "", "youtube": "", "discogs": "", "musicbrainz": "" },
  "factos": [], "fontes": [],
  "estado_revisao": "rascunho"
}
```

## Obra (`dados/obras/<id>.json`)

```json
{
  "id": "balada-de-coimbra",
  "titulo": "…", "titulos_alternativos": [],
  "genero": "fado | balada | cancao | serenata | guitarrada | variacoes | estudo | outro",
  "musica": ["id-pessoa"], "letra": ["id-pessoa"], "ano": "",
  "letra_texto": { "...Citação com a letra completa, copiada literalmente..." },
  "factos": [], "fontes": [],
  "estado_revisao": "rascunho"
}
```

## Media (`dados/media/<id>.json`)

```json
{
  "id": "…",
  "tipo": "video | audio | imagem | partitura",
  "plataforma": "youtube | vimeo | spotify | apple-music | soundcloud | museu-do-fado | rtp-arquivos | rtp-play | blogger | internet-archive | musescore | facebook | dailymotion | ficheiro | outro",
  "url": "https://…",
  "titulo": "…", "data": "AAAA[-MM[-DD]]",
  "pessoas": ["id"], "obras": ["id"], "gravacao": "",
  "fontes": [ { "...Citação (o post que publica/descreve o media)..." } ],
  "estado_revisao": "rascunho"
}
```

Os vídeos e imagens **embutidos nos blogues** já ficam catalogados automaticamente pelo `indexar.py` (tabela `media` do índice). Só se cria um ficheiro em `dados/media/` quando se identifica com segurança, a partir da fonte, quem toca, o quê e quando.

- A plataforma é só um rótulo: o site reconhece-a pelo endereço.
- O mesmo vídeo ou faixa (o mesmo endereço) tem uma só ficha. Noutra edição do mesmo registo, a faixa usa o id dessa ficha em `faixas[].media`.
- Um media retirado do catálogo por um editor fica em `dados/excluidos.json` (ver «Contribuições humanas») e não se volta a criar.

---

## Orientações de pesquisa (atualização de 28-10-2026, decididas pelo utilizador)

Estas orientações prevalecem sobre regras anteriores que digam o contrário.

### Ferramentas novas

```bash
python scripts/rtp_arquivos.py procurar coimbra guitarra        # conteúdos do RTP Arquivos (pelo endereço)
python scripts/rtp_arquivos.py procurar --pessoas paredes       # páginas de personalidades
python scripts/rtp_arquivos.py recolher --termos "coimbra fado"  # arquiva fichas: título, data, personalidades, resumo
python scripts/rtp_arquivos.py pessoa carlos-paredes            # todos os conteúdos de uma personalidade
python scripts/rtp_arquivos.py pesquisar --temas --pessoas-do-arquivo   # pesquisa do site (temas + cada músico)
python scripts/rtp_catalogar.py --simular                       # fichas da RTP da Canção de Coimbra → dados/media
python scripts/discogs.py procurar "Quinteto de Coimbra" --tipo artist
python scripts/discogs.py artista 1234567 --discografia         # perfil, MEMBROS de grupos, lista de edições
python scripts/discogs.py lancamento 7654321                    # editora, nº de catálogo, faixas, créditos, vídeos
python scripts/indexar.py --paginas                           # depois de arquivar (incremental; nunca o índice completo)
python scripts/fontes.py propor ... --pedido-geral "fotografias" # site sério novo para grupos/fotos/luthiers/discografia
```

### RTP Arquivos

É acessível. O robots.txt permite o acesso, e a recolha faz-se pelo sitemap público e pela pesquisa do site (que procura também nas descrições) com `rtp_arquivos.py`. Guarda-se só a ficha descritiva; o vídeo vê-se no site da RTP. As fichas arquivadas podem ser citadas (ex.: «Personalidades: Carlos Paredes»). Cada ficha aparece também automaticamente na mediateca local.

As páginas de personalidade da RTP são incompletas (a de José Afonso tem 13 conteúdos); por isso pesquisa-se cada nome: `rtp_arquivos.py pesquisar --temas --pessoas-do-arquivo`. Um nome muito comum (mais de 15 páginas de resultados) pesquisa-se só com «coimbra».

`rtp_catalogar.py` passa a `dados/media/rtp-*.json` (rascunho) as fichas da Canção de Coimbra (decisão do utilizador, 02-11-2026: incluir toda a informação da RTP sobre a Canção de Coimbra, entrevistas incluídas):
- conta como Canção de Coimbra uma ficha que fale de canção/fado/guitarra/balada de Coimbra ou de fado académico; serenatas, orfeões, tunas, estudantinas, grupos de fados, tricanas e baladeiros só quando a ficha fala de Coimbra perto (até 80 caracteres, na mesma linha) ou no título (afinado a 03-11-2026: ficaram de fora as «Tricanas da Beira Mar» de Aveiro, Pedro Barroso «baladeiro» e as tunas de Lisboa num debate sobre o ensino superior);
- num programa de fado de Lisboa, «X na guitarra portuguesa de Coimbra» diz só o instrumento e, sozinho, não conta; «musicólogo» não faz de uma ficha uma ficha de música;
- conta também uma ficha de música sobre um músico do arquivo (nome no título ou na descrição) que a RTP associa à Canção de Coimbra noutra ficha (ex.: concertos e entrevistas de José Afonso); Duarte Silva e Avelino Baptista ficam de fora deste alargamento;
- as pessoas ligam-se pelo campo «Personalidades» ou pelo nome completo no título, e só quando o nome é de uma única pessoa do arquivo (contando os nomes alternativos). Um nome alternativo de duas palavras só serve com o mesmo apelido do nome principal («Zeca Afonso» sim; «António Sérgio», de Sérgio Azevedo, não, porque na RTP é outra pessoa). Nomes partilhados ficam por ligar e saem no relatório, para quem edita decidir;
- nunca altera fichas que já existem; correr de novo só acrescenta as novas;
- nunca volta a criar o que um editor retirou do catálogo (`dados/excluidos.json`), mesmo com o endereço escrito de outra forma.

### Discogs

O site está protegido contra robôs e não se usa. Usa-se só a API (`discogs.py`). Uma ficha em `dados/gravacoes/` por edição (editora + nº de catálogo). As linhas «Vídeo: …» de um lançamento podem tornar-se media da faixa.

### Pesquisa na internet

O utilizador pediu expressamente pesquisa na internet sobre **grupos, fotografias de pessoas, luthiers e discografia** (incluindo Spotify e YouTube para ouvir).

- `WebSearch`/`WebFetch` servem para descobrir. O resumo de um motor de busca nunca é fonte: a página tem de ser arquivada (`guardar_pagina.py`) e citada.
- Um site sério que ainda não está registado (instituições, imprensa, sites oficiais de artistas, associações ou luthiers, bases discográficas, Wikimedia) regista-se com `fontes.py propor ... --pedido-geral "<para quê>"`. Fica aprovado provisoriamente; o utilizador confirma depois.
- Nunca servem como fonte de factos: redes sociais, fóruns, sites de letras sem autoria, lojas, páginas geradas automaticamente.
- Spotify e YouTube servem só para ouvir: `ligacoes.spotify`/`ligacoes.youtube` da gravação, ou ficha em `dados/media/` com a fonte `spotify`/`youtube`, sem factos.

### Grupos

- Ficha em `dados/pessoas/<id>.json` com `"tipo": "grupo"` e o papel `agrupamento`.
- Os membros ligam-se pela relação `membro_de`, guardada **na ficha da pessoa** e a apontar para o grupo. Formações de épocas diferentes vão para `nota`.
- Cada membro tem de existir em `dados/pessoas/`; se não existir, cria-se uma ficha mínima.

### Fotografias de pessoas

Cada ficha deve ter uma, se existir. A primeira imagem de `imagens` é o retrato. Só serve uma fotografia **cuja legenda ou texto identifique a pessoa**, com essa frase na `citacao`. Ordem de preferência:

1. Fotografias dos blogues com legenda (`pesquisar.py --media imagem "Nome"`).
2. Wikidata (propriedade P18) e Wikimedia Commons, pelas APIs oficiais:
   - `python scripts/wikimedia.py procurar "Nome"`: escolhe a entidade certa pela descrição (datas, profissão).
   - `python scripts/wikimedia.py retrato Q123`: arquiva a ficha da imagem e imprime o bloco pronto a pôr em `imagens`.
   - Depois corre `indexar.py --paginas`. Não uses `guardar_pagina.py` na Commons, porque o robots.txt bloqueia.
   - Prefere fotografias. Se a ficha mostrar que é uma pintura, escultura ou desenho (data recente, «Own work» de um artista), só serve na falta de fotografia, e com a legenda a dizê-lo.
3. Sites institucionais ou oficiais (aja.pt, Museu do Fado, RTP Arquivos…).
4. Outros sites sérios, registados com `--pedido-geral`.

Uma foto de grupo nunca é retrato individual, a não ser que a legenda indique quem é quem. Sem foto segura, não se põe nenhuma e a lacuna fica no relatório.

### Fichas de outros agentes

Para acrescentar algo a uma ficha que não criaste, relê-a imediatamente antes e altera-a com a ferramenta `Edit`, mexendo só no necessário. Nunca reescrevas por script ficheiros que já existem.

### Ouvir cada faixa (decisão do utilizador, 29-10-2026)

Cada faixa de cada gravação deve ter, sempre que exista, uma forma de a ouvir **naquela interpretação**: o mesmo intérprete e, de preferência, a mesma gravação.

Ordem de preferência:
1. **Arquivo Sonoro do Museu do Fado**: `python scripts/museu_fado.py procurar "Nome"` e `python scripts/museu_fado.py interprete <id>`, depois `indexar.py --paginas`. Cada registo tem editora e número (ex.: «Editora: Od.136.806»), por isso dá para ligar com rigor à edição certa. A citação é essa linha da ficha arquivada.
2. Vídeos e áudios dos blogues (`pesquisar.py --media youtube "título"`), quando o texto do post identifica a faixa e o intérprete.
3. As linhas «Vídeo:» do Discogs.
4. YouTube, Spotify, Apple Music e SoundCloud, encontrados com `WebSearch` e `allowed_domains`. O título da faixa e o intérprete têm de coincidir sem dúvida. São fontes só de media (`youtube`, `spotify`, `apple-music`, `soundcloud`), sem citação, e a `nota` diz «identificado pelo título na plataforma».

Cada ligação fica como ficha em `dados/media/`, com `gravacao`, `pessoas`, `obras` e, opcionalmente, `miniatura` (URL da capa ou da etiqueta). O id dessa ficha entra em `faixas[k].media` da gravação. Se a gravação não tiver `faixas`, acrescentam-se a partir do alinhamento arquivado (Discogs ou blogue), com citação na fonte da gravação. Faixas sem nenhuma ligação segura ficam sem `media`, e o relatório diz quais.

### Fontes que o utilizador quer e não quer

- **Estudiosos aprovados expressamente**, com tudo o que tenham escrito: Pedro Caldeira Cabral (fonte `pedro-caldeira-cabral`) e Jorge Cravo (`jorge-cravo`). Os textos deles online arquivam-se com `--fonte` respetiva; os reproduzidos nos blogues citam-se pelo blogue, com `nota` a indicar o autor.
- **Não incluir fontes de autores brasileiros** (decisão do utilizador; por isso foi rejeitado o artigo de Márcia Taborda sobre os Couceiro). Antes de propor uma fonte, confirma a nacionalidade do autor.

### Terminologia

O papel `violista` mostra-se no site como «Viola». Usa-se a terminologia das fontes de Coimbra: guitarra, viola.

---

## Contribuições humanas (decisão do utilizador, 30-10-2026)

O dono do arquivo convida pessoas para ajudar. Fazem-no no **Modo de edição** do site (botão no fundo do menu) e não mexem nos ficheiros.
O que um contribuidor sabe sem fonte entra **assinado** e marcado com ✎. Fica à vista e nunca passa por fonte.

### Contribuidores (`dados/contribuidores.json`)

```json
{ "contribuidores": [ { "id": "maria-silva", "nome": "Maria Silva", "github": "maria-silva", "papel": "editor", "desde": "2026-10-30", "apresentacao": "" } ] }
```

Os papéis:
- `dono`: o fundador (administrador). Há sempre um, e só ele muda os próprios dados e papel.
- `administrador`: convida pessoas e muda papéis (menos o do fundador); aprova como os editores.
- `editor`: aprova fontes e propostas e marca fichas como `revisto`. O que grava entra logo.
- `contribuidor`: propõe (cria e corrige fichas, acrescenta factos, fontes, fotografias, relações); um editor aprova.
- `antigo`: deixou de ter acesso, mas os contributos ficam com o seu nome.

### Assinatura

Uma assinatura é `{ "por": "<id do contribuidor>", "data": "AAAA-MM-DD", "nota": "porquê (opcional)" }`. Vai nestes campos:

- `relacoes[].editorial`: relação indicada por um contribuidor. Leva `"fontes": []`.
- `fontes[].acrescentada`: citação acrescentada por um contribuidor, que escolheu uma fonte aprovada e copiou a frase. Pode ter `referencia` (por exemplo «p. 45»). Se a página estiver arquivada, a citação é verificada como as outras; se não estiver, ou se foi acrescentada online e a cópia local ainda não a viu, fica por verificar (ver «Verificação das citações»).
- `editorial` no topo de uma ficha (de qualquer tipo): ficha criada no modo de edição. Só se pode apagar enquanto não tiver factos.
- `factos[].editorial`: **testemunho** de um contribuidor (o que sabe sem fonte), com `nota` a dizer como sabe. Leva `"fontes": []`.
  Nascimento e morte entram como factos (`campo`, `valor`, `data`, `local`); uma versão diferente de outra já registada fica com
  `"conflito": true` nas duas.
- `referencias[]` = `{ titulo, url, publicacao?, autor?, ano?, editorial }`: artigos e páginas onde a pessoa (ou a obra…) aparece.
  São leituras indicadas, **não fontes**, enquanto não forem citadas num facto.
- `distinta_de[]` = `{ id, por, data, nota? }`: fichas com o mesmo nome que são de pessoas (ou obras…) diferentes. Fica nas duas.
- `juntou[]` = `{ id, nome|titulo, por, data, nota? }`: fichas que eram a mesma pessoa (ou obra, ou disco) e foram juntadas a esta
  no modo de edição («Juntar»). O ficheiro da ficha juntada deixa de existir; tudo o que apontava para ela passa a apontar para esta,
  e o endereço antigo reencaminha. «Separar» faz o contrário: o que se escolhe passa para outra ficha, e ficam as duas com `distinta_de`.
- Fonte proposta ao citar: quando um contribuidor cita uma página de um site que ainda não está em `fontes/fontes.json`, o site
  regista-o como fonte `pendente` (com `proposta_por`). A citação fica à vista com «pendente» e o `validar.py` dá só um aviso,
  até um editor aprovar ou rejeitar a fonte.
- `imagens[].editorial`: fotografia acrescentada. Leva `origem`, a página onde a fotografia está publicada.
- `imagens[].escolhida`: quem escolheu esta imagem para retrato. O retrato é sempre a primeira imagem da lista.
- `imagens[].oculta`: imagem escondida, por exemplo por não ser a pessoa. Não aparece no site, mas continua no ficheiro.
- `factos[].nota_editorial` = `{ por, data, texto }`: nota sobre um facto, sobretudo nos casos de divergência entre fontes.
- `nota_editor` com `nota_editor_por`/`nota_editor_em`. As notas sem `_por` são do dono.
- Notas assinadas em lista (as novas): `notas_editor[]` no topo de uma ficha (de qualquer tipo) e `factos[].notas_editoriais[]`,
  cada uma `{ por, data, texto }`. Uma nota nova acrescenta-se à lista, sem mexer nas dos outros; cada autor edita ou retira só as
  suas. Um editor pode esconder a de outra pessoa sem a reescrever: `oculta` = a assinatura dele, `{ por, data, nota }` (o motivo).
  As notas antigas (`nota_editor`, `factos[].nota_editorial`) ficam como estão e continuam a mostrar-se; não se convertem.
- `revisto_por`/`revisto_em` (com `"estado_revisao": "revisto"`), em qualquer tipo de ficha.
- Em `fontes/fontes.json`: `proposta_por`/`proposta_em` e `decidido_por`. Rejeitar uma fonte que já foi citada não pára a
  publicação: o `validar.py` dá um aviso em cada citação dela, e o site mostra-as como «fonte rejeitada», sem servirem de prova,
  até alguém as retirar ou trocar por outra fonte.
- `dados/excluidos.json` = `{ "media": [ { "url", "motivo", "por", "em" } ] }` (`em` = AAAA-MM-DD): vídeos e áudios que um editor
  retirou do catálogo («Retirar do catálogo», por exemplo um que um script catalogou por engano). A ficha de media apaga-se e o
  endereço fica aqui, assinado. Os scripts de catálogo (`rtp_catalogar.py`) nunca o voltam a criar, e o `validar.py` avisa se
  aparecer de novo uma ficha com esse endereço.

### Blogue (`dados/blogue/<AAAA-MM-DD-titulo>.json`)

```json
{ "id": "2026-11-02-o-pico", "titulo": "…", "data": "2026-11-02", "autor": "<id do contribuidor>", "estado": "rascunho | publicado", "texto": "…", "atualizado_em": "…" }
```

O `texto` usa marcas simples: `## Título`, `**negrito**`, `*itálico*`, `- lista`, `> citação`, `[texto](https://…)`, `![legenda](https://…)` e `[[id-da-ficha]]` ou `[[id-da-ficha|texto]]`. As fichas mencionadas mostram «No blogue do arquivo».

### Regras para o agente

- Uma assinatura, uma nota editorial ou um texto do blogue **nunca é fonte**. Não se cita e não serve para deduzir factos.
- O agente não cria assinaturas em nome de ninguém e não altera nem apaga contribuições assinadas. Também não volta a mostrar imagens escondidas.
  Isto inclui as notas em lista e as entradas de `dados/excluidos.json`: o agente não as escreve, e não volta a catalogar um endereço retirado.
- Se uma fonte aprovada confirmar mais tarde uma relação indicada por um contribuidor, acrescenta-se a citação em `fontes` e mantém-se o `editorial`.
- Fichas marcadas com `distinta_de` nunca se juntam: são pessoas (ou obras) diferentes com o mesmo nome. Ao investigar uma delas,
  confirmar a qual pertence cada excerto antes de o acrescentar.
- Um testemunho (`factos[].editorial`) nunca se cita nem se usa para deduzir; uma fonte pendente não se usa até ser aprovada.
- O `validar.py` recusa assinaturas de contribuidores inexistentes, datas mal escritas, fotografias sem `origem` e ligações do blogue a fichas inexistentes.
- O servidor local (`/api/gravar`) só aceita escritas do próprio site neste computador. Valida antes de gravar e repõe os ficheiros se a alteração criar erros.

## Verificação das citações (o que o `construir.py` acrescenta ao `site/dados/base.json`)

Os ficheiros de `dados/` nunca levam estes campos; só o `base.json`. Cada citação com frase (`citacao`) leva:

- `"verificada": true`: a frase está, palavra por palavra, no documento arquivado.
- ou `"verificada": false` e `"verificacao"` a dizer porquê:
  - `por-confirmar`: na publicação online (sem o arquivo), uma citação que a cópia local ainda não viu, por exemplo acrescentada online. Fica confirmada quando o fundador corre o `construir.py` no computador dele.
  - `nao-arquivado`: o documento citado não está no arquivo local, por isso a frase não se pode verificar. Arquivar a página resolve.
  - `nao-encontrada`: a cópia local não encontrou a frase no documento. Na cópia local é erro; online fica como aviso, para não parar a publicação.
  - `fonte-rejeitada`: a fonte foi rejeitada pelos editores depois de citada, e a citação deixa de servir de prova. Também nas referências de media sem frase.
- As referências de media sem frase (só `fonte` + `url`) não levam nenhum destes campos, a não ser `fonte-rejeitada`.

`validacao` no `base.json`: `erros`, `avisos`, `citacoes` (as que têm frase), `citacoes_verificadas` (só as verificadas), `citacoes_por_estado` (quantas há em cada estado) e `avisos_forma`, a lista dos avisos sobre a forma dos dados (ver abaixo), cada um `{ ficheiro, onde, texto }`, para quem edita os ver junto das fichas.

`dados/verificacao.json` guarda, para a publicação online, o que a cópia local apurou: `{ "verificadas": [...], "nao_arquivadas": [...], "nao_encontradas": [...] }`, com a chave de cada citação (documento + frase normalizada). Escreve-o o `construir.py` (e o servidor local ao gravar), só na cópia local. O formato antigo, só a lista das verificadas, continua a ler-se.

## Avisos do `validar.py` sobre a forma dos dados

Não param a publicação; cada um diz o que corrigir. No GitHub, os avisos dos ficheiros que a proposta muda aparecem como anotações desses ficheiros (os erros aparecem sempre).

- Valores fora das listas acima: `campo` dos factos, `tipo` da pessoa, `estado_revisao`, `formato` da gravação, `genero` da obra, `tipo` do media. Se é o termo da fonte (por exemplo «valsa»), fica, e o fundador decide se a lista o ganha.
- Gravação sem `formato`; `ano` fora do formato AAAA (gravações, obras, instrumentos); `data` de um media fora de AAAA[-MM[-DD]].
- Num campo com vários factos, só um marcado como divergente (`conflito` tem de estar em todas as versões, para aparecerem lado a lado). Não contam o campo `outro`, que junta factos sem relação entre si, nem um campo com um só facto (a outra versão está noutro campo ou na nota). O aviso nunca manda retirar a marca: só se retira depois de ver a fonte. Também: datas de nascimento ou de morte com anos diferentes sem a divergência marcada em todas.
- Grupos sem membros; `membro_de` a apontar para uma ficha que não é grupo.
- Relações repetidas; relações simétricas (`irmao_de`, `conjuge_de`, `primo_de`, `tocou_com`) guardadas nos dois sentidos; `filho_de`, `neto_de`, `sobrinho_de` ou `membro_de` nos dois sentidos.
- Fichas `revisto` sem `revisto_por` ou `revisto_em`.
- O mesmo endereço em duas fichas de media.
- Uma ficha de media com um endereço que está em `dados/excluidos.json`.
- Citações por confirmar, de documentos não arquivados ou de fontes rejeitadas (ver acima).
