# Marca-Página — Sistema de Gestão de Biblioteca Escolar

**Data:** 2026-09-09
**Status:** aprovado, aguardando plano de implementação
**Origem:** especificação "Fase 2 — Alinhamento com a Empresa de Programação", escrita pela coordenação da escola, ampliada em sessão de brainstorming.
**Nome de produto:** Marca-Página · `marcapagina.vercel.app` (nome de trabalho, não acoplado ao código)

---

## 1. Contexto e objetivo

A biblioteca de uma escola opera hoje sem sistema. A coordenação pediu a digitalização do processo e escreveu uma especificação com três módulos: cadastro de obras, gestão de empréstimos e um painel de relatórios.

Este documento amplia aquela especificação para um sistema web completo de gestão de biblioteca escolar, com portal de autoatendimento para alunos, controle de acesso baseado em permissões e arquitetura em camadas service-repository.

**A escola atende Fundamental e Médio** — do 1º ano ao 3º do Médio. Essa é a faixa etária mais ampla possível numa escola, e ela impõe duas consequências que atravessam o sistema:

- A configuração de circulação **precisa** de override por série. Um aluno do 2º ano e um do 3º do Médio não levam a mesma quantidade de livros nem pelo mesmo prazo, e um único valor global tornaria a regra errada para as duas pontas.
- O portal do aluno tem que servir uma criança de 7 anos e um adolescente de 17 sem parecer infantil para um nem complicado para o outro. Linguagem neutra e direta, hierarquia visual forte, nada de mascote. A gamificação usa progresso e conquista, não desenho animado.

**Quem usa:**

| Perfil | Uso principal |
|---|---|
| Coordenação (a pedinte) | Configura, cadastra acervo, lê relatórios, gerencia usuários |
| Bibliotecário / operador de balcão | Empresta, devolve, cadastra obras e alunos |
| Monitor (aluno auxiliar) | Empresta e devolve, sem poder editar cadastros |
| Professor | Engajamento da própria turma, pedidos de carrinho |
| Direção | Relatórios consolidados |
| Aluno | Busca acervo, reserva, acompanha empréstimos e metas |

**Sucesso é:** o balcão parar de usar papel, a coordenação conseguir responder "quais livros foram mais lidos e quais turmas leem mais" sem contar à mão, e nenhum exemplar sumir sem que o sistema saiba.

---

## 2. Decisões tomadas

Cada decisão abaixo foi confirmada em brainstorming. As alternativas rejeitadas ficam registradas para não serem re-litigadas.

### 2.1 Carrinho da Leitura = carrinho físico itinerante

O "Carrinho da Leitura" citado na especificação original é um **carrinho de livros que circula pelas salas de aula**. Alunos pedem títulos para irem no carrinho da próxima rodada.

Modelagem: `RodadaCarrinho` (data + turma visitada + responsável + exemplares levados) e `PedidoCarrinho` (aluno pede um título). O relatório "Livros Mais Solicitados no Carrinho da Leitura" é a contagem de pedidos.

**Detalhe deliberado:** o pedido aceita título que a biblioteca **não possui**. Esses pedidos viram lista de sugestão de compra com contagem de demanda — o argumento que a coordenação leva à direção para pedir verba.

### 2.2 Obra + Exemplar, com etiquetagem gradual

A especificação original previa apenas "Quantidade em Estoque". Rejeitado: um contador digitado à mão dessincroniza, impede rastrear qual cópia sumiu, impede registrar estado de conservação e torna inventário um chute.

Adotado: modelo `Obra` (título/edição) → `Exemplar` (cópia física com tombo próprio). A quantidade em estoque passa a ser **derivada** da contagem de exemplares disponíveis.

O sistema funciona **sem** que o acervo esteja etiquetado — busca por título resolve. A etiquetagem acontece gradualmente, com etiquetas geradas em PDF pelo próprio sistema.

### 2.3 Autenticação do aluno: matrícula + data de nascimento

Escolhido pela simplicidade operacional (crianças pequenas, zero suporte de recuperação de senha).

**Risco aceito conscientemente:** qualquer colega que saiba matrícula e data de nascimento pode agir no nome do outro.

**Mitigações obrigatórias no código:**
- rate limit por IP e por matrícula
- bloqueio progressivo após tentativas falhas
- painel do aluno expõe o mínimo de dado pessoal — sem endereço, sem contato de responsável, sem qualquer dado de outro aluno
- ações do aluno limitadas a reservar, renovar e pedir livro; nada destrutivo
- toda ação do aluno registrada em auditoria

