---
id: TASK-033
title: Consultas que as telas pedem e o backend não tem
status: Done
assignee: []
created_date: '2026-09-10 19:18'
updated_date: '2026-09-10 19:39'
labels:
  - circulacao
  - backend
milestone: m-2
dependencies: []
priority: high
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A reescrita das telas contra o kit (TASK-029) parou em várias partes das pranchas por falta de consulta, não por falta de desenho. As três frentes recusaram desenhar com número inventado, e isso está certo: número falso no balcão ensina a operadora a não confiar em nenhum.

Falta, no balcão:
- a lista de livros EM MÃOS do leitor (hoje buscarLeitorParaBalcao devolve contagem, não títulos)
- "Últimos do balcão" — histórico do dia, empréstimos e devoluções
- "Prateleira de separados" — exemplares aguardando quem reservou, com o que vence hoje
- contadores "atendidos hoje" e "devolvidos hoje"
- prazo da série em DIAS na ficha do leitor (hoje só vem o limite simultâneo) e a data prevista ANTES de confirmar
- título/autor/estante do exemplar ao lado do tombo bipado
- nome e turma do próximo da fila, na faixa de separar exemplar

Falta, na ficha da obra:
- nome de categoria e de localização (o serviço devolve categoriaId/localizacaoId; imprimir cuid na ficha é pior que omitir)
- "catalogada em" / "entrou em"
- nome de quem está com o exemplar emprestado

Nenhuma dessas é regra nova — é consulta. Mas é repositório e serviço novos, com teste, não ajuste de tela.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Entregue em e98d149. As seis consultas do card, cada uma com unitário
contra fake (regra) e integração contra Postgres (query).

## O que entrou

1. **Livros em mãos** — `livrosEmMaos(alunoId)` entrou no contrato de
   consulta do balcão e SUBSTITUIU `contarAtivosDoAluno` /
   `contarAtrasadosDoAluno`. `buscarLeitorParaBalcao` devolve `emMaos`
   (título, tombo, previstaPara, renovações, atrasado, diasDeAtraso), e
   `emprestimosAtivos` e o bloqueio de atraso derivam da MESMA lista.
   "Atrasado" não é campo: o repositório não devolve nada com esse nome —
   há teste de integração que afirma a lista exata de chaves.
2. **Prateleira de separados** — `listarPrateleiraDeSeparados(principal,
   hoje, deps)`, exige `reserva:gerenciar` (o MONITOR não tem
   `relatorio:ver`). `venceHoje`/`vencido`/`diasParaRetirar` derivados, na
   mesma fronteira do cron de expiração. O vencido continua na lista até o
   cron passar, porque o livro está fisicamente na prateleira.
3. **Últimos do balcão** — `resumoDoDiaNoBalcao(principal, {hoje, limite},
   deps)` devolve `atendidosHoje`, `devolvidosHoje` e a tira de
   movimentos. Contadores das listas COMPLETAS do dia; o limite corta só a
   tira. Janela = dia da ESCOLA, via `intervaloDoDiaDaEscola` (novo em
   prazo.ts, testado em três fusos).
4. **Prazo da série em dias** — `prazoDaSerieEmDias` e
   `devolucaoPrevistaSeEmprestarHoje` na ficha, via
   `calcularDataDeDevolucao`, o mesmo caminho que o empréstimo grava.
5. **Exemplar bipado** — `conferirExemplarNoBalcao(principal, tombo,
   deps)`: título, autores em ordem, situação e localização (nome,
   corredor, estante, prateleira). Exige `obra:ver`.
6. **Próximo da fila** — vem na mesma resposta: nome, turma, posição e
   `jaSeparadoParaEle` (derivado no serviço).

## Evidência

    npx eslint src/modules/circulacao tests --max-warnings=0   exit 0
    npx tsc --noEmit                                            exit 0
    npm run test:unit           923 passed (41 arquivos)         exit 0
    npm run test:integration    239 passed (26 arquivos)         exit 0

Vermelho observado antes de cada implementação:
- 20 unitários quebrados em balcao-consulta (`contarAtivosDoAluno is not
  a function`) antes de `livrosEmMaos`;
- 8 de integração (`livrosEmMaos is not a function`);
- 6 unitários (`intervaloDoDiaDaEscola is not a function`);
- módulo inexistente nos dois painéis e na bipagem, antes de escrevê-los.

## NÃO verificado

`npm run build`, `npm run typecheck` e `test:e2e` não rodaram — são do
gate final do Paulo, e o typecheck escreve em `.next/`. Nada foi ligado
em tela: a próxima etapa é a rota consumir estas quatro funções.
<!-- SECTION:NOTES:END -->
