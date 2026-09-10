import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type {
  RepositorioDeReservas,
  ReservaNaFila,
  StatusDaReserva,
} from '@/modules/circulacao/reservas.tipos'

const CAMPOS = {
  id: true,
  obraId: true,
  alunoId: true,
  posicao: true,
  status: true,
  exemplarSeparadoId: true,
  retirarAte: true,
} as const

type Linha = {
  id: string
  obraId: string
  alunoId: string
  posicao: number
  status: string
  exemplarSeparadoId: string | null
  retirarAte: Date | null
}

function paraFila(linha: Linha): ReservaNaFila {
  return { ...linha, status: linha.status as StatusDaReserva }
}

// Ordem de chegada, com desempate por data de criação. A posição é lida e
// gravada em transações diferentes, então duas reservas simultâneas de
// alunos diferentes ainda podem nascer com a MESMA posição — e aí o
// `orderBy` por posição sozinho devolveria a fila em ordem arbitrária,
// diferente a cada consulta. O desempate torna a fila estável mesmo
// quando o empate acontece.
function ordemDaFila(): Prisma.ReservaOrderByWithRelationInput[] {
  return [{ posicao: 'asc' }, { criadaEm: 'asc' }]
}

export const reservasRepository: RepositorioDeReservas = {
  async proximaDaFila(obraId: string): Promise<ReservaNaFila | null> {
    const linha = (await dbDoTenant().reserva.findFirst({
      where: { obraId, status: 'AGUARDANDO' },
      // Ordem de chegada. Sem o `posicao asc` a fila viraria loteria e a
      // promessa de "quem esperou mais leva primeiro" deixaria de valer.
      orderBy: ordemDaFila(),
      select: CAMPOS,
    })) as Linha | null

    return linha ? paraFila(linha) : null
  },

  async contarAguardando(obraId: string): Promise<number> {
    return dbDoTenant().reserva.count({ where: { obraId, status: 'AGUARDANDO' } })
  },

  async reservaVivaDoAluno(obraId: string, alunoId: string): Promise<ReservaNaFila | null> {
    // Viva = ainda espera ou já foi separada. Atendida e expirada não
    // contam: o aluno pode querer o mesmo livro outra vez meses depois.
    const linha = (await dbDoTenant().reserva.findFirst({
      where: { obraId, alunoId, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } },
      select: CAMPOS,
    })) as Linha | null

    return linha ? paraFila(linha) : null
  },

  async ultimaPosicao(obraId: string): Promise<number> {
    const agregado = await dbDoTenant().reserva.aggregate({
      where: { obraId, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } },
      _max: { posicao: true },
    })

    // Sem ninguém na fila, a última posição é 0 e a próxima será 1. O
    // `?? 0` aqui é explícito e correto: o agregado de conjunto vazio é
    // nulo por definição, não por dado faltando.
    return agregado._max.posicao ?? 0
  },

  async criar(dados: {
    obraId: string
    alunoId: string
    posicao: number
  }): Promise<ReservaNaFila> {
    // Cast pelo mesmo motivo documentado em audit.repository.ts: o tipo
    // gerado exige escolaId, que a extensão de tenant injeta em runtime.
    const linha = (await dbDoTenant().reserva.create({
      data: dados as unknown as Prisma.ReservaCreateInput,
      select: CAMPOS,
    })) as Linha

    return paraFila(linha)
  },

  async separarExemplar(reservaId: string, exemplarId: string, retirarAte: Date): Promise<void> {
    await dbDoTenant().reserva.updateMany({
      where: { id: reservaId },
      data: { status: 'DISPONIVEL', exemplarSeparadoId: exemplarId, retirarAte },
    })
  },

  async listarComRetiradaVencida(hoje: Date): Promise<ReservaNaFila[]> {
    const linhas = (await dbDoTenant().reserva.findMany({
      // `lt`, não `lte`: quem tem até HOJE para retirar ainda tem o dia
      // inteiro. Expirar na manhã do último dia tira a vez de quem ainda
      // ia buscar depois da aula.
      where: { status: 'DISPONIVEL', retirarAte: { lt: meiaNoiteUtc(hoje) } },
      orderBy: { retirarAte: 'asc' },
      select: CAMPOS,
    })) as Linha[]

    return linhas.map(paraFila)
  },

  async mudarStatus(reservaId: string, status: StatusDaReserva): Promise<void> {
    await dbDoTenant().reserva.updateMany({
      where: { id: reservaId },
      data:
        status === 'AGUARDANDO'
          ? // Voltar para a fila devolve o exemplar: ele foi separado
            // para esta reserva e agora precisa seguir para outra.
            { status, exemplarSeparadoId: null, retirarAte: null }
          : { status },
    })
  },

  async obter(reservaId: string): Promise<ReservaNaFila | null> {
    const linha = (await dbDoTenant().reserva.findFirst({
      where: { id: reservaId },
      select: CAMPOS,
    })) as Linha | null

    return linha ? paraFila(linha) : null
  },

  async listarFila(obraId: string): Promise<ReservaNaFila[]> {
    const linhas = (await dbDoTenant().reserva.findMany({
      // Viva = espera ou já tem exemplar separado. A atendida saiu da
      // fila com o livro na mão e mostrá-la faria a tela contar gente que
      // não está mais esperando.
      where: { obraId, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } },
      orderBy: ordemDaFila(),
      select: CAMPOS,
    })) as Linha[]

    return linhas.map(paraFila)
  },
}

function meiaNoiteUtc(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()))
}
