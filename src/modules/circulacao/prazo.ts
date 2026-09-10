import { ErroDeDominio } from '@/core/errors'

/** Predicado de feriado/recesso. Recebe a data em meia-noite UTC. */
export type EhFeriado = (data: Date) => boolean

export class PrazoInvalidoError extends ErroDeDominio {
  constructor() {
    super('O prazo de empréstimo precisa ser de pelo menos um dia.', 'PRAZO_INVALIDO')
  }
}

export class CalendarioImpossivelError extends ErroDeDominio {
  constructor(readonly diasTentados: number) {
    super(
      `Não achei nenhum dia letivo nos ${diasTentados} dias seguintes ao vencimento. ` +
        `Verifique o calendário de dias não letivos — provavelmente há um período ` +
        `inteiro marcado por engano.`,
      'CALENDARIO_IMPOSSIVEL',
    )
  }
}

// Se depois de um ano inteiro não houver dia letivo, o calendário está
// errado — e é melhor falhar alto do que girar para sempre segurando o
// balcão com o aluno na frente.
const MAXIMO_DE_DIAS_EMPURRADOS = 366

export function ehFimDeSemana(data: Date): boolean {
  const diaDaSemana = data.getUTCDay()
  return diaDaSemana === 0 || diaDaSemana === 6
}

/**
 * A data de devolução: prazo em dias corridos, empurrado para o próximo
 * dia letivo se cair em fim de semana, feriado ou recesso.
 *
 * Dias CORRIDOS, não úteis: a coordenação pensa em "duas semanas", não em
 * "dez dias úteis". O que não pode acontecer é vencer num dia em que a
 * escola está fechada — o aluno não teria como devolver e o sistema o
 * marcaria como atrasado por culpa do calendário.
 *
 * Função pura: o calendário chega como predicado, então dá para provar o
 * feriadão inteiro sem banco.
 */
export function calcularDataDeDevolucao(
  retirada: Date,
  prazoEmDias: number,
  ehFeriado: EhFeriado,
): Date {
  if (!Number.isInteger(prazoEmDias) || prazoEmDias < 1) throw new PrazoInvalidoError()

  // Tudo em UTC, a partir da meia-noite do dia da retirada. Uma retirada
  // às 23h30 em São Paulo é 02h30 UTC do dia seguinte: contar o prazo
  // sobre o instante bruto daria um dia a mais para quem pegou o livro à
  // noite. A coluna é @db.Date, então o que importa é o DIA.
  let vencimento = meiaNoiteUtcDoDiaLocal(retirada)
  vencimento = somarDias(vencimento, prazoEmDias)

  let empurrados = 0
  while (ehFimDeSemana(vencimento) || ehFeriado(vencimento)) {
    if (empurrados >= MAXIMO_DE_DIAS_EMPURRADOS) {
      throw new CalendarioImpossivelError(MAXIMO_DE_DIAS_EMPURRADOS)
    }
    vencimento = somarDias(vencimento, 1)
    empurrados += 1
  }

  return vencimento
}

/**
 * O próximo dia letivo a partir de uma data — usado também pelo prazo de
 * retirada de reserva, que sofre do mesmo problema: vencer com a escola
 * fechada tira a vez de quem não tinha como vir buscar.
 */
export function proximoDiaLetivo(apartirDe: Date, ehFeriado: EhFeriado): Date {
  let dia = meiaNoiteUtcDoDiaLocal(apartirDe)
  let empurrados = 0

  while (ehFimDeSemana(dia) || ehFeriado(dia)) {
    if (empurrados >= MAXIMO_DE_DIAS_EMPURRADOS) {
      throw new CalendarioImpossivelError(MAXIMO_DE_DIAS_EMPURRADOS)
    }
    dia = somarDias(dia, 1)
    empurrados += 1
  }

  return dia
}

function somarDias(data: Date, dias: number): Date {
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate() + dias),
  )
}

/**
 * Fuso da escola.
 *
 * Fixo e explícito de propósito. Depender do fuso do PROCESSO daria
 * respostas diferentes na máquina da secretaria (São Paulo) e no servidor
 * (UTC na Vercel) — o mesmo empréstimo venceria em dias diferentes
 * conforme onde o código rodou, que é o tipo de bug que ninguém reproduz.
 *
 * Vira configuração por escola no dia em que existir uma escola fora
 * deste fuso; hoje não existe, e uma constante honesta é melhor que um
 * campo que ninguém preenche.
 */
const FUSO_DA_ESCOLA = 'America/Sao_Paulo'

const FORMATADOR_DE_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_DA_ESCOLA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * A meia-noite UTC do dia em que o instante cai **para quem está na
 * escola**.
 *
 * Às 23h30 de sexta em São Paulo já é sábado em UTC: contar a partir do
 * sábado daria um dia a mais para quem pegou o livro no fim da tarde.
 */
function meiaNoiteUtcDoDiaLocal(data: Date): Date {
  // en-CA formata como aaaa-mm-dd, que é exatamente o que se quer.
  return new Date(`${FORMATADOR_DE_DIA.format(data)}T00:00:00.000Z`)
}
