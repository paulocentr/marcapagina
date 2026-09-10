---
id: TASK-030
title: Tela do Carrinho da Leitura
status: To Do
assignee: []
created_date: '2026-09-10 17:18'
labels:
  - circulacao
  - frontend
  - design
milestone: m-2
dependencies: []
priority: high
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A regra do Carrinho está pronta e provada (serviço, repositório, faixa etária, empréstimo em lote, sugestão de compra), mas não há tela nenhuma — hoje o recurso é inalcançável pela coordenação.

Prancha aprovada: docs/design/Carrinho.dc.html. São três passos numa tela só:
1. o que levar na rodada — sugestão a partir dos pedidos PENDENTES da turma, filtrada por faixa etária e pelo que está em estante; é sugestão, não decisão: a operadora acrescenta e tira
2. na volta, empréstimo em LOTE — uma tela para trinta alunos, não trinta telas; e o resultado por aluno, com os recusados visíveis e o motivo, porque um aluno bloqueado não derruba o lote
3. sugestão de compra — títulos pedidos que a biblioteca não tem, agrupados por título normalizado e com contagem de demanda. É o argumento que a coordenação leva à direção para pedir verba.

Depende do sistema de design em código.
<!-- SECTION:DESCRIPTION:END -->
