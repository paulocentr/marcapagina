---
id: TASK-013
title: Configuração de circulação por série e calendário de dias não letivos
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
labels:
  - circulacao
  - backend
  - db
milestone: m-2
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prazo, limite de livros simultâneos, máximo de renovações, dias de suspensão por dia de atraso, prazo de retirada de reserva, se o aluno pode reservar — tudo por escola COM override por série (o 2º ano não leva o mesmo que o 9º). DiaNaoLetivo (feriado, recesso, férias, fim de semana) entra no cálculo do prazo: sem isso o sistema marca como atrasado quem pegou o livro na sexta antes do feriadão, e ela perde a confiança no sistema na primeira semana.
<!-- SECTION:DESCRIPTION:END -->
