---
name: investigar
description: Investigar um ou mais temas da Canção de Coimbra (pessoa, obra, gravação, instrumento, luthier, agrupamento) no arquivo local e nas fontes aprovadas, e criar/atualizar as fichas do site com citações verificadas. Usar quando o utilizador pedir para investigar, pesquisar, catalogar ou "fazer a ficha" de alguém ou de algo.
argument-hint: <pessoa, obra ou tema>[; outro tema; …]
---

# Investigar

Temas pedidos: $ARGUMENTS

1. Se o índice não existir (`arquivo/indice.sqlite`), corre primeiro `python scripts/indexar.py`.
2. Para cada tema (separados por `;`), lança o agente **investigador-coimbra** com um pedido claro: o tema, e que siga integralmente as suas regras (citação literal, só fontes aprovadas, ficha em rascunho, relatório final).
   - Até 3 temas: um agente por tema, em paralelo. Indica a cada um quais as fichas principais que lhe pertencem, para não editarem o mesmo ficheiro ao mesmo tempo. Fichas mínimas de outras pessoas só se ainda não existirem.
   - Se o agente não estiver disponível pelo nome, usa um agente genérico e manda-o ler e seguir `.claude/agents/investigador-coimbra.md`.
3. Quando todos terminarem, corre `python scripts/validar.py` e `python scripts/construir.py`. Se houver erros, corrige-os tu, com a mesma regra: copiar de novo a citação do `ler_post.py`, ou retirar o facto.
4. Responde ao utilizador com:
   - as fichas criadas e o link local (`http://localhost:8765/#/pessoa/<id>`);
   - as divergências e os pontos a rever;
   - as **fontes propostas** que aguardam aprovação (`python scripts/fontes.py listar --estado pendente`). Pergunta se as aprova; nunca as aproves sem resposta explícita.
