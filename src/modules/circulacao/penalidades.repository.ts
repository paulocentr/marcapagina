import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type { RepositorioDePenalidades } from '@/modules/circulacao/devolver.service'

export const penalidadesRepository: RepositorioDePenalidades = {
  async registrarSuspensao(dados: {
    alunoId: string
    inicio: Date
    fim: Date
    motivo: string
    emprestimoOrigemId: string
  }): Promise<{ id: string; fim: Date }> {
    // Cast pelo mesmo motivo documentado em audit.repository.ts: o tipo
    // gerado exige escolaId, que a extensão de tenant injeta em runtime.
    return dbDoTenant().penalidade.create({
      data: {
        ...dados,
        // Único tipo por enquanto, mas explícito: no dia em que existir
        // outro, o registro antigo continua dizendo o que era.
        tipo: 'SUSPENSAO',
      } as unknown as Prisma.PenalidadeCreateInput,
      select: { id: true, fim: true },
    })
  },
}
