import { vi } from 'vitest'
import type {
  DependenciasDoBalcao,
  EmprestimoCriado,
  ExemplarDoBalcao,
  LeitorDoBalcao,
} from '@/modules/circulacao/emprestar.service'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'
import type { SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

const CONFIG_PADRAO: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

/**
 * Fake do balcão inteiro. Conta as transações abertas porque "o exemplar
 * é marcado na MESMA transação do empréstimo" é uma promessa do serviço
 * que só um contador consegue provar.
 */
export function criarFakeDeCirculacao() {
  const leitores = new Map<string, LeitorDoBalcao>([
    ['alu_1', { id: 'alu_1', nome: 'Ana Souza', ativo: true, serie: null, suspensaoAte: null }],
    ['alu_2', { id: 'alu_2', nome: 'Bruno Lima', ativo: true, serie: null, suspensaoAte: null }],
  ])

  const exemplares = new Map<string, ExemplarDoBalcao>([
    ['000001', { id: 'exe_000001', tombo: '000001', obraId: 'obr_1', situacao: 'DISPONIVEL' }],
  ])

  const ativosPorAluno = new Map<string, number>()
  const atrasadosPorAluno = new Map<string, number>()
  const diasNaoLetivos = new Set<string>()
  const overrides: OverrideDeSerie[] = []
  const separadas = new Map<string, { id: string; alunoId: string }>()
  const gravados: EmprestimoCriado[] = []

  let config = { ...CONFIG_PADRAO }
  let atendida = false
  let proximoId = 1
  // Ligado só enquanto a transação está aberta. É o que permite provar
  // que o exemplar foi marcado DENTRO dela — asserção sobre o estado
  // final passaria mesmo com a marcação acontecendo depois do commit.
  let dentroDaTransacao = false
  let marcouDentroDaTransacao: boolean | null = null

  const fake = {
    transacoesAbertas: 0,
    registrarAuditoria: vi.fn().mockResolvedValue(undefined),

    // ─── controles do teste ─────────────────────────────────────────
    definirSerieDoAluno(alunoId: string, serie: string) {
      const leitor = leitores.get(alunoId)
      if (leitor) leitores.set(alunoId, { ...leitor, serie })
    },
    definirOverride(override: OverrideDeSerie) {
      overrides.push(override)
    },
    definirConfiguracao(parcial: Partial<ConfiguracaoDaEscola>) {
      config = { ...config, ...parcial }
    },
    definirDiaNaoLetivo(iso: string) {
      diasNaoLetivos.add(iso)
    },
    definirSuspensao(alunoId: string, ate: Date) {
      const leitor = leitores.get(alunoId)
      if (leitor) leitores.set(alunoId, { ...leitor, suspensaoAte: ate })
    },
    definirAtivosDoAluno(alunoId: string, n: number) {
      ativosPorAluno.set(alunoId, n)
    },
    definirAtrasadosDoAluno(alunoId: string, n: number) {
      atrasadosPorAluno.set(alunoId, n)
    },
    definirSituacaoDoExemplar(tombo: string, situacao: SituacaoDoExemplar) {
      const exemplar = exemplares.get(tombo)
      if (exemplar) exemplares.set(tombo, { ...exemplar, situacao })
    },
    definirReservaSeparada(tombo: string, alunoId: string) {
      const exemplar = exemplares.get(tombo)
      if (exemplar) separadas.set(exemplar.id, { id: 'res_1', alunoId })
    },
    situacaoDoExemplar: (tombo: string) => exemplares.get(tombo)?.situacao,
    marcouExemplarDentroDaTransacao: () => marcouDentroDaTransacao,
    emprestimosGravados: () => gravados,
    reservaAtendida: () => atendida,

    // ─── dependências de verdade ────────────────────────────────────
    async emTransacao<T>(fn: () => Promise<T>): Promise<T> {
      fake.transacoesAbertas += 1
      dentroDaTransacao = true
      try {
        return await fn()
      } finally {
        dentroDaTransacao = false
      }
    },

    balcao: {
      async obterLeitor(alunoId: string) {
        return leitores.get(alunoId) ?? null
      },
      async obterExemplarPorTombo(tombo: string) {
        return exemplares.get(tombo) ?? null
      },
      async configuracaoDaEscola() {
        return config
      },
      async overridesPorSerie() {
        return overrides
      },
      async diasNaoLetivos() {
        return diasNaoLetivos
      },
      async contarAtivosDoAluno(alunoId: string) {
        return ativosPorAluno.get(alunoId) ?? 0
      },
      async contarAtrasadosDoAluno(alunoId: string) {
        return atrasadosPorAluno.get(alunoId) ?? 0
      },
      async reservaQueSeparou(exemplarId: string) {
        return separadas.get(exemplarId) ?? null
      },
      async atenderReserva() {
        atendida = true
      },
      async gravarEmprestimo(dados: {
        exemplarId: string
        alunoId: string
        previstaPara: Date
        liberacaoForcada: boolean
      }): Promise<EmprestimoCriado> {
        const criado: EmprestimoCriado = {
          id: `emp_${proximoId++}`,
          exemplarId: dados.exemplarId,
          alunoId: dados.alunoId,
          previstaPara: dados.previstaPara,
          liberacaoForcada: dados.liberacaoForcada,
        }
        gravados.push(criado)
        return criado
      },
      async marcarExemplar(exemplarId: string, situacao: SituacaoDoExemplar) {
        marcouDentroDaTransacao = dentroDaTransacao
        for (const [tombo, exemplar] of exemplares) {
          if (exemplar.id === exemplarId) exemplares.set(tombo, { ...exemplar, situacao })
        }
      },
    },
  }

  return fake satisfies DependenciasDoBalcao & Record<string, unknown>
}
