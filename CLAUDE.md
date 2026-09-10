# Marca-Página — sistema de gestão de biblioteca escolar

Sistema web para a biblioteca de uma escola. A esposa do Paulo é coordenadora lá e é a
usuária principal. A escola atende **Fundamental e Médio** (1º ano ao 3º do Médio).

**Nome de produto:** Marca-Página · `marcapagina.vercel.app` (nome de trabalho, não
acoplado ao código)

---

## ESTADO ATUAL (2026-09-10)

**Fundação (m-0), Acervo (m-1) e Circulação (m-2) estão completos e em `main`.**

Gate completo medido na árvore de `90d9b06`, exit code conferido um a um, em
máquina local com Postgres em Docker:

| gate | resultado |
|---|---|
| `lint` | exit 0 |
| `typecheck` | exit 0 |
| `test:unit` | 37 arquivos, **810 testes** |
| `test:integration` | 23 arquivos, **201 testes** |
| `test:e2e` | **17 testes** |
| `build` | exit 0 |
| `docker build` | exit 0 |

**Nada foi implantado, e isso não mudou.** Não há remote no repositório, então o
CI do GitHub Actions **nunca executou uma vez** — o workflow está escrito e
versionado, e nenhuma execução foi observada. Não existe projeto na Vercel nem
banco Neon. Card: TASK-031.

**Circulação (m-2) COMPLETA — as 10 tarefas**
(`docs/superpowers/plans/2026-09-10-circulacao.md`).

Schema com os dois índices únicos parciais · camada de regras puras
(configuração por série, prazo, bloqueios, penalidade) · consulta de atrasados ·
empréstimo no balcão com liberação forçada auditada · devolução com penalidade e
avanço da fila · reservas e renovação · job de expiração de reserva, agendado no
`vercel.json` · tela do balcão · Carrinho da Leitura.

**O que a Circulação NÃO entrega, apesar de "completa":** reserva, renovação,
atrasados e Carrinho **não têm tela**. A regra existe e está provada; a
coordenação ainda não alcança nenhum deles pela interface. Cards TASK-030 e
TASK-032. Não confunda "tarefa mergeada" com "a usuária consegue usar".

### Sistema de design — APROVADO, e é a linha a seguir

