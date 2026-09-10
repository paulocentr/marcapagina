---
id: TASK-003
title: 'Autenticação em dois reinos: staff e aluno'
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 02:18'
labels:
  - auth
  - backend
milestone: m-0
dependencies: []
documentation:
  - docs/superpowers/plans/2026-09-09-fundacao.md
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Auth.js v5 com dois providers de credenciais. Staff: e-mail + senha Argon2id, sessão 12h. Aluno: matrícula + data de nascimento, sessão 8h. Risco aceito conscientemente na spec §2.3 — mitigações são parte da definição de pronto: rate limit por IP e por matrícula, bloqueio progressivo, e portal do aluno sem nenhum dado sensível. Reset de senha de staff é feito por quem tem usuario:gerenciar, não por e-mail.
<!-- SECTION:DESCRIPTION:END -->
