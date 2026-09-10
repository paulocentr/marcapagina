# Marca-Página — Plano de Implementação: Circulação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o livro sair da estante e voltar. Ao fim deste plano a biblioteca empresta pelo balcão em segundos e só com teclado, o prazo sai calculado pulando feriado, quem está suspenso ou no limite é barrado antes de qualquer outra coisa, a exceção é liberada com justificativa e fica auditada, a devolução separa o exemplar para o próximo da fila, e o Carrinho da Leitura circula pelas salas lançando 30 empréstimos numa tela só.

**Architecture:** As camadas dos planos anteriores, sem novidade estrutural. A novidade é de domínio: **quase toda regra desta fase é pura** — bloqueios, cálculo de prazo, resolução de configuração por série, cálculo de penalidade — e portanto testável sem banco. O que toca o banco é a persistência do empréstimo, da reserva e da rodada. Manter essa separação é o que impede a regra de circulação de virar um `UPDATE` gigante que ninguém entende seis meses depois.

**Tech Stack:** o dos planos anteriores. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md` §4.3, §4.4, §4.8, §5.1–5.6
**Planos anteriores:** `2026-09-09-fundacao.md` · `2026-09-10-acervo.md`

**Cards no board:** TASK-013 · TASK-014 · TASK-015 · TASK-016 · TASK-017 · TASK-018 (milestone `Circulação`, m-2)

---

## Global Constraints

As invariantes 1–12 da Fundação e 13–15 do Acervo continuam valendo. Este plano acrescenta três, todas nascidas de um jeito específico de este sistema poder mentir.

16. **"Atrasado" é sempre CALCULADO, nunca armazenado.**
    `dataPrevista < hoje AND dataDevolucao IS NULL`. Um campo materializado por cron mente todo dia em que o cron falhar, e mente na direção pior: dizendo que está tudo em ordem. Índice composto sustenta a consulta. **Verificado por teste** (Tarefa 2).

17. **Toda regra de circulação é função pura, sem I/O.** Bloqueios, prazo, penalidade e resolução de configuração recebem dados já lidos e devolvem decisão. Nenhuma delas consulta banco. É o que permite provar "aluno do 2º ano leva 1 livro por 7 dias, o do 9º leva 3 por 14" numa suíte de milissegundos, em vez de um E2E por combinação.

18. **Nenhum bloqueio é vencido em silêncio.** Só existe um caminho para emprestar sobre um bloqueio — `liberacaoForcada` com justificativa não vazia — e ele **sempre** grava auditoria. Um `if` que pula a checagem "porque é caso especial" é o começo do fim da confiança no relatório de atrasados. **Verificado por teste** (Tarefa 5).

---

## Decisões de domínio que este plano fecha

Registradas aqui porque cada uma vai ser questionada de novo.

**A data de devolução nunca cai em dia não letivo.** Soma-se o prazo em dias corridos e, se o resultado cair em fim de semana, feriado ou recesso, empurra-se para o próximo dia letivo. Não se "contam dias úteis": a coordenação pensa em "duas semanas", não em "dez dias úteis". O que não pode acontecer é vencer num dia em que a escola está fechada — o aluno não tem como devolver e o sistema o marca como atrasado por culpa do calendário. É esse detalhe que a card TASK-013 chama de perder a confiança na primeira semana.

**A configuração resolve por série, com a da escola como fallback.** A escola vai do 1º ano do Fundamental ao 3º do Médio. Um valor único estaria errado nas duas pontas ao mesmo tempo — por isso o override é requisito, não refinamento. A resolução é campo a campo: a série pode sobrescrever só o limite e herdar o resto.

**Reserva é da OBRA, não do exemplar.** O aluno quer *o livro*, e qualquer cópia serve. Reservar exemplar específico faria a fila parar porque justamente aquela cópia está com alguém.

**Penalidade é suspensão em dias, nunca multa.** Multa em escola pública é inviável e em particular vira conflito com a família. Dias de suspensão × dias de atraso, com o multiplicador configurável.

**Devolver com atraso aplica a penalidade; devolver danificado NÃO.** Dano vira observação e decisão humana. Automatizar cobrança de dano transformaria a devolução num tribunal, e a operadora deixaria de registrar o estado real para evitar o constrangimento — perdendo o dado que interessa.

---

## Estrutura de arquivos

```
src/modules/circulacao/
  configuracao.{repository,service}.ts    config por escola + override por série
  calendario.{repository,service}.ts      dias não letivos e próximo dia letivo
  prazo.ts                                PURO: calcula a data de devolução
  bloqueios.ts                            PURO: suspensão · limite · atraso
  penalidade.ts                           PURO: dias de suspensão por atraso
  emprestimos.{repository,service}.ts     balcão: emprestar, devolver, renovar
  reservas.{repository,service}.ts        fila da obra, separação, expiração
  penalidades.{repository,service}.ts
  circulacao.deps.ts                      ponto de composição

