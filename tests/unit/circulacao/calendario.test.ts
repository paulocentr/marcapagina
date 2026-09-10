import { describe, it, expect, beforeEach } from 'vitest'
import {
  marcarDiaNaoLetivo,
  desmarcarDiaNaoLetivo,
  marcarPeriodoNaoLetivo,
  type RepositorioDoCalendario,
} from '@/modules/circulacao/calendario.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

const COORDENACAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: ['config:editar', 'obra:ver'],
}

const MONITOR: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['obra:ver'],
}

function criarFake() {
  const dias = new Map<string, string>()
  return {
    marcados: () => [...dias.keys()].sort(),
    motivoDe: (iso: string) => dias.get(iso),
    async listar() {
      return new Set(dias.keys())
    },
    async marcar(iso: string, motivo: string) {
      dias.set(iso, motivo)
    },
    async desmarcar(iso: string) {
      dias.delete(iso)
    },
  } satisfies RepositorioDoCalendario & Record<string, unknown>
}

let deps: { calendario: ReturnType<typeof criarFake> }

beforeEach(() => {
  deps = { calendario: criarFake() }
})

describe('marcarDiaNaoLetivo', () => {
  it('marca um dia com motivo', async () => {
    await marcarDiaNaoLetivo(COORDENACAO, { data: '2026-09-07', motivo: 'Independência' }, deps)

    expect(deps.calendario.marcados()).toEqual(['2026-09-07'])
    expect(deps.calendario.motivoDe('2026-09-07')).toBe('Independência')
  })

  it('exige motivo', async () => {
    // Um dia bloqueado sem motivo vira mistério: meses depois ninguém
    // sabe se foi feriado, recesso ou engano — e ninguém ousa apagar.
    await expect(
      marcarDiaNaoLetivo(COORDENACAO, { data: '2026-09-07', motivo: '  ' }, deps),
    ).rejects.toThrow()
  })

  it('recusa data em formato que não seja aaaa-mm-dd', async () => {
    await expect(
      marcarDiaNaoLetivo(COORDENACAO, { data: '07/09/2026', motivo: 'Feriado' }, deps),
    ).rejects.toThrow()
  })

  it('recusa data impossível', async () => {
    // 31/02 num Date ingênuo vira 3 de março, e a escola ficaria com um
    // dia fechado que nunca foi marcado.
    await expect(
      marcarDiaNaoLetivo(COORDENACAO, { data: '2026-02-31', motivo: 'Feriado' }, deps),
    ).rejects.toThrow()
  })

  it('marcar o mesmo dia duas vezes só atualiza o motivo', async () => {
    await marcarDiaNaoLetivo(COORDENACAO, { data: '2026-09-07', motivo: 'Feriado' }, deps)
    await marcarDiaNaoLetivo(COORDENACAO, { data: '2026-09-07', motivo: 'Independência' }, deps)

    expect(deps.calendario.marcados()).toHaveLength(1)
    expect(deps.calendario.motivoDe('2026-09-07')).toBe('Independência')
  })

  it('recusa sem permissão config:editar', async () => {
    await expect(
      marcarDiaNaoLetivo(MONITOR, { data: '2026-09-07', motivo: 'Feriado' }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('marcarPeriodoNaoLetivo', () => {
  it('marca todos os dias do período, inclusive as pontas', async () => {
    // Recesso é digitado como período: exigir dia a dia faria a
    // coordenação marcar as férias de julho em 30 cliques — e desistir.
    await marcarPeriodoNaoLetivo(
      COORDENACAO,
      { de: '2026-07-01', ate: '2026-07-05', motivo: 'Férias' },
      deps,
    )

    expect(deps.calendario.marcados()).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
    ])
  })

  it('um único dia é um período válido', async () => {
    await marcarPeriodoNaoLetivo(
      COORDENACAO,
      { de: '2026-07-01', ate: '2026-07-01', motivo: 'Ponto facultativo' },
      deps,
    )

    expect(deps.calendario.marcados()).toEqual(['2026-07-01'])
  })

  it('recusa fim anterior ao início', async () => {
    await expect(
      marcarPeriodoNaoLetivo(
        COORDENACAO,
        { de: '2026-07-10', ate: '2026-07-01', motivo: 'Férias' },
        deps,
      ),
    ).rejects.toThrow()
  })

  it('recusa período absurdamente longo', async () => {
    // Um ano inteiro marcado por engano trava o cálculo do prazo — e o
    // erro só apareceria no balcão, com o aluno esperando.
    await expect(
      marcarPeriodoNaoLetivo(
        COORDENACAO,
        { de: '2026-01-01', ate: '2029-01-01', motivo: 'Engano' },
        deps,
      ),
    ).rejects.toThrow()
  })

  it('atravessa a virada do mês', async () => {
    await marcarPeriodoNaoLetivo(
      COORDENACAO,
      { de: '2026-01-30', ate: '2026-02-02', motivo: 'Recesso' },
      deps,
    )

    expect(deps.calendario.marcados()).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
  })
})

describe('desmarcarDiaNaoLetivo', () => {
  it('desmarca', async () => {
    await marcarDiaNaoLetivo(COORDENACAO, { data: '2026-09-07', motivo: 'Feriado' }, deps)
    await desmarcarDiaNaoLetivo(COORDENACAO, '2026-09-07', deps)

    expect(deps.calendario.marcados()).toEqual([])
  })

  it('desmarcar dia que não estava marcado não é erro', async () => {
    await expect(
      desmarcarDiaNaoLetivo(COORDENACAO, '2026-09-07', deps),
    ).resolves.toBeUndefined()
  })

  it('recusa sem permissão config:editar', async () => {
    await expect(
      desmarcarDiaNaoLetivo(MONITOR, '2026-09-07', deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})
