# Marca-Página — sistema de gestão de biblioteca escolar

Sistema web para a biblioteca de uma escola. A esposa do Paulo é coordenadora lá e é a
usuária principal. A escola atende **Fundamental e Médio** (1º ano ao 3º do Médio).

**Nome de produto:** Marca-Página · `marcapagina.vercel.app` (nome de trabalho, não
acoplado ao código)

---

## ESTADO ATUAL (2026-09-09)

**Nenhuma linha de código de aplicação foi escrita ainda.** O repositório contém
apenas documentação, o board e o `.git`. Design e planejamento estão prontos e
aprovados; a implementação ainda não começou.

**Onde paramos exatamente:** o plano da Fundação está escrito e aprovado. Paulo foi
perguntado como quer executá-lo — subagentes (um agente novo por tarefa, com revisão
entre elas) ou inline nesta sessão — e **a resposta ainda não veio**. Retomar por aí.

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
