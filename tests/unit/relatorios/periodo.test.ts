import { describe, it, expect } from 'vitest'
import {
  compararTotais,
  contarPorSemana,
  diaDaEscolaEm,
  ehChaveDePeriodo,
  inicioDoDiaDaEscola,
  janelaDeTendencia,
  periodoAnterior,
  recortarPeriodo,
} from '@/modules/relatorios/periodo'

/**
 * Este arquivo é rodado em TRÊS fusos — local, `TZ=UTC` e
 * `TZ=Asia/Tokyo`. É a única forma de provar que o recorte do mês sai do
 * fuso da ESCOLA e não do processo: um relatório "de setembro" calculado
 * em UTC começa às 21h de 31/08 em São Paulo, e leva para dentro do mês
 * os empréstimos das três últimas horas de agosto.
 *
 * Tóquio é o caso simétrico, e o pior: UTC+9 contra UTC-3 são doze horas
 * de diferença, então metade dos dias de fronteira cai do outro lado.
 */

/** Meio-dia em São Paulo: um instante que cai no dia que o nome diz. */
function instante(iso: string, hora = '12:00'): Date {
  return new Date(`${iso}T${hora}:00-03:00`)
}

function iso(data: Date): string {
  return data.toISOString()
}

describe('o dia da escola, a partir de um instante', () => {
  it('às 15h em São Paulo é o dia de hoje', () => {
    expect(diaDaEscolaEm(instante('2026-09-10', '15:00'))).toEqual({
      ano: 2026,
      mes: 9,
      dia: 10,
    })
  })

  it('às 23h em São Paulo AINDA é hoje, mesmo já sendo amanhã em UTC', () => {
    // 2026-09-10T23:00-03:00 é 2026-09-11T02:00Z. Ler o dia UTC diria 11,
    // e o empréstimo do fim do expediente cairia no mês seguinte na
    // virada do dia 30.
    expect(diaDaEscolaEm(new Date('2026-09-11T02:00:00.000Z'))).toEqual({
      ano: 2026,
      mes: 9,
      dia: 10,
    })
  })

  it('a meia-noite e um minuto na escola já é o dia novo', () => {
    expect(diaDaEscolaEm(new Date('2026-09-11T03:01:00.000Z'))).toEqual({
      ano: 2026,
      mes: 9,
      dia: 11,
    })
  })

  it('a virada do ano na escola não vira antes da hora', () => {
    // 31/12/2026 às 22h em São Paulo é 01/01/2027 em UTC.
    expect(diaDaEscolaEm(new Date('2027-01-01T01:00:00.000Z'))).toEqual({
      ano: 2026,
      mes: 12,
      dia: 31,
    })
  })
})

describe('o instante em que um dia começa na escola', () => {
  it('é 03:00Z, porque a escola está em UTC-3', () => {
    expect(iso(inicioDoDiaDaEscola({ ano: 2026, mes: 9, dia: 10 }))).toBe(
      '2026-09-10T03:00:00.000Z',
    )
  })
})

describe('recortarPeriodo — mês', () => {
  const periodo = recortarPeriodo('MES', instante('2026-09-10'))

  it('começa na meia-noite do dia 1 na escola', () => {
    expect(iso(periodo.inicio)).toBe('2026-09-01T03:00:00.000Z')
  })

  it('termina na meia-noite do dia 1 do mês seguinte, EXCLUSIVA', () => {
    // Exclusivo: o primeiro instante de outubro é de outubro. `lte`
    // contaria o primeiro empréstimo do mês seguinte duas vezes.
    expect(iso(periodo.fim)).toBe('2026-10-01T03:00:00.000Z')
  })

  it('nomeia o mês em português', () => {
    expect(periodo.rotulo).toBe('setembro de 2026')
  })

  it('guarda o primeiro e o último dia do calendário da escola', () => {
    expect(periodo.primeiroDia).toEqual({ ano: 2026, mes: 9, dia: 1 })
    expect(periodo.ultimoDia).toEqual({ ano: 2026, mes: 9, dia: 30 })
  })

  it('acha o último dia de fevereiro em ano bissexto', () => {
    expect(recortarPeriodo('MES', instante('2028-02-10')).ultimoDia).toEqual({
      ano: 2028,
      mes: 2,
      dia: 29,
    })
  })

  it('o instante das 23h do último dia do mês AINDA está dentro do mês', () => {
    // O caso que o fuso do processo erra: 30/09 às 23h em São Paulo é
    // 01/10 em UTC. Se o recorte fosse UTC, este empréstimo sairia de
    // setembro e apareceria em outubro.
    const setembro = recortarPeriodo('MES', instante('2026-09-15'))
    const ultimoAtendimento = new Date('2026-10-01T02:00:00.000Z')

    expect(ultimoAtendimento.getTime()).toBeGreaterThanOrEqual(setembro.inicio.getTime())
    expect(ultimoAtendimento.getTime()).toBeLessThan(setembro.fim.getTime())
  })

  it('o mês é recortado pelo dia da ESCOLA, não pelo dia UTC do instante', () => {
    // 01/09 às 00h30 na escola é 01/09T03:30Z — dia 1 nos dois. Mas
    // 31/08 às 23h na escola é 01/09T02:00Z: pedir o mês desse instante
    // tem de devolver AGOSTO.
    expect(recortarPeriodo('MES', new Date('2026-09-01T02:00:00.000Z')).rotulo).toBe(
      'agosto de 2026',
    )
  })
})

