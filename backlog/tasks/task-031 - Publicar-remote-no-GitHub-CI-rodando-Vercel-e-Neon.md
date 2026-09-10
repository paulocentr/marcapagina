---
id: TASK-031
title: 'Publicar: remote no GitHub, CI rodando, Vercel e Neon'
status: To Do
assignee: []
created_date: '2026-09-10 17:18'
updated_date: '2026-09-10 20:21'
labels:
  - infra
milestone: m-0
dependencies: []
priority: high
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nada foi implantado e nada nunca rodou fora desta máquina.

Estado real em 10/09/2026:
- o repositório NÃO tem remote, então o workflow do GitHub Actions está escrito e versionado mas NUNCA executou uma vez
- não existe projeto na Vercel
- não existe banco no Neon
- toda a verificação até hoje é local, com Postgres em Docker

Enquanto isso não existir, "verde no CI" é uma afirmação sem medição, e não há ambiente para a coordenação ver o sistema.

Ordem: criar o remote e ver o CI rodar de verdade primeiro (é o que revela o que só funciona nesta máquina), depois Neon, depois Vercel. Antes de subir com aluno real, TASK-025 (base legal LGPD) tem de estar resolvido — são dados de menores.

O deploy tem de continuar portátil: output standalone e Dockerfile versionados, cron como endpoint HTTP por segredo. Nunca API proprietária da Vercel.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PARTE DO GITHUB FEITA em 10/09/2026: https://github.com/paulocentr/marcapagina — público, conta paulocentr.

O CI executou pela PRIMEIRA VEZ (nunca havia rodado, por não haver remote) e passou verde em 3m37s. Roda a cada push: lint, typecheck, unit, prisma migrate deploy, integration, build, playwright install, e2e, docker build. Sobe o próprio Postgres e usa segredos descartáveis rotulados como tal — não depende de nada configurado no GitHub.

TRÊS COISAS QUE A PRIMEIRA EXECUÇÃO REVELOU E FORAM CORRIGIDAS:
1. O e2e NÃO rodava no CI. É o único gate que exercita a build de produção com navegador, e foi ele que pegou o prefetch de /sair apagando a sessão — bug que lint, typecheck e unidade não veriam nunca. Ter a suíte verde na máquina local e ausente no CI era ter a rede de segurança no chão.
2. Com o e2e no CI, ele REPROVOU de primeira: o route announcer do Next duplica o texto do <h1>, e getByText("Ana Souza") casava com dois elementos. Verde local, vermelho no CI — corrida, não sorte. Escopado ao <main>.
3. actions/checkout@v4 e setup-node@v4 forçavam Node 20 depreciado. Subiram para v5.

ARMADILHA ENCONTRADA ANTES DE EMPURRAR: havia DUAS contas logadas no gh e a ATIVA era paulowagercasino. Um push teria ido para a conta errada em silêncio. Trocada para paulocentr, e a regra ficou registrada no CLAUDE.md.

VERIFICADO ANTES DO PUSH, porque o repositório é público: .env está gitignored, .env.example tem os segredos vazios, nenhum arquivo de segredo rastreado, nenhum segredo literal no que está versionado.

O QUE FALTA, e depende do Paulo: Vercel e Neon travam num login interativo que eu não consigo completar. Ele roda `npx vercel login` e `npx neonctl auth` uma vez, e daí em diante o resto é automatizável — criar projeto, banco, variáveis de ambiente e deploy. Não pedi token colado em conversa de propósito: segredo em conversa fica no histórico.

Antes de subir com aluno REAL: TASK-025 (base legal LGPD) tem de estar resolvido. São dados de menores.
<!-- SECTION:NOTES:END -->
