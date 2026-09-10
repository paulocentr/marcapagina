'use server'

import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { dependenciasDoAcervo } from '@/modules/acervo/acervo.deps'
import { consultarIsbn, catalogar } from '@/modules/acervo/catalogacao.service'
import { ErroDeDominio } from '@/core/errors'
import type { MetadadosDeObra } from '@/infra/metadados/provedor'

export interface ObraJaNoAcervo {
  id: string
  titulo: string
  exemplares: number
}

export type RespostaDaConsulta =
  | { ok: true; isbn: string; metadados: MetadadosDeObra | null; jaCadastrada: ObraJaNoAcervo | null }
  | { ok: false; erro: string }

export async function consultarIsbnAction(isbnBruto: string): Promise<RespostaDaConsulta> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const deps = dependenciasDoAcervo()
      const resultado = await consultarIsbn(principal, isbnBruto, deps)

      // A contagem de exemplares acompanha o aviso de obra repetida: sem
      // ela, "já está no acervo" não diz à operadora se vale acrescentar
      // exemplares ou se ela já cadastrou os dez da caixa.
      const jaCadastrada = resultado.jaCadastrada
        ? await (async () => {
            const detalhada = await deps.obras.obter(resultado.jaCadastrada!.id)
            return {
              id: resultado.jaCadastrada!.id,
              titulo: resultado.jaCadastrada!.titulo,
              exemplares: detalhada?.totalDeExemplares ?? 0,
            }
          })()
        : null

      return { ok: true as const, isbn: resultado.isbn, metadados: resultado.metadados, jaCadastrada }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export interface EntradaDeCatalogacaoUI {
  isbn: string
  titulo: string
  autores: string
  editora?: string
  anoPublicacao?: string
  numeroDePaginas?: string
  sinopse?: string
  capaUrl?: string
  quantidadeDeExemplares: string
  obraExistenteId?: string
}

export type RespostaDaCatalogacao =
  | { ok: true; titulo: string; tombos: string[] }
  | { ok: false; erro: string }

export async function catalogarAction(
  entrada: EntradaDeCatalogacaoUI,
): Promise<RespostaDaCatalogacao> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const { obra, exemplares } = await catalogar(
        principal,
        {
          metadados: {
            isbn: entrada.isbn,
            titulo: entrada.titulo,
            // Um campo de texto com autores separados por ponto e vírgula
            // é o que permite bipar sem tirar a mão do teclado. Vírgula
            // não serve: "Machado de Assis, Jr." viraria dois autores.
            autores: entrada.autores
              .split(';')
              .map((a) => a.trim())
              .filter((a) => a.length > 0),
            editora: vazioViraIndefinido(entrada.editora),
            anoPublicacao: numeroOuIndefinido(entrada.anoPublicacao),
            numeroDePaginas: numeroOuIndefinido(entrada.numeroDePaginas),
            sinopse: vazioViraIndefinido(entrada.sinopse),
            capaUrl: vazioViraIndefinido(entrada.capaUrl),
          },
          quantidadeDeExemplares: Number(entrada.quantidadeDeExemplares),
          obraExistenteId: vazioViraIndefinido(entrada.obraExistenteId),
        },
        dependenciasDoAcervo(),
      )

      return { ok: true as const, titulo: obra.titulo, tombos: exemplares.map((e) => e.tombo) }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

function vazioViraIndefinido(valor: string | undefined): string | undefined {
  const limpo = valor?.trim()
  return limpo ? limpo : undefined
}

// Campo numérico em branco vira undefined, NUNCA 0: um zero em "número de
// páginas" a operadora não vê, e vira ficha errada que ninguém revisa
// (Global Constraint 9).
function numeroOuIndefinido(valor: string | undefined): number | undefined {
  const limpo = valor?.trim()
  if (!limpo) return undefined
  const numero = Number(limpo)
  return Number.isFinite(numero) ? numero : undefined
}
