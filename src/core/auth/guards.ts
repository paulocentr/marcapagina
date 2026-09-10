import { lerSessao } from '@/core/auth/sessao'
import { ehAluno, ehStaff, type PrincipalAluno, type PrincipalStaff } from '@/core/auth/principal'
import { exigirPermissao } from '@/core/rbac/verificar'
import { NaoAutenticadoError } from '@/core/errors'
import type { Permissao } from '@/core/rbac/permissoes'

export async function requireStaff(): Promise<PrincipalStaff> {
  const principal = await lerSessao()
  if (!principal || !ehStaff(principal)) throw new NaoAutenticadoError()
  return principal
}

export async function requireAluno(): Promise<PrincipalAluno> {
  const principal = await lerSessao()
  if (!principal || !ehAluno(principal)) throw new NaoAutenticadoError()
  return principal
}

// O guard que a Global Constraint 5 exige em todo serviço protegido.
export async function requirePermission(permissao: Permissao): Promise<PrincipalStaff> {
  const principal = await lerSessao()
  exigirPermissao(principal, permissao)
  return principal
}
