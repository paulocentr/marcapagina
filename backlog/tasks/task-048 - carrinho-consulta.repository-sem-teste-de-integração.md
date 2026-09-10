---
id: TASK-048
title: carrinho-consulta.repository sem teste de integração
status: To Do
assignee: []
created_date: '2026-09-10 21:59'
labels:
  - circulacao
  - backend
milestone: m-2
dependencies: []
priority: low
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As duas consultas Prisma de carrinho-consulta.repository.ts (filtro por anoLetivo.ativo, orderBy aninhado por exemplar.tombo) passam por typecheck mas NUNCA tocaram banco. orderBy aninhado é exatamente o tipo de consulta que compila e falha em execução.
<!-- SECTION:DESCRIPTION:END -->
