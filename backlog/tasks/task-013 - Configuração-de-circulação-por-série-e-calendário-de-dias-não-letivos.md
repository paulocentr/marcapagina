---
id: TASK-013
title: Configuração de circulação por série e calendário de dias não letivos
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 17:15'
labels:
  - circulacao
  - backend
  - db
  - merged
milestone: m-2
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prazo, limite de livros simultâneos, máximo de renovações, dias de suspensão por dia de atraso, prazo de retirada de reserva, se o aluno pode reservar — por escola COM OVERRIDE POR SÉRIE. A escola atende Fundamental E Médio (1º ano ao 3º do Médio), a faixa mais ampla possível: um valor global estaria errado nas duas pontas simultaneamente. O override não é refinamento, é requisito. DiaNaoLetivo (feriado, recesso, férias, fim de semana) entra no cálculo do prazo: sem isso o sistema marca como atrasado quem pegou o livro na sexta antes do feriadão, e ela perde a confiança no sistema na primeira semana.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Configuração por escola com override por série (campo a campo, herdando o resto) e calendário de dias não letivos.

Commits: fbf6969 (configuração editável pela coordenação), fbcf69f (calendário), 44a13da (cálculo de prazo puro).

Evidência — medida em 10/09/2026 na árvore de c303a08, Postgres em Docker local:
- npm run lint -> exit 0
- npm run typecheck -> exit 0
- npm run test:unit -> 32 arquivos, 656 testes, todos passando
- npm run test:integration -> 20 arquivos, 168 testes, todos passando

NÃO verificado: npm run test:e2e está VERMELHO no repositório (7 passam, 10 falham) por perda de sessão em Server Action — ver TASK-028. A falha não toca configuração nem calendário, mas o gate completo não está verde e isso está dito aqui de propósito. Build e docker build não foram rodados nesta rodada.
<!-- SECTION:NOTES:END -->
