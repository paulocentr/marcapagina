import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type { RepositorioDeConfiguracao } from '@/modules/circulacao/configuracao.service'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'

const CAMPOS: Prisma.ConfiguracaoDeCirculacaoSelect = {
  prazoEmDias: true,
  limiteSimultaneo: true,
  maximoDeRenovacoes: true,
  diasDeSuspensaoPorDiaDeAtraso: true,
  prazoDeRetiradaEmDias: true,
  alunoPodeReservar: true,
}

export const configuracaoRepository: RepositorioDeConfiguracao = {
  async obterDaEscola(): Promise<ConfiguracaoDaEscola | null> {
    return dbDoTenant().configuracaoDeCirculacao.findFirst({
      select: CAMPOS,
    }) as unknown as Promise<ConfiguracaoDaEscola | null>
  },

  async gravarDaEscola(config: ConfiguracaoDaEscola): Promise<void> {
    // A configuração é UMA por escola. `updateMany` seguido de `create`
    // quando não existe, em vez de upsert: o upsert precisa de um campo
    // único no where, e aqui a chave natural é o próprio tenant — que a
    // extensão injeta, e não aparece na assinatura.
    const { count } = await dbDoTenant().configuracaoDeCirculacao.updateMany({
      where: {},
      data: config,
    })
    if (count > 0) return

    await dbDoTenant().configuracaoDeCirculacao.create({
      data: config as unknown as Prisma.ConfiguracaoDeCirculacaoCreateInput,
    })
  },

  async listarOverrides(): Promise<OverrideDeSerie[]> {
    const linhas = await dbDoTenant().configuracaoPorSerie.findMany({
      select: { serie: true, ...CAMPOS },
      orderBy: { serie: 'asc' },
    })

    // Campo nulo no banco significa "herda"; o domínio fala `undefined`.
    // Deixar o `null` passar faria `?? ` na resolução tratar herança como
    // valor definido em alguns pontos e não em outros.
    return linhas.map((linha) => {
      const override: OverrideDeSerie = { serie: linha.serie }
      for (const [chave, valor] of Object.entries(linha)) {
        if (chave !== 'serie' && valor !== null) {
          Object.assign(override, { [chave]: valor })
        }
      }
      return override
    })
  },

  async gravarOverride(override: OverrideDeSerie): Promise<void> {
    const { serie, ...campos } = override

    const { count } = await dbDoTenant().configuracaoPorSerie.updateMany({
      where: { serie },
      data: campos,
    })
    if (count > 0) return

    await dbDoTenant().configuracaoPorSerie.create({
      data: override as unknown as Prisma.ConfiguracaoPorSerieCreateInput,
    })
  },

  async removerOverride(serie: string): Promise<void> {
    await dbDoTenant().configuracaoPorSerie.deleteMany({ where: { serie } })
  },
}
