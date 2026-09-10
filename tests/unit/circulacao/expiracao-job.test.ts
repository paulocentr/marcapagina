import { describe, it, expect, vi } from 'vitest'
import { expirarReservasDeTodasAsEscolas } from '@/modules/circulacao/expiracao.job'
import type { ResultadoDaExpiracao } from '@/modules/circulacao/reservas.service'

const HOJE = new Date('2026-09-10T03:00:00Z')

function semEfeito(parcial: Partial<ResultadoDaExpiracao> = {}): ResultadoDaExpiracao {
  return {
    expiradas: 0,
    passadasAdiante: 0,
    exemplaresLiberados: 0,
    falhas: [],
    ...parcial,
  }
}

const TRES_ESCOLAS = [
  { id: 'esc_1', slug: 'colegio-a' },
  { id: 'esc_2', slug: 'colegio-b' },
  { id: 'esc_3', slug: 'colegio-c' },
]

describe('expirarReservasDeTodasAsEscolas', () => {
  it('roda em TODAS as escolas ativas', async () => {
    const expirarNaEscola = vi.fn().mockResolvedValue(semEfeito())

    const relatorio = await expirarReservasDeTodasAsEscolas(HOJE, {
      listarEscolasAtivas: async () => TRES_ESCOLAS,
      expirarNaEscola,
    })

    expect(expirarNaEscola.mock.calls.map((c) => c[0])).toEqual(['esc_1', 'esc_2', 'esc_3'])
    expect(relatorio.escolasProcessadas).toBe(3)
  })

  it('erro numa escola NÃO impede as outras', async () => {
    // O sistema é multi-tenant e o job roda sozinho de madrugada. Uma
    // escola com dado estranho não pode deixar todas as outras com
    // exemplares presos numa reserva que já venceu.
    const expirarNaEscola = vi.fn(async (escolaId: string) => {
      if (escolaId === 'esc_2') throw new Error('conexão perdida')
      return semEfeito({ expiradas: 1 })
    })

    const relatorio = await expirarReservasDeTodasAsEscolas(HOJE, {
      listarEscolasAtivas: async () => TRES_ESCOLAS,
      expirarNaEscola,
    })

    expect(expirarNaEscola).toHaveBeenCalledTimes(3)
    expect(relatorio.escolasProcessadas).toBe(2)
    expect(relatorio.expiradas).toBe(2)
    // A escola que falhou aparece pelo NOME: um relatório que só diz
    // "1 falha" obriga quem lê o log de madrugada a adivinhar onde.
    expect(relatorio.falhas).toEqual([
      { escola: 'colegio-b', motivo: expect.stringContaining('conexão perdida') },
    ])
  })

  it('soma os totais de cada escola', async () => {
    const relatorio = await expirarReservasDeTodasAsEscolas(HOJE, {
      listarEscolasAtivas: async () => TRES_ESCOLAS.slice(0, 2),
      expirarNaEscola: async (escolaId: string) =>
        escolaId === 'esc_1'
          ? semEfeito({ expiradas: 2, passadasAdiante: 1, exemplaresLiberados: 1 })
          : semEfeito({ expiradas: 3, passadasAdiante: 3 }),
    })

    expect(relatorio).toMatchObject({
      escolasProcessadas: 2,
      expiradas: 5,
      passadasAdiante: 4,
      exemplaresLiberados: 1,
      falhas: [],
    })
  })

  it('falha de uma reserva sobe para o relatório do job', async () => {
    // A escola foi processada, mas alguma coisa lá dentro não deu certo.
    // Devolver só o sucesso esconderia exatamente o que precisa de gente.
    const relatorio = await expirarReservasDeTodasAsEscolas(HOJE, {
      listarEscolasAtivas: async () => [TRES_ESCOLAS[0]!],
      expirarNaEscola: async () =>
        semEfeito({ expiradas: 1, falhas: [{ reservaId: 'res_9', motivo: 'deu ruim' }] }),
    })

    expect(relatorio.escolasProcessadas).toBe(1)
    expect(relatorio.falhas).toEqual([
      { escola: 'colegio-a', motivo: expect.stringContaining('res_9') },
    ])
  })

  it('sem escola nenhuma, devolve relatório vazio em vez de estourar', async () => {
    const relatorio = await expirarReservasDeTodasAsEscolas(HOJE, {
      listarEscolasAtivas: async () => [],
      expirarNaEscola: async () => semEfeito(),
    })

    expect(relatorio).toMatchObject({ escolasProcessadas: 0, expiradas: 0, falhas: [] })
  })
})
