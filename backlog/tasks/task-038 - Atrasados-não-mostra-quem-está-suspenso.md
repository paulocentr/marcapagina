---
id: TASK-038
title: Atrasados não mostra quem está suspenso
status: To Do
assignee: []
created_date: '2026-09-10 21:59'
labels:
  - circulacao
  - backend
milestone: m-2
dependencies: []
priority: medium
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A tela de atrasados não marca leitor suspenso, e a tela DIZ que não sabe em vez de deixar o silêncio parecer "ninguém está suspenso".

Motivo: EmprestimoAtrasado não carrega suspensão e não há leitura em lote — a única fonte é buscarLeitorParaBalcao, que exige matrícula, e a linha de atrasado não a traz.

CORREÇÃO MÍNIMA, já mapeada: acrescentar suspensaoAte a EmprestimoAtrasado e o select de penalidades { where: { fim: { gte: hoje } }, take: 1 } em listarAtrasados — o padrão está em balcao-consulta.repository.ts. O kit já tem LEITOR_SUSPENSO em estados.ts.
<!-- SECTION:DESCRIPTION:END -->
