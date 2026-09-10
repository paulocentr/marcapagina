---
id: TASK-027
title: 'Sistema de design em código: tokens, primitivos e casca do painel'
status: In Progress
assignee: []
created_date: '2026-09-10 17:18'
labels:
  - design
  - frontend
milestone: m-0
dependencies: []
priority: high
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
O Paulo aprovou o sistema de design em 10/09/2026 ("o design esta aprovado siga esse UI kit e linha"). As pranchas estão em docs/design/*.dc.html e publicadas como canvas em https://claude.ai/code/artifact/975c7374-b76e-4da0-84d6-1f651070e0f5

Hoje o código NÃO tem design system: src/app/globals.css e src/app/layout.tsx são o boilerplate do create-next-app (Arial, #171717, metadata "Create Next App", fontes Geist, lang="en" num sistema em pt-BR).

Esta tarefa transforma o kit aprovado em fundação:
- paleta no bloco @theme do Tailwind v4, para os utilitários existirem (papel, tinta, marca, fita, atencao, alerta, certo)
- três famílias com trabalho definido: Literata nos títulos, IBM Plex Sans na interface, IBM Plex Mono em TOMBO, ISBN e MATRÍCULA sempre
- primitivos em src/components/ui/: Botao, Campo (com variante de bipagem de 52px), Chip de estado, Faixa de resultado, Cartao, Tombo
- casca do painel em src/app/painel/layout.tsx: navegação lateral de 236px

Duas regras do sistema que a implementação tem de tornar difíceis de furar:
- estado NUNCA é dito só pela cor: todo chip carrega ícone E palavra, porque o balcão é operado sob pressa e às vezes em tela com brilho ruim
- só entram atalhos para telas que EXISTEM; um item que leva a 404 ensina a operadora a desconfiar do menu inteiro
<!-- SECTION:DESCRIPTION:END -->
