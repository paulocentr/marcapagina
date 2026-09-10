---
id: TASK-029
title: Reescrever as telas existentes contra o kit aprovado
status: To Do
assignee: []
created_date: '2026-09-10 17:18'
labels:
  - design
  - frontend
milestone: m-0
dependencies: []
priority: high
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As telas que existem hoje (entrar, aluno/entrar, painel, painel/balcao, painel/acervo, painel/acervo/[obraId], painel/acervo/novo, aluno) foram escritas com utilitários neutros do Tailwind soltos, antes de existir design system. Depois que os tokens e os primitivos entrarem (ver o card do sistema de design em código), cada uma tem de ser refeita contra o kit.

As pranchas aprovadas são a referência: docs/design/Balcao.dc.html, Devolucao.dc.html, Catalogar.dc.html, Acervo.dc.html.

O que NÃO pode se perder na reescrita — é comportamento, não enfeite:
- o cursor volta à MATRÍCULA depois de emprestar, e ao ISBN depois de catalogar
- os bloqueios do leitor aparecem ANTES do campo do livro
- o campo de justificativa só existe quando há bloqueio a liberar
- tombo, ISBN e matrícula em mono
- o aviso de "separe este exemplar" continua impossível de ignorar

Dá para paralelizar por tela.
<!-- SECTION:DESCRIPTION:END -->
