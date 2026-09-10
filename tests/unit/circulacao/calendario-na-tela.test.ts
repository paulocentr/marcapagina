import { describe, it, expect } from 'vitest'
import {
  agruparPorMes,
  escreverDiaIso,
  interpretarDiaDigitado,
} from '@/app/painel/configuracao/calendario-na-tela'

describe('escreverDiaIso', () => {
  it('escreve aaaa-mm-dd como a escola escreve', () => {
    expect(escreverDiaIso('2026-09-07')).toBe('07/09/2026')
  })

  it('não passa por Date, então não muda de dia por fuso', () => {
    // `new Date('2026-01-01').toLocaleDateString()` imprime 31/12/2025 em
    // qualquer máquina a oeste de Greenwich — que é o caso da secretaria.
    // A conversão aqui é de TEXTO para texto, e é por isso que ela não tem
    // como errar o dia.
    expect(escreverDiaIso('2026-01-01')).toBe('01/01/2026')
    expect(escreverDiaIso('2026-12-31')).toBe('31/12/2026')
  })

  it('recusa texto que não é um dia', () => {
    expect(() => escreverDiaIso('07/09/2026')).toThrow(/aaaa-mm-dd/i)
    expect(() => escreverDiaIso('')).toThrow(/aaaa-mm-dd/i)
  })
})

describe('interpretarDiaDigitado', () => {
  it('devolve o texto do campo de data sem tocar em Date', () => {
    // O `<input type="date">` já entrega aaaa-mm-dd. Passar por Date para
    // "normalizar" é justamente o que faria o dia marcado no navegador da
    // secretaria virar o dia anterior no servidor.
    expect(interpretarDiaDigitado(' 2026-09-07 ')).toEqual({ ok: true, dia: '2026-09-07' })
  })

  it('recusa vazio pedindo a data', () => {
    const lido = interpretarDiaDigitado('')

    expect(lido.ok).toBe(false)
    if (!lido.ok) expect(lido.erro).toMatch(/data/i)
  })

  it('recusa formato estranho em vez de mandar lixo ao serviço', () => {
    expect(interpretarDiaDigitado('07/09/2026').ok).toBe(false)
    expect(interpretarDiaDigitado('2026-9-7').ok).toBe(false)
  })

  it('não julga dia impossível: a recusa componente a componente é do serviço', () => {
    // `2026-02-31` é recusado por `calendario.service.ts`, com a frase
    // dele. Repetir a checagem aqui daria duas mensagens para o mesmo erro.
    expect(interpretarDiaDigitado('2026-02-31')).toEqual({ ok: true, dia: '2026-02-31' })
  })
})

describe('agruparPorMes', () => {
  it('agrupa os dias marcados por mês, em ordem de calendário', () => {
    const meses = agruparPorMes(['2026-09-07', '2026-07-20', '2026-09-08', '2026-12-25'])

    expect(meses.map((m) => m.titulo)).toEqual([
      'julho de 2026',
      'setembro de 2026',
      'dezembro de 2026',
    ])
    expect(meses[1]!.dias.map((d) => d.iso)).toEqual(['2026-09-07', '2026-09-08'])
  })

  it('descreve cada dia com o dia da semana, para a coordenação conferir', () => {
    // 07/09/2026 é uma segunda-feira. O dia da semana é o que revela o
    // engano de digitação: marcar um sábado como feriado não muda nada, e
    // ver "sábado" na lista explica por que o prazo não mudou.
    const [mes] = agruparPorMes(['2026-09-07'])

    expect(mes!.dias[0]).toEqual({
      iso: '2026-09-07',
      escrito: '07/09/2026',
      diaDoMes: '07',
      diaDaSemana: 'segunda-feira',
      ehFimDeSemana: false,
    })
  })

  it('marca o fim de semana, que já era fechado de qualquer forma', () => {
    const [mes] = agruparPorMes(['2026-09-05', '2026-09-06'])

    expect(mes!.dias.map((d) => d.diaDaSemana)).toEqual(['sábado', 'domingo'])
    expect(mes!.dias.every((d) => d.ehFimDeSemana)).toBe(true)
  })

  it('lista vazia devolve nenhum mês', () => {
    expect(agruparPorMes([])).toEqual([])
  })

  it('recusa dia malformado em vez de desenhar mês inventado', () => {
    expect(() => agruparPorMes(['2026-13-01'])).toThrow(/2026-13-01/)
  })

  it('não repete o mesmo dia', () => {
    // A consulta devolve um Set, mas quem chama entrega array — e um dia
    // duplicado na lista viraria dois botões de desmarcar para o mesmo dia.
    const [mes] = agruparPorMes(['2026-09-07', '2026-09-07'])

    expect(mes!.dias).toHaveLength(1)
  })
})
