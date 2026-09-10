import { describe, it, expect } from 'vitest'
import { intervaloDoDiaDaEscola } from '@/modules/circulacao/prazo'
import {
  chipDoLivroEmMaos,
  formatarDataUtc,
  formatarDiaUtc,
  formatarHoraDaEscola,
  fraseDoAtrasoNaTira,
  fraseDoCorte,
  primeiroNome,
  rotuloDoMovimento,
  situacaoNaPrateleira,
  textoDaLocalizacao,
} from '@/app/painel/balcao/trilha'

/**
 * A trilha lateral do balcão, provada sem React e sem banco.
 *
 * Tudo que a trilha DIZ sai daqui: a hora do movimento, a frase do
 * atraso, o chip do livro em mãos, o destaque da prateleira e a frase
 * que confessa que a tira foi cortada. É o que permite provar em
 * milissegundos as duas coisas que a trilha existe para não errar —
 * contar o dia inteiro e nunca contradizer a lista ao lado.
 */

describe('datas de coluna @db.Date saem em UTC', () => {
  // A armadilha: `previstaPara` e `retirarAte` são @db.Date, que chega
  // como meia-noite UTC. Formatá-las no fuso da escola mostraria o DIA
  // ANTERIOR (meia-noite UTC é 21h do dia anterior em São Paulo) — e a
  // operadora leria "venceu 18/09" de um livro que vence 19/09.
  it('formatarDataUtc escreve como a escola escreve', () => {
    expect(formatarDataUtc(new Date('2026-09-24T00:00:00.000Z'))).toBe('24/09/2026')
  })

  it('formatarDiaUtc corta o ano, e não o dia', () => {
    expect(formatarDiaUtc(new Date('2026-09-19T00:00:00.000Z'))).toBe('19/09')
  })

  it('a meia-noite UTC não escorrega para o dia anterior', () => {
    expect(formatarDiaUtc(new Date('2026-01-01T00:00:00.000Z'))).toBe('01/01')
  })
})

describe('a hora do movimento sai no fuso da ESCOLA', () => {
  it('17:51 UTC é 14:51 no balcão', () => {
    expect(formatarHoraDaEscola(new Date('2026-09-10T17:51:00.000Z'))).toBe('14:51')
  })

  it('escreve a hora com dois dígitos', () => {
    expect(formatarHoraDaEscola(new Date('2026-09-10T12:04:00.000Z'))).toBe('09:04')
  })

  // ESTE é o teste que importa: o fuso está escrito duas vezes no
  // projeto — em prazo.ts, que decide o que é "hoje" para os contadores,
  // e aqui, que escreve a hora na tira. Se os dois divergirem, a tira
  // mostra movimento de 22h num dia que o contador já virou. A
  // meia-noite da escola formatada por esta função é 00:00, e só é 00:00
  // se os dois fusos forem o mesmo.
  it('concorda com o fuso de prazo.ts, que decide o dia da escola', () => {
    const { inicio, fim } = intervaloDoDiaDaEscola(new Date('2026-09-10T17:51:00.000Z'))
    expect(formatarHoraDaEscola(inicio)).toBe('00:00')
    expect(formatarHoraDaEscola(fim)).toBe('00:00')
  })
})

describe('rotuloDoMovimento', () => {
  it('a retirada é "saiu"', () => {
    expect(rotuloDoMovimento('RETIRADA')).toEqual({ palavra: 'saiu', tom: 'certo' })
  })

  it('a devolução é "voltou"', () => {
    expect(rotuloDoMovimento('DEVOLUCAO')).toEqual({ palavra: 'voltou', tom: 'neutro' })
  })
})

