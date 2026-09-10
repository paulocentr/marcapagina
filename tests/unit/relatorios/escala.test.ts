import { describe, it, expect } from 'vitest'
import {
  ALTURA_DO_PLOT,
  escalaDeBarras,
  indicesComRotulo,
  sparkline,
} from '@/modules/relatorios/escala'

/**
 * A geometria do gráfico é código PURO, e é de propósito: é o que
 * permite provar "a barra de 47 não passa do topo do eixo" e "uma barra
 * de valor 1 continua visível" sem abrir navegador. Um gráfico cuja
 * escala só é conferida a olho é um gráfico que mente na reunião.
 */

describe('escalaDeBarras', () => {
  it('põe o topo do eixo num número redondo acima do maior valor', () => {
    const escala = escalaDeBarras([47, 12, 30], 170)

    expect(escala.maximo).toBe(50)
    expect(escala.marcas).toEqual([50, 25, 0])
  })

  it('a marca do meio é sempre inteira — meia-livro não existe', () => {
    for (const maior of [1, 3, 7, 19, 47, 96, 325, 1234]) {
      const escala = escalaDeBarras([maior], 170)
      expect(escala.maximo % 2, `máximo ${escala.maximo} para maior ${maior}`).toBe(0)
      expect(Number.isInteger(escala.maximo / 2)).toBe(true)
    }
  })

  it('nenhuma barra passa do topo do plot', () => {
    const escala = escalaDeBarras([47, 12, 30], 170)
    for (const altura of escala.alturas) {
      expect(altura).toBeLessThanOrEqual(170)
    }
  })

  it('o maior valor não fica perdido no meio do plot', () => {
    // Folga demais no topo achata o gráfico inteiro e a diferença entre
    // as turmas desaparece. Máximo 50 para maior 47 é 94% de ocupação.
    const escala = escalaDeBarras([47], 170)
    expect(escala.alturas[0]! / 170).toBeGreaterThan(0.7)
  })

  it('uma barra de valor 1 CONTINUA visível', () => {
    // 1/500 × 170px arredonda para 0px, e a turma que emprestou um livro
    // desapareceria — indistinguível da turma que não emprestou nenhum.
    const escala = escalaDeBarras([500, 1], 170)
    expect(escala.alturas[1]).toBeGreaterThanOrEqual(2)
  })

  it('valor zero é altura ZERO, e não a altura mínima', () => {
    // O oposto do caso acima: dar 2px a quem emprestou nada desenharia
    // um empréstimo que não aconteceu.
    const escala = escalaDeBarras([500, 0], 170)
    expect(escala.alturas[1]).toBe(0)
  })

  it('período sem nenhum empréstimo desenha a linha de base, não um erro', () => {
    const escala = escalaDeBarras([0, 0, 0], 170)

    expect(escala.maximo).toBe(2)
    expect(escala.alturas).toEqual([0, 0, 0])
    expect(escala.vazio).toBe(true)
  })

  it('sem barra nenhuma também não quebra', () => {
    const escala = escalaDeBarras([], 170)
    expect(escala.alturas).toEqual([])
    expect(escala.vazio).toBe(true)
  })

  it('recusa contagem que não é contagem', () => {
    expect(() => escalaDeBarras([1, -2], 170)).toThrow(/contagem/i)
    expect(() => escalaDeBarras([1.5], 170)).toThrow(/contagem/i)
  })

  it('recusa plot sem altura', () => {
    expect(() => escalaDeBarras([1], 0)).toThrow(/altura/i)
  })

  it('a altura do plot das pranchas é a que o módulo publica', () => {
    expect(ALTURA_DO_PLOT).toBe(170)
  })
})

describe('indicesComRotulo', () => {
  it('rotula o maior e o menor, e mais nada', () => {
    // "Rótulo de valor só onde ajuda": um número em cada barra é ruído
    // e some no meio de onze turmas.
    expect(indicesComRotulo([30, 47, 12, 25])).toEqual([1, 2])
  })

  it('não rotula nada quando todas as barras são iguais', () => {
    expect(indicesComRotulo([10, 10, 10])).toEqual([])
  })

  it('não rotula nada com menos de três barras — o eixo já diz', () => {
    expect(indicesComRotulo([47, 12])).toEqual([])
    expect(indicesComRotulo([47])).toEqual([])
  })

  it('no empate rotula a primeira ocorrência', () => {
    expect(indicesComRotulo([47, 47, 12, 12])).toEqual([0, 2])
  })

  it('período vazio não rotula zero em toda barra', () => {
    expect(indicesComRotulo([0, 0, 0])).toEqual([])
  })
})

describe('sparkline', () => {
  it('desenha um ponto por semana, da esquerda para a direita', () => {
    const linha = sparkline([1, 2, 3], 120, 32)!
    expect(linha.pontos.split(' ')).toHaveLength(3)
  })

  it('o último ponto é o da ponta direita, onde vai o marcador', () => {
    const linha = sparkline([1, 2, 3], 120, 32)!
    const ultimo = linha.pontos.split(' ')[2]!.split(',')

    expect(Number(ultimo[0])).toBe(linha.ultimo.x)
    expect(Number(ultimo[1])).toBe(linha.ultimo.y)
    expect(linha.ultimo.x).toBeGreaterThan(110)
  })

  it('valor maior fica MAIS ALTO na tela, ou seja, com y menor', () => {
    const linha = sparkline([1, 9], 120, 32)!
    const [primeiro, segundo] = linha.pontos.split(' ').map((p) => Number(p.split(',')[1]))

    expect(segundo!).toBeLessThan(primeiro!)
  })

  it('nada é desenhado fora da moldura', () => {
    const linha = sparkline([0, 50, 12, 3], 120, 32)!
    for (const ponto of linha.pontos.split(' ')) {
      const [x, y] = ponto.split(',').map(Number)
      expect(x!).toBeGreaterThanOrEqual(0)
      expect(x!).toBeLessThanOrEqual(120)
      expect(y!).toBeGreaterThanOrEqual(0)
      expect(y!).toBeLessThanOrEqual(32)
    }
  })

  it('série toda igual sai numa reta no meio, não numa reta no chão', () => {
    // Com máximo igual ao valor, uma série constante encostaria no topo
    // e pareceria crescimento máximo. No meio ela não afirma nada.
    const linha = sparkline([7, 7, 7], 120, 32)!
    const ys = linha.pontos.split(' ').map((p) => Number(p.split(',')[1]))

    expect(new Set(ys).size).toBe(1)
    expect(ys[0]).toBeCloseTo(16, 0)
  })

  it('menos de duas semanas não é tendência e não desenha nada', () => {
    expect(sparkline([5], 120, 32)).toBeNull()
    expect(sparkline([], 120, 32)).toBeNull()
  })

  it('recusa contagem que não é contagem', () => {
    expect(() => sparkline([1, -1], 120, 32)).toThrow(/contagem/i)
  })
})
