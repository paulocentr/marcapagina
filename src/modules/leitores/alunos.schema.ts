import { z } from 'zod'

/**
 * Validação da entrada de aluno.
 *
 * Duas decisões que parecem detalhe e não são:
 *
 * 1. **A data de nascimento aceita os MESMOS dois formatos que o
 *    importador** (`src/modules/importacao/plano-alunos.ts`): `aaaa-mm-dd`
 *    e `dd/mm/aaaa`. Divergir faria a planilha da secretaria entrar e o
 *    cadastro à mão recusar a mesma data — ou pior, o contrário.
 *    A lógica está repetida aqui, e não importada, porque o módulo de
 *    importação tem dono próprio nesta passagem; a repetição é
 *    deliberada e está travada por teste nos dois lados.
 *
 * 2. **A matrícula com espaço no meio é RECUSADA, não reescrita.** Ela é
 *    a metade pública do login do aluno (decisão 3): reescrevê-la em
 *    silêncio mudaria a credencial de alguém que já entra no portal.
 */

// `z.trim()` apara as pontas e deixa o espaço do meio. Um nome colado de
// outra tela vem com espaço duplo e sobreviveria à validação, virando
// dois alunos visualmente idênticos na lista — e a operadora sem ver
// diferença nenhuma entre eles no balcão.
const textoLimpo = z.string().transform((valor) => valor.replace(/\s+/g, ' ').trim())

const textoOpcional = textoLimpo.pipe(z.string().min(1)).optional()

const nomeSchema = textoLimpo.pipe(z.string().min(1, 'Informe o nome do aluno.'))

const matriculaSchema = z
  .string()
  .transform((valor) => valor.trim())
  .pipe(
    z
      .string()
      .min(1, 'Informe a matrícula do aluno.')
      .max(40, 'Matrícula longa demais — confira se não colou o nome junto.')
      .refine((valor) => !/\s/.test(valor), {
        message:
          'A matrícula não pode ter espaço no meio. Ela é o que o aluno digita para entrar ' +
          'no portal, e o espaço faz o login falhar sem explicação.',
      }),
  )

const emailDoResponsavelSchema = z
  .string()
  .transform((valor) => valor.trim())
  .pipe(z.string().email('O e-mail do responsável não parece um endereço válido.'))
  .optional()

/**
 * A data de nascimento, sempre normalizada para `aaaa-mm-dd`.
 *
 * Valida os componentes um a um em vez de entregar a string a
 * `new Date()`: `31/02/2012` vira 2 de março num Date ingênuo, e o aluno
 * passaria a não conseguir entrar no portal com a data que sabe de cor.
 */
export const dataDeNascimentoSchema = z
  .string()
  .transform((valor) => valor.trim())
  .refine((valor) => normalizarDataDeNascimento(valor) !== null, {
    message: 'Data de nascimento inválida. Use aaaa-mm-dd ou dd/mm/aaaa.',
  })
  .transform((valor) => normalizarDataDeNascimento(valor)!)

export const entradaDeAlunoSchema = z.object({
  matricula: matriculaSchema,
  nome: nomeSchema,
  dataNascimento: dataDeNascimentoSchema,
  turmaId: textoOpcional,
  responsavelNome: textoOpcional,
  responsavelEmail: emailDoResponsavelSchema,
  responsavelTelefone: textoOpcional,
})

/**
 * Na edição todo campo é opcional, mas o que vier passa pelas mesmas
 * regras. Duas diferenças de propósito:
 *
 * - `dataNascimento` ausente significa "não mexa". A tela de edição abre
 *   o campo em BRANCO — a data é credencial, e mandá-la ao navegador para
 *   preencher um formulário que talvez só mude o telefone do responsável
 *   é expor a credencial sem necessidade.
 * - `turmaId` aceita `null`, que significa "tire da turma". `undefined`
 *   continua sendo "não mexa"; sem a distinção, editar o telefone
 *   tiraria o aluno da turma por omissão.
 */
export const edicaoDeAlunoSchema = entradaDeAlunoSchema.partial().extend({
  turmaId: textoOpcional.nullable(),
  // Os campos do responsável também aceitam `null`, pelo mesmo motivo que
  // `turmaId`: a operadora tem de poder APAGAR um telefone errado. Com
  // apenas `undefined` disponível, esvaziar o campo na tela seria
  // indistinguível de "não mexa" — e o dado errado ficaria lá para
  // sempre, com a operadora convencida de que o apagou.
  responsavelNome: textoOpcional.nullable(),
  responsavelEmail: emailDoResponsavelSchema.nullable(),
  responsavelTelefone: textoOpcional.nullable(),
})

export type EntradaDeAluno = z.input<typeof entradaDeAlunoSchema>
export type EdicaoDeAluno = z.input<typeof edicaoDeAlunoSchema>

/** Aluno de escola não nasceu antes disso nem no futuro. */
const ANO_MINIMO_DE_NASCIMENTO = 1900

function normalizarDataDeNascimento(bruto: string): string | null {
  const texto = bruto.trim()

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  const brasileira = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto)

  const partes = iso
    ? { ano: iso[1]!, mes: iso[2]!, dia: iso[3]! }
    : brasileira
      ? { ano: brasileira[3]!, mes: brasileira[2]!, dia: brasileira[1]! }
      : null

  if (!partes) return null

  const ano = Number.parseInt(partes.ano, 10)
  const mes = Number.parseInt(partes.mes, 10)
  const dia = Number.parseInt(partes.dia, 10)

  if (mes < 1 || mes > 12) return null
  if (dia < 1 || dia > diasNoMes(ano, mes)) return null
  if (ano < ANO_MINIMO_DE_NASCIMENTO || ano > new Date().getUTCFullYear()) return null

  return `${partes.ano}-${partes.mes}-${partes.dia}`
}

function diasNoMes(ano: number, mes: number): number {
  // Dia 0 do mês seguinte é o último dia deste mês; o próprio Date cuida
  // do ano bissexto, sem tabela mantida à mão.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}
