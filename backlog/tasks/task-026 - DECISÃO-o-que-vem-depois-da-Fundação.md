---
id: TASK-026
title: 'DECISÃO: o que vem depois da Fundação'
status: Done
assignee: []
created_date: '2026-09-10 12:01'
updated_date: '2026-09-10 12:02'
labels:
  - backend
milestone: m-1
dependencies: []
priority: high
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Fundação (m-0) está pronta, verificada e mergeada em main. Duas frentes disputam o próximo passo e levam a trabalhos bem diferentes.

## Decisão

O que atacar agora?

**Opção 1 (recomendada) — escrever e executar o plano do Acervo (m-1).** Obras, exemplares com tombo e busca por ISBN, que a spec marca como caminho crítico porque o acervo será catalogado do zero. Custo: é o maior milestone do projeto. Consequência: avança o produto pela ordem de dependência, sem depender de ninguém de fora.

**Opção 2 — colocar o repositório no GitHub e subir um ambiente antes.** Hoje não existe remote: o workflow de CI está escrito e versionado mas NUNCA rodou. Também não há projeto na Vercel nem banco Neon. Custo: baixo em código, mas depende da conta do Paulo. Consequência: o CI passa a valer de verdade e dá para demonstrar de um link.

**Opção 3 — as duas, nesta ordem: infra primeiro, Acervo em seguida.**

## Recomendação

Opção 1. A entrega é única (decisão 9 da spec): não há demonstração à coordenação antes do sistema completo, então subir ambiente agora não destrava nada para a usuária. O CI sem remote é um risco conhecido e barato de corrigir depois.

## Se ele não responder

Sigo pela Opção 1 e escrevo o plano do Acervo.

## Reversibilidade

Total. Nada aqui é caminho sem volta.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Resposta do Paulo (2026-09-10, no terminal)

Escolheu a **Opção 1 — Acervo (m-1)**. Infra (remote, Vercel, Neon) fica para depois; o CI segue escrito e sem nunca ter rodado até lá.
<!-- SECTION:NOTES:END -->
