---
id: TASK-009
title: Catalogação em série por ISBN (caminho crítico)
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 13:22'
labels:
  - acervo
  - backend
  - merged
milestone: m-1
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CAMINHO CRÍTICO DO PROJETO. Confirmado que o acervo não existe em lugar nenhum e será catalogado do zero (spec §2.6) — é a diferença entre catalogar em semanas ou em meses, e o único fator capaz de fazer o sistema nunca sair do papel. Google Books COM FALLBACK para Open Library: nenhuma das duas cobre o catálogo brasileiro sozinha, especialmente didático e infantojuvenil nacional. Modo série: bipa ISBN → confere → salva → CURSOR VOLTA AO CAMPO DE ISBN, sem navegar menu entre um livro e o próximo. Gerar N exemplares com tombos sequenciais na mesma tela. Quando as duas APIs falham, formulário manual enxuto com autocomplete de autor/editora a partir do acervo existente e repetição do último valor em campos que se repetem em lote.
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
