# Marca-Página — sistema de gestão de biblioteca escolar

Sistema web para a biblioteca de uma escola. A esposa do Paulo é coordenadora lá e é a
usuária principal. A escola atende **Fundamental e Médio** (1º ano ao 3º do Médio).

**Nome de produto:** Marca-Página · `marcapagina.vercel.app` (nome de trabalho, não
acoplado ao código)

---

## ESTADO ATUAL (2026-09-10)

**A Fundação está implementada e mergeada em `main`.** As 13 tarefas do plano m-0
foram executadas em TDD, cada uma com o teste falhando antes da implementação.

Verificação final do plano — os sete comandos, exit code conferido um a um:
`lint` · `typecheck` · `test:unit` (88) · `test:integration` (33) · `test:e2e` (5) ·
`build` · `docker build`. Todos com exit 0, em máquina local com Postgres em Docker.

**Nada foi implantado.** Não há remote no repositório, então o CI do GitHub Actions
nunca rodou — o workflow está escrito e versionado, mas nenhuma execução foi
observada. Não existe projeto na Vercel nem banco Neon. Antes de qualquer promessa de
staging ou produção, é isso que falta.

**Acervo (m-1) em andamento.** O plano está escrito
(`docs/superpowers/plans/2026-09-10-acervo.md`, 11 tarefas) e as três primeiras estão
mergeadas em `main`: os dois gates novos, o schema completo do acervo com migration, e
autores/categorias/localizações.

**Próximo passo: Tarefa 4 do plano do Acervo — o serviço de Obras.** Depois vêm
exemplares com tombo sequencial (Tarefa 5) e os provedores de ISBN (Tarefa 6), que são
o caminho crítico do projeto.

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
| `docs/superpowers/plans/2026-09-09-fundacao.md` | Plano da Fundação: 13 tarefas, 92 passos TDD com código real. É o que se executa agora. |

Os planos dos outros quatro milestones **ainda não foram escritos**, de propósito:
cada um é escrito no início da sua fase, porque escrevê-los antes seria adivinhar
assinaturas que as fases anteriores ainda vão definir.

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
