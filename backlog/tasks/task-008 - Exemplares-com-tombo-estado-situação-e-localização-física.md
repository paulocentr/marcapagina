---
id: TASK-008
title: 'Exemplares com tombo, estado, situação e localização física'
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 12:34'
labels:
  - acervo
  - backend
  - db
  - merged
milestone: m-1
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Exemplar: tombo único por escola, estado (NOVO/BOM/DESGASTADO/DANIFICADO), situação (DISPONIVEL/EMPRESTADO/RESERVADO/EM_CARRINHO/EM_MANUTENCAO/EXTRAVIADO/BAIXADO), origem (COMPRA/DOACAO/GOVERNO), localização (corredor/estante/prateleira). 'Quantidade em Estoque' da especificação original vira contagem DERIVADA de exemplares disponíveis — nunca um número digitado. O sistema deve funcionar sem etiqueta: busca por título é caminho de primeira classe (etiquetagem gradual, spec §2.2).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Progresso (2026-09-10, segunda leva)

Tarefas 4 a 7 do plano do Acervo, mergeadas em main.

**Feito:** serviço de Obras (criar/editar/excluir/buscar por título sem acento), exemplares com tombo sequencial sob trava consultiva, provedores de ISBN (Google Books + Open Library em cascata, com timeout e fallback), e catalogação em série atômica.

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

unit 298 testes · integração 72 · e2e 5.

Garantias provadas por mutação (removi a proteção, o teste reprovou, restaurei):
- sem a trava consultiva, os tombos colidem sob concorrência;
- sem a transação, a catalogação deixa obra órfã de exemplar.

**Falta em m-1:** telas do acervo (Tarefa 8), etiquetas PDF (9), inventário (10), importador de planilha (11).

**NÃO verificado:** CI nunca rodou (sem remote). Nada implantado.
<!-- SECTION:NOTES:END -->
