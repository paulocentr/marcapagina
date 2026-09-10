---
id: TASK-031
title: 'Publicar: remote no GitHub, CI rodando, Vercel e Neon'
status: Done
assignee: []
created_date: '2026-09-10 17:18'
updated_date: '2026-09-10 20:54'
labels:
  - infra
  - prod
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
PUBLICADO em 10/09/2026. Site https://marcapagina-escola.vercel.app · código https://github.com/paulocentr/marcapagina (público, conta paulocentr).

GITHUB: repositório criado e CI executando a cada push. Rodou pela PRIMEIRA VEZ nesta sessão (nunca havia rodado, por não haver remote) e passa verde: lint, typecheck, unit, prisma migrate deploy, integration, build, playwright install, e2e, docker build. O CI sobe o próprio Postgres e usa segredos descartáveis — não depende de nada configurado no GitHub.

NEON: projeto marcapagina em aws-sa-east-1 (São Paulo, perto da escola), Postgres 18. Cinco migrations aplicadas pela conexão DIRETA; o runtime na Vercel usa a conexão POOLER, que é o certo para serverless. O schema não tem directUrl, então isso foi resolvido por variável na hora da migração, sem alterar código.

VERCEL: projeto marcapagina, quatro variáveis de produção (DATABASE_URL no pooler, SESSION_SECRET e CRON_SECRET gerados na hora, ESCOLA_PADRAO_SLUG). Os dois crons do vercel.json ficam dentro do limite do Hobby.

Evidência — verificação em PRODUÇÃO, não local:
- rota de cron: 401 sem segredo, 401 com segredo errado, 200 com o certo devolvendo escolasProcessadas: 1. Isso prova Prisma conectado ao Neon lendo a tabela de escolas, e prova a comparação de segredo em tempo constante.
- navegador de verdade (Playwright contra a URL pública): login da coordenação chega em /painel; menu com Painel, Balcão, Acervo, Catalogar por ISBN, Reservas, Carrinho da Leitura; as cinco telas renderizam com h1 correto; login do aluno chega em /aluno com "Olá, Ana Souza"; ZERO erro de JS na página.
- curl cru de fora, sem credencial: HTTP 200 sem redirect, conteúdo é a nossa tela.

DUAS ARMADILHAS ENCONTRADAS E FECHADAS:
1. Havia DUAS contas logadas no gh e a ATIVA era paulowagercasino. Um push teria ido para a conta errada em silêncio.
2. O repositório é público e a senha do seed está nele. Semear produção com ela deixaria qualquer leitor do repositório entrar no sistema ao vivo. O seed ganhou SEED_SENHA_STAFF (padrão intacto, para o CI e o e2e não quebrarem) e produção foi semeada com senha gerada na hora.

EU ERREI UMA MEDIÇÃO no caminho, e vale registrar: afirmei que o site estava alcançável de fora porque um curl -L devolveu 200. Era 200 da PÁGINA DE LOGIN DA VERCEL — o -L seguiu o redirect e eu li o código da página errada. O SSO da Vercel estava ligado. Descoberto pelo POST, que devolveu 302 para vercel.com/sso-api. Desligado com autorização do Paulo.

NÃO VERIFICADO / PENDENTE:
- a senha do banco do Neon apareceu na saída do CLI e está no histórico da sessão. RECOMENDADO ROTACIONAR.
- o deploy é MANUAL (vercel --prod). Git não foi conectado de propósito: a Vercel implantaria a cada push sem esperar o CI, e o gate verde é a regra da casa.
- marcapagina.vercel.app já está tomado por outro projeto; o endereço é marcapagina-escola.vercel.app.
- nenhum backup do Neon foi testado; a rota de exportação existe mas não foi exercitada em produção.
- ambiente de preview e staging não existem: só produção.
<!-- SECTION:NOTES:END -->
