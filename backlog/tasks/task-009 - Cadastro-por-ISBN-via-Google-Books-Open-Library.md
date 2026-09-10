---
id: TASK-009
title: Catalogação em série por ISBN (caminho crítico)
status: To Do
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 02:03'
labels:
  - acervo
  - backend
milestone: m-1
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CAMINHO CRÍTICO DO PROJETO. Confirmado que o acervo não existe em lugar nenhum e será catalogado do zero (spec §2.6) — é a diferença entre catalogar em semanas ou em meses, e o único fator capaz de fazer o sistema nunca sair do papel. Google Books COM FALLBACK para Open Library: nenhuma das duas cobre o catálogo brasileiro sozinha, especialmente didático e infantojuvenil nacional. Modo série: bipa ISBN → confere → salva → CURSOR VOLTA AO CAMPO DE ISBN, sem navegar menu entre um livro e o próximo. Gerar N exemplares com tombos sequenciais na mesma tela. Quando as duas APIs falham, formulário manual enxuto com autocomplete de autor/editora a partir do acervo existente e repetição do último valor em campos que se repetem em lote.
<!-- SECTION:DESCRIPTION:END -->