### 2.4 Stack: Next.js + Prisma + Neon, hospedado na Vercel

TypeScript ponta a ponta, um único deploy, free tier duradouro.

**Limites reais verificados (setembro/2026):**
- **Neon Free:** 0,5 GB de storage e 100 CU-horas/mês por projeto; compute suspende após 5 min de ociosidade e retoma em menos de 1 s. Para um banco de biblioteca (texto, sem binários) 0,5 GB comporta centenas de milhares de registros. Capas de livro são referenciadas por URL externa, **nunca** armazenadas no banco.
- **Vercel Hobby:** permitido apenas para uso **não-comercial**. A definição da Vercel é ampla e inclui ganho financeiro de qualquer pessoa envolvida em produzir o projeto.

**Consequência arquitetural:** o sistema é multi-tenant justamente para poder atender outras escolas no futuro. No dia em que qualquer escola pagar, Vercel Hobby deixa de ser permitido. Portanto o app **não pode depender da Vercel**:

- `output: standalone` no Next.js e `Dockerfile` versionado desde o primeiro commit
- cron implementado como endpoint HTTP protegido por segredo compartilhado, acionado pelo Vercel Cron — trocável por qualquer agendador
- nenhuma API proprietária da Vercel no caminho crítico

Rotas de saída, caso vire produto: Cloudflare Workers via OpenNext (sem cláusula comercial), VM, ou Vercel Pro.

### 2.5 Multi-tenant desde o primeiro commit

Toda tabela carrega `escolaId`. A escola da coordenação é o tenant #1.

Custo hoje: pequeno. Custo de retrofitar depois: schema inteiro e todas as queries.

### 2.6 O acervo será catalogado do zero

Confirmado: **não existe catálogo em lugar nenhum** — nem planilha, nem software, nem ficha. Tudo será cadastrado do zero.

Isso promove a **busca por ISBN a caminho crítico do projeto**, não a conveniência. É literalmente a diferença entre catalogar o acervo em semanas ou em meses, e é o único fator que pode fazer o sistema nunca sair do papel: um sistema de biblioteca sem acervo cadastrado não tem função.

Consequências para a implementação:

- A busca por ISBN consulta **Google Books e Open Library, com fallback entre elas** — nenhuma das duas cobre o catálogo brasileiro sozinha, especialmente livros didáticos e literatura infantojuvenil nacional.
- Quando ambas falham, o cadastro manual precisa ser rápido: formulário enxuto, autores e editoras com autocomplete a partir do que já existe no acervo, e repetição do último valor para os campos que se repetem em lote.
- Existe **modo de catalogação em série**: bipa ISBN → confere → salva → o cursor volta para o campo de ISBN. Sem navegar menu entre um livro e outro.
- Cadastrar a obra e gerar N exemplares de uma vez, já com tombos sequenciais e etiquetas prontas para impressão.

O importador de planilha continua no escopo, mas seu uso primário passa a ser **a importação de alunos**, e não o acervo. Ele permanece útil para o acervo em duas hipóteses: se aparecer alguma lista parcial, e para outras escolas no futuro, dado que o sistema é multi-tenant.

### 2.7 Entrega: sistema completo antes da primeira demonstração

Paulo optou por entregar o sistema inteiro de uma vez, e não em fatias apresentadas à coordenação conforme ficam prontas.

Isso **não** significa construir em ordem arbitrária. A ordem de construção continua sendo por camadas de dependência (fundação → acervo → circulação → portal → relatórios), e cada fase termina verificada. O que muda é que não há entrega parcial para a usuária final: ela vê o Marca-Página quando ele estiver inteiro.

**Consequência a assumir conscientemente:** o feedback da coordenação chega no fim, e não durante. O contrapeso é esta spec — as decisões de produto foram tomadas aqui, por escrito, antes do código. Onde a spec estiver errada sobre a realidade da biblioteca, o erro só aparece na demonstração.

### 2.8 Escopo v1 confirmado

Dentro: gamificação de leitura, notificações de atraso, suspensão por atraso, inventário de acervo, importação por planilha, geração de PDFs, auditoria, exportação/backup, PWA.

**Fora do v1, deliberadamente:** catalogação MARC21, integração com sistema acadêmico, empréstimo entre bibliotecas, app nativo, módulo de aquisição/orçamento, periódicos. Nenhum paga seu custo agora.

---

## 3. Arquitetura

