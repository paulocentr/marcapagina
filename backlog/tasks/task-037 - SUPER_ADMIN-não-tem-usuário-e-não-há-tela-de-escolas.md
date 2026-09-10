---
id: TASK-037
title: 'SUPER_ADMIN não tem usuário, e não há tela de escolas'
status: To Do
assignee: []
created_date: '2026-09-10 21:00'
labels:
  - rbac
  - infra
milestone: m-0
dependencies: []
priority: medium
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O papel SUPER_ADMIN existe e está semeado no banco de produção — "dono do sistema, gerencia escolas, não pertence a nenhuma escola", com TODAS as permissões, inclusive escola:*. Mas NENHUM usuário está atribuído a ele, e não existe tela para criar escola.

Hoje isso não incomoda: há um tenant só, a Escola Piloto, criada pelo seed. Passa a incomodar no momento em que o sistema virar produto e uma segunda escola precisar entrar — que é a razão de ele ser multi-tenant desde o commit 1 (decisão 4 e 5 do projeto).

Não é urgente e não bloqueia a escola da coordenação. Está registrado para não ser descoberto como surpresa no dia da segunda escola.

Cuidado ao construir: um usuário com escola:* atravessa tenant, e é o único que atravessa. O isolamento entre escolas é testado no CI; qualquer coisa aqui tem de ser feita sem afrouxar aquele gate.
<!-- SECTION:DESCRIPTION:END -->
