import { describe, it, expect, beforeEach } from 'vitest'
import {
  buscarLeitorParaBalcao,
  LeitorNaoEncontradoError,
  type RepositorioDeConsultaDoBalcao,
  type LeitorParaBalcao,
  type LivroEmMaos,
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

// Meio-dia, não meia-noite UTC: a meia-noite UTC do dia 10 ainda é o dia
// 9 na escola (São Paulo é UTC-3), e o prazo é calculado no fuso da
// escola de propósito. Uma data de teste às 00:00Z faria o cálculo do
// prazo partir do dia anterior e esconder o próprio erro.
const HOJE = new Date('2026-09-10T12:00:00.000Z')

const CONFIG: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

function livro(
  parcial: Omit<Partial<LivroEmMaos>, 'previstaPara'> & { previstaPara: string },
): LivroEmMaos {
  return {
    emprestimoId: parcial.emprestimoId ?? 'emp_x',
    exemplarId: parcial.exemplarId ?? 'exe_x',
    tombo: parcial.tombo ?? '000001',
    tituloDaObra: parcial.tituloDaObra ?? 'O Cortiço',
    renovacoes: parcial.renovacoes ?? 0,
    previstaPara: new Date(`${parcial.previstaPara}T00:00:00.000Z`),
  }
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
  const diasNaoLetivos = new Set<string>()
  let emMaos: LivroEmMaos[] = []

  return {
    // Os contadores da ficha saem da MESMA lista que a tela mostra, então
    // o controle do teste é a lista. `definirAtivos`/`definirAtrasados`
    // geram empréstimos de verdade em vez de um número solto — um número
    // solto deixaria de existir no dia em que o contador virou derivado.
    definirAtivos: (n: number) => {
      for (let i = 0; i < n; i += 1) {
        emMaos.push(livro({ emprestimoId: `emp_ativo_${i}`, previstaPara: '2026-09-30' }))
      }
    },
    definirAtrasados: (n: number) => {
      for (let i = 0; i < n; i += 1) {
        emMaos.push(livro({ emprestimoId: `emp_atrasado_${i}`, previstaPara: '2026-09-01' }))
      }
    },
    definirEmMaos: (livros: LivroEmMaos[]) => {
      emMaos = livros
    },
    definirSuspensao: (ate: Date) => {
      const leitor = leitores.get('2024001')!
      leitores.set('2024001', { ...leitor, suspensaoAte: ate })
    },
    definirOverride: (o: OverrideDeSerie) => overrides.push(o),
    definirDiaNaoLetivo: (iso: string) => diasNaoLetivos.add(iso),

    async obterPorMatricula(matricula: string) {
      return leitores.get(matricula) ?? null
    },
    async configuracaoDaEscola() {
      return CONFIG
    },
    async overridesPorSerie() {
      return overrides
    },
    async diasNaoLetivos() {
      return diasNaoLetivos
    },
    async livrosEmMaos() {
      return emMaos
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

describe('os livros EM MÃOS do leitor', () => {
  it('traz título, tombo e data prevista de cada um', async () => {
    // A trilha lateral do balcão existe para a operadora dizer, em voz
    // alta, QUAIS livros o aluno está com ele. A contagem sozinha não
    // responde isso e obrigava a abrir outra tela.
    deps.consultaDoBalcao.definirEmMaos([
      livro({ tombo: '000412', tituloDaObra: 'O Cortiço', previstaPara: '2026-09-19' }),
    ])

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.emMaos).toHaveLength(1)
    expect(leitor.emMaos[0]?.tombo).toBe('000412')
    expect(leitor.emMaos[0]?.tituloDaObra).toBe('O Cortiço')
    expect(leitor.emMaos[0]?.previstaPara).toEqual(new Date('2026-09-19T00:00:00.000Z'))
  })

  it('"atrasado" é DERIVADO da data prevista, não vem do repositório', async () => {
    // O repositório nem tem como dizer "atrasado": ele devolve o fato
    // (previstaPara) e quem decide é esta função pura. É a garantia de
    // que nenhum campo materializado possa mentir aqui.
    deps.consultaDoBalcao.definirEmMaos([
      livro({ emprestimoId: 'venceu', previstaPara: '2026-09-02' }),
      livro({ emprestimoId: 'vence_depois', previstaPara: '2026-09-19' }),
    ])

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.emMaos.map((l) => [l.emprestimoId, l.atrasado])).toEqual([
      ['venceu', true],
      ['vence_depois', false],
    ])
  })

  it('quem vence HOJE ainda não está atrasado', async () => {
    // Mesma fronteira do relatório de atrasados: quem vence hoje tem o
    // dia inteiro para devolver. Marcá-lo de vermelho na frente do aluno
    // é acusar quem cumpriu o prazo.
    deps.consultaDoBalcao.definirEmMaos([livro({ previstaPara: '2026-09-10' })])

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.emMaos[0]?.atrasado).toBe(false)
    expect(leitor.emMaos[0]?.diasDeAtraso).toBe(0)
  })

  it('quem venceu ontem está atrasado por um dia', async () => {
    deps.consultaDoBalcao.definirEmMaos([livro({ previstaPara: '2026-09-09' })])

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.emMaos[0]?.atrasado).toBe(true)
    expect(leitor.emMaos[0]?.diasDeAtraso).toBe(1)
  })

  it('conta os dias de atraso de quem está muito atrasado', async () => {
    deps.consultaDoBalcao.definirEmMaos([livro({ previstaPara: '2026-09-02' })])

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.emMaos[0]?.diasDeAtraso).toBe(8)
  })

  it('o contador "2 de 3" sai da MESMA lista que a tela mostra', async () => {
    // Contador e lista vinham de consultas diferentes; nada impedia a
    // tela de dizer "2 de 3" ao lado de três livros. Derivar os dois da
    // mesma lista torna a divergência impossível, não só improvável.
    deps.consultaDoBalcao.definirEmMaos([
      livro({ emprestimoId: 'a', previstaPara: '2026-09-19' }),
      livro({ emprestimoId: 'b', previstaPara: '2026-09-19' }),
    ])

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.emprestimosAtivos).toBe(leitor.emMaos.length)
    expect(leitor.emprestimosAtivos).toBe(2)
  })

  it('o bloqueio de atraso também sai dessa lista', async () => {
    deps.consultaDoBalcao.definirEmMaos([livro({ previstaPara: '2026-09-01' })])

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.bloqueios.map((b) => b.tipo)).toEqual(['COM_ATRASO'])
  })

  it('leitor sem nada em mãos vem com lista vazia, não nula', async () => {
    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)
    expect(leitor.emMaos).toEqual([])
  })
})

