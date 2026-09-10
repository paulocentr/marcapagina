---
id: TASK-019
title: 'Alunos, turmas e ano letivo'
status: In Progress
assignee: []
created_date: '2026-09-10 01:56'
updated_date: '2026-09-10 21:59'
labels:
  - leitores
  - backend
  - db
milestone: m-3
dependencies: []
documentation:
  - docs/superpowers/specs/2026-09-09-biblioteca-escolar-design.md
priority: high
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AnoLetivo, Turma (nome, série, turno), Aluno (matrícula única por escola, nascimento, responsável e contato, ativo). UsuarioTurma vincula professor às turmas. Retenção configurável e anonimização de aluno desligado (LGPD, spec §9).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Entregue nesta passagem (commit 810f9c7)

Serviço, repositório e tela para as três pontas do cadastro:

- **Aluno** — listar com busca (nome ou matrícula) e filtros (turma, sem
  turma, ativos/todos), criar, editar, desativar e reativar.
- **Turma** — listar com contagem de alunos ativos, criar, editar, ligada
  a ano letivo e a série.
- **Ano letivo** — criar e marcar qual é o corrente (exatamente um ativo).

Arquivos: `src/modules/leitores/**` (serviço, repositório, schema, deps),
`src/app/painel/alunos/**` (lista, ficha, cadastro, turmas), com testes em
`tests/unit/leitores/**` e `tests/integration/leitores/**`.

### Três garantias que não devem ser desfeitas

1. **A série é validada na entrada** (`src/modules/leitores/serie.ts`).
   Formato: `1`–`9` (Fundamental) e `1EM`–`3EM` (Médio). Não é rótulo: é
   lida por `idadeTipicaDaSerie` (filtro do Carrinho) e pelo override de
   circulação por série, que compara por igualdade exata. O teste confere
   o formato contra `idadeTipicaDaSerie` de verdade — mexer no regex de lá
   reprova o teste daqui.
2. **A data de nascimento é credencial** (decisão 3). Não sai em nenhum
   retorno do serviço; o `select` do repositório nem pede a coluna. Na
   edição o campo abre em branco = "não mexa".
3. **Desativar não apaga, e avisa antes.** Com livro em mãos o serviço
   recusa e devolve o número; confirmar é explícito. Contagem e escrita na
   mesma transação.

## Evidência

Comandos e saída real (Postgres local, banco `mp_frente_f`):

- `npx eslint src/modules/leitores src/app/painel/alunos tests --max-warnings=0` — exit 0, sem saída
- `npx next typegen && npx tsc --noEmit` — exit 0, sem saída
- `npm run test:unit` — **64 arquivos, 1780 testes, todos passando** (90 novos)
- `npm run test:integration` — **32 arquivos, 367 testes, todos passando** (42 novos)

Cinco proteções confirmadas por MUTAÇÃO (quebrar e ver o teste reprovar):

| Proteção removida | Testes que reprovaram |
|---|---|
| `exigirSerie` na criação de turma | 3 |
| Recheque de homônimo ao mover turma de ano | 1 |
| Checagem de existência dentro da transação do ano ativo | 1 |
| Tradução do P2002 do índice único de matrícula | 1 |
| Filtro `ativo: true` na contagem de alunos da turma | 1 |

## NÃO verificado / NÃO entregue

- **`UsuarioTurma` (vínculo professor ↔ turma) não foi implementado.** Está
  na descrição original deste card e continua pendente; é o que o Painel do
  Professor (TASK-021) vai precisar.
- **Retenção configurável e anonimização de aluno desligado (LGPD, spec §9)
  não foram implementadas.** Continuam pendentes, e dependem de TASK-025.
- **As TELAS não têm teste automatizado.** Não há biblioteca de render de
  componente no projeto e o E2E estava fora do escopo desta passagem. Elas
  passaram por lint, typecheck e pelos gates de arquitetura do CI (camadas,
  `<Link>` para Route Handler), mas NENHUMA foi aberta num navegador.
- `npm run build` e `test:e2e` não foram rodados (fora do escopo desta
  passagem, para não colidir com as outras frentes ativas).
- A busca de aluno **não ignora acento**: `Aluno` não tem coluna
  normalizada como `Obra.tituloNormalizado`, e criar uma exigiria migração.
  Está dito na tela em vez de prometido e falso.

PARCIAL. Alunos, turmas e ano letivo entregues em 810f9c7, com tela. Ficou de FORA e continua neste card: UsuarioTurma (professor<->turma, que TASK-021 precisa) e a retenção/anonimização de aluno desligado exigida pelo LGPD.
<!-- SECTION:NOTES:END -->
