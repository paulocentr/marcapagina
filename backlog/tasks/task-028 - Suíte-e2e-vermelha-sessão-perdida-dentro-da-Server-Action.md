---
id: TASK-028
title: 'Suíte e2e vermelha: sessão perdida dentro da Server Action'
status: In Progress
assignee: []
created_date: '2026-09-10 17:18'
labels:
  - infra
  - auth
  - backend
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
