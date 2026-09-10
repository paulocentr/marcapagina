---
id: TASK-016
title: Renovação e fila de reservas
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 18:15'
labels:
  - circulacao
  - backend
  - merged
milestone: m-2
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reserva é da OBRA, não do exemplar. Fila com posição, prazo de retirada e expiração que passa a vez ao próximo. Renovação pelo aluno ou pelo balcão, bloqueada quando há fila na obra ou quando o máximo de renovações foi atingido.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reservas, renovação e expiração de reserva mergeadas na linha principal (a7f16d0), vindas de feat/faixa-a via integra/faixa-a.

O merge foi resolvido pela UNIÃO, não escolhendo um lado. A faixa-a bifurcou antes das faixas B e C, então o diff de dois pontos a mostrava "apagando" o Carrinho, a devolução e a configuração — artefato da bifurcação, não intenção. Só um arquivo conflitou de verdade: circulacao.deps.ts, criado do zero pelas duas linhas, que ficou com as três funções de composição. Conferido: git diff main...HEAD --diff-filter=D veio VAZIO, nenhum arquivo de main foi removido.

DUAS CORREÇÕES DE PREMISSA, para não gerar dúvida em quem ler depois:
- a faixa-a NUNCA tocou src/app/page.tsx nem painel/page.tsx; o diff os mostrava por artefato da bifurcação. Não havia lado a descartar.
- o job ficou em dependenciasDeReserva(), não em dependenciasDaCirculacao(): o pacote grande carrega auditoria e penalidades que o job não usa.

BUG QUE O MERGE ACHOU, e que ninguém tinha visto: o endpoint expirar-reservas respondia e NADA o chamava. O vercel.json tinha um cron só, o do backup semanal. Em produção a expiração nunca rodaria, e exemplar separado para aluno que não veio buscar ficaria RESERVADO para sempre — fora da estante e fora da fila, exatamente o estado que a reserva existe para evitar. Agora há cron diário às 08:00 UTC (5h em São Paulo, antes de a escola abrir); diário porque o Hobby só dá granularidade de um dia e porque a regra é de dia. Ficam 2 crons, o limite do Hobby.

Evidência — gate COMPLETO na árvore de 90d9b06, exit code conferido um a um, máquina local com Postgres em Docker:
- npm run lint -> exit 0
- npm run typecheck -> exit 0
- npm run test:unit -> 37 arquivos, 810 testes, exit 0
- npm run test:integration -> 23 arquivos, 201 testes, exit 0 (inclui reservas.test.ts, renovar.test.ts e cron-reservas.test.ts, que exercita a rota com e sem CRON_SECRET)
- npm run test:e2e -> 17 testes, exit 0
- npm run build -> exit 0
- docker build -> exit 0

NÃO verificado: nada disso rodou em CI (não há remote — ver TASK-031). A mutação da trava de registrarRenovacao (devolvidaEm: null no WHERE) NÃO foi refeita nesta passagem; o commit 896a56b afirma prová-la contra o banco, mas eu não rodei a mutação. Reserva e renovação seguem SEM TELA (TASK-032) — "Tarefa 7 mergeada" não é "a coordenação consegue reservar pela interface".
<!-- SECTION:NOTES:END -->
