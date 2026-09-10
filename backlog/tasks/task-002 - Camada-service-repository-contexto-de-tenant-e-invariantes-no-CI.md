---
id: TASK-002
title: 'Camada service-repository, contexto de tenant e invariantes no CI'
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
labels:
  - backend
  - db
milestone: m-0
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estrutura src/modules/<dominio>/{repository,service,schema} + src/core/{db,auth,rbac,tenant,errors,result,audit}. Tenant via AsyncLocalStorage, injetado pelo repositório base em todo where; escolaId NUNCA vem do cliente. Dois testes que quebram o CI: (1) nada em app/ importa *.repository.ts ou PrismaClient; (2) nenhum repositório emite query sem filtro de tenant, verificado também por teste de vazamento entre dois tenants semeados. Spec §3.2–3.4.
<!-- SECTION:DESCRIPTION:END -->
