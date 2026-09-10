---
id: TASK-041
title: Importação de alunos não é auditada
status: To Do
assignee: []
created_date: '2026-09-10 21:59'
labels:
  - importacao
  - backend
  - lgpd
milestone: m-0
dependencies: []
priority: high
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
importacao.service.ts não chama registrarAuditoria. Cadastrar 400 alunos de uma vez é exatamente o que se quer poder olhar no log depois — quem importou, quando, quantos entraram.

Num sistema com dados de menores isso não é conveniência: é o registro de quem trouxe os dados para dentro.
<!-- SECTION:DESCRIPTION:END -->
