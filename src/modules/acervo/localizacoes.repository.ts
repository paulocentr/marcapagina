import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type {
  RepositorioDeLocalizacoes,
  LocalizacaoRegistrada,
} from '@/modules/acervo/localizacoes.service'

const CAMPOS = {
  id: true,
  nome: true,
  corredor: true,
  estante: true,
  prateleira: true,
} as const

export const localizacoesRepository: RepositorioDeLocalizacoes = {
  async listar(): Promise<LocalizacaoRegistrada[]> {
    return dbDoTenant().localizacao.findMany({ select: CAMPOS, orderBy: { nome: 'asc' } })
  },

  async criar(dados: Omit<LocalizacaoRegistrada, 'id'>): Promise<LocalizacaoRegistrada> {
    // Cast pelo mesmo motivo documentado em audit.repository.ts: o tipo
    // gerado exige escolaId, que a extensão de tenant injeta em runtime.
    return dbDoTenant().localizacao.create({
      data: dados as unknown as Prisma.LocalizacaoCreateInput,
      select: CAMPOS,
    })
  },
}
