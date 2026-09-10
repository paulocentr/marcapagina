---
id: decision-001
title: 'Reimportar planilha atualiza nome e turma, nunca a data de nascimento'
date: '2026-09-10 22:44'
status: accepted
---
## Context

O importador de planilha IGNORA a linha cuja matrícula já existe e nunca altera
cadastro existente. A tela diz "já cadastrado — será ignorado", que hoje é a
verdade.

O problema é o gesto natural da escola: a secretaria corrige um nome na planilha,
reenvia, e nada muda — sem erro nenhum na tela. Ela vai acreditar que corrigiu.

Mas atualizar tudo tem um risco específico neste sistema: **a data de nascimento é
metade da senha do aluno.** Ele autentica por matrícula + data de nascimento
(decisão 3 do projeto, spec §2.3). Uma data errada na planilha sobrescrevendo a
cadastrada trancaria o aluno fora do portal, e nada na tela indicaria a causa —
ele simplesmente não entraria mais.

## Decision

Reimportar **atualiza nome e turma**. A **data de nascimento nunca é alterada pela
planilha** — só pela ficha do aluno, com uma pessoa vendo.

Decidido pelo Paulo em 2026-09-10, no terminal, entre três opções (ignorar como
hoje / atualizar nome e turma / atualizar tudo).

## Consequences

- O plano que a tela mostra antes de gravar passa a ter **três** destinos e não
  dois: entram, **atualizados**, e com problema. O texto atual ("já cadastrado —
  será ignorado") passa a ser mentira e tem de sair.
- Quando a planilha trouxer nascimento diferente do cadastrado, o plano **avisa a
  divergência e diz que não vai mudar**. É a única forma de a secretaria descobrir
  que uma das duas bases está errada — ignorar em silêncio esconderia o conflito.
- Corrigir data de nascimento continua sendo trabalho manual, um por um. É o preço
  aceito para não derrubar acesso de aluno em lote.
- A importação continua tudo-ou-nada.
- Não colide com a decisão de rodar com dado mínimo (TASK-025): contato de
  responsável continua fora do sistema até a escola formalizar a base legal.
