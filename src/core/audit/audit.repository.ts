import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'

export interface LinhaDeAuditoria {
  autorTipo: string
  autorId: string | null
  autorNome: string
  acao: string
  entidade: string
  entidadeId: string | null
  dadosAntes: Prisma.InputJsonValue | undefined
  dadosDepois: Prisma.InputJsonValue | undefined
  ip: string | null
}

export const auditRepository = {
  async inserir(linha: LinhaDeAuditoria): Promise<void> {
    // O cast existe porque o tipo gerado pelo Prisma exige escolaId, mas
    // quem o fornece é a extensão de tenant, em runtime — o TypeScript não
    // enxerga isso. É o único ponto onde o preço da injeção automática
    // aparece, e o teste de isolamento (Tarefa 3) é o que prova que o
    // campo realmente chega. Se este cast for copiado para outro
    // repositório, mantenha o comentário junto.
    await dbDoTenant().logAuditoria.create({
      data: linha as unknown as Prisma.LogAuditoriaCreateInput,
    })
  },
}
