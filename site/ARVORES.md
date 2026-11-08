# Guia das árvores (famílias e escolas)

Todas as árvores do site (a família na ficha de uma pessoa, as Famílias e as Escolas nas Linhagens) seguem as mesmas regras. Assim lê-se qualquer uma da mesma maneira e passa-se de uma para outra sem reaprender nada. O código está todo em `site/js/vistas/linhagens.js` (`desenharArvore` e `disporNaHorizontal`). Uma árvore nova usa sempre estas funções e a legenda delas, e nunca tem um desenho próprio.

## 1. Disposição

1. **Uma linha por geração, a mais antiga em cima.** Pais acima dos filhos, mestres acima dos alunos. Um neto registado sem o elo do meio fica duas linhas abaixo do avô.
2. **Os filhos ficam centrados por baixo de onde desce a linha:**
   - o ⚭ do casal, quando há dois pais;
   - o cartão do pai ou da mãe, quando só um está registado;
   - o cartão do mestre, nas escolas.
3. **Irmãos lado a lado, por ordem de nascimento.** Quem não tem data vai para o fim, por ordem alfabética.
4. **O casal fica lado a lado, com o ⚭ entre os cartões.** Quem casou mais vezes fica no meio, e os filhos de cada casamento descem do respetivo ⚭.
5. **A família do outro cônjuge** (os sogros) fica o mais perto possível, por cima do cônjuge, sem tapar ninguém. A linha mostra a ligação. A árvore principal é a do lado com mais descendência registada.
6. **Nas escolas, um aluno com vários mestres** fica debaixo do mestre principal: primeiro «aluno de» e só depois «influenciado por». Em empate, conta o mestre com mais alunos. As linhas dos outros mestres vão até ele, mas não mudam o sítio do aluno.
7. **Espaços:** 34 px entre irmãos e cônjuges, 64 px entre famílias diferentes na mesma geração. Os cartões nunca se sobrepõem.

## 2. Linhas e símbolos

Há um só vocabulário, sempre com legenda por cima da árvore. A legenda mostra apenas o que aparece nessa árvore.

| Desenho | Quer dizer |
|---|---|
| linha contínua cinzenta | pais → filhos |
| ⚭ entre dois cartões | casamento registado |
| linha pontilhada entre dois cartões | pais de um mesmo filho, sem casamento nas fontes |
| linha tracejada com rótulo (tio/a, avô/avó, irmãos, primos) | parentesco registado em que falta o elo do meio |
| círculo «?» | irmãos com pais por identificar |
| linha contínua dourada | mestre → aluno («aluno de») |
| linha dourada tracejada | «influenciado por» (não quer dizer que ensinou) |

Uma relação que já se lê pelo caminho dos pais não se desenha outra vez. Por exemplo, se o pai e o avô estão ligados, não aparece a linha avô → neto.

## 3. Cartões

São iguais em todas as árvores:
- fotografia 1:1 com o recorte escolhido na ficha (sem fotografia, aparece uma silhueta);
- nome próprio por cima e apelidos a negrito;
- anos de vida, com ≠ quando as fontes divergem;
- ícones dos papéis (guitarra, viola, canto, pena, nota…).

A pessoa em foco tem contorno. O cartão leva sempre à ficha da pessoa.

## 4. Navegação

- **Na ficha**, a árvore da família abre centrada na pessoa, com «ver nas Linhagens».
- **Nas Linhagens:**
  - uma árvore de cada vez, por ordem cronológica, com «anterior» e «seguinte»;
  - um campo para encontrar uma pessoa;
  - a pessoa em foco mantém-se ao passar de Famílias para Escolas e vice-versa.
- **Ligações e fontes:** por baixo de cada árvore fica a lista «Ligações desta árvore e fontes». A árvore não leva às citações; a lista leva.
- **No telemóvel**, a árvore desliza na horizontal e abre centrada na pessoa.

## 5. Nomes e ordem

- **Famílias:** «Família» seguido do apelido mais frequente (dois apelidos se empatarem).
- **Escolas:** «Escola de» seguido de quem tem mais alunos nessa árvore.
- **Datas:** do nascimento mais antigo à morte mais recente. Se faltarem, aparece «datas por apurar».
- **Ordem:** famílias e escolas por ordem cronológica, agrupadas por século.

## 6. O que entra numa árvore

- **Só relações registadas** com fonte, ou indicadas por um contribuidor e assinadas (✎). Nada se deduz: um tio não se infere por haver um pai e um irmão.
- **Divergências visíveis:** datas em conflito mostram ≠, e as duas versões ficam na ficha.
- **Sem nome conhecido:** escreve-se o que a fonte diz, por exemplo «Mulher de Gilberto Grácio (nome por apurar)».
- **Escolas separadas por área** (guitarra, viola, canto, construção). As influências só aparecem a pedido.
