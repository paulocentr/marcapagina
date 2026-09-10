import { NextResponse, type NextRequest } from 'next/server'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { exigirPermissao } from '@/core/rbac/verificar'
import { dependenciasDoAcervo } from '@/modules/acervo/acervo.deps'
import { listarExemplaresDaObra } from '@/modules/acervo/exemplares.service'
import { gerarPdfDeEtiquetas, ETIQUETAS_POR_FOLHA } from '@/infra/pdf/etiquetas'
import { ErroDeDominio } from '@/core/errors'

export const runtime = 'nodejs'

/**
 * Folha A4 de etiquetas dos exemplares de uma obra.
 *
 * `?pular=N` deixa a operadora aproveitar uma folha já usada pela metade
 * — sem isso, cada impressão pede folha nova e a escola gasta etiqueta à
 * toa, que é o tipo de atrito que faz a etiquetagem gradual parar.
 */
export async function GET(request: NextRequest) {
  try {
    const obraId = request.nextUrl.searchParams.get('obraId')
    if (!obraId) {
      return NextResponse.json({ erro: 'Informe a obra.' }, { status: 400 })
    }

    const pular = lerPular(request.nextUrl.searchParams.get('pular'))
    if (pular === null) {
      return NextResponse.json(
        { erro: `"pular" precisa ser um número entre 0 e ${ETIQUETAS_POR_FOLHA - 1}.` },
        { status: 400 },
      )
    }

    const pdf = await comStaffNoTenant(async (principal) => {
      // Quem imprime etiqueta está mexendo no acervo físico; a permissão
      // é a mesma de editar exemplar.
      exigirPermissao(principal, 'exemplar:editar')

      const exemplares = await listarExemplaresDaObra(obraId, dependenciasDoAcervo())
      if (exemplares.length === 0) return null

      return gerarPdfDeEtiquetas(
        exemplares.map((e) => e.tombo),
        { pular },
      )
    })

    if (!pdf) {
      return NextResponse.json(
        { erro: 'Esta obra não tem exemplares para etiquetar.' },
        { status: 404 },
      )
    }

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'content-type': 'application/pdf',
        // `inline` para abrir no visualizador: a operadora confere antes
        // de gastar a folha de etiqueta, que é cara e não volta atrás.
        'content-disposition': `inline; filename="etiquetas-${obraId}.pdf"`,
      },
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) {
      return NextResponse.json(
        { erro: erro.message },
        { status: erro.codigo === 'NAO_AUTENTICADO' ? 401 : 403 },
      )
    }
    throw erro
  }
}

/** Devolve `null` para entrada inválida — nunca 0 por omissão. */
function lerPular(bruto: string | null): number | null {
  if (bruto === null || bruto.trim() === '') return 0
  const numero = Number(bruto)
  if (!Number.isInteger(numero) || numero < 0 || numero >= ETIQUETAS_POR_FOLHA) return null
  return numero
}