describe('o prazo da série, antes de confirmar o empréstimo', () => {
  it('diz o prazo em DIAS da série do leitor', async () => {
    // A prancha mostra "prazo da série: 14 dias". Só o limite simultâneo
    // não responde a pergunta que o aluno faz no balcão: até quando?
    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.prazoDaSerieEmDias).toBe(14)
  })

  it('o prazo respeita o override da série', async () => {
    deps.consultaDoBalcao.definirOverride({ serie: '2', prazoEmDias: 7 })

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.prazoDaSerieEmDias).toBe(7)
  })

  it('já calcula a data prevista de quem emprestar AGORA', async () => {
    // 10/09/2026 + 14 dias = 24/09/2026, uma quinta-feira.
    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.devolucaoPrevistaSeEmprestarHoje).toEqual(
      new Date('2026-09-24T00:00:00.000Z'),
    )
  })

  it('a data prevista empurra o vencimento que cai em dia não letivo', async () => {
    // Usa o MESMO cálculo do empréstimo (prazo.ts). Recalcular aqui com
    // uma segunda fórmula faria a tela prometer uma data e o empréstimo
    // gravar outra — e a operadora acreditaria na que viu.
    deps.consultaDoBalcao.definirDiaNaoLetivo('2026-09-24')
    deps.consultaDoBalcao.definirDiaNaoLetivo('2026-09-25')

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.devolucaoPrevistaSeEmprestarHoje).toEqual(
      new Date('2026-09-28T00:00:00.000Z'),
    )
  })

  it('a data prevista pula o fim de semana', async () => {
    // 10/09/2026 (quinta) + 9 dias = 19/09, um sábado. A escola está
    // fechada: o vencimento vai para 21/09, segunda.
    deps.consultaDoBalcao.definirOverride({ serie: '2', prazoEmDias: 9 })

    const leitor = await buscarLeitorParaBalcao(BALCAO, '2024001', HOJE, deps)

    expect(leitor.devolucaoPrevistaSeEmprestarHoje).toEqual(
      new Date('2026-09-21T00:00:00.000Z'),
    )
  })
})
