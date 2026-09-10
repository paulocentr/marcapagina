import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type {
  RepositorioDeCategorias,
  CategoriaRegistrada,
} from '@/modules/acervo/categorias.service'

const CAMPOS = { id: true, nome: true, cor: true, parentId: true } as const

export const categoriasRepository: RepositorioDeCategorias = {
  async listar(): Promise<CategoriaRegistrada[]> {
    return dbDoTenant().categoria.findMany({ select: CAMPOS, orderBy: { nome: 'asc' } })
  },

  async obter(id: string): Promise<CategoriaRegistrada | null> {
    return dbDoTenant().categoria.findFirst({ where: { id }, select: CAMPOS })
  },

  async criar(dados: {
    nome: string
    cor?: string
    parentId?: string
  }): Promise<CategoriaRegistrada> {
    // Cast pelo mesmo motivo documentado em audit.repository.ts: o tipo
    // gerado exige escolaId, que a extensão de tenant injeta em runtime.
    return dbDoTenant().categoria.create({
      data: dados as unknown as Prisma.CategoriaCreateInput,
      select: CAMPOS,
    })
  },

  async contarObras(id: string): Promise<number> {
    return dbDoTenant().obra.count({ where: { categoriaId: id } })
  },

  async excluir(id: string): Promise<void> {
    // deleteMany e não delete: o filtro de tenant já entra pela extensão,
    // e um id de outra escola simplesmente não casa em vez de estourar.
    await dbDoTenant().categoria.deleteMany({ where: { id } })
  },
}