describe('fraseDoAtrasoNaTira', () => {
  it('a retirada não fala de atraso', () => {
    // `null`, e não "em dia": o livro acabou de sair e não existe atraso
    // a informar. "Em dia" ali seria uma afirmação sobre um evento que
    // não é devolução.
    expect(fraseDoAtrasoNaTira(null)).toBeNull()
  })

  it('devolução sem atraso é "em dia", em tom neutro', () => {
    expect(fraseDoAtrasoNaTira(0)).toEqual({ palavra: 'em dia', tom: 'neutro' })
  })

  it('um dia de atraso não vira "1 dias"', () => {
    expect(fraseDoAtrasoNaTira(1)).toEqual({ palavra: '1 dia de atraso', tom: 'atencao' })
  })

  it('oito dias de atraso pedem atenção', () => {
    expect(fraseDoAtrasoNaTira(8)).toEqual({ palavra: '8 dias de atraso', tom: 'atencao' })
  })

  it('recusa atraso negativo em vez de escrever "-2 dias de atraso"', () => {
    expect(() => fraseDoAtrasoNaTira(-2)).toThrow(/atraso/i)
  })

  it('recusa atraso quebrado', () => {
    expect(() => fraseDoAtrasoNaTira(1.5)).toThrow(/atraso/i)
  })
})

describe('fraseDoCorte — a tira confessa que foi cortada', () => {
  it('diz quantos de quantos quando a tira não cabe', () => {
    // Sem esta frase, "27 devoluções" no cabeçalho ao lado de cinco
    // linhas faz a coordenação ler o dia como um quinto do que foi.
    expect(fraseDoCorte(5, 27)).toBe('mostrando os 5 mais recentes de 27')
  })

  it('cala quando a tira mostra o dia inteiro', () => {
    expect(fraseDoCorte(5, 5)).toBeNull()
    expect(fraseDoCorte(0, 0)).toBeNull()
  })

  it('recusa mostrar mais do que existe', () => {
    expect(() => fraseDoCorte(9, 3)).toThrow(/contagem/i)
  })

  it('recusa contagem quebrada', () => {
    expect(() => fraseDoCorte(1.5, 3)).toThrow(/contagem/i)
  })
})

describe('chipDoLivroEmMaos', () => {
  it('o livro atrasado sai com a palavra do catálogo e os dias', () => {
    expect(
      chipDoLivroEmMaos({ atrasado: true, diasDeAtraso: 8, previstaPara: '02/09' }),
    ).toEqual({ estado: 'ATRASADO', complemento: '· 8 dias' })
  })

  it('o livro em dia sai com a data de devolução', () => {
    expect(
      chipDoLivroEmMaos({ atrasado: false, diasDeAtraso: 0, previstaPara: '19/09' }),
    ).toEqual({ estado: 'EM_DIA', complemento: '· até 19/09' })
  })

  it('um dia de atraso não vira "1 dias"', () => {
    expect(
      chipDoLivroEmMaos({ atrasado: true, diasDeAtraso: 1, previstaPara: '09/09' }),
    ).toEqual({ estado: 'ATRASADO', complemento: '· 1 dia' })
  })

  // O serviço deriva `atrasado` de `diasDeAtraso > 0`. Se as duas metades
  // chegarem discordando, alguém as calculou por caminhos diferentes — e
  // a tela pintaria de vermelho quem cumpriu o prazo, ou de verde quem
  // não cumpriu. Falhar alto é melhor que escolher uma das duas.
  it('recusa dizer atrasado sem dia de atraso', () => {
    expect(() =>
      chipDoLivroEmMaos({ atrasado: true, diasDeAtraso: 0, previstaPara: '19/09' }),
    ).toThrow(/atraso/i)
  })

  it('recusa dizer em dia com dias de atraso', () => {
    expect(() =>
      chipDoLivroEmMaos({ atrasado: false, diasDeAtraso: 3, previstaPara: '19/09' }),
    ).toThrow(/atraso/i)
  })
})

