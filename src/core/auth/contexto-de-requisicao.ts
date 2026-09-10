import { requireStaff } from '@/core/auth/guards'
import { executarComTenant } from '@/core/tenant/context'
import type { PrincipalStaff } from '@/core/auth/principal'

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
