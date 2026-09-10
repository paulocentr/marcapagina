import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { requirePermission } from '@/core/auth/guards'
import { resolverTenant } from '@/core/tenant/resolver'
import { executarComTenant } from '@/core/tenant/context'
import { exportarEscola } from '@/modules/escolas/escolas.service'
import { registrarAuditoria } from '@/core/audit/audit.service'
import { ErroDeDominio } from '@/core/errors'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const principal = await requirePermission('config:editar')
    const cabecalhos = await headers()
    const escola = await resolverTenant(cabecalhos.get('host'))
    if (!escola) return NextResponse.json({ erro: 'Escola não identificada.' }, { status: 400 })

    const pacote = await executarComTenant(escola.id, async () => {
      const dados = await exportarEscola()
      await registrarAuditoria({
        autor: principal,
        acao: 'escola.exportar',
        entidade: 'Escola',
        entidadeId: escola.id,
      })
      return dados
    })

    return new NextResponse(JSON.stringify(pacote, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="marcapagina-${escola.slug}-${pacote.exportadoEm.slice(0, 10)}.json"`,
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
