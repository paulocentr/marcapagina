import { dbDoTenant } from '@/core/db/tenant-extension'
import { balcaoRepository } from '@/modules/circulacao/balcao.repository'
import { emprestimosRepository } from '@/modules/circulacao/emprestimos.repository'
import type {
  RepositorioDeConsultaDoBalcao,
  LeitorParaBalcao,
} from '@/modules/circulacao/balcao.service'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'

export const consultaDoBalcaoRepository: RepositorioDeConsultaDoBalcao = {
  async obterPorMatricula(matricula: string): Promise<LeitorParaBalcao | null> {
    const aluno = await dbDoTenant().aluno.findFirst({
      where: { matricula },
      select: {
        id: true,
        nome: true,
        matricula: true,
        ativo: true,
        turma: { select: { nome: true, serie: true } },
        // Só a suspensão que ainda não terminou. Trazer o histórico
        // inteiro para achar a vigente seria N linhas para responder uma
        // pergunta de sim ou não.
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
      matricula: aluno.matricula,
      turma: aluno.turma?.nome ?? null,
      serie: aluno.turma?.serie ?? null,
      ativo: aluno.ativo,
      suspensaoAte: aluno.penalidades[0]?.fim ?? null,
    }
  },

  // Delegam ao repositório do balcão em vez de repetir as consultas: duas
  // cópias divergem na primeira correção feita em apenas uma delas.
  configuracaoDaEscola(): Promise<ConfiguracaoDaEscola> {
    return balcaoRepository.configuracaoDaEscola()
  },

  overridesPorSerie(): Promise<OverrideDeSerie[]> {
    return balcaoRepository.overridesPorSerie()
  },

  contarAtivosDoAluno(alunoId: string): Promise<number> {
    return emprestimosRepository.contarAtivosDoAluno(alunoId)
  },

  contarAtrasadosDoAluno(alunoId: string, hoje: Date): Promise<number> {
    return emprestimosRepository.contarAtrasadosDoAluno(alunoId, hoje)
  },
}

function hojeEmUtc(): Date {
  const agora = new Date()
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))
}
