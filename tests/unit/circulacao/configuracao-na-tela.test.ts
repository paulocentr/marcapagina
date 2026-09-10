import { describe, it, expect } from 'vitest'
import {
  CAMPOS_DA_CONFIGURACAO,
  descreverSerie,
  formatarValor,
  interpretarHerancaBooleana,
  interpretarInteiro,
  interpretarInteiroOpcional,
  montarConfiguracaoDaEscola,
  montarOverrideDeSerie,
  resumirConfiguracao,
  separarPorOrigem,
} from '@/app/painel/configuracao/configuracao-na-tela'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'

const DA_ESCOLA: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

/** O formulário da escola como o navegador o entrega: tudo texto. */
const FORMULARIO_DA_ESCOLA = {
  prazoEmDias: '14',
  limiteSimultaneo: '3',
  maximoDeRenovacoes: '2',
  diasDeSuspensaoPorDiaDeAtraso: '1',
  prazoDeRetiradaEmDias: '2',
  alunoPodeReservar: 'SIM',
}

/** O formulário da série: campo vazio significa "herda da escola". */
const FORMULARIO_DA_SERIE = {
  serie: '6º ano',
  prazoEmDias: '',
  limiteSimultaneo: '',
  maximoDeRenovacoes: '',
  diasDeSuspensaoPorDiaDeAtraso: '',
  prazoDeRetiradaEmDias: '',
  alunoPodeReservar: 'HERDA',
}

describe('formatarValor', () => {
  it('escreve cada campo com a unidade e o plural certos', () => {
    expect(formatarValor('prazoEmDias', 14)).toBe('14 dias de prazo')
    expect(formatarValor('limiteSimultaneo', 3)).toBe('3 livros ao mesmo tempo')
    expect(formatarValor('maximoDeRenovacoes', 2)).toBe('2 renovações')
    expect(formatarValor('diasDeSuspensaoPorDiaDeAtraso', 2)).toBe(
      '2 dias de suspensão por dia de atraso',
    )
    expect(formatarValor('prazoDeRetiradaEmDias', 2)).toBe('2 dias para retirar a reserva')
    expect(formatarValor('alunoPodeReservar', true)).toBe('o aluno pode reservar')
  })

  it('escreve o singular no singular', () => {
    // "1 dias" na tela da coordenação é o tipo de detalhe que faz a
    // usuária desconfiar de que o número também está errado.
    expect(formatarValor('prazoEmDias', 1)).toBe('1 dia de prazo')
    expect(formatarValor('limiteSimultaneo', 1)).toBe('1 livro ao mesmo tempo')
    expect(formatarValor('maximoDeRenovacoes', 1)).toBe('1 renovação')
    expect(formatarValor('diasDeSuspensaoPorDiaDeAtraso', 1)).toBe(
      '1 dia de suspensão por dia de atraso',
    )
    expect(formatarValor('prazoDeRetiradaEmDias', 1)).toBe('1 dia para retirar a reserva')
  })

  it('diz o zero por extenso, porque zero é decisão e não ausência', () => {
    // Zero renovações e zero dias de suspensão são como a escola desliga
    // a penalidade sem desligar o controle. "0 renovações" faria a
    // coordenação procurar um campo vazio.
    expect(formatarValor('maximoDeRenovacoes', 0)).toBe('não permite renovação')
    expect(formatarValor('diasDeSuspensaoPorDiaDeAtraso', 0)).toBe('sem suspensão por atraso')
  })

  it('diz quando o aluno não reserva', () => {
    expect(formatarValor('alunoPodeReservar', false)).toBe('só a biblioteca reserva')
  })

  it('recusa valor impossível vindo do banco em vez de escrever NaN na tela', () => {
    // A configuração vem do banco e pode chegar quebrada. Escrever
    // "NaN dias de prazo" ensinaria a coordenação a ignorar a tela.
    expect(() => formatarValor('prazoEmDias', Number.NaN)).toThrow(/prazo de empréstimo/i)
    expect(() => formatarValor('limiteSimultaneo', -1)).toThrow(/limite de livros/i)
    expect(() => formatarValor('prazoEmDias', 1.5)).toThrow(/inteiro/i)
    expect(() => formatarValor('prazoEmDias', true)).toThrow(/prazo de empréstimo/i)
    expect(() => formatarValor('alunoPodeReservar', 1)).toThrow(/aluno pode reservar/i)
  })
})

describe('resumirConfiguracao', () => {
  it('resume a configuração efetiva em uma linha', () => {
    expect(resumirConfiguracao(DA_ESCOLA)).toBe(
      '14 dias de prazo · 3 livros ao mesmo tempo · 2 renovações · ' +
        '1 dia de suspensão por dia de atraso · 2 dias para retirar a reserva · ' +
        'o aluno pode reservar',
    )
  })

  it('cobre todos os campos da configuração', () => {
    // Guarda contra campo novo esquecido: um campo que entra no domínio e
    // não no resumo desaparece da tela sem ninguém notar.
    expect(CAMPOS_DA_CONFIGURACAO).toHaveLength(6)
    expect(resumirConfiguracao(DA_ESCOLA).split(' · ')).toHaveLength(
      CAMPOS_DA_CONFIGURACAO.length,
    )
  })
})