### 3.1 Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict |
| ORM | Prisma |
| Banco | Neon Postgres |
| Auth | Auth.js v5, dois providers de credenciais |
| Hash de senha | Argon2id |
| UI | Tailwind CSS + shadcn/ui |
| Validação | Zod |
| Testes | Vitest (unidade/serviço) + Playwright (E2E) |
| PDF | pdf-lib |
| E-mail | Resend |
| Erros em produção | Sentry |

### 3.2 Camadas

```
app/
  (staff)/…              painel operacional
  (aluno)/…              portal do aluno
  (professor)/…          painel do professor
  api/…                  route handlers
        ↑ APENAS HTTP e UI. Zero regra de negócio.

src/modules/<dominio>/
  <dominio>.repository.ts   único lugar que toca Prisma; sempre escopado por tenant
  <dominio>.service.ts      regra de negócio; não conhece Request/Response
  <dominio>.schema.ts       Zod: validação de entrada e DTOs
  <dominio>.types.ts

src/core/
  db/          PrismaClient singleton
  auth/        sessão, guards
  rbac/        catálogo de permissões, checagem
  tenant/      contexto via AsyncLocalStorage, repositório base
  errors/      erros de domínio tipados
  result/      Result<T, E> para falhas esperadas
  audit/       log de auditoria

prisma/schema.prisma
tests/
```

**Módulos:** `acervo`, `circulacao`, `leitores`, `usuarios`, `carrinho`, `inventario`, `relatorios`, `gamificacao`, `notificacoes`.

### 3.3 Invariantes arquiteturais — verificadas por teste, não por convenção

Duas regras viram teste automatizado que quebra o CI quando violadas:

1. **Nenhum arquivo em `app/` importa `*.repository.ts` ou `PrismaClient`.** Rotas falam com serviços.
2. **Nenhum repositório emite query sem filtro de tenant.** Verificado por análise dos repositórios e por teste de integração que tenta vazar dados entre dois tenants semeados.

A segunda regra é a única barreira entre "multi-tenant" e "vazamento de dados de menores entre escolas". Ela não pode depender de disciplina humana.

### 3.4 Tenancy

O `escolaId` vem do contexto da sessão, propagado via `AsyncLocalStorage`, e é injetado pelo repositório base em todo `where`.

`escolaId` **nunca** é aceito do cliente, em nenhuma rota, em nenhuma circunstância.

### 3.5 RBAC baseado em permissão

O código checa **permissão**, nunca papel:

```ts
// certo
await requirePermission('emprestimo:criar')

// errado — proibido no codebase
if (user.role === 'BIBLIOTECARIO') { … }
```

**Catálogo de permissões** (por domínio):

- `obra:ver` `obra:criar` `obra:editar` `obra:excluir`
- `exemplar:criar` `exemplar:editar` `exemplar:baixar`
- `emprestimo:criar` `emprestimo:devolver` `emprestimo:renovar` `emprestimo:forcar`
- `reserva:criar` `reserva:gerenciar`
- `aluno:ver` `aluno:criar` `aluno:editar` `aluno:importar`
- `turma:gerenciar`
- `usuario:gerenciar` `papel:gerenciar`
- `carrinho:gerenciar`
- `inventario:executar`
- `relatorio:ver` `relatorio:exportar`
- `config:editar`
- `auditoria:ver`
- `escola:gerenciar` (super admin)

**Papéis de fábrica** (conjuntos editáveis de permissões, por escola):

| Papel | Resumo |
|---|---|
| `SUPER_ADMIN` | Gerencia escolas. Global, não pertence a tenant. |
| `DIRECAO` | Lê tudo da escola, sem operar balcão |
| `COORDENACAO` | Tudo da biblioteca + relatórios + gerenciar usuários |
| `BIBLIOTECARIO` | Balcão completo + cadastros |
| `MONITOR` | Empresta e devolve. Não edita, não exclui, não força |
| `PROFESSOR` | Turmas próprias, engajamento, pedidos de carrinho |
| `ALUNO` | Portal de autoatendimento |

Papéis são editáveis pela coordenação: criar "Monitor do 9º ano" não exige mudança de código.

**A checagem mora no service.** Esconder botão na UI não é autorização; a UI apenas reflete a permissão já verificada no servidor.

### 3.6 Autenticação — dois reinos

| Reino | Credencial | Sessão |
|---|---|---|
| Staff | e-mail + senha (Argon2id) | cookie httpOnly, expira em 12 h |
| Aluno | matrícula + data de nascimento | cookie httpOnly, expira em 8 h |

