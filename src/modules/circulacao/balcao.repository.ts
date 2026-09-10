import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type {
  RepositorioDoBalcao,
  LeitorDoBalcao,
  ExemplarDoBalcao,
  EmprestimoCriado,
} from '@/modules/circulacao/emprestar.service'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'
import type { SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'
import { emprestimosRepository } from '@/modules/circulacao/emprestimos.repository'

/**
 * Padrão de circulação, usado enquanto a coordenação não configurou nada.
 *
 * Existe para que a biblioteca funcione no primeiro dia, antes de alguém
 * abrir a tela de configuração. Os números são conservadores de
 * propósito: errar para menos atrapalha um aluno, errar para mais some
 * com o acervo.
 */
const PADRAO: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 2,
  maximoDeRenovacoes: 1,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

export const balcaoRepository: RepositorioDoBalcao = {
  async obterLeitor(alunoId: string): Promise<LeitorDoBalcao | null> {
    const aluno = await dbDoTenant().aluno.findFirst({
      where: { id: alunoId },
      select: {
        id: true,
        nome: true,
        ativo: true,
        turma: { select: { serie: true } },
        // A suspensão que interessa é a que ainda não terminou. Trazer o
        // histórico inteiro para achar a vigente seria N linhas para
        // responder uma pergunta de sim ou não.
        penalidades: {
          where: { fim: { gte: hojeEmUtc() } },
          orderBy: { fim: 'desc' },
          take: 1,
          select: { fim: true },
        },
      },
    })

    if (!aluno) return null

    return {
      id: aluno.id,
      nome: aluno.nome,
      ativo: aluno.ativo,
      serie: aluno.turma?.serie ?? null,
      suspensaoAte: aluno.penalidades[0]?.fim ?? null,
    }
  },

  async obterExemplarPorTombo(tombo: string): Promise<ExemplarDoBalcao | null> {
    const exemplar = await dbDoTenant().exemplar.findFirst({
      where: { tombo },
      select: { id: true, tombo: true, obraId: true, situacao: true },
    })

    return exemplar ? { ...exemplar, situacao: exemplar.situacao as SituacaoDoExemplar } : null
  },

  async configuracaoDaEscola(): Promise<ConfiguracaoDaEscola> {
    const config = await dbDoTenant().configuracaoDeCirculacao.findFirst({
      select: {
        prazoEmDias: true,
        limiteSimultaneo: true,
        maximoDeRenovacoes: true,
        diasDeSuspensaoPorDiaDeAtraso: true,
        prazoDeRetiradaEmDias: true,
        alunoPodeReservar: true,
      },
    })

    return config ?? PADRAO
  },

  async overridesPorSerie(): Promise<OverrideDeSerie[]> {
    return dbDoTenant().configuracaoPorSerie.findMany({
      select: {
        serie: true,
        prazoEmDias: true,
        limiteSimultaneo: true,
        maximoDeRenovacoes: true,
        diasDeSuspensaoPorDiaDeAtraso: true,
        prazoDeRetiradaEmDias: true,
        alunoPodeReservar: true,
      },
    }) as unknown as Promise<OverrideDeSerie[]>
  },

  async diasNaoLetivos(): Promise<Set<string>> {
    // O calendário inteiro da escola cabe folgadamente em memória —
    // são algumas dezenas de datas por ano — e uma consulta por dia
    // candidato transformaria o cálculo do prazo num N+1 dentro de um
    // laço que já empurra data.
    const dias = await dbDoTenant().diaNaoLetivo.findMany({ select: { data: true } })
    return new Set(dias.map((d) => d.data.toISOString().slice(0, 10)))
  },

  contarAtivosDoAluno(alunoId: string): Promise<number> {
    return emprestimosRepository.contarAtivosDoAluno(alunoId)
  },

  contarAtrasadosDoAluno(alunoId: string, hoje: Date): Promise<number> {
    return emprestimosRepository.contarAtrasadosDoAluno(alunoId, hoje)
  },

  async reservaQueSeparou(exemplarId: string): Promise<{ id: string; alunoId: string } | null> {
    return dbDoTenant().reserva.findFirst({
      where: { exemplarSeparadoId: exemplarId, status: 'DISPONIVEL' },
      select: { id: true, alunoId: true },
    })
  },

  async atenderReserva(reservaId: string): Promise<void> {
    await dbDoTenant().reserva.updateMany({
      where: { id: reservaId },
      data: { status: 'ATENDIDA', exemplarSeparadoId: null, retirarAte: null },
    })
  },

  async gravarEmprestimo(dados: {
    exemplarId: string
    alunoId: string
    previstaPara: Date
    operadorRetiradaId: string
    liberacaoForcada: boolean
    justificativaDaLiberacao: string | null
  }): Promise<EmprestimoCriado> {
    // Cast pelo mesmo motivo documentado em audit.repository.ts: o tipo
    // gerado exige escolaId, que a extensão de tenant injeta em runtime.
    const criado = await dbDoTenant().emprestimo.create({
      data: dados as unknown as Prisma.EmprestimoCreateInput,
      select: {
        id: true,
        exemplarId: true,
        alunoId: true,
        previstaPara: true,
        liberacaoForcada: true,
      },
    })

    return {
      id: criado.id,
      exemplarId: criado.exemplarId,
      alunoId: criado.alunoId ?? dados.alunoId,
      previstaPara: criado.previstaPara,
      liberacaoForcada: criado.liberacaoForcada,
    }
  },

  async marcarExemplar(exemplarId: string, situacao: SituacaoDoExemplar): Promise<void> {
    await dbDoTenant().exemplar.updateMany({
      where: { id: exemplarId },
      data: { situacao },
    })
  },
}

function hojeEmUtc(): Date {
  const agora = new Date()
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))
}
