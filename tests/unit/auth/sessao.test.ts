import { describe, it, expect, beforeAll } from 'vitest'
import { assinarSessao, verificarSessao } from '@/core/auth/sessao'
import type { Principal } from '@/core/auth/principal'

const STAFF: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: ['obra:ver', 'emprestimo:criar'],
}

const ALUNO: Principal = {
  reino: 'ALUNO',
  id: 'alu_1',
  escolaId: 'esc_1',
  nome: 'Ana Souza',
  matricula: '2024001',
}

beforeAll(() => {
  process.env.SESSION_SECRET = 'segredo-de-teste-com-tamanho-suficiente-0123456789'
})

describe('sessão', () => {
  it('ida e volta preserva o principal de staff', async () => {
    const token = await assinarSessao(STAFF)
    const lido = await verificarSessao(token)

    expect(lido).toEqual(STAFF)
  })

  it('ida e volta preserva o principal de aluno', async () => {
    const token = await assinarSessao(ALUNO)
    const lido = await verificarSessao(token)

    expect(lido).toEqual(ALUNO)
  })

  it('rejeita token adulterado', async () => {
    const token = await assinarSessao(STAFF)
    const adulterado = `${token.slice(0, -3)}xyz`

    expect(await verificarSessao(adulterado)).toBeNull()
  })

  it('rejeita token assinado com outro segredo', async () => {
    const token = await assinarSessao(STAFF)
    process.env.SESSION_SECRET = 'um-segredo-completamente-diferente-987654321'

    expect(await verificarSessao(token)).toBeNull()

    process.env.SESSION_SECRET = 'segredo-de-teste-com-tamanho-suficiente-0123456789'
  })

  it('rejeita lixo', async () => {
    expect(await verificarSessao('nem-parece-um-jwt')).toBeNull()
    expect(await verificarSessao('')).toBeNull()
  })

  it('rejeita payload que não bate com o formato esperado', async () => {
    // Um token válido criptograficamente mas com corpo estranho não pode
    // virar um Principal — senão o RBAC recebe permissões inventadas.
    const { SignJWT } = await import('jose')
    const segredo = new TextEncoder().encode(process.env.SESSION_SECRET)
    const token = await new SignJWT({ reino: 'STAFF', id: 'x' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(segredo)

    expect(await verificarSessao(token)).toBeNull()
  })
})
