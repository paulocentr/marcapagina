---
id: TASK-010
title: 'Importador de planilha (primário: alunos)'
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 02:03'
labels:
  - importacao
  - backend
milestone: m-1
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Upload, mapeamento de colunas, preview com validação linha a linha, deduplicação (matrícula para alunos, ISBN para acervo), importação transacional. MUDANÇA DE PRIORIDADE: confirmado que o acervo será catalogado do zero, então o uso primário deste importador é IMPORTAR ALUNOS, não acervo. Para acervo ele permanece por duas razões — listas parciais que apareçam, e outras escolas no futuro (o sistema é multi-tenant).
<!-- SECTION:DESCRIPTION:END -->
