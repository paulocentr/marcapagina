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
    if (novos.length === 0) return []

    // `skipDuplicates` porque criar autor é uma corrida perdida por
    // desenho: duas operadoras catalogando ao mesmo tempo dois livros do
    // MESMO autor — dois Ziraldos, uma tarde comum — leem que ele não
    // existe e tentam criá-lo as duas. Sem isso, a segunda estoura no
    // índice único e derruba uma catalogação inteira por causa de um
    // registro que ela nem precisava criar, só reaproveitar.
    //
    // O cast é o mesmo preço documentado em audit.repository.ts: o tipo
    // gerado exige escolaId, que a extensão injeta em runtime.
    await dbDoTenant().autor.createMany({
      data: novos as unknown as Prisma.AutorCreateManyInput[],
      skipDuplicates: true,
    })

    // Reler em vez de confiar no retorno da criação: quem perdeu a corrida
    // precisa do id de quem ganhou, e é esta consulta que o traz. Continua
    // sendo uma ida a mais, não uma por autor.
    return dbDoTenant().autor.findMany({
      where: { nomeNormalizado: { in: novos.map((n) => n.nomeNormalizado) } },
      select: { id: true, nome: true, nomeNormalizado: true },
    })
  },
}
