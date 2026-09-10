import { ErroDeDominio } from '@/core/errors'

export interface ConfiguracaoDaEscola {
  prazoEmDias: number
  limiteSimultaneo: number
  maximoDeRenovacoes: number
  diasDeSuspensaoPorDiaDeAtraso: number
  prazoDeRetiradaEmDias: number
  alunoPodeReservar: boolean
}

/**
 * Override de uma série. TODO campo é opcional porque o override vale
 * campo a campo — a série pode sobrescrever só o limite e herdar o resto.
 */
export type OverrideDeSerie = Partial<ConfiguracaoDaEscola> & { serie: string }

export class ConfiguracaoInvalidaError extends ErroDeDominio {
  constructor(mensagem: string) {
    super(mensagem, 'CONFIGURACAO_INVALIDA')
  }
}

// Teto de sanidade: nada aqui é decisão pedagógica, é barreira contra
// dedo escorregado. Um prazo de 4000 dias só pode ser engano.
const MAXIMO_PRAZO_EM_DIAS = 365
const MAXIMO_LIMITE_SIMULTANEO = 100
const MAXIMO_RENOVACOES = 50

/**
 * A configuração que vale para uma série, resolvida CAMPO A CAMPO sobre a
 * da escola.
 *
 * Função pura: recebe tudo já lido e devolve a decisão. É o que permite
 * provar "o 2º ano leva 1 livro por 7 dias, o 9º leva 5 por 21" numa
 * suíte de milissegundos, em vez de um E2E por combinação.
 */
export function resolverConfiguracao(
  serie: string | null,
  daEscola: ConfiguracaoDaEscola,
  overrides: readonly OverrideDeSerie[],
): ConfiguracaoDaEscola {
  if (serie === null) return { ...daEscola }

  // O primeiro vence. O banco impede duplicata, mas se um dia entrar por
  // importação o resultado tem de ser determinístico em vez de depender
  // da ordem em que veio.
  const override = overrides.find((o) => o.serie === serie)
  if (!override) return { ...daEscola }

  return {
    // `??` e não `||`: zero renovações e `alunoPodeReservar: false` são
    // decisões legítimas da coordenação, e `||` devolveria o valor da
    // escola permitindo exatamente o que ela quis proibir.
    prazoEmDias: override.prazoEmDias ?? daEscola.prazoEmDias,
    limiteSimultaneo: override.limiteSimultaneo ?? daEscola.limiteSimultaneo,
    maximoDeRenovacoes: override.maximoDeRenovacoes ?? daEscola.maximoDeRenovacoes,
    diasDeSuspensaoPorDiaDeAtraso:
      override.diasDeSuspensaoPorDiaDeAtraso ?? daEscola.diasDeSuspensaoPorDiaDeAtraso,
    prazoDeRetiradaEmDias: override.prazoDeRetiradaEmDias ?? daEscola.prazoDeRetiradaEmDias,
    alunoPodeReservar: override.alunoPodeReservar ?? daEscola.alunoPodeReservar,
  }
}

export function validarConfiguracao(config: ConfiguracaoDaEscola): void {
  // Prazo 0 faria todo empréstimo nascer vencido.
  exigirInteiro(config.prazoEmDias, 1, MAXIMO_PRAZO_EM_DIAS, 'prazo de empréstimo em dias')
  // Limite 0 bloqueia a biblioteca inteira em silêncio: todo aluno
  // apareceria como "no limite" sem nunca ter pegado um livro.
  exigirInteiro(
    config.limiteSimultaneo,
    1,
    MAXIMO_LIMITE_SIMULTANEO,
    'limite de livros simultâneos',
  )
  // Zero renovações e zero dias de suspensão são decisões legítimas — é
  // como a escola desliga a penalidade sem desligar o controle.
  exigirInteiro(config.maximoDeRenovacoes, 0, MAXIMO_RENOVACOES, 'máximo de renovações')
  exigirInteiro(
    config.diasDeSuspensaoPorDiaDeAtraso,
    0,
    MAXIMO_PRAZO_EM_DIAS,
    'dias de suspensão por dia de atraso',
  )
  exigirInteiro(
    config.prazoDeRetiradaEmDias,
    1,
    MAXIMO_PRAZO_EM_DIAS,
    'prazo de retirada de reserva',
  )
}

function exigirInteiro(valor: number, minimo: number, maximo: number, nome: string): void {
  if (!Number.isInteger(valor)) {
    throw new ConfiguracaoInvalidaError(`O ${nome} precisa ser um número inteiro.`)
  }
  if (valor < minimo) {
    throw new ConfiguracaoInvalidaError(`O ${nome} precisa ser pelo menos ${minimo}.`)
  }
  if (valor > maximo) {
    throw new ConfiguracaoInvalidaError(`O ${nome} não pode passar de ${maximo}.`)
  }
}
