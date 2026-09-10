---
id: TASK-014
title: 'Balcão: empréstimo com bloqueios e liberação forçada auditada'
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 17:15'
labels:
  - circulacao
  - backend
  - merged
milestone: m-2
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fluxo que roda dezenas de vezes por dia — teclado, sem exigir mouse. Matrícula ou nome → o sistema mostra os bloqueios ANTES de tudo (suspensão, limite atingido, atraso) → tombo ou título → confirma. Data de devolução calculada pulando dias não letivos. Quem tem emprestimo:forcar libera sobre bloqueio com justificativa OBRIGATÓRIA, registrada em auditoria: exceções vão acontecer, e é melhor registrá-las do que empurrar a coordenação a contornar o sistema.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Empréstimo no balcão com bloqueios, liberação forçada justificada e auditada, e a TELA.

Commits: d961967 (consulta de atrasados e empréstimo no balcão), 9510e2c (repositório do balcão contra o banco), c303a08 (tela, buscarLeitorParaBalcao e ponto de composição da circulação).

Duas garantias de fluxo que são requisito da spec §5.1, não conforto:
- os bloqueios são mostrados ANTES do campo do livro;
- depois de emprestar o cursor volta para a MATRÍCULA, não para o tombo.

A justificativa de liberação sobre bloqueio é obrigatória e fica na auditoria com nome e hora.

Evidência — medida em 10/09/2026 na árvore de c303a08:
- npm run lint -> exit 0
- npm run typecheck -> exit 0
- npm run test:unit -> 656 testes passando (inclui balcao-consulta.test.ts, 10 testes)
- npm run test:integration -> 168 testes passando (inclui circulacao/emprestar.test.ts)
- índice único parcial de empréstimo ativo provado POR MUTAÇÃO: removida a proteção, o teste reprova

NÃO verificado: a tela nunca foi aberta num navegador. Não há e2e cobrindo o balcão, e a suíte e2e existente está vermelha (TASK-028). O visual será refeito contra o kit aprovado (TASK-029).
<!-- SECTION:NOTES:END -->
