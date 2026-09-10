import { dbDoTenant } from '@/core/db/tenant-extension'
import type {
  ExemplarSeparadoBruto,
  MovimentoBruto,
  RepositorioDoPainelDoBalcao,
} from '@/modules/circulacao/painel-do-balcao.service'

/**
 * Nome mostrado quando quem levou o livro é da equipe (`alunoId` nulo).
 *
 * Mesmo texto de `emprestimos.repository.ts`, de propósito: as duas telas
 * falam do mesmo empréstimo, e dois textos diferentes para a mesma
 * situação fariam parecer que são coisas diferentes.
 */
const LEITOR_DA_EQUIPE = 'Leitor da equipe'

/**
 * Campos do movimento do balcão, comuns à retirada e à devolução.
 *
 * São a MESMA linha de empréstimo lida por duas colunas de data
 * diferentes, então o SELECT é um só. Tombo, título, nome e turma vêm nos
 * joins do próprio SELECT: resolvê-los depois, por linha, seria um N+1
 * num painel que fica aberto o dia inteiro.
 */
const CAMPOS_DO_MOVIMENTO = {
  id: true,
  previstaPara: true,
  aluno: { select: { nome: true, turma: { select: { nome: true } } } },
  exemplar: { select: { tombo: true, obra: { select: { titulo: true } } } },
} as const

type LinhaDeMovimento = {
  id: string
  previstaPara: Date
  aluno: { nome: string; turma: { nome: string } | null } | null
  exemplar: { tombo: string; obra: { titulo: string } }
}

function paraMovimento(linha: LinhaDeMovimento, quando: Date): MovimentoBruto {
  return {
    emprestimoId: linha.id,
    quando,
    nomeDoLeitor: linha.aluno === null ? LEITOR_DA_EQUIPE : linha.aluno.nome,
    turma: linha.aluno?.turma?.nome ?? null,
    tituloDaObra: linha.exemplar.obra.titulo,
    tombo: linha.exemplar.tombo,
    previstaPara: linha.previstaPara,
  }
}

export const painelDoBalcaoRepository: RepositorioDoPainelDoBalcao = {
  async exemplaresSeparados(): Promise<ExemplarSeparadoBruto[]> {
    const linhas = await dbDoTenant().reserva.findMany({
      // `DISPONIVEL` é exatamente "tem exemplar guardado esperando".
      // AGUARDANDO é quem está na fila sem livro separado, e mostrá-lo
      // mandaria a operadora procurar na prateleira o que não está lá.
      // O prazo VENCIDO continua aparecendo: o livro está fisicamente na
      // prateleira até o cron devolvê-lo à estante, e sumir com ele
      // deixaria a operadora com um exemplar na mão sem explicação.
      where: {
        status: 'DISPONIVEL',
        exemplarSeparadoId: { not: null },
        retirarAte: { not: null },
      },
      // O prazo mais curto em cima — é a ordem em que a prateleira se
      // esvazia. O serviço reordena pela mesma regra; ter as duas mantém
      // a lista certa se a consulta mudar.
      orderBy: { retirarAte: 'asc' },
      select: {
        id: true,
        retirarAte: true,
        exemplarSeparadoId: true,
        aluno: { select: { nome: true, turma: { select: { nome: true } } } },
        exemplar: {
          select: {
            tombo: true,
            obra: { select: { titulo: true } },
            localizacao: { select: { nome: true } },
          },
        },
      },
    })

    return linhas.map((linha) => {
      // O WHERE acima já exige os dois preenchidos; o Prisma apenas não
      // consegue estreitar o tipo. Se ainda assim vier nulo, a invariante
      // de `separarExemplar` — que grava status, exemplar e prazo na
      // MESMA escrita — quebrou, e falhar alto é melhor que esconder uma
      // linha da prateleira que a operadora usa para achar o livro.
      if (linha.exemplar === null || linha.retirarAte === null) {
        throw new Error(
          `Reserva ${linha.id} está DISPONIVEL sem exemplar separado ou sem prazo de retirada.`,
        )
      }

      return {
        reservaId: linha.id,
        exemplarId: linha.exemplarSeparadoId as string,
        tombo: linha.exemplar.tombo,
        tituloDaObra: linha.exemplar.obra.titulo,
        nomeDoLeitor: linha.aluno.nome,
        turma: linha.aluno.turma?.nome ?? null,
        localizacao: linha.exemplar.localizacao?.nome ?? null,
        retirarAte: linha.retirarAte,
      }
    })
  },

  async retiradasEntre(inicio: Date, fim: Date): Promise<MovimentoBruto[]> {
    const linhas = await dbDoTenant().emprestimo.findMany({
      // `gte` no começo e `lt` no fim: a janela é meia-aberta, então a
      // meia-noite pertence a um dia só. `lte` contaria o primeiro
      // atendimento de amanhã duas vezes.
      where: { retiradaEm: { gte: inicio, lt: fim } },
      orderBy: { retiradaEm: 'desc' },
      select: { ...CAMPOS_DO_MOVIMENTO, retiradaEm: true },
    })

    return linhas.map((linha) => paraMovimento(linha, linha.retiradaEm))
  },

  async devolucoesEntre(inicio: Date, fim: Date): Promise<MovimentoBruto[]> {
    const linhas = await dbDoTenant().emprestimo.findMany({
      // Pela hora em que VOLTOU. Filtrar por `retiradaEm` faria a
      // devolução de um livro emprestado no mês passado desaparecer do
      // painel do dia em que ele efetivamente voltou.
      where: { devolvidaEm: { gte: inicio, lt: fim } },
      orderBy: { devolvidaEm: 'desc' },
      select: { ...CAMPOS_DO_MOVIMENTO, devolvidaEm: true },
    })

    return linhas.map((linha) => {
      if (linha.devolvidaEm === null) {
        // Inalcançável: o WHERE compara a coluna com um intervalo, o que
        // já exclui nulo. Existe para o tipo não precisar de `!`.
        throw new Error(`Empréstimo ${linha.id} entrou na lista de devoluções sem data.`)
      }
      return paraMovimento(linha, linha.devolvidaEm)
    })
  },
}
