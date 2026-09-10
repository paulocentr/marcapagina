import { z } from 'zod'

/**
 * O formato da entrada que vem do formulário.
 *
 * Fica na borda (a Server Action valida ANTES de chamar o serviço) e não
 * substitui as regras de domínio: `normalizarNome`, `normalizarEmail` e
 * `validarSenhaNova` continuam rodando dentro do serviço. O motivo é a
 * decisão 13 — a Server Action é uma das portas, e uma regra que só mora
 * na porta não vale para quem entrar por outra.
 *
 * Aqui só se recusa o que nem chega a ser entrada: campo ausente, campo
 * não-texto, `papelId` vazio.
 */
export const entradaDeNovaContaSchema = z.object({
  nome: z.string().min(1, 'Informe o nome de quem vai usar a conta.'),
  email: z.string().min(1, 'Informe o e-mail.'),
  senha: z.string().min(1, 'Informe a senha.'),
  papelId: z.string().min(1, 'Escolha o papel desta conta.'),
})

export type EntradaDeNovaConta = z.infer<typeof entradaDeNovaContaSchema>

export const entradaDeSituacaoSchema = z.object({
  usuarioId: z.string().min(1),
  ativo: z.boolean(),
})

export const entradaDeTrocaDePapelSchema = z.object({
  usuarioId: z.string().min(1),
  papelId: z.string().min(1, 'Escolha o papel.'),
})

export const entradaDePermissoesDoPapelSchema = z.object({
  papelId: z.string().min(1),
  // Strings cruas de propósito: quem decide se a permissão existe e se a
  // escola pode concedê-la é `validarPermissoesConcedidas`, no domínio.
  // Validar contra o enum aqui duplicaria a regra na borda e faria a
  // recusa sair com mensagem de schema, não em pt-BR.
  permissoes: z.array(z.string()),
})
