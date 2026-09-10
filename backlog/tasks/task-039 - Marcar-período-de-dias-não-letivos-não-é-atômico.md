---
id: TASK-039
title: Marcar período de dias não letivos não é atômico
status: To Do
assignee: []
created_date: '2026-09-10 21:59'
labels:
  - circulacao
  - backend
  - db
milestone: m-2
dependencies: []
priority: medium
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
calendario.service.ts marca um dia por vez em laço, sem transação. Falha no meio deixa metade do período marcada, e a coordenação não tem como saber onde parou.

A correção é envolver em emTransacao, que já é injetado em outros serviços. Descoberto ao construir a tela de configuração, que expõe "marcar período".
<!-- SECTION:DESCRIPTION:END -->
