---
id: TASK-003
title: 'Autenticação em dois reinos: staff e aluno'
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 12:01'
labels:
  - auth
  - backend
  - merged
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
