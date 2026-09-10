import type { ConfiguracaoDaEscola } from '@/modules/circulacao/configuracao'

export type TipoDeBloqueio = 'INATIVO' | 'SUSPENSO' | 'NO_LIMITE' | 'COM_ATRASO'

export interface Bloqueio {
  tipo: TipoDeBloqueio
  /** Escrita para a operadora ler em voz alta para o aluno. */
  mensagem: string
}

/**
 * O que se sabe do leitor no momento do balcão. Tudo já lido — a função
 * que avalia não consulta banco (Global Constraint 17).
 */
export interface EstadoDoLeitor {
  ativo: boolean
  emprestimosAtivos: number
  emprestimosEmAtraso: number
  /** Último dia da suspensão, inclusive. `null` quando não há. */
  suspensaoAte: Date | null
}

/**
 * Todos os bloqueios do leitor, de uma vez.
 *
 * ACUMULA em vez de parar no primeiro: a operadora precisa ver tudo junto.
 * Descobrir um bloqueio de cada vez, com o aluno na frente do balcão, é
 * humilhante para ele e faz a fila parar três vezes.
 *
 * A spec §5.1 manda mostrar isto ANTES de escolher o livro — achar o
 * livro e só então descobrir o bloqueio é trabalho desfeito na frente do
 * aluno.
 */
export function avaliarBloqueios(
  leitor: EstadoDoLeitor,
  config: ConfiguracaoDaEscola,
  hoje: Date,
): Bloqueio[] {
  const bloqueios: Bloqueio[] = []

  if (!leitor.ativo) {
    bloqueios.push({
      tipo: 'INATIVO',
      mensagem: 'Este leitor está desativado e não pode levar livros.',
    })
  }

  if (leitor.suspensaoAte && !passouDe(leitor.suspensaoAte, hoje)) {
    // A suspensão vale o DIA INTEIRO em que termina; liberar na manhã do
    // último dia encurta a penalidade e desmoraliza a regra.
    bloqueios.push({
      tipo: 'SUSPENSO',
      mensagem: `Leitor suspenso até ${formatarData(leitor.suspensaoAte)}.`,
    })
  }

  if (leitor.emprestimosAtivos >= config.limiteSimultaneo) {
    bloqueios.push({
      tipo: 'NO_LIMITE',
      mensagem:
        `Já está com ${leitor.emprestimosAtivos} livro(s); ` +
        `o limite para esta série é ${config.limiteSimultaneo}.`,
    })
  }

  if (leitor.emprestimosEmAtraso > 0) {
    bloqueios.push({
      tipo: 'COM_ATRASO',
      mensagem:
        leitor.emprestimosEmAtraso === 1
          ? 'Há um livro em atraso com este leitor.'
          : `Há ${leitor.emprestimosEmAtraso} livros em atraso com este leitor.`,
    })
  }

  return bloqueios
}

function passouDe(limite: Date, hoje: Date): boolean {
  return diaEmUtc(hoje) > diaEmUtc(limite)
}

function diaEmUtc(data: Date): number {
  return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate())
}

/** dd/mm/aaaa — como a escola escreve, não como o ISO escreve. */
function formatarData(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getUTCFullYear()}`
}
