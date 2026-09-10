import { prisma } from '@/core/db/client'
import { BloqueadoPorTentativasError } from '@/core/errors'

export type Reino = 'STAFF' | 'ALUNO'

const LIMITE_POR_IDENTIFICADOR = 5
const LIMITE_POR_IP = 30
const JANELA_MINUTOS = 15

// Espera progressiva: 1min, 5min, 15min, 60min. A cada bloco de
// LIMITE_POR_IDENTIFICADOR falhas sobe um degrau. Isso torna a força
// bruta cara sem punir demais quem errou a senha duas vezes.
const DEGRAUS_SEGUNDOS = [60, 300, 900, 3600] as const

export async function verificarBloqueio(p: {
  identificador: string
  reino: Reino
  ip: string
}): Promise<void> {
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000)

  const [falhasDoIdentificador, falhasDoIp] = await Promise.all([
    prisma.tentativaLogin.count({
      where: { identificador: p.identificador, reino: p.reino, sucesso: false, ocorridaEm: { gte: desde } },
    }),
    prisma.tentativaLogin.count({
      where: { ip: p.ip, sucesso: false, ocorridaEm: { gte: desde } },
    }),
  ])

  if (falhasDoIp >= LIMITE_POR_IP) {
    throw new BloqueadoPorTentativasError(DEGRAUS_SEGUNDOS[DEGRAUS_SEGUNDOS.length - 1]!)
  }

  if (falhasDoIdentificador >= LIMITE_POR_IDENTIFICADOR) {
    const degrau = Math.min(
      Math.floor(falhasDoIdentificador / LIMITE_POR_IDENTIFICADOR) - 1,
      DEGRAUS_SEGUNDOS.length - 1,
    )
    throw new BloqueadoPorTentativasError(DEGRAUS_SEGUNDOS[degrau]!)
  }
}

export async function registrarTentativa(p: {
  identificador: string
  reino: Reino
  ip: string
  sucesso: boolean
  escolaId?: string
}): Promise<void> {
  if (p.sucesso) {
    // Entrar com sucesso limpa o histórico daquele identificador: quem
    // provou ser quem diz não deve continuar contando falhas antigas.
    await prisma.tentativaLogin.deleteMany({
      where: { identificador: p.identificador, reino: p.reino, sucesso: false },
    })
  }

  await prisma.tentativaLogin.create({
    data: {
      identificador: p.identificador,
      reino: p.reino,
      ip: p.ip,
      sucesso: p.sucesso,
      escolaId: p.escolaId ?? null,
    },
  })
}
