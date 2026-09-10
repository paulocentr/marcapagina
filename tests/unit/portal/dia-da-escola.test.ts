import { describe, it, expect } from 'vitest'
import { diaDeHojeNaEscola } from '@/modules/portal/dia-da-escola'
import { diasDeAtraso } from '@/modules/circulacao/penalidade'

/** O dia UTC do instante devolvido — é o que as regras comparam. */
function diaUtc(data: Date): string {
  return data.toISOString().slice(0, 10)
}

describe('diaDeHojeNaEscola', () => {
  it('às 20h30 de São Paulo ainda é o mesmo dia', () => {
    expect(diaUtc(diaDeHojeNaEscola(new Date('2026-09-10T23:30:00.000Z')))).toBe('2026-09-10')
  })

  it('às 23h de São Paulo ainda é o mesmo dia, mesmo já sendo amanhã em UTC', () => {
    // 2026-09-11T02:00Z é 23h de 10/09 em São Paulo. É aqui que o portal
    // erraria: com o instante cru, um livro que vence HOJE apareceria
    // "atrasado há 1 dia" para quem abre o celular depois do jantar.
    expect(diaUtc(diaDeHojeNaEscola(new Date('2026-09-11T02:00:00.000Z')))).toBe('2026-09-10')
  })

  it('às 00h30 de São Paulo já é o dia novo', () => {
    expect(diaUtc(diaDeHojeNaEscola(new Date('2026-09-11T03:30:00.000Z')))).toBe('2026-09-11')
  })
})

describe('o dia da escola alimenta o cálculo de atraso sem um dia de erro', () => {
  // `previstaPara` sai de coluna @db.Date: meia-noite UTC.
  const VENCE_HOJE = new Date('2026-09-10T00:00:00.000Z')

  it('livro que vence hoje NÃO está atrasado às 23h da escola', () => {
    const hoje = diaDeHojeNaEscola(new Date('2026-09-11T02:00:00.000Z'))
    expect(diasDeAtraso(VENCE_HOJE, hoje)).toBe(0)
  })

  it('no dia seguinte está atrasado há um dia', () => {
    const hoje = diaDeHojeNaEscola(new Date('2026-09-11T15:00:00.000Z'))
    expect(diasDeAtraso(VENCE_HOJE, hoje)).toBe(1)
  })
})
