import { dbDoTenant, executarEmTransacao } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type {
  RepositorioDeInventario,
  InventarioRegistrado,
  ItemDeInventario,
  StatusDoInventario,
} from '@/modules/acervo/inventario.service'
import type { ExemplarRegistrado, SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

const CAMPOS_DO_INVENTARIO = {
  id: true,
  localizacaoId: true,
  responsavelId: true,
  responsavelNome: true,
  status: true,
} as const

const CAMPOS_DO_EXEMPLAR = {
  id: true,
  obraId: true,
  tombo: true,
  estado: true,
  situacao: true,
  localizacaoId: true,
  origem: true,
  observacao: true,
} as const

export const inventarioRepository: RepositorioDeInventario = {
  async buscarAbertoPorEscopo(localizacaoId: string | null): Promise<InventarioRegistrado | null> {
    return dbDoTenant().inventario.findFirst({
      where: { status: 'ABERTO', localizacaoId },
      select: CAMPOS_DO_INVENTARIO,
    }) as unknown as Promise<InventarioRegistrado | null>
  },

  async listarExemplaresDoEscopo(localizacaoId: string | null): Promise<ExemplarRegistrado[]> {
    return dbDoTenant().exemplar.findMany({
      // Exemplar já baixado ou extraviado não entra: ele não deveria
      // estar na estante, e cobrá-lo no relatório enterraria as perdas
      // reais numa lista de coisas que a escola já sabe que perdeu.
      where: {
        situacao: { notIn: ['BAIXADO', 'EXTRAVIADO'] },
        ...(localizacaoId === null ? {} : { localizacaoId }),
      },
      select: CAMPOS_DO_EXEMPLAR,
      orderBy: { tombo: 'asc' },
    }) as unknown as Promise<ExemplarRegistrado[]>
  },

  async abrir(
    dados: Omit<InventarioRegistrado, 'id' | 'status'>,
    doEscopo: ExemplarRegistrado[],
  ): Promise<InventarioRegistrado> {
    // O inventário e a foto do acervo nascem juntos ou não nascem: uma
    // sessão aberta sem itens pareceria uma estante vazia e fecharia com
    // "nada faltando", que é a pior mentira que este relatório pode contar.
    return executarEmTransacao(async () => {
      const db = dbDoTenant()

      const inventario = (await db.inventario.create({
        data: dados as unknown as Prisma.InventarioCreateInput,
        select: CAMPOS_DO_INVENTARIO,
      })) as unknown as InventarioRegistrado

      if (doEscopo.length > 0) {
        await db.inventarioItem.createMany({
          data: doEscopo.map((e) => ({
            inventarioId: inventario.id,
            exemplarId: e.id,
            situacaoNaAbertura: e.situacao,
          })) as unknown as Prisma.InventarioItemCreateManyInput[],
        })
      }

      return inventario
    })
  },

  async obter(inventarioId: string): Promise<InventarioRegistrado | null> {
    return dbDoTenant().inventario.findFirst({
      where: { id: inventarioId },
      select: CAMPOS_DO_INVENTARIO,
    }) as unknown as Promise<InventarioRegistrado | null>
  },

  async listarItens(inventarioId: string): Promise<ItemDeInventario[]> {
    const linhas = await dbDoTenant().inventarioItem.findMany({
      where: { inventarioId },
      select: {
        exemplarId: true,
        situacaoNaAbertura: true,
        conferido: true,
        localizacaoEncontradaId: true,
        exemplar: { select: { tombo: true, localizacaoId: true } },
      },
      orderBy: { exemplar: { tombo: 'asc' } },
    })

    return linhas.map((linha) => ({
      exemplarId: linha.exemplarId,
      tombo: linha.exemplar.tombo,
      situacaoNaAbertura: linha.situacaoNaAbertura as SituacaoDoExemplar,
      localizacaoEsperadaId: linha.exemplar.localizacaoId,
      conferido: linha.conferido,
      localizacaoEncontradaId: linha.localizacaoEncontradaId,
    }))
  },

  async buscarExemplarPorTombo(tombo: string): Promise<ExemplarRegistrado | null> {
    return dbDoTenant().exemplar.findFirst({
      where: { tombo },
      select: CAMPOS_DO_EXEMPLAR,
    }) as unknown as Promise<ExemplarRegistrado | null>
  },

  async marcarConferido(
    inventarioId: string,
    exemplarId: string,
    localizacaoEncontradaId: string | null,
  ): Promise<void> {
    // upsert porque o exemplar pode não estar na foto da abertura: é o
    // livro de outra estante que apareceu aqui, e é justamente ele que o
    // inventário existe para encontrar.
    await dbDoTenant().inventarioItem.upsert({
      where: { inventarioId_exemplarId: { inventarioId, exemplarId } },
      update: { conferido: true, conferidoEm: new Date(), localizacaoEncontradaId },
      create: {
        inventarioId,
        exemplarId,
        situacaoNaAbertura: 'DISPONIVEL',
        conferido: true,
        conferidoEm: new Date(),
        localizacaoEncontradaId,
      } as unknown as Prisma.InventarioItemCreateInput,
    })
  },

  async fechar(inventarioId: string): Promise<void> {
    await dbDoTenant().inventario.updateMany({
      where: { id: inventarioId },
      data: { status: 'FECHADO' as StatusDoInventario, fechadoEm: new Date() },
    })
  },
}
