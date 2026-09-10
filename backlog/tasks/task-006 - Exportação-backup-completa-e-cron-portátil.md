---
id: TASK-006
title: Exportação/backup completa e cron portátil
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 12:00'
labels:
  - infra
  - backend
milestone: m-0
dependencies: []
documentation:
  - docs/superpowers/plans/2026-09-09-fundacao.md
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O free tier do Neon não dá retenção longa, e o acervo catalogado à mão é o ativo mais caro do projeto (spec §8.4). Exportação completa em JSON + CSV sob demanda, mais cron semanal. O cron é um endpoint HTTP protegido por segredo compartilhado, acionado pelo Vercel Cron — trocável por qualquer agendador sem mudar código.
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
