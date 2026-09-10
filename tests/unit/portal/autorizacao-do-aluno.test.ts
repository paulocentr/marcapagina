import { describe, it, expect } from 'vitest'
import {
  exigirSessaoDeAluno,
  exigirMeuProprioDado,
  DadoDeOutroLeitorError,
  SessaoNaoEhDeAlunoError,
} from '@/modules/portal/autorizacao-do-aluno'
import { NaoAutenticadoError } from '@/core/errors'
import type { PrincipalAluno, PrincipalStaff } from '@/core/auth/principal'

const ANA: PrincipalAluno = {
  reino: 'ALUNO',
  id: 'aluno_ana',
  escolaId: 'esc_1',
  nome: 'Ana Souza',
  matricula: '2024001',
}

const COORD: PrincipalStaff = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: ['aluno:ver', 'emprestimo:renovar'],
}

describe('exigirSessaoDeAluno', () => {
  it('aceita sessão de aluno', () => {
    expect(() => exigirSessaoDeAluno(ANA)).not.toThrow()
  })

  it('sem sessão pede login, e não recusa', () => {
    // Os dois casos são diferentes para quem chama: sem sessão redireciona
    // para o login; sessão errada mostra recusa. Redirecionar quem já está
    // logado vira laço.
    expect(() => exigirSessaoDeAluno(null)).toThrow(NaoAutenticadoError)
  })

  it('sessão de equipe NÃO entra pelo portal, nem com todas as permissões', () => {
    // A equipe tem `aluno:ver` e enxerga qualquer ficha pelo painel. O
    // portal é outro caminho: aqui o escopo é o id da sessão, e uma
    // sessão de STAFF não tem id de aluno nenhum para escopar.
    expect(() => exigirSessaoDeAluno(COORD)).toThrow(SessaoNaoEhDeAlunoError)
  })
})

describe('exigirMeuProprioDado', () => {
  it('aceita o registro do próprio aluno da sessão', () => {
    expect(() => exigirMeuProprioDado(ANA, 'aluno_ana')).not.toThrow()
  })

  it('recusa o registro de outro aluno', () => {
    expect(() => exigirMeuProprioDado(ANA, 'aluno_bruno')).toThrow(DadoDeOutroLeitorError)
  })

  it('recusa registro sem aluno — empréstimo da equipe não é do aluno', () => {
    expect(() => exigirMeuProprioDado(ANA, null)).toThrow(DadoDeOutroLeitorError)
  })

  it('a mensagem não conta de quem era o dado', () => {
    // Nem o nome, nem o id do colega. A recusa não pode virar um oráculo
    // de "este id existe?" para quem experimenta ids na barra de endereço.
    try {
      exigirMeuProprioDado(ANA, 'aluno_bruno')
      expect.unreachable('devia ter recusado')
    } catch (erro) {
      expect(erro).toBeInstanceOf(DadoDeOutroLeitorError)
      expect((erro as Error).message).not.toContain('aluno_bruno')
    }
  })
})
