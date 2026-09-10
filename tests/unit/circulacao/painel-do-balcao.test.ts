import { describe, it, expect, beforeEach } from 'vitest'
import {
  listarPrateleiraDeSeparados,
  resumoDoDiaNoBalcao,
  type ExemplarSeparadoBruto,
  type MovimentoBruto,
  type RepositorioDoPainelDoBalcao,
} from '@/modules/circulacao/painel-do-balcao.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

const BALCAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['emprestimo:criar', 'emprestimo:devolver', 'reserva:gerenciar'],
}

const SEM_NADA: Principal = { ...BALCAO, permissoes: [] }

// Quinta-feira, 15h na escola (18:00Z). Um instante dentro do horário de
// funcionamento, para o dia da escola e o dia UTC coincidirem e o teste
// falar de uma coisa por vez.
const AGORA = new Date('2026-09-10T18:00:00.000Z')

function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function separado(
  parcial: Omit<Partial<ExemplarSeparadoBruto>, 'retirarAte'> & { retirarAte: string },
): ExemplarSeparadoBruto {
  return {
    reservaId: parcial.reservaId ?? 'res_1',
    exemplarId: parcial.exemplarId ?? 'exe_1',
    tombo: parcial.tombo ?? '000412',
    tituloDaObra: parcial.tituloDaObra ?? 'O Cortiço',
    nomeDoLeitor: parcial.nomeDoLeitor ?? 'Júlia Nogueira',
    turma: parcial.turma === undefined ? '7º A' : parcial.turma,
    localizacao: parcial.localizacao === undefined ? 'Estante 3' : parcial.localizacao,
    retirarAte: dia(parcial.retirarAte),
  }
}

function movimento(
  parcial: Omit<Partial<MovimentoBruto>, 'quando' | 'previstaPara'> & {
    quando: string
    previstaPara?: string
  },
): MovimentoBruto {
  return {
    emprestimoId: parcial.emprestimoId ?? 'emp_1',
    tombo: parcial.tombo ?? '000377',
    tituloDaObra: parcial.tituloDaObra ?? 'Capitães da Areia',
    nomeDoLeitor: parcial.nomeDoLeitor ?? 'Pedro Henrique Lima',
    turma: parcial.turma === undefined ? '6º B' : parcial.turma,
    previstaPara: dia(parcial.previstaPara === undefined ? '2026-09-24' : parcial.previstaPara),
    quando: new Date(parcial.quando),
  }
}

function criarFake() {
  let naPrateleira: ExemplarSeparadoBruto[] = []
  let retiradas: MovimentoBruto[] = []
  let devolucoes: MovimentoBruto[] = []
  const janelasConsultadas: { inicio: Date; fim: Date }[] = []

  return {
    definirPrateleira: (itens: ExemplarSeparadoBruto[]) => {
      naPrateleira = itens
    },
    definirRetiradas: (itens: MovimentoBruto[]) => {
      retiradas = itens
    },
    definirDevolucoes: (itens: MovimentoBruto[]) => {
      devolucoes = itens
    },
    janelas: () => janelasConsultadas,

    async exemplaresSeparados() {
      return naPrateleira
    },
    async retiradasEntre(inicio: Date, fim: Date) {
      janelasConsultadas.push({ inicio, fim })
      return retiradas
    },
    async devolucoesEntre(inicio: Date, fim: Date) {
      janelasConsultadas.push({ inicio, fim })
      return devolucoes
    },
  } satisfies RepositorioDoPainelDoBalcao & Record<string, unknown>
}

let deps: { painelDoBalcao: ReturnType<typeof criarFake> }

beforeEach(() => {
  deps = { painelDoBalcao: criarFake() }
})

