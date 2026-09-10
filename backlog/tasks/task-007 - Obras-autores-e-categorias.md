---
id: TASK-007
title: 'Obras, autores e categorias'
status: In Progress
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 12:12'
labels:
  - acervo
  - backend
  - db
milestone: m-1
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Obra: título, subtítulo, editora, ano, ISBN, edição, idioma, páginas, sinopse, capa (URL externa, NUNCA binário no banco — 0,5 GB no Neon), CDD, faixa etária. Autor em N:N via ObraAutor (um campo texto inviabilizaria o relatório de autor mais lido). Categoria hierárquica com parentId. Spec §4.2.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Progresso (2026-09-10)

Parcialmente entregue no branch `feat/acervo`, mergeado em main.

**Feito:** schema do acervo (Obra, Autor, ObraAutor, Categoria, Localizacao, Exemplar + enums, migration `acervo`), autores com deduplicação por nome normalizado, categorias hierárquicas e localizações. Os cinco modelos novos estão declarados em `modelos-tenant.ts` e o gate do CI confirma.

**Falta neste card:** o serviço de Obras em si (criar/editar/excluir/buscar). O plano do Acervo o cobre na Tarefa 4.

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

unit 169 testes · integração 46 · e2e 5.

**NÃO verificado:** CI nunca rodou (sem remote). Nada implantado.
<!-- SECTION:NOTES:END -->
