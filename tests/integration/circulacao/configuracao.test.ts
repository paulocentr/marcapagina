import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { configuracaoRepository } from '@/modules/circulacao/configuracao.repository'
import {
  definirConfiguracaoDaEscola,
  definirOverrideDeSerie,
  obterConfiguracaoEfetiva,
  removerOverrideDeSerie,
} from '@/modules/circulacao/configuracao.service'
import type { Principal } from '@/core/auth/principal'
import type { ConfiguracaoDaEscola } from '@/modules/circulacao/configuracao'

let escolaA = ''
let escolaB = ''

const deps = { configuracao: configuracaoRepository }

const VALIDA: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

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

describe('configuração contra banco', () => {
  it('grava e lê a configuração da escola', async () => {
    await naEscolaA(() => definirConfiguracaoDaEscola(principalDe(escolaA), VALIDA, deps))

    const efetiva = await naEscolaA(() =>
      obterConfiguracaoEfetiva(principalDe(escolaA), null, deps),
    )

    expect(efetiva).toEqual(VALIDA)
  })

  it('regravar ATUALIZA em vez de criar uma segunda', async () => {
    // Duas configurações para a mesma escola fariam o prazo depender de
    // qual linha a consulta pegasse primeiro.
    await naEscolaA(() => definirConfiguracaoDaEscola(principalDe(escolaA), VALIDA, deps))
    await naEscolaA(() =>
      definirConfiguracaoDaEscola(principalDe(escolaA), { ...VALIDA, prazoEmDias: 21 }, deps),
    )

    expect(await prisma.configuracaoDeCirculacao.count()).toBe(1)
    const efetiva = await naEscolaA(() =>
      obterConfiguracaoEfetiva(principalDe(escolaA), null, deps),
    )
    expect(efetiva.prazoEmDias).toBe(21)
  })

  it('a configuração de uma escola não vaza para a outra', async () => {
    await naEscolaA(() =>
      definirConfiguracaoDaEscola(principalDe(escolaA), { ...VALIDA, prazoEmDias: 21 }, deps),
    )

    const naVizinha = await executarComTenant(escolaB, () =>
      obterConfiguracaoEfetiva(principalDe(escolaB), null, deps),
    )

    // A vizinha não configurou nada: cai no padrão, não no 21 da escola A.
    expect(naVizinha.prazoEmDias).toBe(14)
    expect(naVizinha.limiteSimultaneo).toBe(2)
  })

  it('o override resolve campo a campo contra o banco', async () => {
    await naEscolaA(() => definirConfiguracaoDaEscola(principalDe(escolaA), VALIDA, deps))
    await naEscolaA(() =>
      definirOverrideDeSerie(principalDe(escolaA), { serie: '2', limiteSimultaneo: 1 }, deps),
    )

    const efetiva = await naEscolaA(() =>
      obterConfiguracaoEfetiva(principalDe(escolaA), '2', deps),
    )

    expect(efetiva.limiteSimultaneo).toBe(1)
    expect(efetiva.prazoEmDias).toBe(14)
  })

  it('campo nulo no banco vira herança, não valor', async () => {
    // Se o nulo chegasse ao domínio, a resolução trataria "herda" como
    // valor definido em alguns pontos e não em outros.
    await naEscolaA(() => definirConfiguracaoDaEscola(principalDe(escolaA), VALIDA, deps))
    await naEscolaA(() =>
      definirOverrideDeSerie(principalDe(escolaA), { serie: '2', prazoEmDias: 7 }, deps),
    )

    const overrides = await naEscolaA(() => configuracaoRepository.listarOverrides())

    expect(overrides[0]).toEqual({ serie: '2', prazoEmDias: 7 })
  })

  it('regravar o override da mesma série substitui', async () => {
    await naEscolaA(() =>
      definirOverrideDeSerie(principalDe(escolaA), { serie: '2', prazoEmDias: 7 }, deps),
    )
    await naEscolaA(() =>
      definirOverrideDeSerie(principalDe(escolaA), { serie: '2', prazoEmDias: 10 }, deps),
    )

    expect(await prisma.configuracaoPorSerie.count()).toBe(1)
  })

  it('remover o override devolve a série à configuração da escola', async () => {
    await naEscolaA(() => definirConfiguracaoDaEscola(principalDe(escolaA), VALIDA, deps))
    await naEscolaA(() =>
      definirOverrideDeSerie(principalDe(escolaA), { serie: '2', prazoEmDias: 7 }, deps),
    )

    await naEscolaA(() => removerOverrideDeSerie(principalDe(escolaA), '2', deps))

    const efetiva = await naEscolaA(() =>
      obterConfiguracaoEfetiva(principalDe(escolaA), '2', deps),
    )
    expect(efetiva.prazoEmDias).toBe(14)
  })

  it('o override da escola vizinha não afeta esta', async () => {
    await executarComTenant(escolaB, () =>
      definirOverrideDeSerie(principalDe(escolaB), { serie: '2', prazoEmDias: 30 }, deps),
    )
    await naEscolaA(() => definirConfiguracaoDaEscola(principalDe(escolaA), VALIDA, deps))

    const efetiva = await naEscolaA(() =>
      obterConfiguracaoEfetiva(principalDe(escolaA), '2', deps),
    )

    expect(efetiva.prazoEmDias).toBe(14)
  })
})
