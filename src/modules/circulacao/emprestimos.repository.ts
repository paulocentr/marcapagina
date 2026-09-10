import { dbDoTenant } from '@/core/db/tenant-extension'
import type {
  RepositorioDeEmprestimos,
  EmprestimoAtrasado,
} from '@/modules/circulacao/emprestimos.service'

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * O filtro de "atrasado", num lugar só.
 *
 * `lt: hoje` e não `lte`: quem vence HOJE ainda tem o dia inteiro para
 * devolver. Marcar como atrasado no próprio dia do vencimento suspende
 * quem cumpriu o prazo e faz a operadora perder a confiança no relatório.
 *
 * `hoje` chega de fora em vez de sair de `new Date()` aqui dentro: é o
 * que torna a fronteira testável sem esperar o dia virar.
 */
function filtroDeAtrasado(hoje: Date) {
  return {
    devolvidaEm: null,
    previstaPara: { lt: meiaNoiteUtc(hoje) },
  }
}

export const emprestimosRepository: RepositorioDeEmprestimos = {
  async listarAtrasados(hoje: Date): Promise<EmprestimoAtrasado[]> {
    const linhas = await dbDoTenant().emprestimo.findMany({
      where: filtroDeAtrasado(hoje),
      select: {
        id: true,
        exemplarId: true,
        previstaPara: true,
        alunoId: true,
        // Tombo, título e nome: sem eles a lista é um punhado de ids que
        // ninguém consegue usar para ir atrás do livro.
        exemplar: { select: { tombo: true, obra: { select: { titulo: true } } } },
        aluno: { select: { nome: true, turma: { select: { nome: true } } } },
      },
      // Do mais antigo para o mais recente: é a ordem em que a
      // coordenação quer cobrar.
      orderBy: { previstaPara: 'asc' },
    })

    const referencia = meiaNoiteUtc(hoje).getTime()

    return linhas.map((linha) => ({
      emprestimoId: linha.id,
      exemplarId: linha.exemplarId,
      tombo: linha.exemplar.tombo,
      tituloDaObra: linha.exemplar.obra.titulo,
      leitorId: linha.alunoId ?? '',
      nomeDoLeitor: linha.aluno?.nome ?? 'Leitor da equipe',
      turma: linha.aluno?.turma?.nome ?? null,
      previstaPara: linha.previstaPara,
      diasDeAtraso: Math.round((referencia - linha.previstaPara.getTime()) / MILISSEGUNDOS_POR_DIA),
    }))
  },

  async contarAtrasadosDoAluno(alunoId: string, hoje: Date): Promise<number> {
    return dbDoTenant().emprestimo.count({
      where: { alunoId, ...filtroDeAtrasado(hoje) },
    })
  },

  async contarAtivosDoAluno(alunoId: string): Promise<number> {
    return dbDoTenant().emprestimo.count({
      where: { alunoId, devolvidaEm: null },
    })
  },
}

/** A coluna é @db.Date; comparar contra um instante com hora deixaria o
 *  vencimento de hoje cair do lado errado da fronteira. */
function meiaNoiteUtc(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()))
}
