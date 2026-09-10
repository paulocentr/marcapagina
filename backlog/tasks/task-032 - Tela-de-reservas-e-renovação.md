---
id: TASK-032
title: Tela de reservas e renovação
status: Done
assignee: []
created_date: '2026-09-10 17:20'
updated_date: '2026-09-10 20:15'
labels:
  - circulacao
  - frontend
  - design
  - merged
milestone: m-2
dependencies: []
priority: medium
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Depois que TASK-016 fechar, reservas e renovação existirão como regra testada mas sem nenhuma tela — nem para a coordenação nem para o aluno.

Falta:
- fila de reserva por obra, para a coordenação ver quem é o próximo e até quando o exemplar fica separado
- prateleira de separados no balcão (a prancha docs/design/Devolucao.dc.html já mostra ela na trilha lateral, com o item que vence hoje)
- renovar no balcão e renovar no portal do aluno, respeitando o máximo de renovações da série
- a tira de reserva impressa que vai junto do exemplar separado

O estado "separado para reserva" usa a FITA terracota no sistema de design: é a única faixa com barra colorida e título em serifa, porque é ela que impede a operadora de devolver à estante um exemplar reservado e travar a fila.

Depende de TASK-016 e do sistema de design em código (TASK-027).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tela de reservas, prateleira de separados e renovação construída (6133a1b, 46d31d8) e ligada no menu com a permissão reserva:gerenciar e o ícone da fita.

Prateleira em três grupos — Prazo vencido, Vence hoje, Ainda no prazo — mantendo dentro de cada um a ordem de prazo mais curto que o serviço entrega. Cada linha traz título, tombo, estante, leitor e turma, com o Chip SEPARADO_PARA_RESERVA (fita terracota) mais um chip de prazo.

O CASO EM QUE A TELA E A PRATELEIRA FÍSICA DISCORDAM, que era a pergunta do card: prazo vencido CONTINUA na lista, porque o livro está fisicamente lá até o cron passar. A tela diz isso e nomeia o que vai acontecer na virada do dia — "a vez passa para Rafael Menezes" ou "ninguém mais espera por este título: o exemplar volta à estante". A atribuição consome a fila cópia por cópia na ordem do prazo, igual a expirarReservasVencidas; nomear o mesmo aluno em duas linhas avisaria um duas vezes e esqueceria o outro. Reserva que não aparece em fila nenhuma fica INDETERMINADO e a tela ADMITE que não sabe.

Não desenhou botão de "entregar" de propósito: um segundo caminho deixaria reserva atendida sem empréstimo gravado. A entrega é bipar o tombo no balcão, que é o que fecha a reserva.

SERVIÇO ACRESCENTADO: fila-de-reservas.{service,repository}.ts, consulta pura (nada ali escreve), porque filaDaObra devolvia só identificadores e um alunoId na tela não responde "quem é o próximo". PessoaNaFila é união discriminada pelo status: no ramo DISPONIVEL o tombo e o prazo existem no TIPO, então não há caminho para a tela escrever "reservado até —".

TDD conferido: quatro vermelhos observados antes de implementar (módulo inexistente em fila-de-reservas.service, .repository, reservas-na-tela, e proximoDaFila não sendo função). Uma garantia PROVADA POR MUTAÇÃO: em classificarRetirada, sem os parênteses de venceHoje !== (dias === 0) a expressão vira (boolean) === 0, sempre falsa, guarda morta — removidos os parênteses, o teste res_7 reprovou; restaurados, passa.

Evidência — gate COMPLETO local E no CI do GitHub, exit code conferido um a um:
- lint 0 · typecheck 0 · unit 1048 (44 arquivos) · integration 246 (27 arquivos) · e2e 17 · build 0 · docker build 0
- CI verde em https://github.com/paulocentr/marcapagina, incluindo o passo de e2e que passou a existir nesta rodada

NÃO verificado: a tela NÃO foi aberta em navegador — layout, quebra de linha dos chips e o router.refresh() depois de cancelar não foram vistos rodando. O ramo de recusa por permissão está no código mas não foi exercitado. Ficou de fora, por falta de serviço: criar reserva (é gesto do balcão), aviso antecipado de fila na renovação (a recusa chega no clique) e expirar à mão.
<!-- SECTION:NOTES:END -->
