---
id: TASK-046
title: 'Circulação aceitar autorização por escopo, para o portal chamar renovar'
status: To Do
assignee: []
created_date: '2026-09-10 21:59'
labels:
  - circulacao
  - auth
  - portal
milestone: m-2
dependencies: []
priority: medium
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O portal do aluno NÃO chama renovar() de renovar.service.ts, porque ela começa com exigirPermissao(principal, emprestimo:renovar) e a única forma de atravessar seria forjar um principal de STAFF — mentira para a auditoria e caminho de escalação dentro do código.

Hoje o portal reorquestra a regra chamando as mesmas funções puras e a mesma contagem de fila. Funciona e está testado, mas é uma segunda montagem da mesma regra, e duas cópias divergem na primeira correção feita em apenas uma.

A saída é a circulação aceitar autorização por ESCOPO ao lado da autorização por permissão — o mesmo padrão que src/modules/portal/ já usa: nenhuma função pública aceita id de aluno por parâmetro.
<!-- SECTION:DESCRIPTION:END -->
