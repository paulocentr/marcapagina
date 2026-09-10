---
id: TASK-049
title: 'prazo.ts não exporta FUSO_DA_ESCOLA, e já há uma cópia'
status: To Do
assignee: []
created_date: '2026-09-10 21:59'
labels:
  - circulacao
  - backend
milestone: m-2
dependencies: []
priority: low
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/modules/usuarios/ duplicou a constante de fuso porque prazo.ts não a exporta. Lá o erro é cosmético (formatar data de criação de conta); em prazo.ts seria data de devolução errada.

Exportar a constante e apagar a cópia. Enquanto houver duas, elas divergem.
<!-- SECTION:DESCRIPTION:END -->