describe('a prateleira de separados', () => {
  it('diz de quem é cada exemplar e até quando ele espera', async () => {
    // Sem isso a operadora não sabe o que está na prateleira física: ela
    // vê uma pilha de livros e nenhum nome.
    deps.painelDoBalcao.definirPrateleira([
      separado({
        tombo: '000412',
        tituloDaObra: 'O Cortiço',
        nomeDoLeitor: 'Júlia Nogueira',
        turma: '7º A',
        retirarAte: '2026-09-13',
      }),
    ])

    const prateleira = await listarPrateleiraDeSeparados(BALCAO, AGORA, deps)

    expect(prateleira).toHaveLength(1)
    expect(prateleira[0]?.nomeDoLeitor).toBe('Júlia Nogueira')
    expect(prateleira[0]?.turma).toBe('7º A')
    expect(prateleira[0]?.tituloDaObra).toBe('O Cortiço')
    expect(prateleira[0]?.tombo).toBe('000412')
    expect(prateleira[0]?.retirarAte).toEqual(dia('2026-09-13'))
  })

  it('"vence hoje" é DERIVADO da data, não é campo do banco', async () => {
    deps.painelDoBalcao.definirPrateleira([separado({ retirarAte: '2026-09-10' })])

    const [item] = await listarPrateleiraDeSeparados(BALCAO, AGORA, deps)

    expect(item?.venceHoje).toBe(true)
    expect(item?.vencido).toBe(false)
    expect(item?.diasParaRetirar).toBe(0)
  })

  it('quem tem até amanhã não vence hoje', async () => {
    deps.painelDoBalcao.definirPrateleira([separado({ retirarAte: '2026-09-11' })])

    const [item] = await listarPrateleiraDeSeparados(BALCAO, AGORA, deps)

    expect(item?.venceHoje).toBe(false)
    expect(item?.vencido).toBe(false)
    expect(item?.diasParaRetirar).toBe(1)
  })

  it('o prazo que já passou vem marcado como vencido', async () => {
    // Ele está na prateleira e o cron ainda não passou. A operadora tem
    // de saber que este vai voltar à estante, senão promete ao aluno um
    // livro que a fila já perdeu.
    deps.painelDoBalcao.definirPrateleira([separado({ retirarAte: '2026-09-08' })])

    const [item] = await listarPrateleiraDeSeparados(BALCAO, AGORA, deps)

    expect(item?.vencido).toBe(true)
    expect(item?.venceHoje).toBe(false)
    expect(item?.diasParaRetirar).toBe(-2)
  })

  it('o que vence primeiro vem em cima', async () => {
    // Ordem é regra de tela, e fica provada aqui — sem banco. O
    // `orderBy` do repositório é a mesma ordem; ter as duas é o que faz
    // a lista continuar certa se um dia a consulta mudar.
    deps.painelDoBalcao.definirPrateleira([
      separado({ reservaId: 'depois', retirarAte: '2026-09-15' }),
      separado({ reservaId: 'hoje', retirarAte: '2026-09-10' }),
      separado({ reservaId: 'amanha', retirarAte: '2026-09-11' }),
    ])

    const prateleira = await listarPrateleiraDeSeparados(BALCAO, AGORA, deps)

    expect(prateleira.map((i) => i.reservaId)).toEqual(['hoje', 'amanha', 'depois'])
  })

  it('prateleira vazia é lista vazia, não nula', async () => {
    expect(await listarPrateleiraDeSeparados(BALCAO, AGORA, deps)).toEqual([])
  })

  it('recusa sem permissão de reserva', async () => {
    await expect(listarPrateleiraDeSeparados(SEM_NADA, AGORA, deps)).rejects.toBeInstanceOf(
      SemPermissaoError,
    )
  })
})

