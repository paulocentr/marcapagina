import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { calendarioRepository } from '@/modules/circulacao/calendario.repository'
import {
  marcarDiaNaoLetivo,
  marcarPeriodoNaoLetivo,
  desmarcarDiaNaoLetivo,
  listarDiasNaoLetivos,
} from '@/modules/circulacao/calendario.service'
import type { Principal } from '@/core/auth/principal'

let escolaA = ''
let escolaB = ''

const deps = { calendario: calendarioRepository }

const principalDe = (escolaId: string): Principal => ({
  reino: 'STAFF',
  id: 'usr_1',
  escolaId,
  nome: 'Coordenação',
  permissoes: ['config:editar', 'obra:ver'],
})

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

describe('calendário contra banco', () => {
  it('marca e lê um dia não letivo', async () => {
    await naEscolaA(() =>
      marcarDiaNaoLetivo(principalDe(escolaA), { data: '2026-09-07', motivo: 'Independência' }, deps),
    )

    const dias = await naEscolaA(() => listarDiasNaoLetivos(principalDe(escolaA), deps))
    expect([...dias]).toEqual(['2026-09-07'])
  })

  it('a data não desloca por fuso ao ir e voltar do banco', async () => {
    // A coluna é @db.Date. Um dia a menos aqui empurraria o vencimento de
    // todo mundo sem explicação nenhuma.
    await naEscolaA(() =>
      marcarDiaNaoLetivo(principalDe(escolaA), { data: '2026-01-01', motivo: 'Ano novo' }, deps),
    )

    const dias = await naEscolaA(() => listarDiasNaoLetivos(principalDe(escolaA), deps))
    expect([...dias]).toEqual(['2026-01-01'])
  })

  it('remarcar o mesmo dia atualiza o motivo em vez de estourar no único', async () => {
    // Corrigir "Feriado" para "Independência" é o que a coordenação faz
    // depois de digitar às pressas.
    await naEscolaA(() =>
      marcarDiaNaoLetivo(principalDe(escolaA), { data: '2026-09-07', motivo: 'Feriado' }, deps),
    )
    await naEscolaA(() =>
      marcarDiaNaoLetivo(principalDe(escolaA), { data: '2026-09-07', motivo: 'Independência' }, deps),
    )

    expect(await prisma.diaNaoLetivo.count()).toBe(1)
    const dia = await prisma.diaNaoLetivo.findFirstOrThrow()
    expect(dia.motivo).toBe('Independência')
  })

  it('marca um período inteiro', async () => {
    await naEscolaA(() =>
      marcarPeriodoNaoLetivo(
        principalDe(escolaA),
        { de: '2026-07-01', ate: '2026-07-05', motivo: 'Férias' },
        deps,
      ),
    )

    expect(await prisma.diaNaoLetivo.count()).toBe(5)
  })

  it('desmarca', async () => {
    await naEscolaA(() =>
      marcarDiaNaoLetivo(principalDe(escolaA), { data: '2026-09-07', motivo: 'Feriado' }, deps),
    )
    await naEscolaA(() => desmarcarDiaNaoLetivo(principalDe(escolaA), '2026-09-07', deps))

    expect(await prisma.diaNaoLetivo.count()).toBe(0)
  })

  it('o feriado de uma escola não aparece na outra', async () => {
    // Feriado municipal não é o mesmo em toda cidade.
    await naEscolaA(() =>
      marcarDiaNaoLetivo(principalDe(escolaA), { data: '2026-09-07', motivo: 'Municipal' }, deps),
    )

    const naVizinha = await executarComTenant(escolaB, () =>
      listarDiasNaoLetivos(principalDe(escolaB), deps),
    )

    expect([...naVizinha]).toEqual([])
  })

  it('a mesma data pode ser marcada nas duas escolas', async () => {
    await naEscolaA(() =>
      marcarDiaNaoLetivo(principalDe(escolaA), { data: '2026-09-07', motivo: 'Feriado' }, deps),
    )
    await executarComTenant(escolaB, () =>
      marcarDiaNaoLetivo(principalDe(escolaB), { data: '2026-09-07', motivo: 'Feriado' }, deps),
    )

    expect(await prisma.diaNaoLetivo.count()).toBe(2)
  })

  it('desmarcar não alcança o dia da escola vizinha', async () => {
    await executarComTenant(escolaB, () =>
      marcarDiaNaoLetivo(principalDe(escolaB), { data: '2026-09-07', motivo: 'Feriado' }, deps),
    )

    await naEscolaA(() => desmarcarDiaNaoLetivo(principalDe(escolaA), '2026-09-07', deps))

    expect(await prisma.diaNaoLetivo.count()).toBe(1)
  })
})
