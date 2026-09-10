---
id: TASK-022
title: 'Painel do Leitor: relatórios com exportação CSV e PDF'
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
labels:
  - relatorios
  - backend
milestone: m-4
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Os três pedidos na especificação original: Top 10 mais lidos (filtrável por período/turma/série), turmas com maior engajamento, mais solicitados no Carrinho da Leitura. CORREÇÃO DELIBERADA: engajamento é medido PER CAPITA, não em absoluto — ranking absoluto faz a turma maior vencer sempre e a métrica passa a mentir; mostrar o absoluto ao lado. Adicionais que ela vai precisar: alunos que NUNCA retiraram livro no ano (a lista que muda decisão pedagógica), acervo parado, autores/categorias mais lidos, curva de empréstimos, atrasados por turma, sugestão de compra por demanda, perdas e baixas. Relatórios são queries, não tabelas materializadas.
<!-- SECTION:DESCRIPTION:END -->
