---
id: TASK-015
title: Devolução com estado de conservação e avanço da fila de reserva
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
labels:
  - circulacao
  - backend
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