src/modules/carrinho/
  carrinho.{repository,service}.ts        rodadas, pedidos, empréstimo em lote

src/app/painel/balcao/…                   emprestar e devolver
src/app/painel/circulacao/configuracao/…
src/app/api/cron/[job]/route.ts           + job de expiração de reserva

tests/unit/circulacao/**   tests/integration/circulacao/**   tests/e2e/balcao.spec.ts
```

---

## Tarefa 1: Schema da circulação

**Files:** `prisma/schema.prisma`, `src/core/db/modelos-tenant.ts`, `tests/apoio/banco.ts`, `tests/integration/circulacao/schema.test.ts`

Modelos: `ConfiguracaoDeCirculacao` (por escola), `ConfiguracaoPorSerie`, `DiaNaoLetivo`, `Emprestimo`, `Reserva`, `Penalidade`, `RodadaCarrinho`, `RodadaCarrinhoExemplar`, `PedidoCarrinho`.

- [ ] **Passo 1: Teste que falha** — os casos que travam decisão, não a existência das tabelas:

```ts
it('o mesmo exemplar não pode ter dois empréstimos ATIVOS', async () => {
  // Sem isso, um duplo clique no balcão empresta o mesmo livro duas vezes
  // e o acervo passa a ter uma cópia fantasma emprestada para sempre.
  // Índice único parcial: WHERE dataDevolucao IS NULL.
})
it('o mesmo aluno não entra duas vezes na fila da mesma obra', async () => { /* … */ })
it('excluir exemplar com empréstimo é recusado pelo banco', async () => { /* … */ })
it('dia não letivo é único por escola e data', async () => { /* … */ })
it('a mesma data é dia não letivo em uma escola e letivo na outra', async () => { /* … */ })
```

- [ ] **Passo 2–3:** rodar e ver falhar · escrever o schema

Pontos que o schema tem de acertar:

```prisma
model Emprestimo {
  id            String    @id @default(cuid())
  escolaId      String
  exemplarId    String
  alunoId       String?
  usuarioId     String?   // staff também pega livro emprestado
  retiradaEm    DateTime  @default(now())
  previstaPara  DateTime  @db.Date
  devolvidaEm   DateTime?
  // NÃO existe campo "atrasado" (Global Constraint 16).
  renovacoes    Int       @default(0)
  operadorRetiradaId String
  operadorDevolucaoId String?
  estadoNaDevolucao   EstadoDeConservacao?
  observacao          String?
  liberacaoForcada    Boolean @default(false)
  justificativaDaLiberacao String?
  // …
  @@index([escolaId, devolvidaEm, previstaPara]) // sustenta a query de atrasados
  @@index([escolaId, alunoId, devolvidaEm])
}
```

O índice único parcial de "um empréstimo ativo por exemplar" não sai do Prisma declarativo — entra por SQL na migration:

```sql
CREATE UNIQUE INDEX "emprestimo_ativo_por_exemplar"
  ON "Emprestimo" ("exemplarId") WHERE "devolvidaEm" IS NULL;
