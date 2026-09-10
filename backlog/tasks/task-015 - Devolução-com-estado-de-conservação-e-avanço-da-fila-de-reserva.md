---
id: TASK-015
title: Devolução com estado de conservação e avanço da fila de reserva
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 13:34'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Progresso (2026-09-10)

Plano da Circulação escrito (`docs/superpowers/plans/2026-09-10-circulacao.md`, 10 tarefas). Tarefas 1, 3 e 4 e a camada de regras puras mergeadas em main.

**Feito:** schema completo da circulação com os dois índices únicos parciais · configuração por escola com override por série resolvido campo a campo · cálculo de prazo pulando dia não letivo, com fuso da escola fixo · bloqueios do leitor · cálculo de penalidade.

**Falta:** consulta de atrasados (T2), serviço de empréstimo (T5), devolução com avanço da fila (T6), reservas e renovação (T7), job de cron (T8), tela do balcão (T9), Carrinho da Leitura (T10).

### Evidência

```
PASS   npm run lint
PASS   npm run typecheck
PASS   npm run test:unit
PASS   npm run test:integration
PASS   npm run test:e2e
PASS   npm run build
PASS   docker build -t marcapagina:local .
---
RESULTADO: os sete com exit 0
```

unit 454 testes em 25 arquivos · integração 99 em 13 · e2e 16.

Provado por mutação: derrubando o índice único parcial, o teste de duplo empréstimo do mesmo exemplar reprova. A suíte de prazo roda idêntica em TZ=America/Sao_Paulo, TZ=UTC e TZ=Asia/Tokyo.

**NÃO verificado:** CI nunca rodou (sem remote). Nada implantado.
<!-- SECTION:NOTES:END -->
