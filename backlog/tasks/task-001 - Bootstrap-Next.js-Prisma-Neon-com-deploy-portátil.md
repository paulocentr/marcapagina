---
id: TASK-001
title: Bootstrap Next.js + Prisma + Neon com deploy portátil
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 12:01'
labels:
  - infra
  - backend
  - merged
milestone: m-0
dependencies: []
documentation:
  - docs/superpowers/plans/2026-09-09-fundacao.md
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Projeto Next.js 15 (App Router, TS strict), Prisma apontando para Neon, Tailwind + shadcn/ui, Vitest e Playwright configurados. Deploy na Vercel. OBRIGATÓRIO desde o commit 1: output standalone + Dockerfile versionado, porque Vercel Hobby é apenas não-comercial e o sistema é multi-tenant justamente para poder virar produto (spec §2.4). Nenhuma API proprietária da Vercel no caminho crítico.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Evidência

Branch `feat/fundacao`. Verificação final do plano, os sete comandos, cada um com o exit code conferido individualmente:

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

Contagens reais: unit 88 testes em 7 arquivos, integração 33 em 5 arquivos, e2e 5 em 1 arquivo.

**NÃO verificado:** o CI do GitHub Actions nunca rodou — não há remote configurado neste repo. O workflow está escrito e versionado, mas nenhuma execução dele foi observada. Nada foi implantado em lugar nenhum: sem staging, sem produção, sem projeto na Vercel, sem banco Neon. Tudo acima é máquina local com Postgres em Docker.
<!-- SECTION:NOTES:END -->
