import { describe, it, expect } from 'vitest'
import {
  ROTULO_DO_PERIODO,
  dataCurta,
  descreverComparacao,
  numeroNaTela,
  porAlunoNaTela,
} from '@/app/painel/relatorios/painel-na-tela'

/**
 * As decisões de TEXTO da tela do painel, separadas do JSX.
 *
 * Ficam num módulo puro porque cada uma delas é uma afirmação que a
 * coordenação vai levar para a reunião — "+11% sobre agosto" é diferente
 * de "estável", e "0,0 por aluno" é diferente de "sem aluno".
 */

describe('descreverComparacao', () => {
  it('alta sai com sinal e com o mês de comparação', () => {
    expect(
      descreverComparacao({ tipo: 'ALTA', anterior: 293, percentual: 11 }, 'agosto de 2026'),
    ).toEqual({ tom: 'alta', texto: '+11% sobre agosto de 2026 (293)' })
  })

  it('baixa sai com o sinal negativo', () => {
    expect(
      descreverComparacao({ tipo: 'BAIXA', anterior: 250, percentual: 20 }, 'agosto de 2026'),
    ).toEqual({ tom: 'baixa', texto: '-20% sobre agosto de 2026 (250)' })
  })

  it('variação que arredonda para zero diz "menos de 1%", não "+0%"', () => {
    // "+0%" é uma afirmação sem sentido: ou não mudou, ou mudou pouco.
    const dito = descreverComparacao(
      { tipo: 'ALTA', anterior: 1000, percentual: 0 },
      'agosto de 2026',
    )

    expect(dito.texto).toContain('menos de 1%')
    expect(dito.tom).toBe('alta')
  })

  it('igual não vira alta de zero por cento', () => {
    expect(descreverComparacao({ tipo: 'IGUAL', anterior: 80 }, 'agosto de 2026')).toEqual({
      tom: 'neutro',
      texto: 'igual a agosto de 2026 (80)',
    })
  })

  it('sem base diz que não há com o que comparar', () => {
    const dito = descreverComparacao({ tipo: 'SEM_BASE', anterior: 0 }, 'agosto de 2026')

    expect(dito.tom).toBe('neutro')
    expect(dito.texto).toContain('agosto de 2026')
    expect(dito.texto).toMatch(/sem|primeiro|nenhum/i)
    // O que NÃO pode aparecer é uma porcentagem inventada.
    expect(dito.texto).not.toContain('%')
  })
})

describe('numeroNaTela', () => {
  it('usa vírgula decimal', () => {
    expect(numeroNaTela(4.5)).toBe('4,5')
  })

  it('arredonda para uma casa', () => {
    expect(numeroNaTela(43.62)).toBe('43,6')
  })

  it('inteiro não ganha casa decimal à toa', () => {
    expect(numeroNaTela(44)).toBe('44')
  })

  it('sem número não inventa zero', () => {
    // "0%" do acervo circulando afirmaria que existe acervo.
    expect(numeroNaTela(null)).toBeNull()
  })
})

describe('porAlunoNaTela', () => {
  it('duas casas, porque a diferença entre turmas é fina', () => {
    expect(porAlunoNaTela(7 / 3)).toBe('2,33')
  })

  it('turma sem aluno ativo diz isso com palavra, não com zero', () => {
    expect(porAlunoNaTela(null)).toBe('sem aluno ativo')
  })

  it('zero empréstimo por aluno é zero de verdade', () => {
    expect(porAlunoNaTela(0)).toBe('0')
  })
})

describe('dataCurta', () => {
  it('dia e mês, como a escola escreve', () => {
    // Lida em UTC de propósito: as colunas são @db.Date e o Postgres as
    // devolve como meia-noite UTC. Ler no fuso do navegador mostraria
    // 17/08 para quem está a oeste de Greenwich.
    expect(dataCurta(new Date('2026-08-18T00:00:00.000Z'))).toBe('18/08')
  })
})

describe('ROTULO_DO_PERIODO', () => {
  it('nomeia as três chaves para os botões da tela', () => {
    expect(ROTULO_DO_PERIODO.MES).toBe('Mês')
    expect(ROTULO_DO_PERIODO.BIMESTRE).toBe('Bimestre')
    expect(ROTULO_DO_PERIODO.ANO).toBe('Ano letivo')
  })
})
