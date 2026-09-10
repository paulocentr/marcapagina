---
id: TASK-015
title: Devolução com estado de conservação e avanço da fila de reserva
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 17:15'
labels:
  - circulacao
  - backend
  - merged
milestone: m-2
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tombo identifica o empréstimo → registra estado na devolução → aplica penalidade se atrasado → SE houver reserva na fila, separa o exemplar, marca RESERVADO e dispara o aviso com prazo de retirada. Esse último passo é o que faz fila de reserva funcionar de verdade. 'Atrasado' é sempre CALCULADO (dataPrevista < hoje AND dataDevolucao IS NULL), nunca um campo materializado que mente quando o cron falha.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Devolução com estado de conservação, cálculo de atraso e avanço da fila de reserva.

Commits: 3112096 (devolução com penalidade e avanço da fila), 1463fbd (faixa B integrada).

O aviso "SEPARE ESTE EXEMPLAR" na devolução é parte da definição de pronto: sem ele a operadora devolve o livro à estante e a fila de reserva nunca anda. Dano NÃO gera penalidade automática — a decisão é da coordenação.

Evidência — medida em 10/09/2026 na árvore de c303a08:
- npm run test:unit -> 656 testes passando (inclui devolver.test.ts)
- npm run test:integration -> 168 testes passando (inclui circulacao/devolucao.test.ts)
- npm run lint e npm run typecheck -> exit 0

NÃO verificado: e2e vermelho no repositório (TASK-028); a tela de devolução não foi aberta em navegador.
<!-- SECTION:NOTES:END -->
