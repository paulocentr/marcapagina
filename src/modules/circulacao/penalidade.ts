import { ErroDeDominio } from '@/core/errors'

export interface SuspensaoCalculada {
  dias: number
  motivo: string
  /** Verdadeiro quando o teto cortou o resultado. A tela pode avisar. */
  limitadaPeloTeto: boolean
}

/**
 * Teto da suspensão.
 *
 * 200 dias de esquecimento não podem virar três anos: a pena deixaria de
 * ser corretiva e a coordenação simplesmente a ignoraria — junto com o
 * resto do sistema, que é o risco real.
 */
export const TETO_DE_DIAS_DE_SUSPENSAO = 60

export class PenalidadeInvalidaError extends ErroDeDominio {
  constructor(mensagem: string) {
    super(mensagem, 'PENALIDADE_INVALIDA')
  }
}

/**
 * Dias de atraso entre o previsto e o devolvido.
 *
 * Devolver NO DIA previsto não é atraso. Errar esta fronteira suspende
 * quem cumpriu o prazo, e a regra perde legitimidade na primeira
 * reclamação de um responsável.
 */
export function diasDeAtraso(previstaPara: Date, devolvidaEm: Date): number {
  const previsto = diaEmUtc(previstaPara)
  const devolvido = diaEmUtc(devolvidaEm)

  if (devolvido <= previsto) return 0

  const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000
  return Math.round((devolvido - previsto) / MILISSEGUNDOS_POR_DIA)
}

/**
 * A suspensão por um atraso, ou `null` quando não há o que aplicar.
 *
 * Dias corridos, incluindo fim de semana: a penalidade é pelo tempo em
 * que o livro ficou fora da estante, e o livro não volta sozinho no
 * sábado.
 */
export function calcularSuspensao(
  diasEmAtraso: number,
  diasDeSuspensaoPorDiaDeAtraso: number,
): SuspensaoCalculada | null {
  if (!Number.isInteger(diasEmAtraso) || diasEmAtraso < 0) {
    throw new PenalidadeInvalidaError('Dias de atraso precisam ser um inteiro não negativo.')
  }
  if (!Number.isInteger(diasDeSuspensaoPorDiaDeAtraso) || diasDeSuspensaoPorDiaDeAtraso < 0) {
    throw new PenalidadeInvalidaError('O fator de suspensão precisa ser um inteiro não negativo.')
  }

  if (diasEmAtraso === 0) return null
  // Fator zero é como a escola desliga a penalidade sem desligar o
  // controle: o atraso continua registrado, só não gera suspensão.
  if (diasDeSuspensaoPorDiaDeAtraso === 0) return null

  const bruto = diasEmAtraso * diasDeSuspensaoPorDiaDeAtraso
  const dias = Math.min(bruto, TETO_DE_DIAS_DE_SUSPENSAO)

  return {
    dias,
    // O motivo é o que permite explicar a suspensão ao responsável meses
    // depois. Sem ele, vira castigo sem história.
    motivo:
      `Devolução com ${diasEmAtraso} dia(s) de atraso ` +
      `(${diasDeSuspensaoPorDiaDeAtraso} dia(s) de suspensão por dia).`,
    limitadaPeloTeto: bruto > TETO_DE_DIAS_DE_SUSPENSAO,
  }
}

function diaEmUtc(data: Date): number {
  return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate())
}
