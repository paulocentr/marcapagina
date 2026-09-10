import { describe, it, expect } from 'vitest'
import {
  calcularDataDeDevolucao,
  ehFimDeSemana,
  intervaloDoDiaDaEscola,
  CalendarioImpossivelError,
} from '@/modules/circulacao/prazo'

/** Nenhum dia é feriado, só valem os fins de semana. */
const semFeriado = () => false

// Meio-dia em São Paulo: um instante que cai sem ambiguidade NO DIA que
// o nome diz, em qualquer fuso em que a suíte rode. Meia-noite UTC seria
// o dia anterior para quem está na escola.
function data(iso: string): Date {
  return new Date(`${iso}T12:00:00-03:00`)
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

describe('ehFimDeSemana', () => {
  it('reconhece sábado e domingo', () => {
    // 2026-09-12 é sábado; 2026-09-13, domingo.
    expect(ehFimDeSemana(data('2026-09-12'))).toBe(true)
    expect(ehFimDeSemana(data('2026-09-13'))).toBe(true)
  })

  it('segunda a sexta não são fim de semana', () => {
    for (const dia of ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']) {
      expect(ehFimDeSemana(data(dia)), dia).toBe(false)
    }
  })
})

describe('calcularDataDeDevolucao', () => {
  it('soma o prazo em dias corridos', () => {
    // Quinta 2026-09-10 + 14 dias = quinta 2026-09-24.
    expect(iso(calcularDataDeDevolucao(data('2026-09-10'), 14, semFeriado))).toBe('2026-09-24')
  })

  it('empurra para o próximo dia letivo quando cai em fim de semana', () => {
    // Vencer num dia em que a escola está fechada marca como atrasado
    // quem não tinha como devolver — é o que faz a coordenação perder a
    // confiança no sistema na primeira semana (TASK-013).
    // Segunda 2026-09-07 + 5 = sábado 2026-09-12 → segunda 2026-09-14.
    expect(iso(calcularDataDeDevolucao(data('2026-09-07'), 5, semFeriado))).toBe('2026-09-14')
  })

  it('empurra quando cai em feriado', () => {
    const feriado = (d: Date) => iso(d) === '2026-09-24'

    expect(iso(calcularDataDeDevolucao(data('2026-09-10'), 14, feriado))).toBe('2026-09-25')
  })

  it('atravessa um feriadão inteiro sem parar no meio', () => {
    // Emenda: sexta feriado, sábado, domingo e segunda feriado.
    const feriadao = (d: Date) => ['2026-09-25', '2026-09-28'].includes(iso(d))

    // Quinta 2026-09-10 + 15 = sexta 25 (feriado) → sáb → dom →
    // seg 28 (feriado) → terça 29.
    expect(iso(calcularDataDeDevolucao(data('2026-09-10'), 15, feriadao))).toBe('2026-09-29')
  })

  it('prazo que já cai em dia letivo não é empurrado', () => {
    expect(iso(calcularDataDeDevolucao(data('2026-09-07'), 7, semFeriado))).toBe('2026-09-14')
  })

  it('não desloca o dia por causa de fuso', () => {
    // Retirada às 23h de sexta em São Paulo (02h UTC de sábado) não pode
    // fazer o prazo contar a partir do dia seguinte.
    const sextaTarde = new Date('2026-09-11T23:30:00-03:00')

    expect(iso(calcularDataDeDevolucao(sextaTarde, 3, semFeriado))).toBe('2026-09-14')
  })

  it('a data devolvida é sempre meia-noite UTC', () => {
    // A coluna é @db.Date; qualquer hora residual vira ruído que desloca
    // comparações de "venceu hoje?".
    const resultado = calcularDataDeDevolucao(new Date('2026-09-10T17:45:00-03:00'), 7, semFeriado)

    expect(resultado.toISOString()).toBe('2026-09-17T00:00:00.000Z')
  })

  it('recusa prazo zero ou negativo', () => {
    expect(() => calcularDataDeDevolucao(data('2026-09-10'), 0, semFeriado)).toThrow()
    expect(() => calcularDataDeDevolucao(data('2026-09-10'), -3, semFeriado)).toThrow()
  })

  it('não entra em laço infinito com calendário absurdo', () => {
    // Um ano inteiro marcado como não letivo por engano não pode travar o
    // servidor: falha alto depois de um limite.
    const tudoFechado = () => true

    expect(() => calcularDataDeDevolucao(data('2026-09-10'), 7, tudoFechado)).toThrow(
      CalendarioImpossivelError,
    )
  })

  it('o erro de calendário absurdo diz o que está errado', () => {
    const erro = (() => {
      try {
        calcularDataDeDevolucao(data('2026-09-10'), 7, () => true)
        return null
      } catch (e) {
        return e as Error
      }
    })()

    expect(erro?.message).toMatch(/calendário/i)
  })
})

describe('intervaloDoDiaDaEscola', () => {
  it('vai da meia-noite da escola à meia-noite seguinte', () => {
    // São Paulo é UTC-3: o dia 10 na escola começa às 03:00Z do dia 10 e
    // termina às 03:00Z do dia 11.
    const { inicio, fim } = intervaloDoDiaDaEscola(new Date('2026-09-10T12:00:00.000Z'))

    expect(inicio.toISOString()).toBe('2026-09-10T03:00:00.000Z')
    expect(fim.toISOString()).toBe('2026-09-11T03:00:00.000Z')
  })

  it('às 23h na escola o dia ainda é o de hoje', () => {
    // 02:00Z do dia 11 é 23:00 do dia 10 em São Paulo. Contar por dia UTC
    // faria "devolvidos hoje" zerar às 21h com a operadora ainda no
    // balcão — e ela veria o contador apagar o próprio trabalho.
    const { inicio, fim } = intervaloDoDiaDaEscola(new Date('2026-09-11T02:00:00.000Z'))

    expect(inicio.toISOString()).toBe('2026-09-10T03:00:00.000Z')
    expect(fim.toISOString()).toBe('2026-09-11T03:00:00.000Z')
  })

  it('logo depois da meia-noite da escola já é o dia seguinte', () => {
    const { inicio } = intervaloDoDiaDaEscola(new Date('2026-09-11T03:30:00.000Z'))

    expect(inicio.toISOString()).toBe('2026-09-11T03:00:00.000Z')
  })

  it('o fim é EXCLUSIVO: o instante do fim já é o dia seguinte', () => {
    const { fim } = intervaloDoDiaDaEscola(new Date('2026-09-10T12:00:00.000Z'))
    const seguinte = intervaloDoDiaDaEscola(fim)

    expect(seguinte.inicio.toISOString()).toBe(fim.toISOString())
  })

  it('a janela tem exatamente 24 horas num dia sem virada de horário', () => {
    const { inicio, fim } = intervaloDoDiaDaEscola(new Date('2026-09-10T12:00:00.000Z'))

    expect(fim.getTime() - inicio.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('não depende do fuso do processo', () => {
    // O mesmo instante, escrito de dois jeitos, tem de dar a mesma janela.
    const comOffset = intervaloDoDiaDaEscola(new Date('2026-09-10T09:00:00-03:00'))
    const emUtc = intervaloDoDiaDaEscola(new Date('2026-09-10T12:00:00.000Z'))

    expect(comOffset.inicio.toISOString()).toBe(emUtc.inicio.toISOString())
  })
})
