---
id: TASK-029
title: Reescrever as telas existentes contra o kit aprovado
status: Done
assignee: []
created_date: '2026-09-10 17:18'
updated_date: '2026-09-10 19:18'
labels:
  - design
  - frontend
  - merged
milestone: m-0
dependencies: []
priority: high
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As telas que existem hoje (entrar, aluno/entrar, painel, painel/balcao, painel/acervo, painel/acervo/[obraId], painel/acervo/novo, aluno) foram escritas com utilitários neutros do Tailwind soltos, antes de existir design system. Depois que os tokens e os primitivos entrarem (ver o card do sistema de design em código), cada uma tem de ser refeita contra o kit.

As pranchas aprovadas são a referência: docs/design/Balcao.dc.html, Devolucao.dc.html, Catalogar.dc.html, Acervo.dc.html.

O que NÃO pode se perder na reescrita — é comportamento, não enfeite:
- o cursor volta à MATRÍCULA depois de emprestar, e ao ISBN depois de catalogar
- os bloqueios do leitor aparecem ANTES do campo do livro
- o campo de justificativa só existe quando há bloqueio a liberar
- tombo, ISBN e matrícula em mono
- o aviso de "separe este exemplar" continua impossível de ignorar

Dá para paralelizar por tela.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
As 9 telas existentes reescritas contra o kit aprovado, em três frentes paralelas: 19e23d6 (balcão), 40d67bb (entradas, home, painel, portal), aed8701 (acervo).

O SELETOR ACESSÍVEL FOI TRATADO COMO CONTRATO. O e2e cobre estas telas e havia acabado de sair de 10 falhas para verde; nenhuma das três frentes podia rodar e2e (build e porta 3000 são recurso disputado). Extraí os 25 seletores de tests/e2e/*.spec.ts e entreguei como contrato, e cada frente conferiu um por um por leitura. Aguentou: 17/17 no gate final.

Duas armadilhas que os briefings tiveram de carregar: "Imprimir etiquetas" tem de continuar <a href> e nunca <Link> (gate do prefetch), e os avisos são procurados DENTRO de <main>, porque o Next monta um role="alert" próprio em toda página.

Evidência — gate COMPLETO na árvore de aed8701, exit code conferido um a um:
- npm run lint -> exit 0
- npm run typecheck -> exit 0
- npm run test:unit -> 37 arquivos, 814 testes, exit 0
- npm run test:integration -> 23 arquivos, 201 testes, exit 0
- npm run test:e2e -> 17 testes, exit 0
- npm run build -> exit 0
- docker build -> exit 0

NÃO VERIFICADO, e é a lacuna que importa: NENHUMA TELA FOI ABERTA EM NAVEGADOR. Cor, espaçamento, quebra de linha, responsividade, ordem de tabulação, foco e o comportamento do Esc não foram vistos funcionando — só compilam e passam nos gates. O e2e cobre fluxo, não aparência.

O QUE FICOU DE FORA DAS PRANCHAS, por falta de dado no backend e não por escolha de desenho (as três frentes recusaram inventar número, e isso está certo — número falso no balcão ensina a operadora a não confiar em nenhum): a trilha lateral do balcão inteira (em mãos, últimos do balcão, prateleira de separados, atendidos hoje), capa da obra, categoria e estante por nome na ficha, e o portal do aluno quase todo. Cards próprios.
<!-- SECTION:NOTES:END -->
