import { describe, it, expect } from 'vitest'
import { avaliarBloqueios, type EstadoDoLeitor } from '@/modules/circulacao/bloqueios'
import type { ConfiguracaoDaEscola } from '@/modules/circulacao/configuracao'

const CONFIG: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

const HOJE = new Date('2026-09-10T00:00:00.000Z')

const LIMPO: EstadoDoLeitor = {
  emprestimosAtivos: 0,
  emprestimosEmAtraso: 0,
  suspensaoAte: null,
  ativo: true,
}

describe('avaliarBloqueios', () => {
  it('leitor sem pendência nenhuma não tem bloqueio', () => {
    expect(avaliarBloqueios(LIMPO, CONFIG, HOJE)).toEqual([])
  })

  it('acusa suspensão ativa, dizendo até quando', () => {
    const bloqueios = avaliarBloqueios(
      { ...LIMPO, suspensaoAte: new Date('2026-09-20T00:00:00.000Z') },
      CONFIG,
      HOJE,
    )

    expect(bloqueios).toHaveLength(1)
    expect(bloqueios[0]?.tipo).toBe('SUSPENSO')
    // Sem a data, a operadora não sabe o que dizer ao aluno.
    expect(bloqueios[0]?.mensagem).toContain('20/09/2026')
  })

  it('suspensão que termina HOJE ainda bloqueia', () => {
    // A suspensão vale o dia inteiro; liberar na manhã do último dia
    // encurta a penalidade em um dia e desmoraliza a regra.
    const bloqueios = avaliarBloqueios({ ...LIMPO, suspensaoAte: HOJE }, CONFIG, HOJE)

    expect(bloqueios.map((b) => b.tipo)).toEqual(['SUSPENSO'])
  })

  it('suspensão vencida ontem NÃO bloqueia', () => {
    const bloqueios = avaliarBloqueios(
      { ...LIMPO, suspensaoAte: new Date('2026-09-09T00:00:00.000Z') },
      CONFIG,
      HOJE,
    )

    expect(bloqueios).toEqual([])
  })

  it('acusa limite de livros simultâneos atingido', () => {
    const bloqueios = avaliarBloqueios({ ...LIMPO, emprestimosAtivos: 3 }, CONFIG, HOJE)

    expect(bloqueios[0]?.tipo).toBe('NO_LIMITE')
    expect(bloqueios[0]?.mensagem).toContain('3')
  })

  it('abaixo do limite não bloqueia', () => {
    expect(avaliarBloqueios({ ...LIMPO, emprestimosAtivos: 2 }, CONFIG, HOJE)).toEqual([])
  })

  it('acima do limite também bloqueia', () => {
    // Pode acontecer depois de uma liberação forçada; o bloqueio tem de
    // continuar valendo para a próxima.
    const bloqueios = avaliarBloqueios({ ...LIMPO, emprestimosAtivos: 5 }, CONFIG, HOJE)

    expect(bloqueios.map((b) => b.tipo)).toContain('NO_LIMITE')
  })

  it('acusa empréstimo em atraso', () => {
    const bloqueios = avaliarBloqueios({ ...LIMPO, emprestimosEmAtraso: 1 }, CONFIG, HOJE)

    expect(bloqueios[0]?.tipo).toBe('COM_ATRASO')
  })

  it('acusa leitor desativado', () => {
    // Aluno desligado da escola não leva livro embora.
    const bloqueios = avaliarBloqueios({ ...LIMPO, ativo: false }, CONFIG, HOJE)

    expect(bloqueios[0]?.tipo).toBe('INATIVO')
  })

  it('ACUMULA os bloqueios em vez de parar no primeiro', () => {
    // A operadora precisa ver TUDO de uma vez: descobrir um bloqueio de
    // cada vez, com o aluno na frente do balcão, é humilhante para ele e
    // faz a fila parar três vezes.
    const bloqueios = avaliarBloqueios(
      {
        ativo: true,
        emprestimosAtivos: 3,
        emprestimosEmAtraso: 2,
        suspensaoAte: new Date('2026-09-20T00:00:00.000Z'),
      },
      CONFIG,
      HOJE,
    )

    expect(bloqueios.map((b) => b.tipo).sort()).toEqual(['COM_ATRASO', 'NO_LIMITE', 'SUSPENSO'])
  })

  it('respeita o limite da SÉRIE, não o da escola', () => {
    // É o override que faz o 2º ano levar um livro e o 9º levar cinco.
    const doSegundoAno = { ...CONFIG, limiteSimultaneo: 1 }

    expect(avaliarBloqueios({ ...LIMPO, emprestimosAtivos: 1 }, doSegundoAno, HOJE)).toHaveLength(
      1,
    )
    expect(avaliarBloqueios({ ...LIMPO, emprestimosAtivos: 1 }, CONFIG, HOJE)).toEqual([])
  })

  it('toda mensagem é escrita para a operadora ler em voz alta', () => {
    const bloqueios = avaliarBloqueios(
      { ativo: false, emprestimosAtivos: 9, emprestimosEmAtraso: 1, suspensaoAte: HOJE },
      CONFIG,
      HOJE,
    )

    for (const bloqueio of bloqueios) {
      expect(bloqueio.mensagem.length).toBeGreaterThan(10)
      expect(bloqueio.mensagem).not.toMatch(/undefined|NaN|\[object/)
    }
  })
})
