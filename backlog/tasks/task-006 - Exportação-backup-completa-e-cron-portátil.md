---
id: TASK-006
title: Exportação/backup completa e cron portátil
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 02:18'
labels:
  - infra
  - backend
milestone: m-0
dependencies: []
documentation:
  - docs/superpowers/plans/2026-09-09-fundacao.md
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O free tier do Neon não dá retenção longa, e o acervo catalogado à mão é o ativo mais caro do projeto (spec §8.4). Exportação completa em JSON + CSV sob demanda, mais cron semanal. O cron é um endpoint HTTP protegido por segredo compartilhado, acionado pelo Vercel Cron — trocável por qualquer agendador sem mudar código.
<!-- SECTION:DESCRIPTION:END -->