describe('recortarPeriodo — bimestre', () => {
  it('setembro cai no bimestre de setembro e outubro', () => {
    const periodo = recortarPeriodo('BIMESTRE', instante('2026-09-10'))

    expect(iso(periodo.inicio)).toBe('2026-09-01T03:00:00.000Z')
    expect(iso(periodo.fim)).toBe('2026-11-01T03:00:00.000Z')
    expect(periodo.rotulo).toBe('setembro e outubro de 2026')
  })

  it('outubro cai no MESMO bimestre de setembro', () => {
    expect(recortarPeriodo('BIMESTRE', instante('2026-10-31')).rotulo).toBe(
      'setembro e outubro de 2026',
    )
  })

  it('o bimestre de novembro termina na virada do ano', () => {
    const periodo = recortarPeriodo('BIMESTRE', instante('2026-12-05'))

    expect(iso(periodo.inicio)).toBe('2026-11-01T03:00:00.000Z')
    expect(iso(periodo.fim)).toBe('2027-01-01T03:00:00.000Z')
  })
})

describe('recortarPeriodo — ano letivo', () => {
  it('vai de 1º de janeiro a 1º de janeiro do ano seguinte', () => {
    const periodo = recortarPeriodo('ANO', instante('2026-09-10'))

    expect(iso(periodo.inicio)).toBe('2026-01-01T03:00:00.000Z')
    expect(iso(periodo.fim)).toBe('2027-01-01T03:00:00.000Z')
    expect(periodo.rotulo).toBe('ano letivo de 2026')
    expect(periodo.ultimoDia).toEqual({ ano: 2026, mes: 12, dia: 31 })
  })
})

describe('periodoAnterior', () => {
  it('do mês é o mês anterior, inteiro', () => {
    const anterior = periodoAnterior(recortarPeriodo('MES', instante('2026-09-10')))

    expect(anterior.rotulo).toBe('agosto de 2026')
    expect(iso(anterior.inicio)).toBe('2026-08-01T03:00:00.000Z')
    expect(iso(anterior.fim)).toBe('2026-09-01T03:00:00.000Z')
  })

  it('de janeiro é dezembro do ano passado', () => {
    expect(periodoAnterior(recortarPeriodo('MES', instante('2026-01-10'))).rotulo).toBe(
      'dezembro de 2025',
    )
  })

  it('do bimestre é o bimestre anterior', () => {
    expect(periodoAnterior(recortarPeriodo('BIMESTRE', instante('2026-09-10'))).rotulo).toBe(
      'julho e agosto de 2026',
    )
  })

  it('do primeiro bimestre do ano é o último do ano passado', () => {
    expect(periodoAnterior(recortarPeriodo('BIMESTRE', instante('2026-02-10'))).rotulo).toBe(
      'novembro e dezembro de 2025',
    )
  })

  it('do ano letivo é o ano letivo anterior', () => {
    expect(periodoAnterior(recortarPeriodo('ANO', instante('2026-09-10'))).rotulo).toBe(
      'ano letivo de 2025',
    )
  })

  it('o fim do anterior é EXATAMENTE o começo do atual', () => {
    // Sem isso, um dia caberia nos dois períodos ou em nenhum, e a
    // comparação "sobre agosto" passaria a contar o dia 1 duas vezes.
    const atual = recortarPeriodo('MES', instante('2026-09-10'))
    expect(periodoAnterior(atual).fim.getTime()).toBe(atual.inicio.getTime())
  })
})