```

> Deixar isso só na regra de aplicação não basta: dois cliques simultâneos passam pelos dois `if` antes de qualquer um gravar. O banco é o único que sabe dizer não de verdade.

- [ ] **Passo 4:** declarar TODOS os modelos novos em `modelos-tenant.ts` e acrescentá-los ao TRUNCATE — o gate reprova se esquecer
- [ ] **Passo 5–7:** migration · rodar e ver passar · commit

---

## Tarefa 2: Cálculo de atraso, sem campo materializado

**Files:** `src/modules/circulacao/emprestimos.repository.ts` (consulta), `tests/integration/circulacao/atraso.test.ts`

- [ ] **Passo 1: Teste que falha**

```ts
it('atrasado é quem passou da data prevista e não devolveu', async () => { /* … */ })
it('devolvido com atraso NÃO aparece como atrasado hoje', async () => {
  // Ele foi devolvido; a penalidade já é outro assunto.
})
it('vence hoje ainda não está atrasado', async () => {
  // Marcar como atrasado no próprio dia do vencimento é o erro de
  // fronteira que faz a operadora perder a confiança no relatório.
})
it('a lista de atrasados não enxerga a escola vizinha', async () => { /* … */ })
```

- [ ] **Passo 2–4:** rodar e ver falhar · implementar `listarAtrasados` e `contarAtrasadosDoAluno` como consulta · rodar e ver passar
- [ ] **Passo 5: Commit**

---

## Tarefa 3: Configuração por escola com override por série

**Files:** `src/modules/circulacao/configuracao.{repository,service}.ts`, `tests/unit/circulacao/configuracao.test.ts`

**Produces:** `resolverConfiguracao(serie, config, overrides): ConfiguracaoEfetiva` — **pura**

- [ ] **Passo 1: Teste que falha**

```ts
it('sem override, a série herda a configuração da escola', () => { /* … */ })
it('o override vale campo a campo, não em bloco', () => {
  // A série sobrescreve só o limite e herda prazo e renovações. Em bloco,
  // a coordenação teria de reescrever tudo para mudar um número — e
  // esqueceria um campo, que passaria a valer o padrão do código.
})
it('série sem override não afeta as outras', () => { /* … */ })
it('valores da escola nunca são zero por omissão', () => {
  // Um limite 0 por omissão bloqueia a biblioteca inteira em silêncio.
})
it('recusa prazo, limite ou renovações negativos', () => { /* … */ })
```

- [ ] **Passo 2–5:** rodar e ver falhar · implementar · rodar e ver passar · commit

---

## Tarefa 4: Calendário e cálculo do prazo

**Files:** `src/modules/circulacao/prazo.ts` (puro), `calendario.{repository,service}.ts`, testes

**Produces:** `calcularDataDeDevolucao(retirada, prazoEmDias, ehDiaNaoLetivo): Date` — **pura**, recebe um predicado

- [ ] **Passo 1: Teste que falha**

```ts
it('soma o prazo em dias corridos', () => { /* … */ })
it('empurra para o próximo dia letivo quando cai em não letivo', () => {
  // Vencer num dia em que a escola está fechada marca como atrasado quem
  // não tinha como devolver — é o que faz perder a confiança no sistema
  // na primeira semana (TASK-013).
})
it('atravessa um feriadão inteiro sem parar no meio', () => { /* … */ })
it('não entra em laço infinito com calendário absurdo', () => {
  // Um ano inteiro marcado como não letivo por engano não pode travar o
  // servidor: falha alto depois de um limite.
})
it('fim de semana conta como não letivo por padrão', () => { /* … */ })
it('não desloca o dia por fuso', () => {
  // Retirada 23h de sexta em São Paulo não pode virar sábado em UTC.
})
```

- [ ] **Passo 2–5:** rodar e ver falhar · implementar · rodar e ver passar · commit

---

## Tarefa 5: Bloqueios e empréstimo no balcão

O fluxo que roda dezenas de vezes por dia.

**Files:** `src/modules/circulacao/bloqueios.ts` (puro), `emprestimos.{repository,service}.ts`, testes

**Produces:**
- `avaliarBloqueios(estado, config): Bloqueio[]` — **pura**
- `emprestar(principal, entrada, deps): Promise<Emprestimo>`

- [ ] **Passo 1: Teste que falha — bloqueios primeiro, porque é o que a tela mostra antes de tudo**

```ts
describe('avaliarBloqueios', () => {
  it('acusa suspensão ativa, com a data em que termina', () => { /* … */ })
  it('suspensão vencida NÃO bloqueia', () => { /* … */ })
  it('acusa limite de livros simultâneos atingido', () => { /* … */ })
  it('acusa empréstimo em atraso', () => { /* … */ })
  it('acumula os bloqueios em vez de parar no primeiro', () => {
    // A operadora precisa ver TUDO de uma vez: descobrir um bloqueio de
    // cada vez, com o aluno na frente do balcão, é humilhante para ele.
  })
  it('leitor sem pendência nenhuma não tem bloqueio', () => { /* … */ })
})

