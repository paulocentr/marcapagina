import { describe, it, expect } from 'vitest'
import {
  idadeMinimaDaFaixa,
  idadeTipicaDaSerie,
  obraCabeNaTurma,
} from '@/modules/carrinho/faixa-etaria'

describe('idadeTipicaDaSerie', () => {
  it('1º ano do Fundamental é a criança de 6 anos', () => {
    expect(idadeTipicaDaSerie('1')).toBe(6)
  })

  it('9º ano do Fundamental é o adolescente de 14', () => {
    expect(idadeTipicaDaSerie('9')).toBe(14)
  })

  it('1º do Médio continua de onde o 9º parou', () => {
    // A escola vai do 1º ano ao 3º do Médio numa faixa contínua. Um salto
    // ou uma sobreposição aqui faria a turma de 1EM receber sugestão de
    // livro infantil ou perder o juvenil que o 9º já lia.
    expect(idadeTipicaDaSerie('1EM')).toBe(15)
    expect(idadeTipicaDaSerie('3EM')).toBe(17)
  })

  it('aceita a série em minúsculas e com espaço, como vem digitada', () => {
    expect(idadeTipicaDaSerie(' 2em ')).toBe(16)
  })

  it('série que não reconhece devolve null, nunca um número chutado', () => {
    // Devolver um número por omissão faria o filtro de faixa etária
    // esconder livros com base num palpite, sem ninguém perceber.
    expect(idadeTipicaDaSerie('Maternal')).toBeNull()
    expect(idadeTipicaDaSerie('')).toBeNull()
    expect(idadeTipicaDaSerie(null)).toBeNull()
  })

  it('recusa série fora do intervalo que a escola atende', () => {
    expect(idadeTipicaDaSerie('0')).toBeNull()
    expect(idadeTipicaDaSerie('12')).toBeNull()
    expect(idadeTipicaDaSerie('4EM')).toBeNull()
  })
})

describe('idadeMinimaDaFaixa', () => {
  it('lê o formato "10+" que o catálogo usa', () => {
    expect(idadeMinimaDaFaixa('10+')).toBe(10)
  })

  it('lê "12 anos" e "a partir de 12 anos"', () => {
    expect(idadeMinimaDaFaixa('12 anos')).toBe(12)
    expect(idadeMinimaDaFaixa('a partir de 12 anos')).toBe(12)
  })

  it('num intervalo, a idade mínima é a ponta de baixo', () => {
    expect(idadeMinimaDaFaixa('9 a 12 anos')).toBe(9)
  })

  it('rótulo sem número nenhum é "não sei", não zero', () => {
    expect(idadeMinimaDaFaixa('Livre')).toBeNull()
    expect(idadeMinimaDaFaixa('Infantojuvenil')).toBeNull()
    expect(idadeMinimaDaFaixa('')).toBeNull()
    expect(idadeMinimaDaFaixa(null)).toBeNull()
  })

  it('número implausível para idade é ignorado', () => {
    // O campo é texto livre e alguém vai digitar um ano ali. Aceitar 2020
    // como idade mínima esconderia o acervo INTEIRO de todas as turmas, e
    // a operadora veria a sugestão vir vazia sem nenhuma pista do motivo.
    expect(idadeMinimaDaFaixa('Coleção 2020')).toBeNull()
    expect(idadeMinimaDaFaixa('99')).toBeNull()
  })
})

describe('obraCabeNaTurma', () => {
  it('livro de 14+ não vai para a turma do 2º ano', () => {
    expect(obraCabeNaTurma('14+', '2')).toBe(false)
  })

  it('livro de 10+ vai para a turma do 5º ano', () => {
    expect(obraCabeNaTurma('10+', '5')).toBe(true)
  })

  it('a idade da turma na borda ainda cabe', () => {
    // 5º ano são 10 anos. Recusar "10+" ali seria errar por um e tirar da
    // sugestão exatamente o livro escrito para aquela idade.
    expect(obraCabeNaTurma('10+', '5')).toBe(true)
  })

  it('livro fácil demais continua cabendo', () => {
    // O filtro é de UM lado só: proteger o aluno de conteúdo acima da
    // idade. Esconder o livro fácil apagaria da sugestão um título que o
    // aluno pediu com o próprio nome — e o carrinho existe para atender
    // pedidos, não para julgar gosto.
    expect(obraCabeNaTurma('6+', '3EM')).toBe(true)
  })

  it('faixa desconhecida não some da sugestão', () => {
    // A maioria do acervo nacional vem das APIs sem faixa etária. Filtrar
    // pelo desconhecido esvaziaria a sugestão e a operadora concluiria
    // que ninguém pediu nada.
    expect(obraCabeNaTurma(null, '2')).toBe(true)
    expect(obraCabeNaTurma('Livre', '2')).toBe(true)
  })

  it('turma sem série reconhecida não filtra nada', () => {
    expect(obraCabeNaTurma('14+', null)).toBe(true)
    expect(obraCabeNaTurma('14+', 'Multisseriada')).toBe(true)
  })
})