describe('descreverSerie', () => {
  it('marca campo a campo o que é herdado e o que a série sobrescreve', () => {
    const override: OverrideDeSerie = { serie: '6º ano', limiteSimultaneo: 1 }

    const linhas = descreverSerie(DA_ESCOLA, override)
    const limite = linhas.find((l) => l.campo === 'limiteSimultaneo')
    const prazo = linhas.find((l) => l.campo === 'prazoEmDias')

    expect(limite).toMatchObject({
      origem: 'SERIE',
      valorEfetivo: '1 livro ao mesmo tempo',
      valorDaEscola: '3 livros ao mesmo tempo',
    })
    expect(prazo).toMatchObject({
      origem: 'ESCOLA',
      valorEfetivo: '14 dias de prazo',
      valorDaEscola: '14 dias de prazo',
    })
  })

  it('trata zero sobrescrito como sobrescrito, não como herança', () => {
    // `|| ` no lugar de `?? ` diria que a série herda as 2 renovações da
    // escola — liberando exatamente o que a coordenação proibiu.
    const linhas = descreverSerie(DA_ESCOLA, { serie: '1º ano', maximoDeRenovacoes: 0 })
    const renovacoes = linhas.find((l) => l.campo === 'maximoDeRenovacoes')

    expect(renovacoes).toMatchObject({ origem: 'SERIE', valorEfetivo: 'não permite renovação' })
  })

  it('trata `false` sobrescrito como sobrescrito', () => {
    const linhas = descreverSerie(DA_ESCOLA, { serie: '1º ano', alunoPodeReservar: false })
    const reserva = linhas.find((l) => l.campo === 'alunoPodeReservar')

    expect(reserva).toMatchObject({ origem: 'SERIE', valorEfetivo: 'só a biblioteca reserva' })
  })

  it('sobrescrito com o MESMO valor da escola continua sobrescrito', () => {
    // Não é firula: o valor está gravado na série. Se a escola mudar o
    // prazo amanhã, esta série NÃO acompanha — e chamar isso de herança
    // faria a coordenação mudar o prazo da escola esperando mudar o desta.
    const linhas = descreverSerie(DA_ESCOLA, { serie: '9º ano', prazoEmDias: 14 })
    const prazo = linhas.find((l) => l.campo === 'prazoEmDias')

    expect(prazo).toMatchObject({ origem: 'SERIE', valorEfetivo: '14 dias de prazo' })
  })

  it('devolve uma linha por campo, na ordem do catálogo', () => {
    const linhas = descreverSerie(DA_ESCOLA, { serie: '6º ano' })

    expect(linhas.map((l) => l.campo)).toEqual([...CAMPOS_DA_CONFIGURACAO])
    expect(linhas.every((l) => l.origem === 'ESCOLA')).toBe(true)
  })
})

describe('separarPorOrigem', () => {
  it('separa os ajustados dos herdados', () => {
    const linhas = descreverSerie(DA_ESCOLA, {
      serie: '6º ano',
      prazoEmDias: 7,
      limiteSimultaneo: 1,
    })

    const { ajustados, herdados } = separarPorOrigem(linhas)

    expect(ajustados.map((l) => l.campo)).toEqual(['prazoEmDias', 'limiteSimultaneo'])
    expect(herdados).toHaveLength(4)
  })
})

describe('interpretarInteiro', () => {
  it('lê um inteiro digitado', () => {
    expect(interpretarInteiro('7', 'prazoEmDias')).toEqual({ ok: true, valor: 7 })
    expect(interpretarInteiro(' 0 ', 'maximoDeRenovacoes')).toEqual({ ok: true, valor: 0 })
  })

  it('recusa campo vazio dizendo qual campo', () => {
    const lido = interpretarInteiro('', 'prazoEmDias')

    expect(lido.ok).toBe(false)
    if (!lido.ok) expect(lido.erro).toMatch(/prazo de empréstimo/i)
  })

  it('recusa o que não é inteiro em vez de virar NaN ou zero', () => {
    // É o bug clássico desta tela: `Number('')` é 0 e `Number('abc')` é
    // NaN. Um prazo 0 faz todo empréstimo nascer vencido, e um NaN faz o
    // cálculo do vencimento devolver data inválida no balcão.
    for (const bruto of ['abc', '1,5', '1.5', '-3', '+7', '1e3', '7 dias', '٧']) {
      const lido = interpretarInteiro(bruto, 'prazoEmDias')
      expect(lido.ok, `"${bruto}" passou como inteiro`).toBe(false)
    }
  })

  it('recusa número grande demais para contar dias', () => {
    const lido = interpretarInteiro('99999999999999999999', 'prazoEmDias')
    expect(lido.ok).toBe(false)
  })
})

