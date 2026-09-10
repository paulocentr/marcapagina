---
id: TASK-002
title: 'Camada service-repository, contexto de tenant e invariantes no CI'
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 12:00'
labels:
  - backend
  - db
milestone: m-0
dependencies: []
documentation:
  - docs/superpowers/plans/2026-09-09-fundacao.md
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estrutura src/modules/<dominio>/{repository,service,schema} + src/core/{db,auth,rbac,tenant,errors,result,audit}. Tenant via AsyncLocalStorage, injetado pelo repositório base em todo where; escolaId NUNCA vem do cliente. Dois testes que quebram o CI: (1) nada em app/ importa *.repository.ts ou PrismaClient; (2) nenhum repositório emite query sem filtro de tenant, verificado também por teste de vazamento entre dois tenants semeados. Spec §3.2–3.4.
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
