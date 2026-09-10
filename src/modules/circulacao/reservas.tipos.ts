import { ErroDeDominio } from '@/core/errors'

export type StatusDaReserva =
  | 'AGUARDANDO'
  | 'DISPONIVEL'
  | 'ATENDIDA'
  | 'EXPIRADA'
  | 'CANCELADA'

export interface ReservaNaFila {
  id: string
  obraId: string
  alunoId: string
  posicao: number
  status: StatusDaReserva
  exemplarSeparadoId: string | null
  retirarAte: Date | null
}

/**
 * Contrato do repositório de reservas.
 *
 * Vive num arquivo próprio, separado do serviço, porque DOIS fluxos
 * dependem dele: a reserva em si e a DEVOLUÇÃO — é ela que, ao receber o
 * livro de volta, separa o exemplar para o próximo da fila (spec §5.2).
 * Deixar o contrato dentro do serviço de reservas obrigaria a devolução a
 * importar o serviço inteiro só para enxergar um tipo.
 */
export interface RepositorioDeReservas {
  /** A próxima da fila que ainda espera. `null` quando não há fila. */
  proximaDaFila(obraId: string): Promise<ReservaNaFila | null>
  contarAguardando(obraId: string): Promise<number>
  reservaVivaDoAluno(obraId: string, alunoId: string): Promise<ReservaNaFila | null>
  ultimaPosicao(obraId: string): Promise<number>
  criar(dados: { obraId: string; alunoId: string; posicao: number }): Promise<ReservaNaFila>
  /**
   * Separa um exemplar para a reserva e liga o relógio da retirada.
   * Move a reserva de AGUARDANDO para DISPONIVEL.
   */
  separarExemplar(reservaId: string, exemplarId: string, retirarAte: Date): Promise<void>
  /** Reservas DISPONIVEL cujo prazo de retirada já passou. */
  listarComRetiradaVencida(hoje: Date): Promise<ReservaNaFila[]>
  mudarStatus(reservaId: string, status: StatusDaReserva): Promise<void>
  obter(reservaId: string): Promise<ReservaNaFila | null>
}

export interface DependenciasDeReservas {
  reservas: RepositorioDeReservas
}

export class ReservaInexistenteError extends ErroDeDominio {
  constructor() {
    super('Esta reserva não existe nesta escola.', 'RESERVA_INEXISTENTE')
  }
}

export class JaEstaNaFilaError extends ErroDeDominio {
  constructor(readonly posicao: number) {
    super(`Este leitor já está na fila desta obra, na posição ${posicao}.`, 'JA_ESTA_NA_FILA')
  }
}

export class ReservaNaoPermitidaError extends ErroDeDominio {
  constructor() {
    super(
      'A coordenação desativou a reserva por conta própria para esta série.',
      'RESERVA_NAO_PERMITIDA',
    )
  }
}
