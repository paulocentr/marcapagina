---
id: TASK-018
title: 'Carrinho da Leitura: rodadas, pedidos e empréstimo em lote'
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 17:16'
labels:
  - circulacao
  - backend
  - merged
milestone: m-2
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O Carrinho da Leitura é um carrinho FÍSICO ITINERANTE que circula pelas salas (confirmado com Paulo — não é wishlist). RodadaCarrinho (data + turma + responsável + exemplares levados). O sistema SUGERE exemplares a partir dos pedidos pendentes da turma e da faixa etária. Empréstimos lançados EM LOTE: uma tela para 30 alunos, não 30 telas. PedidoCarrinho aceita título que a biblioteca NÃO tem — vira lista de sugestão de compra com contagem de demanda, que é o argumento que a coordenação leva à direção para pedir verba.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rodadas, pedidos, sugestão do que levar, empréstimo em LOTE e lista de sugestão de compra — camada de serviço e repositório.

Commits: 74e5fb0 (serviço), 2fc86ab (repositório e integração contra banco), ac8f495 (faixa etária pura, com "não sei" em vez de zero), e578f78 (ponto de composição), 15cf28c (faixa C integrada).

A transação é POR ALUNO, nunca global: um aluno bloqueado não derruba o lote dos outros 29. Derrubar tudo por causa de um faria a operadora desistir do lote e voltar a lançar um por um, que é exatamente o que o carrinho existe para evitar.

Evidência — medida em 10/09/2026 na árvore de c303a08:
- npm run test:unit -> 656 testes passando (inclui carrinho.test.ts com 47 e faixa-etaria.test.ts com 17)
- npm run test:integration -> 168 testes passando (inclui carrinho/carrinho.test.ts e carrinho/lote.test.ts)
- npm run lint e npm run typecheck -> exit 0

ESCOPO QUE FICOU FORA, de propósito: o Carrinho NÃO tem tela. A regra existe e está provada; a interface está desenhada e aprovada, mas não implementada. Card próprio: TASK-030. Este card fecha na camada de regra, não na experiência de uso.
<!-- SECTION:NOTES:END -->