describe('os últimos do balcão', () => {
  it('junta retiradas e devoluções numa linha do tempo, a mais recente em cima', async () => {
    deps.painelDoBalcao.definirRetiradas([
      movimento({ emprestimoId: 'saiu_1431', quando: '2026-09-10T17:31:00.000Z' }),
      movimento({ emprestimoId: 'saiu_1451', quando: '2026-09-10T17:51:00.000Z' }),
    ])
    deps.painelDoBalcao.definirDevolucoes([
      movimento({ emprestimoId: 'voltou_1447', quando: '2026-09-10T17:47:00.000Z' }),
    ])

    const resumo = await resumoDoDiaNoBalcao(BALCAO, { hoje: AGORA }, deps)

    expect(resumo.movimentos.map((m) => m.emprestimoId)).toEqual([
      'saiu_1451',
      'voltou_1447',
      'saiu_1431',
    ])
  })

  it('cada linha diz se o livro saiu ou voltou', async () => {
    deps.painelDoBalcao.definirRetiradas([movimento({ quando: '2026-09-10T17:31:00.000Z' })])
    deps.painelDoBalcao.definirDevolucoes([movimento({ quando: '2026-09-10T17:47:00.000Z' })])

    const resumo = await resumoDoDiaNoBalcao(BALCAO, { hoje: AGORA }, deps)

    expect(resumo.movimentos.map((m) => m.tipo)).toEqual(['DEVOLUCAO', 'RETIRADA'])
  })

  it('traz leitor, turma, título e tombo em cada linha', async () => {
    deps.painelDoBalcao.definirRetiradas([
      movimento({
        quando: '2026-09-10T17:51:00.000Z',
        nomeDoLeitor: 'Pedro Henrique Lima',
        turma: '6º B',
        tituloDaObra: 'Capitães da Areia',
        tombo: '000377',
      }),
    ])

    const [linha] = (await resumoDoDiaNoBalcao(BALCAO, { hoje: AGORA }, deps)).movimentos

    expect(linha?.nomeDoLeitor).toBe('Pedro Henrique Lima')
    expect(linha?.turma).toBe('6º B')
    expect(linha?.tituloDaObra).toBe('Capitães da Areia')
    expect(linha?.tombo).toBe('000377')
    expect(linha?.quando).toEqual(new Date('2026-09-10T17:51:00.000Z'))
  })

  it('o livro que saiu e voltou no mesmo dia aparece DUAS vezes', async () => {
    // São dois atendimentos: a operadora atendeu de manhã e à tarde.
    // Deduplicar por empréstimo esconderia metade do trabalho do dia.
    const mesmo = { emprestimoId: 'emp_9' }
    deps.painelDoBalcao.definirRetiradas([
      movimento({ ...mesmo, quando: '2026-09-10T12:00:00.000Z' }),
    ])
    deps.painelDoBalcao.definirDevolucoes([
      movimento({ ...mesmo, quando: '2026-09-10T17:00:00.000Z' }),
    ])

    const resumo = await resumoDoDiaNoBalcao(BALCAO, { hoje: AGORA }, deps)

    expect(resumo.movimentos).toHaveLength(2)
    expect(resumo.movimentos.map((m) => m.tipo)).toEqual(['DEVOLUCAO', 'RETIRADA'])
  })

  it('a devolução em atraso mostra quantos dias atrasou', async () => {
    deps.painelDoBalcao.definirDevolucoes([
      {
        ...movimento({ quando: '2026-09-10T17:04:00.000Z' }),
        previstaPara: dia('2026-09-02'),
      },
    ])

    const [linha] = (await resumoDoDiaNoBalcao(BALCAO, { hoje: AGORA }, deps)).movimentos

    expect(linha?.diasDeAtraso).toBe(8)
  })

  it('a devolução em dia mostra zero dia de atraso, não nulo', async () => {
    deps.painelDoBalcao.definirDevolucoes([
      {
        ...movimento({ quando: '2026-09-10T17:04:00.000Z' }),
        previstaPara: dia('2026-09-24'),
      },
    ])

    const [linha] = (await resumoDoDiaNoBalcao(BALCAO, { hoje: AGORA }, deps)).movimentos

    expect(linha?.diasDeAtraso).toBe(0)
  })

  it('a retirada não fala de atraso: o livro acabou de sair', async () => {
    deps.painelDoBalcao.definirRetiradas([movimento({ quando: '2026-09-10T17:51:00.000Z' })])

    const [linha] = (await resumoDoDiaNoBalcao(BALCAO, { hoje: AGORA }, deps)).movimentos

    expect(linha?.diasDeAtraso).toBeNull()
  })

  it('conta atendidos e devolvidos do dia', async () => {
    deps.painelDoBalcao.definirRetiradas([
      movimento({ emprestimoId: 'a', quando: '2026-09-10T12:00:00.000Z' }),
      movimento({ emprestimoId: 'b', quando: '2026-09-10T13:00:00.000Z' }),
      movimento({ emprestimoId: 'c', quando: '2026-09-10T14:00:00.000Z' }),
    ])
    deps.painelDoBalcao.definirDevolucoes([
      movimento({ emprestimoId: 'd', quando: '2026-09-10T15:00:00.000Z' }),
    ])

    const resumo = await resumoDoDiaNoBalcao(BALCAO, { hoje: AGORA }, deps)

    expect(resumo.atendidosHoje).toBe(3)
    expect(resumo.devolvidosHoje).toBe(1)
  })

  it('o limite corta a LISTA e não os contadores', async () => {
    // A prancha mostra o contador ao lado de uma tira curta. Se o
    // contador viesse do tamanho da tira, "27 devoluções" apareceria como
    // 5 — e a coordenação leria o dia como um quinto do que foi.
    deps.painelDoBalcao.definirDevolucoes(
      Array.from({ length: 27 }, (_, i) =>
        movimento({
          emprestimoId: `d_${i}`,
          quando: `2026-09-10T${String(8 + Math.floor(i / 4)).padStart(2, '0')}:0${i % 4}:00.000Z`,
        }),
      ),
    )

    const resumo = await resumoDoDiaNoBalcao(BALCAO, { hoje: AGORA, limite: 5 }, deps)

    expect(resumo.movimentos).toHaveLength(5)
    expect(resumo.devolvidosHoje).toBe(27)
  })

  it('consulta a janela do dia da ESCOLA, não o dia UTC', async () => {
    // 02:00Z do dia 11 é 23:00 do dia 10 em São Paulo. Se a janela fosse
    // o dia UTC, o resumo mostraria um dia recém-começado e vazio com a
    // operadora ainda fechando o balcão.
    const noiteDaEscola = new Date('2026-09-11T02:00:00.000Z')

    await resumoDoDiaNoBalcao(BALCAO, { hoje: noiteDaEscola }, deps)

    const [janela] = deps.painelDoBalcao.janelas()
    expect(janela?.inicio.toISOString()).toBe('2026-09-10T03:00:00.000Z')
    expect(janela?.fim.toISOString()).toBe('2026-09-11T03:00:00.000Z')
  })

  it('dia sem movimento nenhum vem zerado, não nulo', async () => {
    const resumo = await resumoDoDiaNoBalcao(BALCAO, { hoje: AGORA }, deps)

    expect(resumo).toEqual({ atendidosHoje: 0, devolvidosHoje: 0, movimentos: [] })
  })

  it('recusa quem não opera o balcão', async () => {
    await expect(
      resumoDoDiaNoBalcao(SEM_NADA, { hoje: AGORA }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('quem só devolve também vê o resumo', async () => {
    // O monitor que está no turno da devolução não tem por que ser
    // barrado do histórico do próprio balcão.
    const soDevolve: Principal = { ...BALCAO, permissoes: ['emprestimo:devolver'] }

    await expect(
      resumoDoDiaNoBalcao(soDevolve, { hoje: AGORA }, deps),
    ).resolves.toBeTruthy()
  })
})
