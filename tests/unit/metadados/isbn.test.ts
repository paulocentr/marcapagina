import { describe, it, expect } from 'vitest'
import { normalizarIsbn } from '@/infra/metadados/isbn'

describe('normalizarIsbn', () => {
  it('aceita ISBN-13 sem hífen', () => {
    expect(normalizarIsbn('9788535902778')).toBe('9788535902778')
  })

  it('aceita com hífen e com espaço', () => {
    expect(normalizarIsbn('978-85-359-0277-8')).toBe('9788535902778')
    expect(normalizarIsbn(' 978 85 359 0277 8 ')).toBe('9788535902778')
  })

  it('converte ISBN-10 para 13', () => {
    expect(normalizarIsbn('8535902775')).toBe('9788535902778')
  })

  it('aceita o X do ISBN-10 e converte', () => {
    expect(normalizarIsbn('080442957X')).toBe('9780804429573')
    expect(normalizarIsbn('080442957x')).toBe('9780804429573')
  })

  it('recusa dígito verificador errado no ISBN-13', () => {
    // Um dígito trocado ao digitar viraria uma consulta que não acha nada,
    // e a operadora concluiria que "o sistema não tem esse livro" em vez
    // de "eu digitei errado" — e cadastraria manualmente uma duplicata.
    expect(normalizarIsbn('9788535902779')).toBeNull()
  })

  it('recusa dígito verificador errado no ISBN-10', () => {
    expect(normalizarIsbn('8535902776')).toBeNull()
  })

  it('recusa comprimento que não é 10 nem 13', () => {
    expect(normalizarIsbn('12345')).toBeNull()
    expect(normalizarIsbn('97885359027781')).toBeNull()
  })

  it('recusa texto que não é ISBN', () => {
    expect(normalizarIsbn('')).toBeNull()
    expect(normalizarIsbn('Dom Casmurro')).toBeNull()
    expect(normalizarIsbn('   ')).toBeNull()
  })

  it('recusa X fora da última posição', () => {
    expect(normalizarIsbn('X535902775')).toBeNull()
  })

  it('recusa prefixo que não é 978 nem 979 no ISBN-13', () => {
    // 13 dígitos com verificador certo mas prefixo inválido não é livro.
    expect(normalizarIsbn('1234567890128')).toBeNull()
  })
})