describe('interpretarInteiroOpcional', () => {
  it('campo vazio significa herdar da escola', () => {
    expect(interpretarInteiroOpcional('', 'prazoEmDias')).toEqual({ ok: true, valor: undefined })
    expect(interpretarInteiroOpcional('   ', 'prazoEmDias')).toEqual({
      ok: true,
      valor: undefined,
    })
  })

  it('campo preenchido é lido como inteiro', () => {
    expect(interpretarInteiroOpcional('7', 'prazoEmDias')).toEqual({ ok: true, valor: 7 })
    expect(interpretarInteiroOpcional('0', 'maximoDeRenovacoes')).toEqual({ ok: true, valor: 0 })
  })

  it('campo preenchido com bobagem é recusado, não tratado como herança', () => {
    // Tratar "abc" como herança gravaria uma série silenciosamente
    // diferente do que a coordenação digitou.
    const lido = interpretarInteiroOpcional('abc', 'prazoEmDias')
    expect(lido.ok).toBe(false)
  })
})

describe('interpretarHerancaBooleana', () => {
  it('lê as três respostas possíveis', () => {
    expect(interpretarHerancaBooleana('HERDA')).toEqual({ ok: true, valor: undefined })
    expect(interpretarHerancaBooleana('SIM')).toEqual({ ok: true, valor: true })
    expect(interpretarHerancaBooleana('NAO')).toEqual({ ok: true, valor: false })
  })

  it('recusa qualquer outra coisa', () => {
    // Sem esta guarda, um valor inesperado cairia no ramo do `false` e
    // proibiria a reserva da série inteira sem ninguém pedir.
    expect(interpretarHerancaBooleana('talvez').ok).toBe(false)
    expect(interpretarHerancaBooleana('').ok).toBe(false)
  })
})

describe('montarConfiguracaoDaEscola', () => {
  it('monta a configuração a partir do texto do formulário', () => {
    const montada = montarConfiguracaoDaEscola(FORMULARIO_DA_ESCOLA)

    expect(montada).toEqual({ ok: true, config: DA_ESCOLA })
  })

  it('lê `alunoPodeReservar` como NÃO sem confundir com herança', () => {
    const montada = montarConfiguracaoDaEscola({
      ...FORMULARIO_DA_ESCOLA,
      alunoPodeReservar: 'NAO',
    })

    expect(montada.ok).toBe(true)
    if (montada.ok) expect(montada.config.alunoPodeReservar).toBe(false)
  })

  it('junta os erros de leitura de todos os campos, campo por campo', () => {
    const montada = montarConfiguracaoDaEscola({
      ...FORMULARIO_DA_ESCOLA,
      prazoEmDias: 'abc',
      limiteSimultaneo: '',
    })

    expect(montada.ok).toBe(false)
    if (!montada.ok) {
      expect(Object.keys(montada.porCampo).sort()).toEqual(['limiteSimultaneo', 'prazoEmDias'])
    }
  })

  it('NÃO valida faixa: quem diz que o limite 0 é inválido é o serviço', () => {
    // Duas cópias da regra de faixa divergem na primeira correção feita em
    // apenas uma. Aqui só se lê o número; o teto e o piso são do serviço,
    // e é a mensagem dele que a tela mostra.
    const montada = montarConfiguracaoDaEscola({
      ...FORMULARIO_DA_ESCOLA,
      limiteSimultaneo: '0',
      prazoEmDias: '9999',
    })

    expect(montada.ok).toBe(true)
    if (montada.ok) {
      expect(montada.config.limiteSimultaneo).toBe(0)
      expect(montada.config.prazoEmDias).toBe(9999)
    }
  })
})

describe('montarOverrideDeSerie', () => {
  it('inclui só os campos preenchidos', () => {
    const montada = montarOverrideDeSerie({
      ...FORMULARIO_DA_SERIE,
      limiteSimultaneo: '1',
      alunoPodeReservar: 'NAO',
    })

    expect(montada).toEqual({
      ok: true,
      override: { serie: '6º ano', limiteSimultaneo: 1, alunoPodeReservar: false },
    })
  })

  it('formulário todo vazio devolve override sem campo nenhum', () => {
    // E é o SERVIÇO que recusa isso, com a frase dele: um override vazio
    // aparece configurado na tela e não tem efeito.
    const montada = montarOverrideDeSerie(FORMULARIO_DA_SERIE)

    expect(montada).toEqual({ ok: true, override: { serie: '6º ano' } })
  })

  it('passa a série adiante sem julgar, porque a recusa é do serviço', () => {
    const montada = montarOverrideDeSerie({ ...FORMULARIO_DA_SERIE, serie: '  ' })

    expect(montada.ok).toBe(true)
    if (montada.ok) expect(montada.override.serie).toBe('  ')
  })

  it('recusa campo preenchido que não é inteiro', () => {
    const montada = montarOverrideDeSerie({ ...FORMULARIO_DA_SERIE, prazoEmDias: 'sete' })

    expect(montada.ok).toBe(false)
    if (!montada.ok) expect(Object.keys(montada.porCampo)).toEqual(['prazoEmDias'])
  })
})
