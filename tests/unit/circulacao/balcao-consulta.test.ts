import { describe, it, expect, beforeEach } from 'vitest'
import {
  buscarLeitorParaBalcao,
  LeitorNaoEncontradoError,
  type RepositorioDeConsultaDoBalcao,
  type LeitorParaBalcao,
} from '@/modules/circulacao/balcao.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'

const BALCAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['emprestimo:criar', 'aluno:ver'],
}

const SEM_NADA: Principal = { ...BALCAO, permissoes: [] }

const HOJE = new Date('2026-09-10T00:00:00.000Z')

const CONFIG: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

function criarFake() {
  const leitores = new Map<string, LeitorParaBalcao>([
    [
      '2024001',
      {
        id: 'alu_1',
        nome: 'Ana Souza',
        matricula: '2024001',
        turma: '2º A',
        serie: '2',
        ativo: true,
        suspensaoAte: null,
      },
    ],
  ])
  const overrides: OverrideDeSerie[] = []
  let ativos = 0
  let atrasados = 0

  return {
    definirAtivos: (n: number) => {
      ativos = n
    },
    definirAtrasados: (n: number) => {
      atrasados = n
    },
    definirSuspensao: (ate: Date) => {
      const leitor = leitores.get('2024001')!
      leitores.set('2024001', { ...leitor, suspensaoAte: ate })
    },
    definirOverride: (o: OverrideDeSerie) => overrides.push(o),

    async obterPorMatricula(matricula: string) {
      return leitores.get(matricula) ?? null
    },
    async configuracaoDaEscola() {
      return CONFIG
    },
    async overridesPorSerie() {
      return overrides
    },
    async contarAtivosDoAluno() {
      return ativos
    },
    async contarAtrasadosDoAluno() {
      return atrasados
    },
  } satisfies RepositorioDeConsultaDoBalcao & Record<string, unknown>
}

let deps: { consultaDoBalcao: ReturnType<typeof criarFake> }

beforeEach(() => {
  deps = { consultaDoBalcao: criarFake() }
})

describe('buscarLeitorParaBalcao', () => {
  it('devolve o leitor com turma e matrícula', async () => {
    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.nome).toBe('Ana Souza')
    expect(leitor.turma).toBe('2º A')
  })

  it('JÁ traz os bloqueios junto', async () => {
    // Os bloqueios vêm antes de escolher o livro (spec §5.1). Buscar o
    // leitor e depois consultar bloqueios numa segunda chamada deixaria
    // uma janela em que a tela mostra o aluno como liberado.
    deps.consultaDoBalcao.definirAtrasados(1)

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.bloqueios.map((b) => b.tipo)).toEqual(['COM_ATRASO'])
  })

  it('usa o limite da SÉRIE do leitor', async () => {
    deps.consultaDoBalcao.definirOverride({ serie: '2', limiteSimultaneo: 1 })
    deps.consultaDoBalcao.definirAtivos(1)

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.bloqueios.map((b) => b.tipo)).toEqual(['NO_LIMITE'])
  })

  it('leitor sem pendência vem sem bloqueio', async () => {
    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)
    expect(leitor.bloqueios).toEqual([])
  })

  it('informa quantos livros o leitor já está levando', async () => {
    // A operadora precisa do número para decidir, não só do sim/não.
    deps.consultaDoBalcao.definirAtivos(2)

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)
    expect(leitor.emprestimosAtivos).toBe(2)
  })

  it('acumula bloqueios', async () => {
    deps.consultaDoBalcao.definirAtivos(3)
    deps.consultaDoBalcao.definirAtrasados(1)
    deps.consultaDoBalcao.definirSuspensao(new Date('2026-09-20T00:00:00.000Z'))

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.bloqueios).toHaveLength(3)
  })

  it('matrícula com espaço em volta ainda acha', async () => {
    // Leitor de código de barras às vezes entrega espaço junto.
    const leitor = await buscarLeitorParaBalcao(BALCAO, '  2024001 ', HOJE, deps)
    expect(leitor.id).toBe('alu_1')
  })

  it('matrícula inexistente é erro próprio, não nulo', async () => {
    await expect(
      buscarLeitorParaBalcao(BALCAO, '9999', HOJE, deps),
    ).rejects.toBeInstanceOf(LeitorNaoEncontradoError)
  })

  it('o erro diz a matrícula que não achou', async () => {
    const erro = await buscarLeitorParaBalcao(BALCAO, '9999', HOJE, deps).then(
      () => null,
      (e: unknown) => e as Error,
    )
    expect(erro?.message).toContain('9999')
  })

  it('recusa sem permissão aluno:ver', async () => {
    await expect(
      buscarLeitorParaBalcao(SEM_NADA, '2024001', HOJE, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})
