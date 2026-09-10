---
id: TASK-010
title: 'Importador de planilha (primário: alunos)'
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 13:22'
labels:
  - importacao
  - backend
  - merged
milestone: m-1
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Upload, mapeamento de colunas, preview com validação linha a linha, deduplicação (matrícula para alunos, ISBN para acervo), importação transacional. MUDANÇA DE PRIORIDADE: confirmado que o acervo será catalogado do zero, então o uso primário deste importador é IMPORTAR ALUNOS, não acervo. Para acervo ele permanece por duas razões — listas parciais que apareçam, e outras escolas no futuro (o sistema é multi-tenant).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Evidência (2026-09-10)

Milestone `Acervo` (m-1) completo: as 11 tarefas do plano, mergeadas em main.

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

unit 392 testes em 21 arquivos · integração 88 em 12 · e2e 16 em 2.

Garantias provadas por MUTAÇÃO (removi a proteção, o teste reprovou, restaurei):
- sem a trava consultiva, os tombos colidem sob concorrência;
- sem a transação, a catalogação deixa obra órfã de exemplar;
- sem a transação, a importação parcial grava os alunos;
- sem o drawText do tombo, a etiqueta sai em branco e o teste acusa.

**NÃO verificado:** o CI do GitHub Actions nunca rodou — não há remote neste repositório. Nada foi implantado: sem Vercel, sem Neon, sem staging, sem produção. Tudo acima é máquina local com Postgres em Docker.
<!-- SECTION:NOTES:END -->
