import { z } from 'zod'

// Capa é SEMPRE URL externa (spec §4.2): binário no banco não entra,
// porque o free tier do Neon são 0,5 GB e capa de livro é o jeito mais
// rápido de gastá-los. Uma data URI é binário disfarçado de texto e
// passaria por um `z.string()` solto sem ninguém perceber; `javascript:`
// passaria por um `z.string().url()` solto e viraria XSS na ficha.
const capaUrlSchema = z
  .string()
  .trim()
  .url('A capa precisa ser um endereço de imagem válido.')
  .refine(
    (valor) => {
      try {
        return ['http:', 'https:'].includes(new URL(valor).protocol)
      } catch {
        return false
      }
    },
    { message: 'A capa precisa ser um endereço http ou https, não um arquivo embutido.' },
  )

// Um ano com um dígito a mais vira ficha errada que ninguém revisa depois.
// O piso é a invenção da prensa; o teto é o ano que vem, porque catálogo
// de editora anuncia lançamento antes de o ano virar.
const anoPublicacaoSchema = z
  .number()
  .int('O ano de publicação precisa ser um número inteiro.')
  .min(1450, 'Ano de publicação anterior à imprensa.')
  .max(new Date().getUTCFullYear() + 1, 'Ano de publicação no futuro.')

// `z.trim()` apara as pontas mas deixa o espaço do meio. Um título colado
// de outra tela vem com espaço duplo e sobreviveria à validação, virando
// duas fichas visualmente idênticas no acervo — e a operadora sem ver
// diferença nenhuma entre elas.
const textoLimpo = z.string().transform((valor) => valor.replace(/\s+/g, ' ').trim())

const textoOpcional = textoLimpo.pipe(z.string().min(1)).optional()

export const entradaDeObraSchema = z.object({
  titulo: textoLimpo.pipe(z.string().min(1, 'Informe o título da obra.')),
  subtitulo: textoOpcional,
  autores: z.array(z.string()).optional(),
  editora: textoOpcional,
  anoPublicacao: anoPublicacaoSchema.optional(),
  isbn: textoOpcional,
  edicao: textoOpcional,
  idioma: textoOpcional,
  numeroDePaginas: z.number().int().positive('Número de páginas precisa ser positivo.').optional(),
  sinopse: z.string().trim().min(1).optional(),
  capaUrl: capaUrlSchema.optional(),
  cdd: textoOpcional,
  faixaEtaria: textoOpcional,
  categoriaId: textoOpcional,
})

// Na edição todo campo é opcional, mas o que vier tem que passar pelas
// mesmas regras — inclusive o título, que pode mudar mas não ficar vazio.
export const edicaoDeObraSchema = entradaDeObraSchema.partial()

export type EntradaDeObra = z.infer<typeof entradaDeObraSchema>
export type EdicaoDeObra = z.infer<typeof edicaoDeObraSchema>