describe('emprestar', () => {
  it('calcula a data prevista pela configuração da SÉRIE do aluno', () => { /* … */ })
  it('recusa exemplar que não está DISPONIVEL', () => { /* … */ })
  it('recusa exemplar já emprestado', () => { /* … */ })
  it('marca o exemplar como EMPRESTADO na mesma transação', () => {
    // Empréstimo gravado com exemplar ainda DISPONIVEL faz o mesmo livro
    // ser emprestado duas vezes.
  })
  it('recusa quando há bloqueio e não veio liberação forçada', () => { /* … */ })
  it('liberação forçada SEM justificativa é recusada', () => { /* … */ })
  it('liberação forçada exige a permissão emprestimo:forcar', () => { /* … */ })
  it('liberação forçada GRAVA auditoria com a justificativa', () => {
    // Global Constraint 18. Sem o registro, a exceção some e o relatório
    // de atrasados deixa de significar alguma coisa.
  })
  it('exemplar RESERVADO só é emprestado para quem está na frente da fila', () => { /* … */ })
})
```

- [ ] **Passo 2–6:** rodar e ver falhar · implementar puro · implementar serviço + repositório · rodar e ver passar · commit

---

## Tarefa 6: Devolução, penalidade e avanço da fila

**Files:** `src/modules/circulacao/penalidade.ts` (puro), `penalidades.{repository,service}.ts`, devolução em `emprestimos.service.ts`, testes

- [ ] **Passo 1: Teste que falha**

```ts
describe('calcularSuspensao', () => {
  it('sem atraso, não há suspensão', () => { /* … */ })
  it('multiplica dias de atraso pelo fator configurado', () => { /* … */ })
  it('devolver no dia previsto não é atraso', () => { /* … */ })
  it('respeita um teto, para 200 dias de esquecimento não virarem 3 anos', () => { /* … */ })
})

