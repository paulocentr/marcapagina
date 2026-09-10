import { ehStaff, type Principal, type PrincipalStaff } from '@/core/auth/principal'
import { NaoAutenticadoError, SemPermissaoError } from '@/core/errors'
import type { Permissao } from '@/core/rbac/permissoes'

// Funções puras, sem I/O: é o que permite testá-las sem banco e sem HTTP.
// Os guards da camada de rota (guards.ts) apenas leem a sessão e delegam
// para cá.
export function temPermissao(principal: Principal | null, permissao: Permissao): boolean {
  if (!principal || !ehStaff(principal)) return false
  return principal.permissoes.includes(permissao)
}

export function exigirPermissao(
  principal: Principal | null,
  permissao: Permissao,
): asserts principal is PrincipalStaff {
  // Os dois casos são diferentes e o chamador precisa distingui-los:
  // sem sessão redireciona para o login; sem permissão mostra recusa.
  // Redirecionar para o login alguém que já está logado vira laço.
  if (!principal) throw new NaoAutenticadoError()
  if (!temPermissao(principal, permissao)) throw new SemPermissaoError(permissao)
}
