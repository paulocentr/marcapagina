import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type { RepositorioDeAutores, AutorRegistrado } from '@/modules/acervo/autores.service'

export const autoresRepository: RepositorioDeAutores = {
  async buscarPorNormalizados(normalizados: string[]): Promise<AutorRegistrado[]> {
    if (normalizados.length === 0) return []

    return dbDoTenant().autor.findMany({
      where: { nomeNormalizado: { in: normalizados } },
      select: { id: true, nome: true, nomeNormalizado: true },
    })
  },

  async criarMuitos(
    novos: { nome: string; nomeNormalizado: string }[],
  ): Promise<AutorRegistrado[]> {
    // createManyAndReturn em vez de N creates: é uma ida ao banco só.
    // A extensão de tenant trata esta operação explicitamente — ela já
    // vazou uma vez por não ser tratada, e o teste de isolamento cobre.
    // O cast é o mesmo preço documentado em audit.repository.ts: o tipo
    // gerado exige escolaId, que a extensão injeta em runtime.
    return dbDoTenant().autor.createManyAndReturn({
      data: novos as unknown as Prisma.AutorCreateManyInput[],
      select: { id: true, nome: true, nomeNormalizado: true },
    })
  },
}
