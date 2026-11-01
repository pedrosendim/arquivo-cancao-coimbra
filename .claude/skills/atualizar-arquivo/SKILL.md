---
name: atualizar-arquivo
description: Voltar a recolher os blogues aprovados (o blogue V está ativo), reconstruir o índice de pesquisa e os dados do site. Usar quando o utilizador pedir para atualizar o arquivo, ir buscar posts novos ou depois de aprovar uma fonte do tipo blogue.
---

# Atualizar o arquivo

1. `python scripts/recolher_blogger.py` (ou só uma fonte: `python scripts/recolher_blogger.py gc-v`). Demora 1 a 2 minutos.
2. `python scripts/indexar.py`
3. `python scripts/validar.py`. Uma correção num post pode invalidar uma citação; se o validador acusar erros, mostra-os ao utilizador e corrige as fichas afetadas a partir do texto novo.
4. `python scripts/construir.py`
5. Diz ao utilizador quantos posts e media novos entraram (compara com os números antes da recolha).
