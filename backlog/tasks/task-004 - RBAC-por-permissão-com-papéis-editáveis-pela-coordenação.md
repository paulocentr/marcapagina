---
id: TASK-004
title: 'RBAC por permissão, com papéis editáveis pela coordenação'
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 02:18'
labels:
  - rbac
  - backend
milestone: m-0
dependencies: []
documentation:
  - docs/superpowers/plans/2026-09-09-fundacao.md
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Catálogo de permissões da spec §3.5 (obra:*, emprestimo:*, aluno:*, relatorio:*, etc). O código checa PERMISSÃO, nunca papel — 'if (user.role === ...)' é proibido no codebase. Papéis de fábrica: SUPER_ADMIN, DIRECAO, COORDENACAO, BIBLIOTECARIO, MONITOR, PROFESSOR, ALUNO, como conjuntos editáveis por escola. Checagem mora no service; esconder botão na UI não é autorização.
<!-- SECTION:DESCRIPTION:END -->
