import { describe, it, expect } from 'vitest'
import {
  resolverConfiguracao,
  validarConfiguracao,
  type ConfiguracaoDaEscola,
  type OverrideDeSerie,
} from '@/modules/circulacao/configuracao'

const DA_ESCOLA: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

describe('resolverConfiguracao', () => {
  it('sem override, a série herda a configuração da escola', () => {
    expect(resolverConfiguracao('5', DA_ESCOLA, [])).toEqual(DA_ESCOLA)
  })

  it('o override vale CAMPO A CAMPO, não em bloco', () => {
    // A série sobrescreve só o limite e herda prazo e renovações. Em
    // bloco, a coordenação teria de reescrever tudo para mudar um número
    // — e esqueceria um campo, que passaria a valer o padrão do código.
    const overrides: OverrideDeSerie[] = [{ serie: '2', limiteSimultaneo: 1 }]

    const efetiva = resolverConfiguracao('2', DA_ESCOLA, overrides)

    expect(efetiva.limiteSimultaneo).toBe(1)
    expect(efetiva.prazoEmDias).toBe(14)
    expect(efetiva.maximoDeRenovacoes).toBe(2)
  })

  it('o 2º ano e o 9º podem ter regras diferentes ao mesmo tempo', () => {
    // A escola vai do 1º do Fundamental ao 3º do Médio: um valor único
    // estaria errado nas duas pontas simultaneamente (TASK-013).
    const overrides: OverrideDeSerie[] = [
      { serie: '2', prazoEmDias: 7, limiteSimultaneo: 1 },
      { serie: '9', prazoEmDias: 21, limiteSimultaneo: 5 },
    ]

    expect(resolverConfiguracao('2', DA_ESCOLA, overrides)).toMatchObject({
      prazoEmDias: 7,
      limiteSimultaneo: 1,
    })
    expect(resolverConfiguracao('9', DA_ESCOLA, overrides)).toMatchObject({
      prazoEmDias: 21,
      limiteSimultaneo: 5,
    })
  })

  it('série sem override não é afetada pelo override de outra', () => {
    const overrides: OverrideDeSerie[] = [{ serie: '2', prazoEmDias: 7 }]

    expect(resolverConfiguracao('5', DA_ESCOLA, overrides).prazoEmDias).toBe(14)
  })

  it('série nula (staff, por exemplo) usa a configuração da escola', () => {
    expect(resolverConfiguracao(null, DA_ESCOLA, [{ serie: '2', prazoEmDias: 7 }])).toEqual(
      DA_ESCOLA,
    )
  })

  it('override com zero explícito é respeitado, e não confundido com ausente', () => {
    // "0 renovações" é uma decisão legítima da coordenação. Tratar 0 como
    // ausente devolveria as 2 renovações da escola e permitiria
    // exatamente o que ela quis proibir.
    const efetiva = resolverConfiguracao('1', DA_ESCOLA, [
      { serie: '1', maximoDeRenovacoes: 0 },
    ])

    expect(efetiva.maximoDeRenovacoes).toBe(0)
  })

  it('override de booleano com false é respeitado', () => {
    // Mesma armadilha do zero: `false ?? true` daria true.
    const efetiva = resolverConfiguracao('1', DA_ESCOLA, [
      { serie: '1', alunoPodeReservar: false },
    ])

    expect(efetiva.alunoPodeReservar).toBe(false)
  })

  it('ignora override duplicado da mesma série de forma previsível', () => {
    // O banco impede o duplicado, mas se um dia entrar por importação, o
    // resultado tem de ser determinístico em vez de depender da ordem.
    const efetiva = resolverConfiguracao('1', DA_ESCOLA, [
      { serie: '1', prazoEmDias: 7 },
      { serie: '1', prazoEmDias: 30 },
    ])

    expect(efetiva.prazoEmDias).toBe(7)
  })
})

describe('validarConfiguracao', () => {
  it('aceita a configuração de exemplo', () => {
    expect(() => validarConfiguracao(DA_ESCOLA)).not.toThrow()
  })

  it('recusa prazo zero ou negativo', () => {
    // Prazo 0 faria todo empréstimo nascer vencido.
    expect(() => validarConfiguracao({ ...DA_ESCOLA, prazoEmDias: 0 })).toThrow()
    expect(() => validarConfiguracao({ ...DA_ESCOLA, prazoEmDias: -1 })).toThrow()
  })

  it('recusa limite simultâneo zero', () => {
    // Um limite 0 bloqueia a biblioteca inteira em silêncio: todo aluno
    // apareceria como "no limite" sem nunca ter pegado um livro.
    expect(() => validarConfiguracao({ ...DA_ESCOLA, limiteSimultaneo: 0 })).toThrow()
  })

  it('aceita zero renovações, que é decisão legítima', () => {
    expect(() => validarConfiguracao({ ...DA_ESCOLA, maximoDeRenovacoes: 0 })).not.toThrow()
  })

  it('recusa renovações negativas', () => {
    expect(() => validarConfiguracao({ ...DA_ESCOLA, maximoDeRenovacoes: -1 })).toThrow()
  })

  it('aceita zero dias de suspensão por dia de atraso', () => {
    // É como a escola desliga a penalidade sem desligar o controle.
    expect(() =>
      validarConfiguracao({ ...DA_ESCOLA, diasDeSuspensaoPorDiaDeAtraso: 0 }),
    ).not.toThrow()
  })

  it('recusa prazo absurdo, que só pode ser dedo escorregado', () => {
    expect(() => validarConfiguracao({ ...DA_ESCOLA, prazoEmDias: 4000 })).toThrow()
  })

  it('recusa valor fracionário', () => {
    expect(() => validarConfiguracao({ ...DA_ESCOLA, prazoEmDias: 7.5 })).toThrow()
  })
})
