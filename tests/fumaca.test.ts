import { describe, it, expect } from 'vitest'
import { nomeDoProduto } from '@/core/produto'

describe('bootstrap', () => {
  it('expõe o nome do produto', () => {
    expect(nomeDoProduto()).toBe('Marca-Página')
  })
})
