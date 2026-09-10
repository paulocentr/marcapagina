---
id: TASK-028
title: 'Suíte e2e vermelha: sessão perdida dentro da Server Action'
status: Done
assignee: []
created_date: '2026-09-10 17:18'
updated_date: '2026-09-10 18:15'
labels:
  - infra
  - auth
  - backend
  - merged
milestone: m-0
dependencies: []
priority: high
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
npm run test:e2e dá 10 falhas de 17. As 5 specs de login passam; quase todas as 12 de tests/e2e/acervo.spec.ts falham.

Sintoma: depois do login, a Server Action consultarIsbnAction devolve "É preciso entrar para continuar." — NaoAutenticadoError lançado por requireStaff(), ou seja lerSessao() não achou ou não validou o cookie mp_sessao.

O que já está apurado (10/09/2026):
- o login funciona e a sessão vale na NAVEGAÇÃO: /painel valida sessão de staff no servidor e o beforeEach afirma toHaveURL(/painel), e passa
- é NÃO-DETERMINÍSTICO: numa rodada falharam 10 e passaram 7; rodando só acervo.spec.ts falharam 9 e passaram 3, e o conjunto que passou MUDOU
- dirigindo o MESMO fluxo à mão contra o mesmo servidor de produção, a action responde ok:true — o cookie está presente, httpOnly, secure, sameSite Lax
- o servidor não loga exceção nenhuma; a recusa é limpa
- descartado: rate limit de login (tentativas.ts só é usado nas duas actions de login), SESSION_SECRET ausente, fixture de metadados
- suspeito ainda de pé: gravarCookieDeSessao marca secure quando NODE_ENV=production, e o e2e roda contra a build de produção; playwright.config.ts usa reuseExistingServer quando não é CI

Gravidade: este é o único gate vermelho do projeto. Enquanto ele estiver assim, nenhum card pode alegar verificação completa, e é isso que está escrito nas Evidências de TASK-013/014/015/017/018.

Regra para a correção: não enfraquecer a asserção nem a segurança da sessão para pintar de verde. O teste tem de continuar provando o requisito da spec §5.5 (catalogar em série e o cursor voltar ao ISBN).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CAUSA RAIZ: o PREFETCH do <Link href="/sair"> apagava o cookie de sessão sozinho.

O App Router prefetcha todo <Link> que entra na viewport, disparando um GET no href sem ninguém clicar. /sair é Route Handler e o GET dele chamava apagarCookieDeSessao(). O <Link href="/sair"> que existia em src/app/painel/page.tsx derrubava a sessão SÓ POR A TELA DO PAINEL TER RENDERIZADO, logo depois do login do beforeEach. A página em si não mostrava nada de errado — ela já havia renderizado com sessão válida; quem recusava era a Server Action seguinte.

Isso explica os três mistérios de uma vez: a não-determinação (o prefetch é agendado por ociosidade, então o conjunto que falhava mudava a cada rodada), o login passar e a action falhar, e o fluxo funcionar quando dirigido à mão (o script saía do /painel antes de o prefetch disparar).

Prova produzida contra a build de produção, com página descartável que só tinha o <Link>: "REQUISICAO ESPONTANEA DO NAVEGADOR: GET /sair?_rsc=..." e "cookie mp_sessao depois de so olhar a pagina: AUSENTE". No formato exato do prefetch: 307 com set-cookie "mp_sessao=; Expires=Thu, 01 Jan 1970".

O <Link> em si já havia saído no commit 57928fb (sistema de design moveu "Sair" para a casca como <a href>). Então o que faltava não era código de produção, era a TRAVA — nada impedia o <Link> de voltar, e o sintoma não aponta para a causa.

CONSERTOS (518c034 e 90d9b06):
- gate em camadas.test.ts: nenhum <Link> aponta para Route Handler. Provado por mutação.
- 3 testes do acervo passam a procurar resultado dentro de <main>: a casca nova desenha a navegação como <ul>, e getByRole(listitem) solto achava "Painel". Mesmas asserções, inclusive o toHaveCount(1) que prova que acrescentar exemplares não cria segunda ficha.
- /sair virou POST-only com 303, porque o problema era da CLASSE e não daquele caminho: <a> esquecido, <img src> em mensagem, crawler e pre-render de e-mail também disparam GET, e nenhum passa pelo gate do <Link>. Trava nova: /sair exporta POST e NÃO exporta GET, provada por mutação.
- o gate do <Link> acusava a PRÓPRIA PROSA (o comentário cita <Link href="/sair"> literalmente). Passa a remover comentário antes de procurar. Gate que grita à toa é gate que alguém desliga.

Evidência — na árvore de 90d9b06:
- npm run test:e2e -> 17 passed, exit 0. Rodado 3x seguidas ANTES do conserto do /sair (25.3s, 23.3s, 24.2s) para provar que a não-determinação acabou, e de novo depois.
- lint 0 · typecheck 0 · unit 810 · integration 201 · build 0 · docker build 0

ARMADILHA QUE CUSTOU HORAS, registrada para a próxima pessoa: playwright.config.ts tem reuseExistingServer quando não é CI. Havia um servidor de 46 minutos na porta 3000, e o primeiro playwright test reusou aquele binário e testou código ANTIGO, sem build e sem avisar. Quando um resultado de e2e não fizer sentido, mate a porta 3000 primeiro.
<!-- SECTION:NOTES:END -->
