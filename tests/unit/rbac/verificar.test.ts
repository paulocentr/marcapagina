import { describe, it, expect } from 'vitest'
import {
  temPermissao,
  exigirPermissao,
  exigirQualquerPermissao,
} from '@/core/rbac/verificar'
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

describe('exigirQualquerPermissao', () => {
  // Existe para ações que são passo interno de mais de um fluxo. Cadastrar
  // um autor acontece tanto ao criar obra quanto ao editar: exigir só
  // 'obra:criar' impediria quem tem apenas 'obra:editar' de corrigir a
  // autoria de uma ficha — uma recusa que ninguém entenderia.
  it('passa quando o principal tem UMA das permissões', () => {
    expect(() => exigirQualquerPermissao(STAFF, ['obra:criar', 'emprestimo:criar'])).not.toThrow()
  })

  it('passa quando tem mais de uma', () => {
    expect(() =>
      exigirQualquerPermissao(STAFF, ['emprestimo:criar', 'emprestimo:devolver']),
    ).not.toThrow()
  })

  it('lança SemPermissaoError quando não tem nenhuma', () => {
    expect(() => exigirQualquerPermissao(STAFF, ['obra:criar', 'obra:editar'])).toThrow(
      SemPermissaoError,
    )
  })

  it('o erro nomeia a primeira permissão exigida, para a mensagem não sair vazia', () => {
    try {
      exigirQualquerPermissao(STAFF, ['obra:criar', 'obra:editar'])
      throw new Error('deveria ter lançado')
    } catch (erro) {
      expect((erro as SemPermissaoError).permissao).toBe('obra:criar')
    }
  })

  it('lança NaoAutenticadoError quando não há principal', () => {
    expect(() => exigirQualquerPermissao(null, ['obra:ver'])).toThrow(NaoAutenticadoError)
  })

  it('lança SemPermissaoError para aluno', () => {
    expect(() => exigirQualquerPermissao(ALUNO, ['obra:ver'])).toThrow(SemPermissaoError)
  })

  it('lista vazia é erro de programação, não passe livre', () => {
    // Uma lista vazia significaria "qualquer uma de nenhuma", que só pode
    // ser bug. Deixar passar transformaria o engano em autorização.
    expect(() => exigirQualquerPermissao(STAFF, [])).toThrow()
  })
})