describe('devolver', () => {
  it('registra o estado de conservação informado', () => { /* … */ })
  it('devolve o exemplar para DISPONIVEL', () => { /* … */ })
  it('aplica suspensão quando houve atraso', () => { /* … */ })
  it('devolver DANIFICADO não aplica penalidade automática', () => {
    // Dano vira observação e decisão humana. Automatizar transformaria a
    // devolução num tribunal, e a operadora deixaria de registrar o
    // estado real para evitar o constrangimento — perdendo o dado.
  })
  it('SE houver fila na obra, separa o exemplar e marca RESERVADO', () => {
    // É este passo que faz fila de reserva funcionar de verdade (spec §5.2).
  })
  it('com fila, o exemplar NÃO volta para DISPONIVEL', () => { /* … */ })
  it('sem fila, volta para DISPONIVEL', () => { /* … */ })
  it('devolver duas vezes o mesmo empréstimo é recusado', () => { /* … */ })
  it('tudo numa transação: penalidade sem devolução é impossível', () => { /* … */ })
})
```

- [ ] **Passo 2–6:** rodar e ver falhar · implementar · rodar e ver passar · commit

---

## Tarefa 7: Reservas e renovação

**Files:** `src/modules/circulacao/reservas.{repository,service}.ts`, renovação em `emprestimos.service.ts`, testes

- [ ] **Passo 1: Teste que falha**

```ts
describe('reservar', () => {
  it('a reserva é da OBRA, não do exemplar', () => { /* … */ })
  it('entra na fila na ordem de chegada', () => { /* … */ })
  it('o mesmo aluno não entra duas vezes na mesma fila', () => { /* … */ })
  it('recusa reserva de quem já está com a obra em mãos', () => { /* … */ })
  it('respeita a configuração "aluno pode reservar"', () => { /* … */ })
})

describe('expirarReservasVencidas', () => {
  it('passa a vez ao próximo quando o prazo de retirada vence', () => { /* … */ })
  it('o exemplar separado vai para o próximo, não para DISPONIVEL', () => { /* … */ })
  it('sem próximo na fila, o exemplar volta para DISPONIVEL', () => { /* … */ })
  it('não expira reserva dentro do prazo', () => { /* … */ })
})

describe('renovar', () => {
  it('empurra a data pela configuração da série', () => { /* … */ })
  it('recusa quando há fila de reserva na obra', () => {
    // Renovar com gente na fila é dar a vez de quem esperou a quem já leu.
  })
  it('recusa quando o máximo de renovações foi atingido', () => { /* … */ })
  it('recusa renovar empréstimo já devolvido', () => { /* … */ })
  it('recusa renovar quando o leitor está suspenso', () => { /* … */ })
  it('conta a renovação, para o máximo valer', () => { /* … */ })
})
```

- [ ] **Passo 2–6:** rodar e ver falhar · implementar · rodar e ver passar · commit

---

## Tarefa 8: Job de expiração de reserva no cron

**Files:** `src/app/api/cron/[job]/route.ts`, testes

A Fundação entregou o contrato de acionamento autenticado; aqui entra o primeiro job de verdade.

- [ ] Acrescentar `expirar-reservas` a `JOBS_CONHECIDOS` e ligá-lo ao serviço
- [ ] Teste: sem o segredo, 401 e **nada é expirado** · com o segredo, expira e devolve a contagem · job desconhecido continua 404
- [ ] O job roda **por escola**: iterar tenants é responsabilidade dele, e um erro numa escola não pode impedir as outras
- [ ] Commit

---

## Tarefa 9: Tela do balcão

Otimizada para teclado, sem exigir mouse (spec §5.1).

**Files:** `src/app/painel/balcao/**`, `tests/e2e/balcao.spec.ts`

- [ ] **Passo 1: Teste E2E que falha**

```ts
test('empresta em três campos, só com teclado', async ({ page }) => { /* … */ })
test('os bloqueios aparecem ANTES de escolher o livro', async ({ page }) => {
  // Descobrir o bloqueio depois de achar o livro faz a operadora
  // desfazer trabalho na frente do aluno.
})
test('a data de devolução aparece já calculada', async ({ page }) => { /* … */ })
test('liberar sobre bloqueio exige justificativa para habilitar o botão', async ({ page }) => { /* … */ })
test('devolução por tombo mostra o que foi devolvido e por quem', async ({ page }) => { /* … */ })
test('devolução com fila avisa que o exemplar foi separado', async ({ page }) => { /* … */ })
```

- [ ] **Passo 2–5:** rodar e ver falhar · implementar · rodar e ver passar · commit

---

## Tarefa 10: Carrinho da Leitura

**Carrinho FÍSICO ITINERANTE que circula pelas salas** — não é wishlist (decisão 1 do projeto).

**Files:** `src/modules/carrinho/**`, telas, testes

- [ ] **Passo 1: Teste que falha**

```ts
describe('rodada', () => {
  it('planeja rodada com data, turma e responsável', () => { /* … */ })
  it('sugere exemplares a partir dos pedidos pendentes da turma', () => { /* … */ })
  it('a sugestão respeita a faixa etária da turma', () => { /* … */ })
  it('não sugere exemplar indisponível', () => { /* … */ })
})

