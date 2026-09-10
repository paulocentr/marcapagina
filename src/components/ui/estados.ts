import type { NomeDeIcone } from '@/components/ui/icone-nomes'

/**
 * Catálogo dos estados que a interface sabe mostrar.
 *
 * Módulo puro de propósito: é o que permite ao teste de unidade provar,
 * sem renderizar nada, que nenhum estado ficou só com cor.
 */

/** Tom visual do chip. É acompanhamento da palavra, nunca a informação. */
export type TomDeChip = 'certo' | 'neutro' | 'atencao' | 'fita' | 'alerta' | 'apagado'

export interface DescricaoDeEstado {
  /** A palavra que a operadora lê. Obrigatória — cor sozinha não informa. */
  palavra: string
  /** O desenho que acompanha a palavra. Obrigatório pelo mesmo motivo. */
  icone: NomeDeIcone
  tom: TomDeChip
}

/**
 * Estado de exemplar e de leitor no mesmo catálogo, com uma união só de
 * chaves: `<Chip estado="…" />` não aceita nada que não esteja aqui, e
 * quem acrescenta um estado é obrigado pelo tipo a dar palavra e ícone.
 */
export const ESTADOS_DE_CHIP = {
  // exemplar
  DISPONIVEL: { palavra: 'Disponível', icone: 'check', tom: 'certo' },
  EMPRESTADO: { palavra: 'Emprestado', icone: 'troca', tom: 'neutro' },
  ATRASADO: { palavra: 'Atrasado', icone: 'relogio', tom: 'atencao' },
  SEPARADO_PARA_RESERVA: { palavra: 'Separado para reserva', icone: 'fita', tom: 'fita' },
  // Baixado sai da contagem de disponíveis mas fica na ficha — é história
  // do acervo, não erro a esconder (prancha do Acervo).
  BAIXADO: { palavra: 'Baixado', icone: 'xis', tom: 'apagado' },

  // leitor
  EM_DIA: { palavra: 'Em dia', icone: 'check', tom: 'certo' },
  NO_LIMITE: { palavra: 'No limite de livros', icone: 'info', tom: 'atencao' },
  LEITOR_SUSPENSO: { palavra: 'Leitor suspenso', icone: 'aviso', tom: 'alerta' },
} as const satisfies Record<string, DescricaoDeEstado>

export type EstadoDeChip = keyof typeof ESTADOS_DE_CHIP

export interface Disponibilidade {
  palavra: string
  tom: TomDeChip
}

/**
 * A frase "3 de 5 livres", derivada da contagem.
 *
 * Existe para que nenhuma tela escreva o plural à mão — e para que
 * ninguém invente um chip de disponibilidade com tom próprio. O número
 * na tela é sempre contado (princípio 03 da prancha de Fundamentos).
 */
export function descreverDisponibilidade(disponiveis: number, total: number): Disponibilidade {
  if (!Number.isInteger(disponiveis) || !Number.isInteger(total)) {
    throw new Error('Contagem impossível de exemplares: só números inteiros contam livros.')
  }
  if (disponiveis < 0 || total < 0 || disponiveis > total) {
    throw new Error(
      `Contagem impossível de exemplares: ${disponiveis} disponíveis de ${total}. ` +
        'Desenhar o número errado ensina a operadora a não confiar em nenhum.',
    )
  }

  if (total === 0) return { palavra: 'sem exemplares', tom: 'neutro' }

  const substantivo = total === 1 ? 'livre' : 'livres'
  return {
    palavra: `${disponiveis} de ${total} ${substantivo}`,
    // Sem nenhum livre o chip para de chamar atenção: verde ali seria
    // dizer "pode emprestar" para uma obra que não tem exemplar na mão.
    tom: disponiveis > 0 ? 'certo' : 'neutro',
  }
}
