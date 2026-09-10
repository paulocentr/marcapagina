import { describe, it, expect } from 'vitest'
import { idadeTipicaDaSerie } from '@/modules/carrinho/faixa-etaria'
import {
  SERIES_VALIDAS,
  SerieInvalidaError,
  exigirSerie,
  normalizarSerie,
  rotuloDaSerie,
} from '@/modules/leitores/serie'

/**
 * Por que este arquivo existe, e por que ele importa de `faixa-etaria`.
 *
 * `Turma.serie` é lido por DOIS consumidores que interpretam o texto:
 * `idadeTipicaDaSerie` (filtro de faixa etária do Carrinho) e o override
 * por série da configuração de circulação, que compara a string por
 * igualdade exata. Aceitar série em formato livre no cadastro não quebra
 * nada na hora — quebra depois, nos dois, em silêncio: o Carrinho para de
 * filtrar e o override da coordenação deixa de casar.
 *
 * Então o teste não confere o formato contra uma lista escrita à mão
 * aqui: ele confere contra o CONSUMIDOR de verdade. Se alguém mexer no
 * regex de `faixa-etaria.ts`, este teste reprova.
 */
describe('normalizarSerie', () => {
  it('aceita as nove séries do Fundamental', () => {
    for (const digito of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(normalizarSerie(digito)).toBe(digito)
    }
  })

  it('aceita as três séries do Médio, em caixa alta', () => {
    expect(normalizarSerie('1EM')).toBe('1EM')
    expect(normalizarSerie('2EM')).toBe('2EM')
    expect(normalizarSerie('3EM')).toBe('3EM')
  })

  it('normaliza o que a operadora digita: minúscula, espaço e ordinal', () => {
    // A tela oferece um `select`, mas Server Action recebe string crua —
    // e a secretaria escreve "5º" e "1º EM" porque é assim que a escola
    // escreve. Recusar isso mandaria a operadora adivinhar a grafia.
    expect(normalizarSerie(' 5 ')).toBe('5')
    expect(normalizarSerie('5º')).toBe('5')
    expect(normalizarSerie('5°')).toBe('5')
    expect(normalizarSerie('1em')).toBe('1EM')
    expect(normalizarSerie('1º EM')).toBe('1EM')
    expect(normalizarSerie('3 em')).toBe('3EM')
  })

  it('recusa o que os consumidores não sabem ler', () => {
    // Cada um destes passaria por um `z.string().min(1)` e viraria turma
    // cadastrada cuja série o Carrinho e a configuração ignoram.
    for (const invalida of [
      '',
      '   ',
      '0',
      '10',
      '4EM',
      '0EM',
      'EM',
      'Maternal',
      '5A',
      '5º A',
      'EJA',
      '2026',
      'quinto',
    ]) {
      expect(normalizarSerie(invalida), `"${invalida}" deveria ser recusada`).toBeNull()
    }
  })

  it('TODA série que ela aceita é entendida por idadeTipicaDaSerie', () => {
    // Esta é a invariante que importa. Uma série aceita no cadastro e não
    // entendida pelo filtro de faixa etária é uma turma para a qual o
    // Carrinho passa a sugerir livro de qualquer idade, sem erro nenhum
    // na tela.
    for (const serie of SERIES_VALIDAS) {
      expect(idadeTipicaDaSerie(serie), `idadeTipicaDaSerie não entende "${serie}"`).not.toBeNull()
    }
  })

  it('o normalizado de uma entrada torta também é entendido pelo consumidor', () => {
    // Não basta a lista canônica passar: o que a normalização DEVOLVE é o
    // que vai para o banco, e é ele que o Carrinho vai ler.
    for (const bruta of ['5º', '1º EM', ' 3 em ', '9']) {
      const normalizada = normalizarSerie(bruta)
      expect(normalizada).not.toBeNull()
      expect(idadeTipicaDaSerie(normalizada)).not.toBeNull()
    }
  })

  it('SERIES_VALIDAS tem as doze séries que a escola atende, em ordem escolar', () => {
    // Fundamental 1–9 e Médio 1–3: a escola atende do 1º ano ao 3º do
    // Médio (CLAUDE.md). A ordem é a que a tela imprime no `select`.
    expect([...SERIES_VALIDAS]).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '1EM',
      '2EM',
      '3EM',
    ])
  })
})

describe('exigirSerie', () => {
  it('devolve a série canônica quando entende', () => {
    expect(exigirSerie('1º em')).toBe('1EM')
  })

  it('recusa com mensagem que diz o que serve', () => {
    // A mensagem tem de ensinar o formato: "série inválida" sozinho manda
    // a operadora tentar de novo no escuro.
    expect(() => exigirSerie('Maternal')).toThrow(SerieInvalidaError)
    try {
      exigirSerie('Maternal')
    } catch (erro) {
      expect((erro as Error).message).toContain('Maternal')
      expect((erro as Error).message).toContain('1EM')
    }
  })
})

describe('rotuloDaSerie', () => {
  it('escreve a série como a escola fala', () => {
    expect(rotuloDaSerie('5')).toBe('5º ano do Fundamental')
    expect(rotuloDaSerie('1EM')).toBe('1º ano do Médio')
    expect(rotuloDaSerie('3EM')).toBe('3º ano do Médio')
  })

  it('devolve a própria série quando não conhece, em vez de mentir', () => {
    // Turma antiga com série fora do formato existe no banco de quem
    // importou planilha. A tela mostra o texto cru — esconder a linha
    // faria a turma desaparecer da lista sem ninguém saber por quê.
    expect(rotuloDaSerie('EJA')).toBe('EJA')
  })
})
