---
id: TASK-032
title: Tela de reservas e renovação
status: To Do
assignee: []
created_date: '2026-09-10 17:20'
labels:
  - circulacao
  - frontend
  - design
milestone: m-2
dependencies: []
priority: medium
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Depois que TASK-016 fechar, reservas e renovação existirão como regra testada mas sem nenhuma tela — nem para a coordenação nem para o aluno.

Falta:
- fila de reserva por obra, para a coordenação ver quem é o próximo e até quando o exemplar fica separado
- prateleira de separados no balcão (a prancha docs/design/Devolucao.dc.html já mostra ela na trilha lateral, com o item que vence hoje)
- renovar no balcão e renovar no portal do aluno, respeitando o máximo de renovações da série
- a tira de reserva impressa que vai junto do exemplar separado

O estado "separado para reserva" usa a FITA terracota no sistema de design: é a única faixa com barra colorida e título em serifa, porque é ela que impede a operadora de devolver à estante um exemplar reservado e travar a fila.

Depende de TASK-016 e do sistema de design em código (TASK-027).
<!-- SECTION:DESCRIPTION:END -->