O Paulo aprovou o kit em 2026-09-10 ("o design esta aprovado siga esse UI kit e
linha"). Pranchas em `docs/design/*.dc.html`; canvas publicado em
https://claude.ai/code/artifact/975c7374-b76e-4da0-84d6-1f651070e0f5

Antes disso o projeto **não tinha design system**: `globals.css` e `layout.tsx`
eram o boilerplate do `create-next-app`. Agora:

- paleta no bloco `@theme` do Tailwind v4 (`papel`, `tinta`, `marca`, `fita`,
  `atencao`, `alerta`, `certo`), para os utilitários existirem em vez de hex no JSX
- três famílias com trabalho definido: **Literata** nos títulos, **IBM Plex
  Sans** na interface, **IBM Plex Mono** em tombo, ISBN e matrícula **sempre** —
  é assim que a operadora confere dígito a dígito contra a etiqueta
- primitivos em `src/components/ui/`, casca do painel em `src/app/painel/layout.tsx`

**Duas regras do kit que o código torna difíceis de furar:**

- **`Chip` não aceita cor, ícone nem texto livre** — só a chave de um estado do
  catálogo (`src/components/ui/estados.ts`), e o tipo cobra `palavra` **e**
  `icone`. Não existe caminho para um chip que diga o estado só pela cor, porque
  o balcão é operado sob pressa e às vezes em tela com brilho ruim.
- **Só entram atalhos para telas que EXISTEM.** Um item de menu que leva a 404
  ensina a operadora a desconfiar do menu inteiro, e depois disso ela para de
  explorar o sistema.

As telas existentes **ainda não foram reescritas** contra o kit (TASK-029): elas
seguem com utilitários neutros de antes.

### A casca do painel não é fronteira de segurança

`src/app/painel/layout.tsx` valida a sessão, e isso é conveniência: tela nova
nasce protegida. Mas **layout em Next não é fronteira** — ele não volta a rodar
em navegação de cliente entre telas irmãs, e Server Action nenhuma passa por
ele. Por isso `painel/page.tsx` e cada action continuam validando por conta.
O filtro do menu por permissão existe para o menu não mentir; **quem autoriza é
o serviço**.

### Três coisas que é fácil desfazer sem perceber

- **Não existe campo "atrasado".** É sempre `previstaPara < hoje AND devolvidaEm IS
  NULL`. Um campo materializado mente todo dia em que o cron falhar — e mente na
  direção pior, dizendo que está tudo em ordem.
- **O fuso da escola é fixo em `prazo.ts`, não o do processo.** Depender do fuso do
  processo faz o mesmo empréstimo vencer em dias diferentes na máquina da secretaria
  (São Paulo) e no servidor (UTC na Vercel). A suíte de prazo roda idêntica em três
  fusos; se mexer, rode `TZ=UTC` e `TZ=Asia/Tokyo` também.

- **`/sair` é POST, e NÃO existe `GET` nele.** Esta custou horas e o sintoma não
  aponta para a causa. O App Router **prefetcha** todo `<Link>` que entra na
  viewport, disparando um GET no `href` sem ninguém clicar. Enquanto `/sair`
  aceitava GET, um `<Link href="/sair">` na tela do painel **apagava o cookie de
  sessão só por a tela ter renderizado** — a página renderizava bem, a sessão
  morria em silêncio, e a recusa aparecia na Server Action seguinte, longe da
  causa. Como o prefetch é agendado por ociosidade, o conjunto de testes que
  falhava mudava a cada rodada, e dirigido à mão funcionava. Dois gates travam
  isso hoje (`<Link>` para Route Handler, e `/sair` sem GET). Se for pôr tela de
  confirmação, ela é uma `page.tsx` com form POST, nunca um GET que já desloga.

### Garantias provadas por MUTAÇÃO — se mexer nelas, refaça a mutação

Não basta o teste estar verde; cada linha abaixo foi verificada removendo a proteção
e confirmando que o teste reprova. Se mexer numa delas, refaça a mutação — é o que
distingue "o teste passa" de "a proteção funciona":

| Proteção | Sem ela |
|---|---|
| Trava consultiva no tombo | tombos colidem sob concorrência |
| Transação na catalogação | fica obra órfã de exemplar |
| Transação na importação | importação parcial grava os alunos |
| `drawText` do tombo | a etiqueta sai em branco |
| Índice único parcial de empréstimo ativo | o mesmo exemplar é emprestado duas vezes |
| `palavra` e `icone` obrigatórios no estado do chip | chip diz o estado só pela cor |
| `/sair` sem `GET` | prefetch, `<img src>` ou crawler deslogam a operadora |
| Gate do `<Link>` ignorando comentário | o gate acusa a própria prosa, e alguém o desliga |

### Duas escolhas de dependência que divergem do plano, de propósito

- **`vitest` ^3.2**, não ^2.1: a config usa `test.projects`, que não existe na 2.1.
- **`exceljs`, não `xlsx`.** A última `xlsx` no npm (0.18.5) tem duas vulnerabilidades
  altas — prototype pollution e ReDoS — corrigidas só na ≥0.20.2, que a SheetJS não
  publica mais no npm. É o código que lê arquivo enviado de fora, num sistema com
  dados de menores. Não volte para ela.

### Transação atravessa as camadas por AsyncLocalStorage

`executarEmTransacao` (em `src/core/db/tenant-extension.ts`) guarda o cliente da
transação num AsyncLocalStorage, e `dbDoTenant()` o devolve quando há uma em curso. O
serviço recebe `emTransacao` **injetado** e continua sem saber que banco existe.

Duas armadilhas já pagas, não repita:

- **O cliente de transação do Prisma não aceita `$extends`.** A extensão de tenant tem
  de ser aplicada **antes** de abrir a transação.
- **`tenantAtual()` é lido por quem monta o cliente, nunca dentro da operação.** O
  Prisma adia a execução da query até o `await`, e lá o AsyncLocalStorage do tenant já
  é outro: ler tarde devolve "fora de contexto" para chamada que estava dentro dele.

### Decisão 13 — autorização sem HTTP no serviço

A Fundação afirmava que serviço não conhece HTTP e, na mesma lista, que todo serviço
protegido chama `requirePermission` — que lê cookie. Não fechava. **Vale agora:** o
serviço recebe `Principal` por parâmetro e chama `exigirPermissao`, que é puro. Quem lê
a sessão é a rota, com `requireStaff()`. Dois gates no CI travam isso e o `fetch` fora
de `src/infra/`.

### Como rodar

```bash
docker compose up -d db
cp .env.example .env            # preencher SESSION_SECRET e CRON_SECRET
npx prisma migrate deploy && npm run db:seed
npm run dev
```

Seed: staff `coord@escola.br` / `SenhaForte#2026`; aluno matrícula `2024001`,
nascimento `2012-03-15`.

### Decisões de implementação que o plano não previa

Cada uma está no corpo do commit que a introduziu, com o motivo:

- **O filtro de tenant entra por `AND`, não sobrescrevendo a chave.** Sobrescrever
  transformava "me dê o registro do vizinho" em "tome OUTRO registro" — silenciosamente.
- **A extensão de tenant é fail-closed:** operação que ela não sabe escopar lança
  `OperacaoNaoEscopavelError`. Um `default` permissivo transformava cada operação nova
  do Prisma em porta aberta (foi assim que `updateManyAndReturn` vazou).
- **O `data` de toda escrita tem `escolaId` reescrito.** Escopar só o `where` impede
  alcançar o registro do vizinho, não impede empurrar o próprio para lá.
- **`npm start` sobe `.next/standalone/server.js`**, não `next start` — que o Next
  avisa não funcionar com `output: 'standalone'`. O E2E testa o que se entrega.
- **`typecheck` roda `next typegen` antes do `tsc`** por causa do `typedRoutes`.
- **O E2E semeia o banco no `globalSetup`**, porque `test:integration` dá TRUNCATE e a
  verificação final roda integração antes do e2e.
- **Versões:** `next` 15.5.25 (o 15.5.4 do plano tem CVE) e `vitest` ^3.2 (a config do
  plano usa `test.projects`, que não existe no 2.1).

### Documentos que governam o trabalho

| Documento | Papel |
|---|---|
| `docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md` | Spec arquitetural. Fonte da verdade de produto e de arquitetura. Leia antes de qualquer decisão. |
| `docs/superpowers/plans/2026-09-09-fundacao.md` | Plano da Fundação (m-0): 13 tarefas. **Executado.** |
| `docs/superpowers/plans/2026-09-10-acervo.md` | Plano do Acervo (m-1): 11 tarefas. **Executado.** |
| `docs/superpowers/plans/2026-09-10-circulacao.md` | Plano da Circulação (m-2): 10 tarefas. **Executado.** |
| `docs/design/*.dc.html` | Pranchas do sistema de design, **aprovadas**. Material de referência para as telas: leia antes de escrever tela. |

**Os planos de m-3 (Leitores & Portal) e m-4 (Relatórios & Engajamento) ainda não
foram escritos, de propósito:** cada um é escrito no início da sua fase, porque
escrevê-los antes seria adivinhar assinaturas que as fases anteriores ainda vão
definir.

---

## Board

Board próprio deste projeto, em `backlog/`, versionado junto com o código.
Porta **6422** (Wager usa 6420, ProvablyFair 6421).

```bash
BACKLOG_CWD=/Users/paulo/Documents/Projetos/biblioteca/biblioteca backlog board
```

**Colunas:** `To Do` · `In Progress` · `Needs Paulo` · `Blocked` · `Done` ·
`On Staging` · `Live on Prod`. Regras de ciclo de vida, bloco de Evidência e tags de
deploy: skill `backlog-flow` e `~/.claude/CLAUDE.md`.

**Milestone = workstream** neste board (esquema próprio, não importe o de outro projeto):

| Milestone | Cobre |
|---|---|
| `Fundação` (m-0) | Infra, auth, RBAC, multi-tenancy, CI, deploy, auditoria, backup |
| `Acervo` (m-1) | Obras, exemplares, ISBN, importador, etiquetas PDF, inventário |
| `Circulação` (m-2) | Empréstimo, devolução, reserva, penalidades, Carrinho da Leitura |
| `Leitores & Portal` (m-3) | Alunos, turmas, portal do aluno PWA, painel do professor |
| `Relatórios & Engajamento` (m-4) | Painel do Leitor, gamificação, notificações |

**Labels** são temáticas e sem prefixo: `infra`, `auth`, `rbac`, `acervo`,
`circulacao`, `portal`, `relatorios`, `pdf`, `importacao`, `backend`, `frontend`,
`db`, `lgpd`.

**Aberto em `Needs Paulo`:** TASK-025 — base legal LGPD e aviso aos responsáveis.
Não bloqueia implementação; é decisão institucional da escola, a ser resolvida antes
de o primeiro aluno real ser cadastrado em produção.

**O que está em `To Do` e importa mais:** TASK-029 (reescrever as telas contra o kit
aprovado), TASK-030 e TASK-032 (telas do Carrinho e de reservas, cuja regra já está
pronta e inalcançável), TASK-031 (publicar — não há remote, o CI nunca rodou) e
TASK-019 (alunos e turmas, que m-3 inteiro depende).

---

## Decisões fechadas — não re-litigar

Cada uma foi discutida e decidida com Paulo. Todas estão registradas na spec com as
alternativas rejeitadas e o porquê. Se algo no código parecer surpreendente, leia a
spec antes de propor mudar.

1. **Carrinho da Leitura = carrinho físico itinerante** que circula pelas salas. Não é
   wishlist. Modelado como `RodadaCarrinho` (data + turma + exemplares levados) e
   `PedidoCarrinho`. O pedido aceita título que a biblioteca **não tem** — vira lista
   de sugestão de compra com contagem de demanda.
2. **Obra + Exemplar com tombo**, etiquetagem gradual. "Quantidade em estoque" é
   **derivada** da contagem de exemplares disponíveis, nunca um número digitado.
3. **Aluno autentica por matrícula + data de nascimento.** Risco aceito
   conscientemente. As mitigações são parte da definição de pronto, não opcionais:
   rate limit por identificador **e** por IP, bloqueio progressivo, e portal do aluno
   sem nenhum dado sensível (nem de colega, nem de responsável).
4. **Next.js + Prisma + Neon na Vercel, portátil desde o commit 1.** Vercel Hobby é
   apenas **não-comercial** e o sistema é multi-tenant justamente para poder virar
   produto. Por isso `output: 'standalone'` + `Dockerfile` versionado e cron como
   endpoint HTTP por segredo — nunca API proprietária da Vercel.
5. **Multi-tenant desde o início.** A escola da coordenação é o tenant #1.
6. **RBAC por permissão, nunca por papel.** `requirePermission('emprestimo:criar')`
   é certo; `if (user.papel === 'BIBLIOTECARIO')` é proibido.
7. **Sessão própria (`jose` + cookie httpOnly), não Auth.js v5.** Revisto durante o
   planejamento e aprovado por Paulo (spec §3.6): dependência beta não é lugar para o
   alicerce de um sistema que guarda dados de menores.
8. **O acervo será catalogado do zero** — não existe planilha, software nem ficha.
   Isso promove a **busca por ISBN a caminho crítico do projeto**, não conveniência.
   O importador de planilha tem como uso primário importar **alunos**.
9. **Entrega única:** o sistema completo antes da primeira demonstração à coordenação.
   Não há entrega em fatias para a usuária final. A ordem de **construção** continua
   sendo por dependência.

---

## Git — SOMENTE a conta `paulocentr`

**Decisão do Paulo, 2026-09-10: toda operação de git neste projeto é pela conta
`paulocentr`. Sem rodapé de co-autoria, sem link de sessão, sem mais nada — só
`paulocentr`.**

Já está configurado, e ficou assim:

| onde | valor |
|---|---|
| `git config user.name` (local) | `paulocentr` |
| `git config user.email` (local) | `2635233+paulocentr@users.noreply.github.com` |
| `.claude/settings.json` | `attribution.commit` e `attribution.pr` vazios, `sessionUrl` false |

**A armadilha que isso fecha:** havia DUAS contas logadas no `gh`, e a ativa era
`paulowagercasino`. Qualquer `git push` ou `gh repo create` teria ido para a
conta errada em silêncio. A ativa passou a ser `paulocentr`
(`gh auth switch --user paulocentr`), mas **`gh` guarda isso fora do
repositório** — se você abrir outra sessão e o `gh auth status` mostrar outra
conta ativa, troque antes de tocar no remoto.

Confira com `git log -1 --format='%an <%ae>'` antes de empurrar qualquer coisa.

---

## Regras de código

As invariantes completas estão em **Global Constraints** no plano da Fundação. As que
mais importam:

- Nada em `src/app/` importa `*.repository.ts`, `@prisma/client` ou `src/core/db/`.
  Rotas falam com serviços. **Verificado por teste no CI.**
- Só `src/core/db/client.ts` instancia `PrismaClient`. **Verificado por teste no CI.**
- `escolaId` **nunca** vem do cliente. Vem do contexto de tenant, resolvido da sessão.
  Um Prisma Client Extension injeta em toda query de modelo escopado e **sobrescreve**
  qualquer valor recebido de fora.
- Serviços não conhecem `Request`, `Response`, `cookies()` nem `headers()`.
- Autorização mora no serviço. Esconder botão na UI não é autorização.
- TDD: o teste que falha vem primeiro, e rodar para ver falhar é passo obrigatório.
- Sem valores mágicos silenciosos: `?? 0`, `|| 0`, `Number()` sobre entrada não
  validada e `catch` vazio são proibidos.
- Identificadores de domínio em português (`Emprestimo`, `escolaId`, `matricula`),
  termos técnicos consagrados em inglês (`repository`, `service`). Mensagens de
  usuário sempre em pt-BR.
- Commits em português, Conventional Commits.

**Ao adicionar um model com `escolaId`:** declare-o em `src/core/db/modelos-tenant.ts`
na mesma alteração. Sem a declaração, as queries daquele modelo **não são filtradas por
tenant e vazam entre escolas em silêncio**. Há um teste no CI que pega o esquecimento.

---

## Pendências que dependem de terceiros

- **TASK-025 (LGPD):** decisão institucional da escola. Está em `Needs Paulo`.
- **Nada mais está bloqueado.** Todas as perguntas de produto foram respondidas.
