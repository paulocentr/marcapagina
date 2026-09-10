import { z } from 'zod'
import { TODAS_AS_PERMISSOES } from '@/core/rbac/permissoes'

export const principalStaffSchema = z.object({
  reino: z.literal('STAFF'),
  id: z.string().min(1),
  escolaId: z.string().min(1),
  nome: z.string().min(1),
  // Permissões viajam no token para que a checagem não precise de banco a
  // cada requisição. O preço é o tempo de vida: uma permissão revogada só
  // vale na próxima sessão. Aceitável com sessão de 12 h e revogação
  // imediata disponível por desativar o usuário.
  permissoes: z.array(z.enum(TODAS_AS_PERMISSOES)),
})

export const principalAlunoSchema = z.object({
  reino: z.literal('ALUNO'),
  id: z.string().min(1),
  escolaId: z.string().min(1),
  nome: z.string().min(1),
  matricula: z.string().min(1),
})

export const principalSchema = z.discriminatedUnion('reino', [
  principalStaffSchema,
  principalAlunoSchema,
])

export type PrincipalStaff = z.infer<typeof principalStaffSchema>
export type PrincipalAluno = z.infer<typeof principalAlunoSchema>
export type Principal = z.infer<typeof principalSchema>

export function ehStaff(p: Principal): p is PrincipalStaff {
  return p.reino === 'STAFF'
}

export function ehAluno(p: Principal): p is PrincipalAluno {
  return p.reino === 'ALUNO'
}
