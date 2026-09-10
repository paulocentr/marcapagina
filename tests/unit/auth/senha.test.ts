import { describe, it, expect } from 'vitest'
import { gerarHash, verificarSenha } from '@/core/auth/senha'

describe('hash de senha', () => {
  it('aceita a senha correta', async () => {
    const hash = await gerarHash('SenhaDaCoordenacao#2026')
    expect(await verificarSenha('SenhaDaCoordenacao#2026', hash)).toBe(true)
  })

  it('rejeita senha errada', async () => {
    const hash = await gerarHash('SenhaDaCoordenacao#2026')
    expect(await verificarSenha('senhadacoordenacao#2026', hash)).toBe(false)
  })

  it('gera hashes diferentes para a mesma senha', async () => {
    const [a, b] = await Promise.all([gerarHash('mesma-senha'), gerarHash('mesma-senha')])
    expect(a).not.toBe(b)
  })

  it('produz um hash Argon2id', async () => {
    const hash = await gerarHash('qualquer-uma')
    expect(hash.startsWith('$argon2id$')).toBe(true)
  })

  it('retorna false em hash corrompido, sem lançar', async () => {
    // Um hash inválido no banco não pode derrubar o login com exceção
    // não tratada: tem que se comportar como senha errada.
    expect(await verificarSenha('qualquer', 'lixo-que-nao-e-hash')).toBe(false)
  })
})
