import { requireStaff, requireAluno } from '@/core/auth/guards'
import { executarComTenant } from '@/core/tenant/context'
import type { PrincipalStaff, PrincipalAluno } from '@/core/auth/principal'

/**
 * Lê a sessão, abre o contexto de tenant e entrega o principal.
 *
 * O `escolaId` sai da SESSÃO, não do host e nunca do cliente
 * (Global Constraint 3). No login ele veio do host e foi carimbado no
 * token assinado; daí em diante quem manda é o token — assim uma
 * requisição autenticada não consegue trocar de escola mudando cabeçalho,
 * e não há ida ao banco para redescobrir o que a sessão já sabe.
 */
export async function comStaffNoTenant<T>(
  fn: (principal: PrincipalStaff) => Promise<T>,
): Promise<T> {
  const principal = await requireStaff()
  return executarComTenant(principal.escolaId, () => fn(principal))
}

/**
 * O gêmeo do de cima, para o outro reino.
 *
 * Nasceu em `src/modules/portal/contexto-do-aluno.ts` porque `src/core/`
 * estava sendo mexido por outra frente, e foi promovido para cá: um
 * módulo de `modules/` que lê sessão é exatamente o que a Decisão 13
 * separa. Isto não é serviço, é a cola da camada de rota — e é por isso
 * que mora em `core/auth` e não em `modules/`.
 *
 * O `escolaId` sai da SESSÃO pelo mesmo motivo explicado acima. Vale
 * dizer o que este contexto NÃO faz: ele não autoriza nada. O portal
 * autoriza por ESCOPO — nenhuma função pública de `src/modules/portal/`
 * aceita id de aluno por parâmetro, e o único id que entra em consulta é
 * `principal.id`. Dar `aluno:ver` ao aluno teria sido a resposta errada:
 * permissão é sobre a ação, não sobre a linha, e ele passaria a ver a
 * ficha do colega.
 */
export async function comAlunoNoTenant<T>(
  fn: (principal: PrincipalAluno) => Promise<T>,
): Promise<T> {
  const principal = await requireAluno()
  return executarComTenant(principal.escolaId, () => fn(principal))
}