describe('compararTotais', () => {
  it('sobe', () => {
    expect(compararTotais(325, 293)).toEqual({ tipo: 'ALTA', anterior: 293, percentual: 11 })
  })

  it('desce', () => {
    expect(compararTotais(200, 250)).toEqual({ tipo: 'BAIXA', anterior: 250, percentual: 20 })
  })

  it('igual é igual, não alta de zero por cento', () => {
    expect(compararTotais(80, 80)).toEqual({ tipo: 'IGUAL', anterior: 80 })
  })

  it('sem base anterior NÃO inventa porcentagem', () => {
    // Dividir por zero daria Infinity, e `?? 0` diria "+0%" — as duas
    // mentem. O primeiro mês do sistema não tem com o que comparar, e a
    // tela tem de dizer isso.
    expect(compararTotais(42, 0)).toEqual({ tipo: 'SEM_BASE', anterior: 0 })
  })

  it('zero contra zero é sem base, não igual', () => {
    expect(compararTotais(0, 0)).toEqual({ tipo: 'SEM_BASE', anterior: 0 })
  })

  it('variação menor que meio por cento arredonda para zero mas guarda o sentido', () => {
    // 1000 → 1002 é +0,2%. Dizer "IGUAL" seria falso; dizer "+0%" na
    // tela é tratado por quem desenha, com "menos de 1%".
    expect(compararTotais(1002, 1000)).toEqual({
      tipo: 'ALTA',
      anterior: 1000,
      percentual: 0,
    })
  })

  it('recusa contagem impossível', () => {
    expect(() => compararTotais(-1, 10)).toThrow(/contagem/i)
    expect(() => compararTotais(10, 1.5)).toThrow(/contagem/i)
  })
})

describe('janelaDeTendencia', () => {
  const setembro = recortarPeriodo('MES', instante('2026-09-10'))
  const janela = janelaDeTendencia(setembro, 12)

  it('tem uma semana por balde', () => {
    expect(janela.semanas).toHaveLength(12)
  })

  it('a última semana TERMINA no fim do período', () => {
    // A tendência tem de chegar até a borda do período: um sparkline que
    // para uma semana antes desenha uma queda que não existe.
    expect(janela.semanas[11]?.fim.getTime()).toBe(setembro.fim.getTime())
  })

  it('cada semana tem sete dias e nenhuma vaza para a vizinha', () => {
    for (let i = 1; i < janela.semanas.length; i += 1) {
      expect(janela.semanas[i]?.inicio.getTime()).toBe(janela.semanas[i - 1]?.fim.getTime())
    }
  })

  it('a janela começa 84 dias antes do fim do período', () => {
    // 12 × 7 = 84. Em dias de CALENDÁRIO da escola, não em 84×24 horas.
    expect(iso(janela.inicio)).toBe('2026-07-09T03:00:00.000Z')
    expect(iso(janela.fim)).toBe('2026-10-01T03:00:00.000Z')
  })

  it('recusa janela sem semana', () => {
    expect(() => janelaDeTendencia(setembro, 0)).toThrow(/semana/i)
  })
})

describe('contarPorSemana', () => {
  const janela = janelaDeTendencia(recortarPeriodo('MES', instante('2026-09-10')), 12)

  it('põe cada retirada no balde da sua semana', () => {
    const contagem = contarPorSemana(janela.semanas, [
      // dentro da última semana (25/09 a 01/10)
      instante('2026-09-28'),
      instante('2026-09-30', '23:00'),
      // na penúltima
      instante('2026-09-20'),
    ])

    expect(contagem).toHaveLength(12)
    expect(contagem[11]).toBe(2)
    expect(contagem[10]).toBe(1)
    expect(contagem[9]).toBe(0)
  })

  it('ignora o que está fora da janela', () => {
    const contagem = contarPorSemana(janela.semanas, [
      instante('2026-01-05'),
      instante('2027-01-05'),
    ])

    expect(contagem.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('o instante exato do começo de uma semana é DELA, não da anterior', () => {
    const contagem = contarPorSemana(janela.semanas, [janela.semanas[11]!.inicio])

    expect(contagem[11]).toBe(1)
    expect(contagem[10]).toBe(0)
  })
})

describe('ehChaveDePeriodo', () => {
  it('aceita as três chaves', () => {
    expect(ehChaveDePeriodo('MES')).toBe(true)
    expect(ehChaveDePeriodo('BIMESTRE')).toBe(true)
    expect(ehChaveDePeriodo('ANO')).toBe(true)
  })

  it('recusa o que veio da URL sem ser chave', () => {
    // A chave vem da query string, que é entrada de fora. Sem esta
    // guarda, `?periodo=x` cairia num `default` silencioso.
    expect(ehChaveDePeriodo('mes')).toBe(false)
    expect(ehChaveDePeriodo('')).toBe(false)
    expect(ehChaveDePeriodo('SEMANA')).toBe(false)
  })
})
