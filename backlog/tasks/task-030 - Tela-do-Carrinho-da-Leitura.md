---
id: TASK-030
title: Tela do Carrinho da Leitura
status: Done
assignee: []
created_date: '2026-09-10 17:18'
updated_date: '2026-09-10 19:42'
labels:
  - circulacao
  - frontend
  - design
  - merged
milestone: m-2
dependencies: []
priority: high
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A regra do Carrinho está pronta e provada (serviço, repositório, faixa etária, empréstimo em lote, sugestão de compra), mas não há tela nenhuma — hoje o recurso é inalcançável pela coordenação.

Prancha aprovada: docs/design/Carrinho.dc.html. São três passos numa tela só:
1. o que levar na rodada — sugestão a partir dos pedidos PENDENTES da turma, filtrada por faixa etária e pelo que está em estante; é sugestão, não decisão: a operadora acrescenta e tira
2. na volta, empréstimo em LOTE — uma tela para trinta alunos, não trinta telas; e o resultado por aluno, com os recusados visíveis e o motivo, porque um aluno bloqueado não derruba o lote
3. sugestão de compra — títulos pedidos que a biblioteca não tem, agrupados por título normalizado e com contagem de demanda. É o argumento que a coordenação leva à direção para pedir verba.

Depende do sistema de design em código.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tela do Carrinho da Leitura construída (8169f80) e ligada no menu (commit seguinte). O recurso deixou de ser inalcançável pela coordenação.

Os três passos da prancha: o que levar (sugestão a partir dos pedidos pendentes da turma, filtrada por faixa etária e disponibilidade — chega marcada e a operadora desmarca, porque o recorte já é do sistema), empréstimo em lote na volta, e sugestão de compra com as duas contagens rotuladas (alunos distintos e pedidos).

O PONTO DO RECURSO, dito em três lugares independentes da tela: um aluno recusado NÃO derrubou o lote. Contagens lado a lado, a frase "as recusas abaixo não desfizeram nenhum deles — cada aluno é uma gravação por conta", e o motivo linha por linha. A tela também distingue dois casos que o serviço distingue: nenhum empréstimo entrou (a rodada continua PLANEJADA) e lote interrompido por falha de infraestrutura (LoteInterrompidoError — faixa de erro, mostra o parcial já gravado, e relança só o que não foi tentado).

SAÍDA DE ESCOPO, aceita: foi preciso criar carrinho-consulta.{service,repository}.ts porque planejarRodada e sugerirExemplares recebem turmaId e NENHUM serviço do sistema sabia dizer que turmas existem (cadastro de turmas é m-3). Sem isso o passo 1 não tem entrada e o recurso seguia inalcançável. Segue o padrão que balcao-consulta já documenta.

TDD conferido: viu vermelho antes (Cannot find module) em resumo-do-lote.test.ts e carrinho-consulta.test.ts.

Evidência — gate COMPLETO na árvore de 06e3770 + o item de menu, exit code conferido um a um:
- lint 0 · typecheck 0 · unit 923 (41 arquivos) · integration 239 (26 arquivos) · e2e 17 · build 0 · docker build 0

NÃO verificado: a tela NÃO foi aberta em navegador — layout, foco, o fluxo real de bipagem e o input de data não foram vistos funcionando. carrinho-consulta.repository.ts NÃO tem teste de integração: suas duas consultas Prisma (filtro por anoLetivo.ativo, orderBy aninhado por exemplar.tombo) passam por typecheck mas nunca tocaram banco. Ficou de fora da prancha, por falta de serviço: acrescentar por tombo, imprimir romaneio, exportar a lista de compra em PDF, e a contagem de pedidos descartados pelo filtro.
<!-- SECTION:NOTES:END -->
