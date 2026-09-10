import { describe, it, expect } from 'vitest'
import { TODAS_AS_PERMISSOES } from '@/core/rbac/permissoes'
import { PAPEIS_DE_FABRICA } from '@/core/rbac/papeis'

describe('papéis de fábrica', () => {
  it('só concede permissões que existem no catálogo', () => {
    const catalogo = new Set<string>(TODAS_AS_PERMISSOES)

    for (const [papel, definicao] of Object.entries(PAPEIS_DE_FABRICA)) {
      for (const permissao of definicao.permissoes) {
        expect(catalogo.has(permissao), `${papel} concede "${permissao}", que não existe`).toBe(true)
      }
    }
  })

  it('COORDENACAO tem tudo menos o que é do dono do sistema', () => {
    const coordenacao = new Set<string>(PAPEIS_DE_FABRICA.COORDENACAO.permissoes)
    const esperadas = TODAS_AS_PERMISSOES.filter((p) => !p.startsWith('escola:'))

    for (const p of esperadas) {
      expect(coordenacao.has(p), `COORDENACAO deveria ter "${p}"`).toBe(true)
    }
    expect(coordenacao.has('escola:gerenciar')).toBe(false)
  })

  it('MONITOR empresta e devolve, mas não edita, exclui nem força', () => {
    const monitor = new Set<string>(PAPEIS_DE_FABRICA.MONITOR.permissoes)

    expect(monitor.has('emprestimo:criar')).toBe(true)
    expect(monitor.has('emprestimo:devolver')).toBe(true)
    expect(monitor.has('emprestimo:forcar')).toBe(false)
    expect(monitor.has('obra:excluir')).toBe(false)
    expect(monitor.has('aluno:editar')).toBe(false)
    expect(monitor.has('usuario:gerenciar')).toBe(false)
    expect(monitor.has('config:editar')).toBe(false)
  })

  it('DIRECAO lê tudo mas não opera o balcão', () => {
    const direcao = new Set<string>(PAPEIS_DE_FABRICA.DIRECAO.permissoes)

    expect(direcao.has('relatorio:ver')).toBe(true)
    expect(direcao.has('obra:ver')).toBe(true)
    expect(direcao.has('emprestimo:criar')).toBe(false)
    expect(direcao.has('emprestimo:devolver')).toBe(false)
  })

  it('ALUNO não tem nenhuma permissão de staff', () => {
    expect(PAPEIS_DE_FABRICA.ALUNO.permissoes).toHaveLength(0)
  })

  it('não há permissão duplicada dentro de um papel', () => {
    for (const [papel, definicao] of Object.entries(PAPEIS_DE_FABRICA)) {
      const unicas = new Set<string>(definicao.permissoes)
      expect(unicas.size, `${papel} tem permissão repetida`).toBe(definicao.permissoes.length)
    }
  })
})
