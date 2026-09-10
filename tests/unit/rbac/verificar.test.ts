import { describe, it, expect } from 'vitest'
import { temPermissao, exigirPermissao } from '@/core/rbac/verificar'
import { SemPermissaoError, NaoAutenticadoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

const STAFF: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['emprestimo:criar', 'emprestimo:devolver'],
}

const ALUNO: Principal = {
  reino: 'ALUNO',
  id: 'alu_1',
  escolaId: 'esc_1',
  nome: 'Ana',
  matricula: '2024001',
}

describe('temPermissao', () => {
  it('reconhece permissão concedida', () => {
    expect(temPermissao(STAFF, 'emprestimo:criar')).toBe(true)
  })

  it('nega permissão não concedida', () => {
    expect(temPermissao(STAFF, 'emprestimo:forcar')).toBe(false)
  })

  it('nega para aluno, que não tem permissões de staff', () => {
    expect(temPermissao(ALUNO, 'emprestimo:criar')).toBe(false)
  })

  it('nega para não autenticado', () => {
    expect(temPermissao(null, 'obra:ver')).toBe(false)
  })
})

describe('exigirPermissao', () => {
  it('passa quando a permissão existe', () => {
    expect(() => exigirPermissao(STAFF, 'emprestimo:criar')).not.toThrow()
  })

  it('lança SemPermissaoError quando falta', () => {
    expect(() => exigirPermissao(STAFF, 'emprestimo:forcar')).toThrow(SemPermissaoError)
  })

  it('lança NaoAutenticadoError quando não há principal', () => {
    // Distinguir os dois importa: sem sessão manda pro login, sem
    // permissão mostra "você não pode" — mandar pro login quem já está
    // logado é um laço infinito.
    expect(() => exigirPermissao(null, 'obra:ver')).toThrow(NaoAutenticadoError)
  })

  it('lança SemPermissaoError para aluno tentando ação de staff', () => {
    expect(() => exigirPermissao(ALUNO, 'emprestimo:criar')).toThrow(SemPermissaoError)
  })

  it('o erro nomeia a permissão que faltou', () => {
    try {
      exigirPermissao(STAFF, 'config:editar')
      throw new Error('deveria ter lançado')
    } catch (erro) {
      expect(erro).toBeInstanceOf(SemPermissaoError)
      expect((erro as SemPermissaoError).permissao).toBe('config:editar')
    }
  })
})
