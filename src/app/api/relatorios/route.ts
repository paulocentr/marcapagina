import { NextResponse, type NextRequest } from 'next/server'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { ErroDeDominio } from '@/core/errors'
import { exportarPainelDoLeitor } from '@/modules/relatorios/painel-do-leitor.service'
import { dependenciasDeRelatorios } from '@/modules/relatorios/relatorios.deps'
import {
  gerarPdfDoPainel,
  montarCsvDoPainel,
  nomeDoArquivo,
  type FormatoDeExportacao,
} from '@/modules/relatorios/exportacao'
import { ehChaveDePeriodo, type ChaveDePeriodo } from '@/modules/relatorios/periodo'

export const runtime = 'nodejs'

/**
 * O Painel do Leitor em arquivo: CSV para continuar a conta na planilha,
 * PDF para a reunião pedagógica em que ninguém abre o notebook.
 *
 * É Route Handler e não Server Action porque o resultado é um DOWNLOAD:
 * action devolve dado para a tela, não um arquivo com
 * `content-disposition`. Por isso o botão da tela é `<a href>` e nunca
 * `<Link>` — o App Router prefetcha todo `<Link>` que aparece na tela, e
 * um prefetch aqui geraria o PDF do acervo inteiro sem ninguém clicar.
 * Há gate no CI para isso.
 *
 * Quem lê a sessão é esta camada (`comStaffNoTenant`); quem autoriza é o
 * serviço, que recebe o `Principal` e exige `relatorio:exportar`
 * (decisão 13).
 */
export async function GET(request: NextRequest) {
  const formato = lerFormato(request.nextUrl.searchParams.get('formato'))
  if (formato === null) {
    return NextResponse.json(
      { erro: 'Formato de exportação desconhecido. Use "csv" ou "pdf".' },
      { status: 400 },
    )
  }

  const chave = lerPeriodo(request.nextUrl.searchParams.get('periodo'))
  if (chave === null) {
    return NextResponse.json(
      { erro: 'Período desconhecido. Use "MES", "BIMESTRE" ou "ANO".' },
      { status: 400 },
    )
  }

  try {
    const painel = await comStaffNoTenant((principal) =>
      exportarPainelDoLeitor(
        principal,
        // `agora` sai daqui e não do serviço: é o que permite ao teste do
        // serviço rodar em qualquer data sem mexer no relógio da máquina.
        { chave, agora: new Date() },
        dependenciasDeRelatorios(),
      ),
    )

    const nome = nomeDoArquivo(painel.periodo, formato)

    if (formato === 'csv') {
      return new NextResponse(montarCsvDoPainel(painel), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${nome}"`,
          // Relatório é contado na hora: uma cópia em cache faria a
          // coordenação baixar de novo e receber os números de ontem.
          'cache-control': 'no-store',
        },
      })
    }

    return new NextResponse(Buffer.from(await gerarPdfDoPainel(painel)), {
      headers: {
        'content-type': 'application/pdf',
        // `inline`: a coordenação confere na tela antes de imprimir, e o
        // navegador ainda oferece o botão de salvar.
        'content-disposition': `inline; filename="${nome}"`,
        'cache-control': 'no-store',
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

/** `null` para entrada inválida — nunca um formato por omissão. */
function lerFormato(bruto: string | null): FormatoDeExportacao | null {
  if (bruto === 'csv' || bruto === 'pdf') return bruto
  return null
}

/**
 * O período. Ausente vale o mês, que é o padrão da tela; presente e
 * inválido é 400, e não o mês em silêncio — quem digitou
 * `?periodo=SEMANA` pediu algo que não existe e tem de saber.
 */
function lerPeriodo(bruto: string | null): ChaveDePeriodo | null {
  if (bruto === null || bruto === '') return 'MES'
  return ehChaveDePeriodo(bruto) ? bruto : null
}
