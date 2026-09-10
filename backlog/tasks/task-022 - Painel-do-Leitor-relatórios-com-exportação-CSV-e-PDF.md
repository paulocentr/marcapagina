---
id: TASK-022
title: 'Painel do Leitor: relatórios com exportação CSV e PDF'
status: Done
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 21:42'
labels:
  - relatorios
  - backend
  - frontend
  - pdf
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENTADO (serviço + tela + exportação), em TDD.

Módulo `src/modules/relatorios/`: `periodo.ts` (recorte de mês/bimestre/ano
NO FUSO DA ESCOLA, reusando `intervaloDoDiaDaEscola`), `escala.ts` (geometria
pura do gráfico), `painel-do-leitor.service.ts`, `relatorios.repository.ts`,
`relatorios.deps.ts`, `exportacao.ts` (CSV + PDF).
Tela `src/app/painel/relatorios/` e download em `src/app/api/relatorios/`.

CORREÇÃO DO CARD HONRADA: engajamento é POR CAPITA. O gráfico de barras é o
absoluto (série única, uma cor, sem legenda, sem eixo duplo) e a tabela ao lado
traz `Por aluno` — com nota na tela dizendo que a turma maior empresta mais só
por ser maior.

Evidência — quatro comandos, exit code conferido:
  npx eslint src/modules/relatorios src/app/painel/relatorios tests --max-warnings=0  -> exit 0
  npx tsc --noEmit                                                                    -> exit 0
  npm run test:unit                       -> exit 0, 66 arquivos, 1846 testes
  DATABASE_URL=...mp_frente_g npm run test:integration -> exit 0, 32 arquivos, 367 testes
Do total, 158 testes unitários e 38 de integração são desta frente.
A suíte de período roda idêntica em TZ local, TZ=UTC e TZ=Asia/Tokyo (132 testes cada).

Provado por MUTAÇÃO (removi a proteção e confirmei o vermelho):
  1. recorte do período no fuso da escola  -> 8 testes reprovam
  2. `hoje` normalizado ao dia da escola nas consultas de atraso -> 1 reprova
  3. turmaId desconhecido não some do gráfico (`has` em vez de `?? null`) -> 2 reprovam
  4. acervo parado exigindo exemplar vivo -> 4 reprovam
  5. janela meia-aberta (`lt` no fim) -> 1 reprova

NÃO VERIFICADO: a tela nunca foi aberta em navegador (sem `build`/`dev`/e2e nesta
frente). A cobertura de desenho é `renderToStaticMarkup` sobre os quatro
componentes.

DEPENDE DE OUTRA FRENTE: não há item de menu — `src/app/painel/layout.tsx` é de
outra frente. Hoje a tela só é alcançável por URL (`/painel/relatorios`).

FICOU DE FORA da prancha, por falta de dado: "média de dias por empréstimo"
(exigiria diferença de datas em SQL, e SQL cru passa por fora da extensão de
tenant); os botões "Avisar os responsáveis" e "Lista impressa por turma"
(TASK-024, não existe); e os links "ver todos os atrasados" e "ver a lista para o
carrinho" (as telas não existem — a lista aparece na própria tela em vez de
apontar para 404).
<!-- SECTION:NOTES:END -->
