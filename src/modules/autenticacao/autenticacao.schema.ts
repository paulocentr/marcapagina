import { z } from 'zod'

export const entradaLoginStaffSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.'),
})

export const entradaLoginAlunoSchema = z.object({
  matricula: z.string().trim().min(1, 'Informe a matrícula.'),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de nascimento.'),
})

export type EntradaLoginStaff = z.infer<typeof entradaLoginStaffSchema>
export type EntradaLoginAluno = z.infer<typeof entradaLoginAlunoSchema>