Reset de senha de staff é feito por quem tem `usuario:gerenciar` — não há fluxo por e-mail no v1, porque a escola pode não ter e-mail confiável para todos.

---

## 4. Modelo de dados

Todas as entidades, exceto `Escola` e `SUPER_ADMIN`, carregam `escolaId`.

### 4.1 Instituição e leitores

- **`Escola`** — tenant. Nome, config de circulação, ativo.
- **`AnoLetivo`** — ano, início, fim, ativo.
- **`DiaNaoLetivo`** — data, descrição, tipo (feriado, recesso, férias, fim de semana). Usado no cálculo de prazo.
- **`Turma`** — nome ("5º A"), série, turno, `anoLetivoId`.
- **`Aluno`** — matrícula (única por escola), nome, data de nascimento, `turmaId`, nome/e-mail/telefone do responsável, ativo, foto opcional.
- **`Usuario`** — staff: nome, e-mail, hash de senha, ativo.
- **`UsuarioTurma`** — vincula professor às turmas.
- **`Papel`** — nome, `escolaId` (nulo = global), lista de permissões.
- **`UsuarioPapel`**.

### 4.2 Acervo

- **`Obra`** — título, subtítulo, editora, ano de publicação, ISBN, edição, idioma, número de páginas, sinopse, URL da capa, CDD, faixa etária, `categoriaId`.
- **`Autor`** e **`ObraAutor`** — relação N:N. Necessária para o relatório de autor mais lido; um campo texto "autor" inviabilizaria isso.
- **`Categoria`** — nome, cor, `parentId` (hierarquia gênero → subgênero).
- **`Exemplar`** — `obraId`, tombo (único por escola), estado de conservação (`NOVO`, `BOM`, `DESGASTADO`, `DANIFICADO`), situação (`DISPONIVEL`, `EMPRESTADO`, `RESERVADO`, `EM_CARRINHO`, `EM_MANUTENCAO`, `EXTRAVIADO`, `BAIXADO`), `localizacaoId`, data de aquisição, origem (`COMPRA`, `DOACAO`, `GOVERNO`), valor de aquisição opcional.
- **`Localizacao`** — nome, corredor, estante, prateleira. Atende ao campo "Localização Física (Corredor/Prateleira)" da especificação original.

### 4.3 Circulação

- **`Emprestimo`** — `exemplarId`, leitor (`alunoId` ou `usuarioId`), data de retirada, data prevista de devolução, data de devolução, status (`ATIVO`, `DEVOLVIDO`, `PERDIDO`), contagem de renovações, operador da retirada, operador da devolução, observação, flag de liberação forçada e justificativa.

  **"Atrasado" é calculado**, nunca armazenado: `dataPrevista < hoje AND dataDevolucao IS NULL`. Um campo materializado por cron mente sempre que o cron falha. Índice composto sustenta a query.

- **`Reserva`** — `obraId` (a reserva é da obra, não do exemplar), `alunoId`, data, status (`AGUARDANDO`, `DISPONIVEL`, `ATENDIDA`, `EXPIRADA`, `CANCELADA`), posição na fila, `exemplarSeparadoId`, data limite de retirada.

- **`Penalidade`** — `alunoId`, tipo (`SUSPENSAO`), início, fim, motivo, `emprestimoOrigemId`. Suspensão em dias é o padrão em escola; multa em dinheiro não entra no v1.

### 4.4 Carrinho da Leitura

- **`RodadaCarrinho`** — data, `turmaId`, responsável, observação, status (`PLANEJADA`, `REALIZADA`).
- **`RodadaCarrinhoExemplar`** — exemplares levados na rodada.
- **`PedidoCarrinho`** — `alunoId`, `obraId` **ou** `tituloLivre` (para título fora do acervo), data, status (`PENDENTE`, `ATENDIDO`, `RECUSADO`, `SUGERIDO_COMPRA`).

### 4.5 Inventário

- **`Inventario`** — início, fim, responsável, status, escopo (localização ou acervo inteiro).
- **`InventarioItem`** — `inventarioId`, `exemplarId`, conferido, localização real encontrada, tipo de divergência.

### 4.6 Gamificação

- **`Meta`** — escopo (`ALUNO` ou `TURMA`), `anoLetivoId`, quantidade de livros, período.
- **`Conquista`** — nome, descrição, ícone, regra.
- **`AlunoConquista`** — `alunoId`, `conquistaId`, data.
- Rankings são calculados a partir de empréstimos devolvidos; não há tabela de placar materializada no v1.

### 4.7 Operação

