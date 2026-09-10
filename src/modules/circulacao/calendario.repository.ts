import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type { RepositorioDoCalendario } from '@/modules/circulacao/calendario.service'

export const calendarioRepository: RepositorioDoCalendario = {
  async listar(): Promise<Set<string>> {
    // O calendário inteiro de uma escola são algumas dezenas de datas por
    // ano e cabe folgadamente em memória. Consultar por dia candidato
    // faria um N+1 dentro do laço que empurra a data de vencimento.
    const dias = await dbDoTenant().diaNaoLetivo.findMany({ select: { data: true } })
    return new Set(dias.map((d) => d.data.toISOString().slice(0, 10)))
  },

  async marcar(dataIso: string, motivo: string): Promise<void> {
    const data = new Date(`${dataIso}T00:00:00.000Z`)

    // Remarcar o mesmo dia atualiza o motivo em vez de estourar no único
    // (escolaId, data): corrigir "Feriado" para "Independência" é
    // exatamente o que a coordenação faz depois de digitar às pressas.
    const { count } = await dbDoTenant().diaNaoLetivo.updateMany({
      where: { data },
      data: { motivo },
    })
    if (count > 0) return

    await dbDoTenant().diaNaoLetivo.create({
      data: { data, motivo } as unknown as Prisma.DiaNaoLetivoCreateInput,
    })
  },

  async desmarcar(dataIso: string): Promise<void> {
    await dbDoTenant().diaNaoLetivo.deleteMany({
      where: { data: new Date(`${dataIso}T00:00:00.000Z`) },
    })
  },
}
