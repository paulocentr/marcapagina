import { dbDoTenant } from '@/core/db/tenant-extension'
import { balcaoRepository } from '@/modules/circulacao/balcao.repository'
import type {
  RepositorioDeConsultaDoBalcao,
  LeitorParaBalcao,
  LivroEmMaos,
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

  diasNaoLetivos(): Promise<Set<string>> {
    return balcaoRepository.diasNaoLetivos()
  },

  /**
   * Os livros que o leitor está com ele, numa consulta só.
   *
   * Tombo e título vêm no mesmo SELECT, atravessando exemplar → obra.
   * Resolvê-los depois, por livro, seria um N+1 numa tela que a
   * operadora abre dezenas de vezes por dia — e o leitor com três livros
   * custaria sete idas ao banco em vez de uma.
   *
   * Não devolve NENHUM campo chamado "atrasado". Devolve `previstaPara`,
   * que é o fato; a decisão é do serviço (Global Constraint 16). O filtro
   * `devolvidaEm: null` é o que faz "em mãos" significar em mãos.
   */
  async livrosEmMaos(alunoId: string): Promise<LivroEmMaos[]> {
    const linhas = await dbDoTenant().emprestimo.findMany({
      where: { alunoId, devolvidaEm: null },
      // Do vencimento mais próximo para o mais distante: a operadora lê a
      // trilha de cima para baixo, e o que já venceu tem de estar em cima.
      orderBy: { previstaPara: 'asc' },
      select: {
        id: true,
        exemplarId: true,
        previstaPara: true,
        renovacoes: true,
        exemplar: { select: { tombo: true, obra: { select: { titulo: true } } } },
      },
    })

    return linhas.map((linha) => ({
      emprestimoId: linha.id,
      exemplarId: linha.exemplarId,
      tombo: linha.exemplar.tombo,
      tituloDaObra: linha.exemplar.obra.titulo,
      previstaPara: linha.previstaPara,
      renovacoes: linha.renovacoes,
    }))
  },
}

function hojeEmUtc(): Date {
  const agora = new Date()
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))
}
