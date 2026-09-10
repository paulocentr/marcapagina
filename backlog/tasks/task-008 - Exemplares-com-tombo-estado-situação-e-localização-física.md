---
id: TASK-008
title: 'Exemplares com tombo, estado, situação e localização física'
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
labels:
  - acervo
  - backend
  - db
milestone: m-1
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Exemplar: tombo único por escola, estado (NOVO/BOM/DESGASTADO/DANIFICADO), situação (DISPONIVEL/EMPRESTADO/RESERVADO/EM_CARRINHO/EM_MANUTENCAO/EXTRAVIADO/BAIXADO), origem (COMPRA/DOACAO/GOVERNO), localização (corredor/estante/prateleira). 'Quantidade em Estoque' da especificação original vira contagem DERIVADA de exemplares disponíveis — nunca um número digitado. O sistema deve funcionar sem etiqueta: busca por título é caminho de primeira classe (etiquetagem gradual, spec §2.2).
<!-- SECTION:DESCRIPTION:END -->