describe('situacaoNaPrateleira', () => {
  it('o exemplar com prazo em curso mostra até quando, com a fita', () => {
    expect(
      situacaoNaPrateleira({
        vencido: false,
        venceHoje: false,
        diasParaRetirar: 3,
        retirarAte: '13/09',
      }),
    ).toEqual({
      palavra: 'até 13/09',
      icone: 'fita',
      tom: 'fita',
      frase: '3 dias para retirar',
    })
  })

  it('o que vence hoje avisa que volta à estante amanhã', () => {
    expect(
      situacaoNaPrateleira({
        vencido: false,
        venceHoje: true,
        diasParaRetirar: 0,
        retirarAte: '10/09',
      }),
    ).toEqual({
      palavra: 'vence hoje',
      icone: 'relogio',
      tom: 'atencao',
      frase: 'volta à estante amanhã',
    })
  })

  it('o vencido aparece — não desaparece porque o cron falhou', () => {
    // Se o job de expiração não rodou de madrugada, o exemplar continua
    // separado com o prazo estourado. Esconder isso deixaria o livro
    // parado atrás do balcão sem ninguém saber por quê.
    const situacao = situacaoNaPrateleira({
      vencido: true,
      venceHoje: false,
      diasParaRetirar: -2,
      retirarAte: '08/09',
    })

    expect(situacao.palavra).toBe('retirada vencida')
    expect(situacao.tom).toBe('alerta')
    expect(situacao.icone).toBe('aviso')
    expect(situacao.frase).toContain('08/09')
  })

  it('recusa vencer hoje e estar vencido ao mesmo tempo', () => {
    expect(() =>
      situacaoNaPrateleira({
        vencido: true,
        venceHoje: true,
        diasParaRetirar: 0,
        retirarAte: '10/09',
      }),
    ).toThrow(/prazo/i)
  })

  it('recusa "vence hoje" com dias que dizem outra coisa', () => {
    expect(() =>
      situacaoNaPrateleira({
        vencido: false,
        venceHoje: true,
        diasParaRetirar: 4,
        retirarAte: '14/09',
      }),
    ).toThrow(/prazo/i)
  })

  it('recusa "vencido" com dias que dizem outra coisa', () => {
    expect(() =>
      situacaoNaPrateleira({
        vencido: true,
        venceHoje: false,
        diasParaRetirar: 2,
        retirarAte: '12/09',
      }),
    ).toThrow(/prazo/i)
  })
})

describe('textoDaLocalizacao', () => {
  // O serviço devolve os quatro campos separados de propósito: quem sabe
  // se escreve "estante 3 · prateleira 2" ou só "3" é a tela.
  it('junta o que existe, na ordem em que se procura na sala', () => {
    expect(
      textoDaLocalizacao({
        nome: 'Literatura',
        corredor: 'A',
        estante: '4',
        prateleira: '2',
      }),
    ).toBe('Literatura · corredor A · estante 4 · prateleira 2')
  })

  it('cala sobre o que a localização não diz', () => {
    expect(
      textoDaLocalizacao({ nome: 'Reserva técnica', corredor: null, estante: null, prateleira: null }),
    ).toBe('Reserva técnica')
  })

  it('não escreve "estante null" quando falta o meio', () => {
    expect(
      textoDaLocalizacao({ nome: 'Infantil', corredor: null, estante: '1', prateleira: null }),
    ).toBe('Infantil · estante 1')
  })

  it('devolve null quando o exemplar não tem localização', () => {
    // Exemplar sem localização é comum durante a catalogação. Escrever
    // "sem localização" como se fosse um lugar mandaria a operadora
    // procurar uma estante que não existe.
    expect(textoDaLocalizacao(null)).toBeNull()
  })

  it('ignora campo que veio só com espaço', () => {
    expect(
      textoDaLocalizacao({ nome: 'Infantil', corredor: '  ', estante: '1', prateleira: '' }),
    ).toBe('Infantil · estante 1')
  })
})

describe('primeiroNome', () => {
  it('devolve o primeiro nome para o título da trilha', () => {
    expect(primeiroNome('Ana Beatriz Rocha')).toBe('Ana')
  })

  it('aguenta espaço a mais', () => {
    expect(primeiroNome('  Pedro   Henrique Lima ')).toBe('Pedro')
  })

  it('devolve null quando não há nome — não inventa inicial', () => {
    expect(primeiroNome('   ')).toBeNull()
  })
})