- **`Notificacao`** — tipo, destinatário, canal (`EMAIL`, `PAINEL`), status, tentativas, payload. Fila em tabela, consumida por cron.
- **`LogAuditoria`** — usuário, ação, entidade, id da entidade, dados antes, dados depois, IP, timestamp, `escolaId`.

### 4.8 Configuração de circulação (por escola, com override por série)

- prazo de empréstimo em dias
- limite de livros simultâneos
- máximo de renovações
- dias de suspensão por dia de atraso
- prazo de retirada de reserva
- aluno pode reservar por conta própria (sim/não)

O override por série existe porque um aluno do 2º ano e um do 9º não levam a mesma quantidade nem pelo mesmo prazo.

---

## 5. Fluxos operacionais

### 5.1 Empréstimo no balcão

Roda dezenas de vezes por dia. Otimizado para teclado, sem exigir mouse.

1. Digita matrícula ou nome do aluno.
2. **O sistema mostra os bloqueios antes de qualquer outra coisa**: suspensão ativa, limite atingido, empréstimo em atraso.
3. Digita o tombo ou busca o título.
4. Confirma. A data de devolução sai calculada, pulando dias não letivos.

Quem tem `emprestimo:forcar` pode liberar sobre um bloqueio **com justificativa obrigatória**, e o evento vai para auditoria. Exceções vão acontecer; é melhor registrá-las do que empurrar a coordenação a contornar o sistema.

### 5.2 Devolução

1. Tombo identifica o empréstimo.
2. Registra estado de conservação na devolução.
3. Se houver atraso, aplica a penalidade configurada.
4. **Se houver reserva na fila para aquela obra, o sistema separa o exemplar, marca `RESERVADO` e dispara o aviso com prazo de retirada.**

O passo 4 é o que faz fila de reserva funcionar de verdade.

### 5.3 Renovação

Permitida pelo aluno no portal ou pelo balcão. Bloqueada quando há fila de reserva na obra ou quando o máximo de renovações foi atingido.

### 5.4 Reserva pelo aluno

Aluno busca no acervo, reserva, entra na fila. Ao ficar disponível, recebe notificação e um prazo para retirar; expirado o prazo, passa para o próximo da fila.

### 5.5 Cadastro de acervo

O acervo será catalogado do zero (§2.6), então este fluxo é o caminho crítico do projeto inteiro.

**Por ISBN, em série:** bipa ou digita o ISBN → consulta Google Books, com fallback para Open Library → preenche título, autores, editora, ano, capa e sinopse → a operadora confere e salva → **o cursor volta ao campo de ISBN**. Sem navegar menu entre um livro e o próximo. Na mesma tela, gerar N exemplares com tombos sequenciais.

**Quando as duas APIs falham** — comum em didático e infantojuvenil nacional — o formulário manual precisa ser enxuto, com autocomplete de autor e editora a partir do acervo já cadastrado e repetição do último valor nos campos que se repetem em lote.

**Por planilha:** upload, mapeamento de colunas, preview com validação linha a linha, deduplicação por ISBN, importação transacional. Uso primário é **importar alunos**; para acervo, serve a listas parciais que apareçam e a outras escolas no futuro.

### 5.6 Rodada do Carrinho da Leitura

1. Coordenação planeja a rodada: data, turma, responsável.
2. O sistema **sugere exemplares** com base nos pedidos pendentes daquela turma e na faixa etária.
3. Após a visita, os empréstimos da rodada são lançados **em lote** — uma tela para 30 alunos, não 30 telas.
4. Pedidos de títulos fora do acervo alimentam o relatório de sugestão de compra.

### 5.7 Inventário

Sessão de conferência por localização. A operadora percorre a estante marcando conferidos. Ao final, três listas: não encontrado, fora do lugar, consta emprestado.

---

## 6. Relatórios

Relatórios são queries, não tabelas materializadas.

**Pedidos na especificação original:**
1. Top 10 livros mais lidos — filtrável por período, turma e série
2. Turmas com maior engajamento
3. Livros mais solicitados no Carrinho da Leitura

**Correção deliberada no item 2:** o engajamento é medido **per capita**, não em valor absoluto. Ranking absoluto faz a turma maior vencer sempre, e a métrica passa a mentir. O sistema mostra empréstimos por aluno matriculado, com o número absoluto ao lado.

**Adicionais que a coordenação vai precisar:**
- **Alunos que nunca retiraram um livro no ano letivo** — a lista que efetivamente muda decisão pedagógica
- Acervo parado: obras nunca emprestadas
- Autores e categorias mais lidos
- Curva de empréstimos ao longo do ano letivo
- Atrasados, por turma
- Sugestão de compra, por demanda
- Perdas e baixas por período

