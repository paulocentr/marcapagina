---
id: TASK-016
title: Renovação e fila de reservas
status: In Progress
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 17:20'
labels:
  - circulacao
  - backend
milestone: m-2
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reserva é da OBRA, não do exemplar. Fila com posição, prazo de retirada e expiração que passa a vez ao próximo. Renovação pelo aluno ou pelo balcão, bloqueada quando há fila na obra ou quando o máximo de renovações foi atingido.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reservas, renovação e o job de expiração de reserva ESTÃO escritos e testados, mas estavam parados fora da linha principal — três commits na branch feat/faixa-a (6b2db9a reservas e renovação, 733c3dc job de cron expirar-reservas, 896a56b trava do UPDATE de renovação contra o banco), que nunca foi mergeada.

A branch bifurcou de main ANTES das faixas B e C, então o merge não é trivial: um merge ingênuo apaga o Carrinho, a devolução e a configuração que já estão em main. A integração está em curso na branch integra/faixa-a, com a regra "manter main inteira e somar a faixa-a".

Falta também ligar o job na rota: JOBS_CONHECIDOS em src/app/api/cron/[job]/route.ts só tem backup-semanal, e o comentário ainda diz que os jobs chegam nos planos seguintes.

NÃO verificado: nada desta branch passou por lint, typecheck, unit, integração ou e2e depois do merge. É exatamente o que falta para o card fechar.

A tela de reservas e renovação é card próprio: TASK-032. Este card fecha na regra e no job de cron.
<!-- SECTION:NOTES:END -->
