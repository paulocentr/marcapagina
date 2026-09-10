import { describe, it, expect } from 'vitest'
import { normalizarParaBusca } from '@/core/texto/normalizar'

describe('normalizarParaBusca', () => {
  it('ignora acento, caixa e espaço repetido', () => {
    expect(normalizarParaBusca('  Memórias   PÓSTUMAS ')).toBe('memorias postumas')
  })

  it('é a mesma chave para grafias que só diferem em acento', () => {
    expect(normalizarParaBusca('Grande Sertão: Veredas')).toBe(
      normalizarParaBusca('grande sertao: veredas'),
    )
  })

  it('preserva pontuação, que faz parte do título', () => {
    // "Vidas Secas" e "Vidas, Secas" são coisas diferentes; apagar
    // pontuação faria títulos distintos colidirem na busca.
    expect(normalizarParaBusca('Quem Tem Medo?')).toBe('quem tem medo?')
  })

  it('preserva letras não latinas em vez de apagá-las', () => {
    // Um regex ganancioso transformaria o título inteiro em string vazia.
    expect(normalizarParaBusca('村上 春樹')).not.toBe('')
    expect(normalizarParaBusca('Александр')).not.toBe('')
  })

  it('devolve string vazia para entrada só de espaço', () => {
    expect(normalizarParaBusca('   ')).toBe('')
  })

  it('trata ç como c', () => {
    expect(normalizarParaBusca('Coração')).toBe('coracao')
  })
})