Todo relatório exporta em CSV e PDF.

---

## 7. Interfaces

### 7.1 Painel staff (desktop-first)

Dashboard do dia (empréstimos hoje, atrasados, reservas aguardando retirada, devoluções previstas) · balcão · acervo · leitores · carrinho · inventário · relatórios · configurações · auditoria.

### 7.2 Portal do aluno (mobile-first, PWA)

Busca no acervo com capa e disponibilidade real · reservar · meus empréstimos com prazo e botão de renovar · histórico de leitura · pedir livro para o carrinho · metas e medalhas · ranking da turma.

O aluno vê o próprio nome e mais nada de sensível: sem endereço, sem contato de responsável, sem qualquer dado de outro aluno. Rankings exibem primeiro nome e inicial do sobrenome.

### 7.3 Portal do professor

Engajamento da própria turma, alunos que nunca retiraram livro, solicitação de rodada de carrinho.

### 7.4 Impressos em PDF

Etiquetas de tombo em folha A4 (para a etiquetagem gradual) · carteirinhas com código · lista diária de atrasados por turma, para entregar em sala · comprovante de empréstimo.

---

## 8. Infraestrutura e qualidade

### 8.1 Deploy

Vercel Hobby + Neon Free, com `output: standalone` e `Dockerfile` versionado como porta de saída (ver 2.4). Cron da Vercel aciona endpoint HTTP protegido por segredo compartilhado.

### 8.2 CI (GitHub Actions)

lint · typecheck · testes · build · **as duas invariantes arquiteturais da seção 3.3**. Migrations por Prisma Migrate. Seed cria escola, papéis de fábrica e usuário administrador.

### 8.3 Testes

Serviços testam contra **repositórios fake em memória** — o retorno concreto do padrão repository: regras de negócio verificadas em milissegundos, sem banco.

Playwright cobre os quatro fluxos que não podem quebrar: empréstimo, devolução, reserva com fila, login do aluno.

Cobertura obrigatória de regra: cálculo de prazo com dias não letivos, aplicação de suspensão, avanço da fila de reserva, bloqueio de renovação, isolamento entre tenants.

### 8.4 Backup

O free tier do Neon não oferece retenção longa. O sistema inclui exportação completa (JSON + CSV) sob demanda e um cron semanal.

O acervo catalogado à mão é o ativo mais caro deste projeto e não pode depender do free tier de terceiros.

### 8.5 Observabilidade

Sentry no free tier.

---

## 9. LGPD

O sistema trata dados pessoais de crianças e adolescentes, que a LGPD protege de forma reforçada.

**O que o design resolve:**
- minimização: só os campos com uso operacional definido
- aluno não acessa dado de outro aluno
- auditoria de acesso e alteração
- retenção configurável e anonimização de aluno desligado
- isolamento entre tenants verificado por teste

**O que fica com a escola, não com o código:**
- definir a base legal do tratamento
- informar responsáveis
- designar quem responde por proteção de dados

Isto está registrado aqui para que a responsabilidade fique explícita. Não é uma tarefa de engenharia.

---

## 10. Fora de escopo no v1

Catalogação MARC21 · integração com sistema acadêmico · empréstimo entre bibliotecas · aplicativo nativo · módulo de aquisição e orçamento · controle de periódicos.

**Nota sobre código de barras:** leitores USB de código de barras funcionam como teclado — digitam o código e dão Enter. Todo campo de tombo e de ISBN é, portanto, compatível com leitor desde o v1, sem trabalho adicional. O que fica fora do v1 é **leitura por câmera do celular**, que exigiria biblioteca de visão computacional no cliente.

---

## 11. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Autenticação do aluno por dado adivinhável (2.3) | Rate limit, bloqueio progressivo, exposição mínima de dados, auditoria |
| Vercel Hobby proíbe uso comercial (2.4) | Portabilidade desde o commit 1; rota de saída documentada |
| 100 CU-horas/mês do Neon | Uso escolar fica confortavelmente abaixo; monitorar e migrar se estourar |
| Acervo nunca ser catalogado | Busca por ISBN e importador de planilha reduzem o custo de entrada |
| Etiquetagem nunca acontecer | O sistema opera sem etiqueta; busca por título é caminho de primeira classe |
| Vazamento entre tenants | Filtro no repositório base + teste de isolamento no CI |
