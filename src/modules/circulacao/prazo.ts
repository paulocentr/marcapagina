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

const FORMATADOR_DE_OFFSET = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_DA_ESCOLA,
  timeZoneName: 'longOffset',
})

/**
 * A janela de INSTANTES que forma um dia de trabalho da escola.
 *
 * `inicio` inclusivo, `fim` exclusivo. Serve para as consultas que
 * filtram por hora cheia — "atendidos hoje", "devolvidos hoje", o
 * histórico do balcão — e não por coluna `@db.Date`.
 *
 * Existe porque o dia UTC e o dia da escola são dias diferentes durante
 * três horas: às 21h em São Paulo já é o dia seguinte em UTC. Contar por
 * dia UTC zeraria o contador de devoluções do dia com a operadora ainda
 * no balcão — o contador apagaria o trabalho dela na frente dela. E
 * contar pelo fuso do PROCESSO daria respostas diferentes na máquina da
 * secretaria e no servidor da Vercel, que é o bug que ninguém reproduz.
 */
export function intervaloDoDiaDaEscola(instante: Date): { inicio: Date; fim: Date } {
  const dia = FORMATADOR_DE_DIA.format(instante)
  // Aritmética de CALENDÁRIO sobre o dia já resolvido: "o dia seguinte a
  // 30/09 é 01/10". Somar 24 horas ao instante e reformatar daria o dia
  // errado justamente no dia em que o fuso muda de deslocamento.
  const diaSeguinte = somarDias(new Date(`${dia}T00:00:00.000Z`), 1)
    .toISOString()
    .slice(0, 10)

  return {
    inicio: instanteDaMeiaNoiteNaEscola(dia),
    fim: instanteDaMeiaNoiteNaEscola(diaSeguinte),
  }
}

/** O instante exato em que a meia-noite de um dia acontece na escola. */
function instanteDaMeiaNoiteNaEscola(diaIso: string): Date {
  // O deslocamento é lido AO MEIO-DIA do dia em questão. Meio-dia nunca
  // cai dentro do salto de horário de verão, então a leitura não escolhe
  // o lado errado da hora que muda. (O Brasil não tem mais horário de
  // verão, mas o dia em que voltar não pode ser o dia em que isto quebra.)
  const meioDia = new Date(`${diaIso}T12:00:00.000Z`)
  const instante = new Date(`${diaIso}T00:00:00.000${offsetDaEscolaEm(meioDia)}`)

  if (Number.isNaN(instante.getTime())) {
    // Falhar alto: um intervalo inválido devolveria zero movimento e a
    // tela diria "nenhum atendimento hoje" num dia cheio.
    throw new Error(`Não consegui montar a meia-noite da escola para ${diaIso}.`)
  }

  return instante
}

/** O deslocamento do fuso da escola, no formato `-03:00`. */
function offsetDaEscolaEm(instante: Date): string {
  const parte = FORMATADOR_DE_OFFSET.formatToParts(instante).find(
    (p) => p.type === 'timeZoneName',
  )

  if (!parte) {
    throw new Error(`Não consegui ler o fuso ${FUSO_DA_ESCOLA} nesta plataforma.`)
  }

  // `longOffset` devolve "GMT-03:00" — e "GMT" seco quando o
  // deslocamento é zero, caso em que a string vazia não serviria.
  const offset = parte.value.replace('GMT', '')
  return offset === '' ? '+00:00' : offset
}
