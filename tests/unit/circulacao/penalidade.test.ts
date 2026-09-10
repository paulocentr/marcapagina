import { describe, it, expect } from 'vitest'
import {
  calcularSuspensao,
  diasDeAtraso,
  TETO_DE_DIAS_DE_SUSPENSAO,
} from '@/modules/circulacao/penalidade'

function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

describe('diasDeAtraso', () => {
  it('devolver no dia previsto NÃO é atraso', () => {
    // Errar esta fronteira suspende quem cumpriu o prazo, e a regra perde
    // legitimidade na primeira reclamação de um responsável.
    expect(diasDeAtraso(dia('2026-09-20'), dia('2026-09-20'))).toBe(0)
  })

  it('devolver antes não é atraso negativo', () => {
    expect(diasDeAtraso(dia('2026-09-20'), dia('2026-09-15'))).toBe(0)
  })

  it('um dia depois é um dia de atraso', () => {
    expect(diasDeAtraso(dia('2026-09-20'), dia('2026-09-21'))).toBe(1)
  })

  it('conta dias corridos, incluindo fim de semana', () => {
    // A penalidade é por dias em que o livro ficou fora da estante, e o
    // livro não volta sozinho no sábado.
    expect(diasDeAtraso(dia('2026-09-20'), dia('2026-09-30'))).toBe(10)
  })

  it('atravessa a virada do mês e do ano', () => {
    expect(diasDeAtraso(dia('2026-12-30'), dia('2027-01-02'))).toBe(3)
  })
})

describe('calcularSuspensao', () => {
  it('sem atraso, não há suspensão', () => {
    expect(calcularSuspensao(0, 1)).toBeNull()
  })

  it('multiplica os dias de atraso pelo fator configurado', () => {
    expect(calcularSuspensao(5, 2)?.dias).toBe(10)
  })

  it('fator 1 suspende um dia por dia de atraso', () => {
    expect(calcularSuspensao(3, 1)?.dias).toBe(3)
  })

  it('fator ZERO desliga a penalidade sem desligar o controle', () => {
    // É como a escola escolhe não punir, e continua registrando o atraso.
    expect(calcularSuspensao(10, 0)).toBeNull()
  })

  it('respeita um teto', () => {
    // 200 dias de esquecimento não podem virar três anos de suspensão: a
    // pena deixaria de ser corretiva e a coordenação simplesmente a
    // ignoraria, junto com o resto do sistema.
    const suspensao = calcularSuspensao(200, 3)

    expect(suspensao?.dias).toBe(TETO_DE_DIAS_DE_SUSPENSAO)
    expect(suspensao?.limitadaPeloTeto).toBe(true)
  })

  it('abaixo do teto não marca como limitada', () => {
    expect(calcularSuspensao(3, 1)?.limitadaPeloTeto).toBe(false)
  })

  it('o motivo explica de onde veio a suspensão', () => {
    // Sem isso a suspensão vira castigo sem história, e ninguém consegue
    // explicar ao responsável de onde ela saiu.
    const suspensao = calcularSuspensao(5, 2)

    expect(suspensao?.motivo).toContain('5')
    expect(suspensao?.motivo).toMatch(/atraso/i)
  })

  it('recusa fator negativo em vez de gerar suspensão negativa', () => {
    expect(() => calcularSuspensao(5, -1)).toThrow()
  })

  it('recusa dias de atraso fracionários', () => {
    expect(() => calcularSuspensao(2.5, 1)).toThrow()
  })
})
