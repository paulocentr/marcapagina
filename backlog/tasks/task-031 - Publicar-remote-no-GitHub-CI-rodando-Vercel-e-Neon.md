---
id: TASK-031
title: 'Publicar: remote no GitHub, CI rodando, Vercel e Neon'
status: To Do
assignee: []
created_date: '2026-09-10 17:18'
labels:
  - infra
milestone: m-0
dependencies: []
priority: high
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nada foi implantado e nada nunca rodou fora desta máquina.

Estado real em 10/09/2026:
- o repositório NÃO tem remote, então o workflow do GitHub Actions está escrito e versionado mas NUNCA executou uma vez
- não existe projeto na Vercel
- não existe banco no Neon
- toda a verificação até hoje é local, com Postgres em Docker

Enquanto isso não existir, "verde no CI" é uma afirmação sem medição, e não há ambiente para a coordenação ver o sistema.

Ordem: criar o remote e ver o CI rodar de verdade primeiro (é o que revela o que só funciona nesta máquina), depois Neon, depois Vercel. Antes de subir com aluno real, TASK-025 (base legal LGPD) tem de estar resolvido — são dados de menores.

O deploy tem de continuar portátil: output standalone e Dockerfile versionados, cron como endpoint HTTP por segredo. Nunca API proprietária da Vercel.
<!-- SECTION:DESCRIPTION:END -->
