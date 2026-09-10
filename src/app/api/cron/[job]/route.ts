import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { expirarReservasDeTodasAsEscolas } from '@/modules/circulacao/expiracao.job'

export const runtime = 'nodejs'

// Cron portátil (spec §2.4): um endpoint HTTP protegido por segredo, não
// uma API proprietária da Vercel. O Vercel Cron aciona hoje; amanhã pode
// ser cron do sistema, GitHub Actions ou qualquer agendador, sem tocar
// no código.
const JOBS_CONHECIDOS = new Set(['backup-semanal', 'expirar-reservas'])

// Comparar segredo com === vaza, pelo tempo de resposta, quantos bytes
// iniciais o palpite acertou. Aqui a diferença é pequena, mas o custo de
// fazer certo também é.
function segredoConfere(enviado: string | null, esperado: string): boolean {
  if (!enviado) return false
  const a = Buffer.from(enviado)
  const b = Buffer.from(`Bearer ${esperado}`)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function acionar(request: NextRequest, contexto: { params: Promise<{ job: string }> }) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) {
    return NextResponse.json({ erro: 'CRON_SECRET não configurado.' }, { status: 500 })
  }

  if (!segredoConfere(request.headers.get('authorization'), segredo)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }

  const { job } = await contexto.params
  if (!JOBS_CONHECIDOS.has(job)) {
    return NextResponse.json({ erro: `Job desconhecido: ${job}` }, { status: 404 })
  }

  const executadoEm = new Date()

  if (job === 'expirar-reservas') {
    const relatorio = await expirarReservasDeTodasAsEscolas(executadoEm)

    for (const falha of relatorio.falhas) {
      console.error('[cron expirar-reservas] falha', falha)
    }

    // Falhou em alguma escola → 5xx. O agendador (Vercel Cron, GitHub
    // Actions, cron do sistema) só sabe reclamar de resposta não-2xx:
    // devolver 200 com a falha escondida no corpo faria a expiração
    // parar de funcionar sem ninguém ficar sabendo. O corpo vai junto
    // porque as escolas que deram certo deram certo de verdade — não há
    // nada a refazer nelas.
    return NextResponse.json(
      { job, executadoEm: executadoEm.toISOString(), ...relatorio },
      { status: relatorio.falhas.length > 0 ? 500 : 200 },
    )
  }

  // `backup-semanal` ainda é só o contrato de acionamento: a rotina de
  // backup em si é operação de infraestrutura, fora deste plano.
  return NextResponse.json({ job, executadoEm: executadoEm.toISOString() })
}

// Dois verbos para o mesmo acionamento: o Vercel Cron dispara GET, e um
// agendador externo (cron do sistema, GitHub Actions) normalmente usa
// POST. Aceitar os dois é o que mantém o cron trocável sem editar código
// — que é o ponto da spec §2.4. A autorização é a mesma nos dois.
export const GET = acionar
export const POST = acionar
