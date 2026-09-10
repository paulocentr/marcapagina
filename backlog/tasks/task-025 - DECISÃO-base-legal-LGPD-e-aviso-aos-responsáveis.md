---
id: TASK-025
title: 'DECISÃO: base legal LGPD e aviso aos responsáveis'
status: Needs Paulo
assignee: []
created_date: '2026-09-10 01:56'
labels:
  - lgpd
  - blocker
milestone: m-0
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O sistema armazena dados pessoais de crianças e adolescentes, que a LGPD protege de forma reforçada. O design já faz a parte da engenharia (minimização, aluno não vê dado de colega, auditoria de acesso, retenção configurável, anonimização de aluno desligado, isolamento entre tenants testado no CI). O que falta NÃO é código.

## Decision needed

**Quem, na escola, assume formalmente a base legal do tratamento de dados dos alunos e o aviso aos responsáveis?**

| # | Opção | Custo | Consequência |
|---|-------|-------|--------------|
| 1 | A escola assume: direção define a base legal, avisa os responsáveis, designa um encarregado | Uma conversa da coordenação com a direção; nenhum trabalho de engenharia | Caminho correto. O sistema entra em produção com a responsabilidade no lugar certo |
| 2 | Rodar só com dados mínimos até a escola formalizar | Sem contato de responsável, portanto sem notificação de atraso por e-mail — só a lista impressa | Reduz a exposição enquanto a escola não se organiza, e o sistema já funciona |
| 3 | Ignorar e seguir | Zero hoje | Dados de menores tratados sem base legal definida, com a escola exposta e você como quem construiu. Não recomendo |

- **Eu recomendo:** 1, com 2 como caminho de partida se a formalização demorar. O código já minimiza e audita; o que falta é uma decisão institucional que só a escola pode tomar.
- **Se você não fizer nada:** o sistema é construído do mesmo jeito (nada aqui bloqueia desenvolvimento), mas na hora de entrar em produção com alunos reais a pendência vira risco da escola. Decida antes do primeiro aluno cadastrado em produção.
- **Reversível?** Sim, mas só para frente. Dados já coletados sem base legal definida continuam coletados.
- **Evidência:** spec §9 (`docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md`), e a decisão §2.3 de autenticar aluno por matrícula + data de nascimento, que torna a data de nascimento um dado operacional e não apenas cadastral.

**Isto não bloqueia a implementação.** É uma pendência para a coordenação levar à direção antes de o sistema entrar em produção.
<!-- SECTION:DESCRIPTION:END -->
