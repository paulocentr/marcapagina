import { describe, it, expect } from 'vitest'
import { ESTADOS_DE_CHIP, descreverDisponibilidade } from '@/components/ui/estados'
import { NOMES_DE_ICONE } from '@/components/ui/icone-nomes'

// A regra dura do sistema de design: estado NUNCA é dito só pela cor.
// O balcão é operado sob pressa, às vezes em tela com brilho ruim, e
// quem confere é a operadora de pé. Cada chip carrega ícone E palavra —
// e é este teste que impede alguém de cadastrar um estado novo sem uma
// das duas metades.
describe('todo estado de chip carrega ícone e palavra', () => {
  const entradas = Object.entries(ESTADOS_DE_CHIP)

  it('encontra estados para verificar', () => {
    // Guarda contra falso verde: catálogo vazio passaria em tudo abaixo.
    expect(entradas.length).toBeGreaterThan(0)
  })

  it.each(entradas)('%s tem palavra própria', (chave, descricao) => {
    expect(
      descricao.palavra.trim(),
      `O chip ${chave} sairia só com cor. Estado sem palavra não é lido no balcão.`,
    ).not.toBe('')
  })

  it.each(entradas)('%s aponta para um ícone que existe', (chave, descricao) => {
    expect(
      NOMES_DE_ICONE as readonly string[],
      `O chip ${chave} aponta para o ícone "${descricao.icone}", que não está desenhado.`,
    ).toContain(descricao.icone)
  })

  it('dois estados do mesmo tom não ficam com a mesma palavra', () => {
    // Se dois estados compartilham tom e palavra, a única diferença
    // visível entre eles some — que é exatamente o que a regra proíbe.
    const porTom = new Map<string, string[]>()
    for (const [, descricao] of entradas) {
      const palavras = porTom.get(descricao.tom) ?? []
      palavras.push(descricao.palavra)
      porTom.set(descricao.tom, palavras)
    }

    const colisoes: string[] = []
    for (const [tom, palavras] of porTom) {
      const unicas = new Set(palavras)
      if (unicas.size !== palavras.length) colisoes.push(tom)
    }

    expect(colisoes, `Tons com palavras repetidas: ${colisoes.join(', ')}`).toEqual([])
  })
})

// "Disponíveis" é contagem de exemplares, nunca campo guardado (princípio
// 03 da prancha de Fundamentos). Por isso a frase é derivada aqui, e não
// escrita à mão em cada tela — onde o plural erraria em metade dos casos.
describe('descreverDisponibilidade', () => {
  it('diz quantos de quantos, no plural certo', () => {
    expect(descreverDisponibilidade(3, 5).palavra).toBe('3 de 5 livres')
    expect(descreverDisponibilidade(0, 1).palavra).toBe('0 de 1 livre')
    expect(descreverDisponibilidade(1, 1).palavra).toBe('1 de 1 livre')
  })

  it('perde o destaque quando não há nenhum livre', () => {
    expect(descreverDisponibilidade(2, 2).tom).toBe('certo')
    expect(descreverDisponibilidade(0, 4).tom).toBe('neutro')
  })

  it('obra sem exemplar nenhum não vira "0 de 0"', () => {
    expect(descreverDisponibilidade(0, 0).palavra).toBe('sem exemplares')
    expect(descreverDisponibilidade(0, 0).tom).toBe('neutro')
  })

  it('recusa contagem impossível em vez de desenhar mentira', () => {
    // Mais disponíveis do que exemplares só pode ser erro de quem contou.
    // Renderizar "7 de 5 livres" ensinaria a operadora a não confiar no número.
    expect(() => descreverDisponibilidade(7, 5)).toThrow(/impossível/i)
    expect(() => descreverDisponibilidade(-1, 5)).toThrow(/impossível/i)
  })
})
