---
id: TASK-027
title: 'Sistema de design em código: tokens, primitivos e casca do painel'
status: Done
assignee: []
created_date: '2026-09-10 17:18'
updated_date: '2026-09-10 17:41'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Entregue no commit 57928fb (main).

O que entrou:
- src/app/globals.css: paleta aprovada no bloco @theme do Tailwind v4 (papel, papel-2, superficie, tinta 1-3, linha 1-2, marca/forte/suave, fita + borda + texto, atencao/alerta/certo cada um com suave/borda/texto), --radius-controle 6px, --radius-cartao 10px e --shadow-cartao. O bloco prefers-color-scheme do boilerplate saiu (não há tema escuro desenhado) e o <html> declara color-scheme: light.
- src/app/layout.tsx: Literata (títulos), IBM Plex Sans (interface) e IBM Plex Mono 400/500/600 (tombo, ISBN, matrícula) por next/font/google em @theme inline; lang="pt-BR"; title vindo de nomeDoProduto().
- src/components/ui/: icone-nomes.ts + icones.tsx (19 ícones de traço em grade de 20, copiados das pranchas, mais o Logotipo com a fita), estados.ts (catálogo puro + descreverDisponibilidade), chip.tsx (Chip, ChipDeContagem), botao.tsx (primaria/secundaria/perigo/fantasma, 40px e 44px, type obrigatório), campo.tsx (Campo normal 40px e de bipagem 52px mono, CampoComRotulo), faixa.tsx (Faixa sucesso/atencao/erro + FaixaDaFita), cartao.tsx, cabecalho-de-tela.tsx, rotulo.tsx, codigo.tsx (Codigo/Tombo/Isbn/Matricula), tabela.tsx.
- src/app/painel/layout.tsx: casca com navegação lateral de 236px, item ativo com barra à esquerda, rodapé com usuário e Sair. Menu com Route tipada e filtro por permissão item a item; só as 4 telas que existem (/painel, /painel/balcao, /painel/acervo, /painel/acervo/novo).
- src/components/painel/: navegacao-lateral.tsx ('use client', só por causa do usePathname) e item-ativo.ts (regra do caminho mais específico, pura).
- tests/unit/design/: estados.test.ts (22) e item-ativo.test.ts (6).
- src/app/painel/page.tsx: única alteração foi tirar o nome do usuário e o link Sair do cabeçalho, que agora moram na casca. Sem isso "Coordenação" apareceria duas vezes e o getByText do e2e de login quebraria.

Onde ficou a autorização: a validação de sessão passou a existir TAMBÉM no layout (ponto por onde toda tela de /painel/* passa), sem tirar a das páginas — layout não volta a rodar em navegação de cliente entre irmãs e Server Action nenhuma passa por ele. O filtro de permissão do menu não é autorização; quem autoriza é o serviço.

Evidência (comandos rodados, saída real):
- npx eslint src tests --max-warnings=0 -> exit 0
- npm run typecheck (next typegen && tsc --noEmit) -> exit 0
- npm run test:unit -> "Test Files 34 passed (34) / Tests 715 passed (715)", exit 0
- compilação do globals.css pelo @tailwindcss/postcss via postcss (fora do .next, para não atropelar a outra frente): 105.716 bytes, zero avisos; conferido que .bg-papel-2, .text-tinta-2, .border-linha-2, .bg-marca-suave, .bg-fita-suave, .text-fita-texto, .border-atencao-borda, .rounded-cartao, .rounded-controle, .border-l-fita, .h-[52px], .focus:ring-marca/15 e .font-serif/.font-mono (com var(--fonte-titulo)/var(--fonte-codigo) inline) saem no CSS, e que sobraram 0 regras prefers-color-scheme.

Provado por MUTAÇÃO (as duas metades da regra "estado nunca é dito só pela cor"):
- palavra de um estado apagada -> "EMPRESTADO tem palavra própria" reprova (1 failed | 21 passed)
- ícone de um estado apagado -> typecheck reprova (TS2741 em estados.ts, TS2339 em chip.tsx)
- regra do item ativo mais específico removida -> 2 testes de item-ativo reprovam

NÃO verificado: npm run build, npm start, test:integration e test:e2e não foram rodados nesta rodada — a outra frente é dona do .next, do Postgres e da porta 3000 agora. Em particular, o download das fontes pelo next/font só acontece no build; as três famílias foram conferidas contra o font-data.json do Next (Literata e IBM Plex Sans têm versão variável, IBM Plex Mono não tem e por isso os pesos são declarados).

Fora do meu escopo, achado durante a verificação: "npm run lint" (eslint .) reprova num arquivo de OUTRA frente, .claude/worktrees/agent-a30c971c6d7de677a/src/modules/circulacao/circulacao.deps.ts, com marcador de conflito de merge. Nada meu; eslint sobre src e tests está limpo.
<!-- SECTION:NOTES:END -->
