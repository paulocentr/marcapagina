---
id: TASK-035
title: Ligar a trilha lateral do balcão nas consultas novas
status: Done
assignee: []
created_date: '2026-09-10 19:42'
updated_date: '2026-09-10 21:59'
labels:
  - circulacao
  - frontend
  - merged
milestone: m-2
dependencies: []
priority: high
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-033 entregou as seis consultas (livros em mãos, prateleira de separados, últimos do balcão + contadores, prazo da série em dias e data prevista, exemplar bipado, próximo da fila). Todas saem prontas de dependenciasDaCirculacao(). MAS nada foi ligado em tela: a frente das consultas não tocou src/app/** de propósito, porque a tela do balcão estava sendo reescrita ao mesmo tempo.

Então a trilha lateral da prancha docs/design/Balcao.dc.html e docs/design/Devolucao.dc.html continua ausente, e a ficha do leitor continua sem o prazo e sem a data prevista, mesmo com o dado existindo.

Este card é a ligação: a tela consumir buscarLeitorParaBalcao (que agora traz emMaos, prazoDaSerieEmDias e devolucaoPrevistaSeEmprestarHoje), listarPrateleiraDeSeparados, resumoDoDiaNoBalcao e conferirExemplarNoBalcao.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A tela do balcão passou a ter as DUAS colunas da prancha: a operacional
(máx. 780px) e a trilha de 336px, que envolve pela `flex-wrap` em tela
estreita. `src/app/painel/balcao/page.tsx` virou a casca — ela guarda o
leitor e o dia, porque as duas colunas falam do mesmo leitor e do mesmo
dia; `emprestar.tsx`, `devolver.tsx` e `trilha-lateral.tsx` são os
componentes; `trilha.ts` é o módulo puro com tudo que a trilha DIZ.

## O que foi ligado

1. **Em mãos de X** — de `buscarLeitorParaBalcao().emMaos`. Cada livro
   com título, tombo em mono e chip do kit ("Atrasado · 8 dias" /
   "Em dia · até 19/09").
2. **O contador não pode mais divergir da lista.** `emprestimosAtivos`
   saiu do contrato da action: o "2 de 3" da ficha, os blocos de vaga e o
   "2 de 3" da trilha são `emMaos.length` — a mesma lista desenhada ao
   lado. Não existe segundo caminho para o número.
3. **Últimos do balcão** e **Devoluções de hoje** — de
   `resumoDoDiaNoBalcao`, com "saiu"/"voltou" em palavra e o atraso da
   devolução em palavra. Os cabeçalhos contam o DIA; quando a tira corta,
   `fraseDoCorte` confessa ("mostrando os 20 mais recentes de 58").
4. **Prateleira de separados** — de `listarPrateleiraDeSeparados`, com
   três destaques exaustivos (até dd/mm · vence hoje · retirada vencida),
   cada um com palavra, ícone e cor, mais onde o exemplar está guardado.
   Sem `reserva:gerenciar`, a prateleira explica a recusa em vez de
   sumir, e a tira de devoluções continua.
5. **prazo da série: N dias** na linha da ficha e **devolução prevista:
   dd/mm/aaaa** ao lado do botão de confirmar.
6. **Conferência do tombo** — `conferirExemplarNoBalcao`, com debounce de
   320ms e descarte de resposta atrasada: título, autoria, localização e
   chip de situação ao lado do campo, mais aviso de quem espera na fila
   (dois textos distintos para `jaSeparadoParaEle` true/false).
7. **atendidos hoje / devolvidos hoje** no alto de cada aba. Sem dado,
   nenhum número — zero desenhado diria que o balcão não atendeu ninguém.

## O que NÃO regrediu

Foco de volta na matrícula após emprestar · bloqueios antes do campo do
livro (inclusive os da recusa) · justificativa só com bloqueio, com o
texto da auditoria · cursor pula para o tombo ao achar o leitor ·
`FaixaDaFita` só em "SEPARE ESTE EXEMPLAR" · texto de Danificado ·
matrícula e tombo em mono, bipagem de 52px · `Esc` recomeça · `<main>`.

## Evidência

    npx eslint src/app/painel/balcao --max-warnings=0   exit 0
    npx tsc --noEmit                                    exit 0
    npm run test:unit    1048 passed (44 arquivos)      exit 0

Dos 1048, 37 são novos, em `tests/unit/balcao/trilha.test.ts`. Vermelho
observado antes de implementar: primeiro `Cannot find module
'@/app/painel/balcao/trilha'` (32 casos), depois `textoDaLocalizacao is
not a function` (5 casos). O teste também pegou um defeito real durante a
implementação — `a !== b === 0` na guarda de contradição da prateleira,
que TypeScript e o teste reprovaram juntos.

## NÃO verificado

`npm run build`, `npm start`, `npm run typecheck`, `test:integration` e
`test:e2e` não rodaram: são do gate final, outra frente é dona do banco e
o typecheck escreve em `.next/`. **A tela não foi aberta em navegador** —
não há como, sem o banco. Render de componente também não foi coberto por
teste: o project `unit` transforma JSX no runtime clássico (o tsconfig do
Next usa `jsx: preserve`), então renderizar um `.tsx` exigiria mexer no
`vitest.config.ts` compartilhado, que não é deste card.

## Da prancha, ficou de fora por falta de dado

- "separado" e "recusado" como tipos de movimento na tira: o serviço só
  devolve RETIRADA e DEVOLUCAO, e recusa não é movimento gravado.
- O link "tudo" do cabeçalho da tira: não existe tela de histórico, e
  atalho para 404 ensina a operadora a desconfiar do resto.
- A miniatura de capa em "Em mãos de": não há capa no schema.
- "estado: Novo" ao lado do tombo bipado: `ExemplarBipado` não traz
  estado de conservação (traz situação, que é o que a tela mostra).
- "Estante 2-C" no bloco "Exemplar agora" da devolução: `devolver` não
  devolve localização, e buscá-la custaria uma segunda ida ao banco no
  meio da devolução.
- `renovacoes`, que a consulta traz: o balcão não tem tela de renovação
  (TASK-032), e o número sozinho na ficha não decide nada.
<!-- SECTION:NOTES:END -->
