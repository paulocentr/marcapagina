---
id: TASK-007
title: 'Obras, autores e categorias'
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
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Obra: título, subtítulo, editora, ano, ISBN, edição, idioma, páginas, sinopse, capa (URL externa, NUNCA binário no banco — 0,5 GB no Neon), CDD, faixa etária. Autor em N:N via ObraAutor (um campo texto inviabilizaria o relatório de autor mais lido). Categoria hierárquica com parentId. Spec §4.2.
<!-- SECTION:DESCRIPTION:END -->