describe('pedido', () => {
  it('aceita obra do acervo', () => { /* … */ })
  it('aceita TÍTULO LIVRE que a biblioteca não tem', () => {
    // Vira lista de sugestão de compra com contagem de demanda — o
    // argumento que a coordenação leva à direção para pedir verba.
  })
  it('agrupa a demanda por título livre, contando quantos pediram', () => { /* … */ })
})

describe('empréstimo em lote', () => {
  it('lança 30 empréstimos numa chamada', () => {
    // Uma tela para 30 alunos, não 30 telas.
  })
  it('um aluno bloqueado não derruba o lote inteiro', () => {
    // Derrubar tudo por causa de um faria a operadora desistir do lote e
    // voltar a lançar um por um — que é o que o carrinho existe para evitar.
  })
  it('devolve o que entrou e o que foi recusado, com o motivo', () => { /* … */ })
  it('o que entrou entra numa transação por aluno, não uma global', () => { /* … */ })
})
```

- [ ] **Passo 2–6:** rodar e ver falhar · implementar · rodar e ver passar · commit

---

## Verificação final da Circulação

```bash
docker compose up -d db
npm ci && npx prisma migrate deploy && npm run db:seed
npm run lint && npm run typecheck
npm run test:unit && npm run test:integration && npm run test:e2e
npm run build && docker build -t marcapagina:local .
```

| Afirmação | Provada por |
|---|---|
| O mesmo exemplar não é emprestado duas vezes | índice único parcial + teste de integração |
| O prazo pula feriado e recesso | `tests/unit/circulacao/prazo.test.ts` |
| 2º ano e 9º ano têm regras diferentes | `tests/unit/circulacao/configuracao.test.ts` |
| Bloqueio só é vencido com justificativa auditada | `tests/unit/circulacao/emprestimos.test.ts` |
| "Atrasado" nunca vem de campo materializado | `tests/integration/circulacao/atraso.test.ts` |
| Devolução com fila separa o exemplar | `tests/integration/circulacao/devolucao.test.ts` |
| Reserva vencida passa a vez | `tests/unit/circulacao/reservas.test.ts` |
| Um aluno bloqueado não derruba o lote do carrinho | `tests/unit/carrinho/carrinho.test.ts` |

**Mutação obrigatória** (remover a proteção, ver o teste reprovar, restaurar): índice único de empréstimo ativo · transação da devolução · checagem de fila na renovação.

---

## O que este plano deliberadamente NÃO entrega

- **Portal do aluno e o botão de renovar do lado dele.** O serviço de renovação nasce aqui pronto para os dois reinos; a tela do aluno é m-3.
- **Notificação de reserva disponível por e-mail.** A separação do exemplar e o prazo de retirada ficam gravados aqui; o envio é m-4, junto com a fila de notificações.
- **Relatórios de circulação.** As consultas existem; o Painel do Leitor é m-4.
- **Multa em dinheiro.** Fora do v1, por decisão registrada.

## Próximos planos

1. `2026-XX-XX-leitores-portal.md` (m-3) · 2. `2026-XX-XX-relatorios.md` (m-4)
