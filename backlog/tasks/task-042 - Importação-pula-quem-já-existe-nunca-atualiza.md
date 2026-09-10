---
id: TASK-042
title: 'Importação pula quem já existe, nunca atualiza'
status: To Do
assignee: []
created_date: '2026-09-10 21:59'
updated_date: '2026-09-10 22:44'
labels:
  - importacao
  - backend
milestone: m-0
dependencies: []
priority: medium
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O serviço IGNORA a linha cuja matrícula já existe e nunca altera cadastro existente. A tela diz "já cadastrado — será ignorado", que é a verdade.

Consequência: corrigir nome ou responsável pela planilha não funciona. A escola vai tentar, porque é o gesto natural. Decidir se atualizar entra, e com que confirmação.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DECIDIDO pelo Paulo em 10/09/2026, no terminal: "Atualizar nome e turma, nunca a data de nascimento".

O motivo da exceção, que é o ponto todo do card: a data de nascimento é METADE DA SENHA DO ALUNO (decisão 3 do projeto — ele autentica por matrícula + nascimento). Sobrescrevê-la com uma data errada na planilha da secretaria trancaria o aluno fora do portal, e ninguém entenderia por quê: nada na tela indicaria a causa.

Comportamento a implementar:
- matrícula já existente -> ATUALIZA nome e turma;
- data de nascimento NUNCA é alterada pela planilha; só pela ficha do aluno, com a pessoa vendo;
- o plano (o passo que a tela mostra antes de gravar) tem de distinguir três destinos, não dois: entram, ATUALIZADOS, e com problema — hoje ele diz "já cadastrado, será ignorado", que passará a ser mentira;
- quando a planilha traz nascimento diferente do cadastrado, o plano AVISA a divergência e diz que não vai mudar, em vez de ignorar em silêncio. É a única forma de a secretaria descobrir que uma das duas bases está errada.

Continua valendo: a importação é tudo-ou-nada, e a decisão do LGPD (TASK-025) manda não coletar contato de responsável.
<!-- SECTION:NOTES:END -->
