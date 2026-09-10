import { describe, it, expect, beforeEach } from 'vitest'
import {
  definirConfiguracaoDaEscola,
  definirOverrideDeSerie,
  removerOverrideDeSerie,
  obterConfiguracaoEfetiva,
  type RepositorioDeConfiguracao,
} from '@/modules/circulacao/configuracao.service'
import { ConfiguracaoInvalidaError, type ConfiguracaoDaEscola, type OverrideDeSerie } from '@/modules/circulacao/configuracao'
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

const VALIDA: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

function criarFake() {
  let daEscola: ConfiguracaoDaEscola | null = null
  const overrides = new Map<string, OverrideDeSerie>()

  return {
    async obterDaEscola() {
      return daEscola
    },
    async gravarDaEscola(config: ConfiguracaoDaEscola) {
      daEscola = config
    },
    async listarOverrides() {
      return [...overrides.values()]
    },
    async gravarOverride(override: OverrideDeSerie) {
      overrides.set(override.serie, override)
    },
    async removerOverride(serie: string) {
      overrides.delete(serie)
    },
  } satisfies RepositorioDeConfiguracao & Record<string, unknown>
}

let deps: { configuracao: ReturnType<typeof criarFake> }

beforeEach(() => {
  deps = { configuracao: criarFake() }
})

describe('definirConfiguracaoDaEscola', () => {
  it('grava uma configuração válida', async () => {
    await definirConfiguracaoDaEscola(COORDENACAO, VALIDA, deps)

    expect(await deps.configuracao.obterDaEscola()).toEqual(VALIDA)
  })

  it('recusa configuração inválida SEM gravar', async () => {
    // Gravar e só então validar deixaria a biblioteca com limite 0 até
    // alguém perceber — e o sintoma seria "todo aluno está no limite".
    await expect(
      definirConfiguracaoDaEscola(COORDENACAO, { ...VALIDA, limiteSimultaneo: 0 }, deps),
    ).rejects.toBeInstanceOf(ConfiguracaoInvalidaError)

    expect(await deps.configuracao.obterDaEscola()).toBeNull()
  })

  it('recusa sem permissão config:editar', async () => {
    await expect(definirConfiguracaoDaEscola(MONITOR, VALIDA, deps)).rejects.toBeInstanceOf(
      SemPermissaoError,
    )
  })
})

describe('definirOverrideDeSerie', () => {
  it('grava um override parcial', async () => {
    await definirOverrideDeSerie(COORDENACAO, { serie: '2', limiteSimultaneo: 1 }, deps)

    expect(await deps.configuracao.listarOverrides()).toEqual([{ serie: '2', limiteSimultaneo: 1 }])
  })

  it('recusa série vazia', async () => {
    await expect(
      definirOverrideDeSerie(COORDENACAO, { serie: '  ', prazoEmDias: 7 }, deps),
    ).rejects.toThrow()
  })

  it('recusa override sem nenhum campo, que não sobrescreve nada', async () => {
    // Um override vazio parece configurado na tela e não muda coisa
    // alguma — a coordenação juraria ter ajustado a série.
    await expect(definirOverrideDeSerie(COORDENACAO, { serie: '2' }, deps)).rejects.toThrow()
  })

  it('valida os campos do override com as MESMAS regras da escola', async () => {
    // Um limite 0 no override bloqueia aquela série inteira, com o mesmo
    // sintoma e a mesma dificuldade de diagnosticar.
    await expect(
      definirOverrideDeSerie(COORDENACAO, { serie: '2', limiteSimultaneo: 0 }, deps),
    ).rejects.toBeInstanceOf(ConfiguracaoInvalidaError)
  })

  it('aceita override que zera renovações', async () => {
    await expect(
      definirOverrideDeSerie(COORDENACAO, { serie: '1', maximoDeRenovacoes: 0 }, deps),
    ).resolves.toBeUndefined()
  })

  it('regravar a mesma série substitui em vez de duplicar', async () => {
    await definirOverrideDeSerie(COORDENACAO, { serie: '2', prazoEmDias: 7 }, deps)
    await definirOverrideDeSerie(COORDENACAO, { serie: '2', prazoEmDias: 10 }, deps)

    const overrides = await deps.configuracao.listarOverrides()
    expect(overrides).toHaveLength(1)
    expect(overrides[0]?.prazoEmDias).toBe(10)
  })

  it('recusa sem permissão config:editar', async () => {
    await expect(
      definirOverrideDeSerie(MONITOR, { serie: '2', prazoEmDias: 7 }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('removerOverrideDeSerie', () => {
  it('remove e a série volta a herdar da escola', async () => {
    await definirConfiguracaoDaEscola(COORDENACAO, VALIDA, deps)
    await definirOverrideDeSerie(COORDENACAO, { serie: '2', prazoEmDias: 7 }, deps)

    await removerOverrideDeSerie(COORDENACAO, '2', deps)

    const efetiva = await obterConfiguracaoEfetiva(COORDENACAO, '2', deps)
    expect(efetiva.prazoEmDias).toBe(14)
  })
})

describe('obterConfiguracaoEfetiva', () => {
  it('resolve a configuração da série sobre a da escola', async () => {
    await definirConfiguracaoDaEscola(COORDENACAO, VALIDA, deps)
    await definirOverrideDeSerie(COORDENACAO, { serie: '2', prazoEmDias: 7 }, deps)

    const efetiva = await obterConfiguracaoEfetiva(COORDENACAO, '2', deps)

    expect(efetiva.prazoEmDias).toBe(7)
    expect(efetiva.limiteSimultaneo).toBe(3)
  })

  it('sem nada cadastrado, devolve um padrão utilizável', async () => {
    // A biblioteca precisa emprestar no primeiro dia, antes de alguém
    // abrir a tela de configuração.
    const efetiva = await obterConfiguracaoEfetiva(COORDENACAO, null, deps)

    expect(efetiva.prazoEmDias).toBeGreaterThan(0)
    expect(efetiva.limiteSimultaneo).toBeGreaterThan(0)
  })

  it('ler configuração exige apenas obra:ver, não config:editar', async () => {
    // O balcão precisa da configuração para calcular o prazo; exigir
    // permissão de edição para ler impediria o monitor de emprestar.
    await expect(obterConfiguracaoEfetiva(MONITOR, null, deps)).resolves.toBeDefined()
  })
})
