---
id: TASK-034
title: 'Camada de serviço do aluno: o portal não tem o que chamar'
status: Done
assignee: []
created_date: '2026-09-10 19:18'
updated_date: '2026-09-10 21:59'
labels:
  - portal
  - backend
  - auth
  - merged
milestone: m-3
dependencies: []
priority: high
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DESCOBERTO em 10/09/2026 ao reescrever o portal do aluno contra a prancha aprovada. É bloqueio de arquitetura, não de desenho.

NÃO EXISTE NENHUM SERVIÇO QUE UMA SESSÃO DE ALUNO POSSA CHAMAR. Todo serviço de circulação chama exigirPermissao com permissão de EQUIPE, e PrincipalAluno não carrega permissão nenhuma. Consequência: a prancha docs/design/Portal.dc.html é inconstruível hoje, inteira.

Está atrás de permissão de equipe, e por isso ficou fora do portal:
- livros em mãos, autor, prazo, "atrasado há N dias" (não há serviço "meus empréstimos"; emprestimosEmCursoRepository existe mas repositório é proibido em src/app/)
- turma e série do próprio aluno (só em LeitorParaBalcao, atrás de aluno:ver)
- limite da série ("você tem 2, pode levar 3")
- "sua reserva chegou" e prazo de retirada (reserva:criar / reserva:gerenciar)
- renovar (emprestimo:renovar)
- pedir no carrinho (carrinho:gerenciar)
- meta, medalhas e progresso — esses são m-4, não existem em lugar nenhum

O que o portal mostra hoje: saudação, matrícula, e um cartão honesto dizendo que os livros ainda não aparecem ali e que o prazo está registrado na biblioteca. Nenhum número inventado, de propósito: prazo errado no portal faz o aluno devolver atrasado confiando na tela.

O QUE PRECISA SER DECIDIDO ao construir: como o aluno é autorizado sobre os dados DELE MESMO. Não é dar aluno:ver ao aluno — isso o deixaria ver colega. É uma operação cujo escopo é o próprio id da sessão, e a spec §2.3 é dura nisso: o portal não mostra nenhum dado sensível, nem de colega nem de responsável. As mitigações são parte da definição de pronto, não opcionais.

Bloqueia TASK-020 (portal do aluno) e a parte de renovação de TASK-032.
<!-- SECTION:DESCRIPTION:END -->
