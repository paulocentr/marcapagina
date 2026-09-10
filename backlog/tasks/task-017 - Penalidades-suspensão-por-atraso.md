---
id: TASK-017
title: 'Penalidades: suspensão por atraso'
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
priority: medium
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Penalidade com início, fim, motivo e empréstimo de origem. Suspensão em dias é o padrão em escola; multa em dinheiro fica fora do v1. Configurável pela coordenação.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Suspensão por atraso, com fator configurável por dia de atraso e teto de 60 dias.

Commits: fd6d133 (bloqueios do leitor e cálculo de penalidade, puros), 3112096 (aplicação na devolução).

O teto existe porque 200 dias de esquecimento não podem virar três anos de castigo — a pena deixaria de ser pedagógica.

Evidência — medida em 10/09/2026 na árvore de c303a08:
- npm run test:unit -> 656 testes passando (inclui penalidade.test.ts, 14 testes, e bloqueios.test.ts, 12)
- npm run test:integration -> 168 testes passando
- npm run lint e npm run typecheck -> exit 0

NÃO verificado: e2e vermelho no repositório (TASK-028).
<!-- SECTION:NOTES:END -->
