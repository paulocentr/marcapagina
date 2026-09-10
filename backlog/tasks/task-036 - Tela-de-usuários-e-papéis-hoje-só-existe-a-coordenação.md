---
id: TASK-036
title: 'Tela de usuários e papéis: hoje só existe a coordenação'
status: Done
assignee: []
created_date: '2026-09-10 21:00'
labels:
  - rbac
  - auth
  - frontend
milestone: m-0
dependencies: []
priority: high
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DESCOBERTO em 10/09/2026, olhando produção. Existe UM usuário no banco (coord@escola.br, papel COORDENACAO) e NENHUMA forma de criar outro pela interface.

As permissões usuario:gerenciar e papel:gerenciar existem no RBAC e nenhuma tela as usa. Os sete papéis de fábrica estão semeados no banco (SUPER_ADMIN, COORDENACAO, DIRECAO, BIBLIOTECARIO, MONITOR, PROFESSOR, ALUNO), mas atribuir papel a alguém hoje só é possível por SQL ou re-executando o seed.

Consequência prática: a bibliotecária e a monitora, que são quem opera o balcão no dia a dia, não têm como ter conta. A coordenação teria de emprestar a própria senha — o que destrói a auditoria, porque toda ação apareceria como sendo dela.

Precisa: listar usuários, criar usuário com papel, desativar, e trocar papel. A spec prevê papéis editáveis pela coordenação, então editar as permissões de um papel também entra.

Autorização mora no serviço: a tela filtra por permissão para não mentir, mas quem recusa é o serviço.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Entregue em 10/09/2026. Serviço + tela, em TDD (vermelho antes de cada peça).

**Arquivos**

- `src/modules/usuarios/usuarios.ts` — regras puras (nenhuma toca banco)
- `src/modules/usuarios/usuarios.service.ts` — serviço, `Principal` por parâmetro
- `src/modules/usuarios/gestao-de-usuarios.repository.ts` — queries, `dbDoTenant()`
- `src/modules/usuarios/usuarios.deps.ts` — ponto de composição
- `src/modules/usuarios/usuarios.schema.ts` — zod da borda
- `src/app/painel/usuarios/{page,actions,lista-de-contas,formulario-de-nova-conta,editor-de-papeis,usuarios-na-tela}`
- `tests/unit/usuarios/` (78 testes) · `tests/integration/usuarios/gestao.test.ts` (20)

**Assinaturas do serviço**

```
listarUsuariosDaEscola(principal, deps): Promise<UsuarioNaTela[]>        // usuario:gerenciar
listarPapeisDaEscola(principal, deps): Promise<PapelNaTela[]>            // usuario:gerenciar OU papel:gerenciar
criarUsuario(principal, {nome,email,senha,papelId}, deps): Promise<ContaCriada>
definirSituacaoDoUsuario(principal, {usuarioId,ativo}, deps): Promise<void>
trocarPapelDoUsuario(principal, {usuarioId,papelId}, deps): Promise<void>
definirPermissoesDoPapel(principal, {papelId,permissoes}, deps): Promise<void>  // papel:gerenciar
```

**Como a coordenação fica impedida de se trancar fora**

`administracaoSemDono(usuarios)` (pura) devolve as permissões de
administração — `usuario:gerenciar` e `papel:gerenciar` — que nenhum usuário
ATIVO carrega. Os três caminhos que levam ao mesmo buraco projetam a lista
como ela ficaria depois da mudança e chamam `exigirAdministradorRemanescente`:
desativar, trocar papel e editar as permissões do papel. Mais a recusa de
desativar a própria conta. A tela usa a MESMA função pura para desabilitar o
botão e escrever o motivo antes do clique, então aviso e recusa não podem
discordar.

`papel:gerenciar` entra na conta junto com `usuario:gerenciar` porque, sem ela,
o catálogo de papéis congela: devolver a permissão a um papel exige justamente
`papel:gerenciar`.

**Provado por MUTAÇÃO** (proteção removida, teste reprova):

| Proteção removida | Testes que reprovaram |
|---|---|
| `exigirAdministradorRemanescente` virou no-op | 4 — desativar o último admin, rebaixar-se, tirar `usuario:gerenciar` do papel, tirar `papel:gerenciar` do papel |
| `AutoDesativacaoError` removido | 1 — "NÃO desativa a própria conta" |
| `config:editar` tirado de `GRUPOS_DE_PERMISSAO` | 1 — "cobre TODA permissão que a escola pode conceder" |

**Decisões**

- `SUPER_ADMIN` e `ALUNO` não são atribuíveis por uma tela de escola
  (`PAPEIS_NAO_ATRIBUIVEIS_NA_ESCOLA`); `escola:gerenciar` não é concedível
  (`PERMISSOES_ATRIBUIVEIS_NA_ESCOLA`). Filtro de CATÁLOGO, não autorização
  por papel — quem autoriza continua sendo `exigirPermissao`.
- `senhaHash` não existe em nenhum tipo devolvido pelo serviço, e não aparece
  em nenhum `select` do repositório. Vazá-lo para a tela não compila.
- Senha por `gerarHash` de `src/core/auth/senha.ts`, importado direto (não
  injetado): ponto de composição que escolhe o hash é ponto que pode escolher
  um pior.
- Auditoria depois da escrita, com `.catch(() => undefined)`: `usuario.criar`,
  `usuario.desativar`, `usuario.reativar`, `usuario.trocar-papel`,
  `papel.editar-permissoes`. Nem senha nem hash entram no evento.

**NÃO feito** (fora do escopo do card): trocar/redefinir senha de conta
existente, excluir conta, criar papel novo, atribuir mais de um papel por
conta (o schema permite; a tela atribui um).
<!-- SECTION:NOTES:END -->

## Evidence

<!-- SECTION:EVIDENCE:BEGIN -->
Máquina local, 10/09/2026, banco `mp_frente_e` em Docker.

```
$ npx eslint src/modules/usuarios src/app/painel/usuarios tests --max-warnings=0
exit=0

$ npx tsc --noEmit
exit=2 — 8 erros, TODOS de outras frentes ativas ao mesmo tempo:
  src/app/painel/alunos/[alunoId]/page.tsx
  src/app/painel/alunos/novo/page.tsx
  src/app/painel/alunos/page.tsx
  tests/unit/relatorios/exportacao.test.ts
Erros nos caminhos desta frente (modules/usuarios, painel/usuarios,
tests/*/usuarios): 0

$ npm run test:unit
Test Files  63 passed (63)
     Tests  1745 passed (1745)

$ DATABASE_URL='postgresql://marcapagina:marcapagina@localhost:5432/mp_frente_e' npm run test:integration
Test Files  32 passed (32)
     Tests  367 passed (367)
```

NÃO verificado: `npm run build`, `npm start`, `npm run typecheck` (que roda
`next typegen` antes do `tsc`) e `test:e2e` — reservados para o gate final do
integrador; sete outras frentes ativas disputando `.next` e a porta 3000. A
tela não foi aberta em navegador; a prova é de serviço e de banco.
<!-- SECTION:EVIDENCE:END -->
