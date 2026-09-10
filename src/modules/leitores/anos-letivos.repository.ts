import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type {
  AnoLetivoRegistrado,
  DadosDeAnoLetivoParaGravar,
  RepositorioDeAnosLetivos,
} from '@/modules/leitores/anos-letivos.service'

const CAMPOS = {
  id: true,
  ano: true,
  dataInicio: true,
  dataFim: true,
  ativo: true,
} as const

export const anosLetivosRepository: RepositorioDeAnosLetivos = {
  async listar(): Promise<AnoLetivoRegistrado[]> {
    // Do mais novo para o mais velho: a coordenação trabalha no ano
    // corrente, e ele tem de estar na primeira linha da tela.
    return dbDoTenant().anoLetivo.findMany({ select: CAMPOS, orderBy: { ano: 'desc' } })
  },

  async obter(id: string): Promise<AnoLetivoRegistrado | null> {
    return dbDoTenant().anoLetivo.findFirst({ where: { id }, select: CAMPOS })
  },

  async obterPorAno(ano: number): Promise<AnoLetivoRegistrado | null> {
    return dbDoTenant().anoLetivo.findFirst({ where: { ano }, select: CAMPOS })
  },

  async criar(dados: DadosDeAnoLetivoParaGravar): Promise<AnoLetivoRegistrado> {
    // Cast pelo mesmo motivo documentado nos outros repositórios: o tipo
    // gerado exige escolaId, que a extensão de tenant injeta em runtime.
    return dbDoTenant().anoLetivo.create({
      data: dados as unknown as Prisma.AnoLetivoCreateInput,
      select: CAMPOS,
    })
  },

  /**
   * Zera o ativo de todos os anos DESTA escola.
   *
   * O `where` vem vazio de propósito e é a extensão de tenant que
   * acrescenta o `escolaId` — é ela, e só ela, que impede este
   * `updateMany` de apagar o ano ativo de TODAS as escolas do sistema.
   * (`AnoLetivo` está declarado em `MODELOS_ESCOPADOS_POR_TENANT`, e há
   * teste no CI que reprova a omissão.) Há também um teste de integração
   * que confere o ano da escola vizinha depois desta chamada.
   */
  async desativarTodos(): Promise<void> {
    await dbDoTenant().anoLetivo.updateMany({ where: {}, data: { ativo: false } })
  },

  async definirAtivo(id: string): Promise<AnoLetivoRegistrado | null> {
    // updateMany e não update: a extensão converte um no outro de
    // qualquer forma, e assim um id de outra escola simplesmente não casa
    // em vez de estourar. O count é o que diz se achou.
    const { count } = await dbDoTenant().anoLetivo.updateMany({
      where: { id },
      data: { ativo: true },
    })
    if (count === 0) return null

    return dbDoTenant().anoLetivo.findFirst({ where: { id }, select: CAMPOS })
  },
}
