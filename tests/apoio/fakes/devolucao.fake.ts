import { vi } from 'vitest'
import type {
  DependenciasDeDevolucao,
  EmprestimoParaDevolucao,
} from '@/modules/circulacao/devolver.service'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'
import type { ReservaNaFila } from '@/modules/circulacao/reservas.tipos'
import type { EstadoDeConservacao, SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

const CONFIG_PADRAO: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

interface DevolucaoGravada {
  emprestimoId: string
  devolvidaEm: Date
  operadorDevolucaoId: string
  estado: EstadoDeConservacao
  observacao: string | null
  dentroDaTransacao: boolean
}

interface SuspensaoGravada {
  alunoId: string
  inicio: Date
  fim: Date
  motivo: string
  emprestimoOrigemId: string
  dentroDaTransacao: boolean
}

interface SeparacaoGravada {
  reservaId: string
  exemplarId: string
  retirarAte: Date
  dentroDaTransacao: boolean
}

/**
 * Fake da devolução inteira.
 *
 * Cada escrita anota se aconteceu DENTRO da transação. Asserção sobre o
 * estado final passaria igual com a penalidade gravada depois do commit —
 * e é exatamente esse caso que produz aluno suspenso por um empréstimo
 * que consta em aberto.
 */
export function criarFakeDeDevolucao() {
  const emprestimosAtivos = new Map<string, EmprestimoParaDevolucao>([
    [
      '000001',
      {
        id: 'emp_1',
        exemplarId: 'exe_000001',
        obraId: 'obr_1',
        tombo: '000001',
        alunoId: 'alu_1',
        nomeDoLeitor: 'Ana Souza',
        tituloDaObra: 'Dom Casmurro',
        previstaPara: new Date('2026-09-24T00:00:00.000Z'),
        serieDoLeitor: null,
      },
    ],
  ])

  const exemplares = new Map<string, { situacao: SituacaoDoExemplar; estado: EstadoDeConservacao }>(
    [['exe_000001', { situacao: 'EMPRESTADO', estado: 'BOM' }]],
  )

  const fila = new Map<string, ReservaNaFila[]>()
  const overrides: OverrideDeSerie[] = []
  const diasNaoLetivos = new Set<string>()
  const devolucoes: DevolucaoGravada[] = []
  const suspensoes: SuspensaoGravada[] = []
  const separacoes: SeparacaoGravada[] = []

  let config = { ...CONFIG_PADRAO }
  let dentroDaTransacao = false
  let atualizouExemplarDentroDaTransacao: boolean | null = null
  let proximaPenalidade = 1

  const fake = {
    transacoesAbertas: 0,
    registrarAuditoria: vi.fn().mockResolvedValue(undefined),

    // ─── controles do teste ─────────────────────────────────────────
    definirConfiguracao(parcial: Partial<ConfiguracaoDaEscola>) {
      config = { ...config, ...parcial }
    },
    definirOverride(override: OverrideDeSerie) {
      overrides.push(override)
    },
    definirSerieDoLeitor(serie: string | null) {
      const emprestimo = emprestimosAtivos.get('000001')
      if (emprestimo) emprestimosAtivos.set('000001', { ...emprestimo, serieDoLeitor: serie })
    },
    definirPrevistaPara(iso: string) {
      const emprestimo = emprestimosAtivos.get('000001')
      if (emprestimo) {
        emprestimosAtivos.set('000001', {
          ...emprestimo,
          previstaPara: new Date(`${iso}T00:00:00.000Z`),
        })
      }
    },
    definirLeitorDaEquipe() {
      const emprestimo = emprestimosAtivos.get('000001')
      if (emprestimo) {
        emprestimosAtivos.set('000001', {
          ...emprestimo,
          alunoId: null,
          nomeDoLeitor: 'Leitor da equipe',
        })
      }
    },
    definirDiaNaoLetivo(iso: string) {
      diasNaoLetivos.add(iso)
    },
    definirFila(obraId: string, alunosNaOrdem: string[]) {
      fila.set(
        obraId,
        alunosNaOrdem.map((alunoId, indice) => ({
          id: `res_${indice + 1}`,
          obraId,
          alunoId,
          posicao: indice + 1,
          status: 'AGUARDANDO' as const,
          exemplarSeparadoId: null,
          retirarAte: null,
        })),
      )
    },

    // ─── o que o teste observa ──────────────────────────────────────
    devolucoesGravadas: () => devolucoes,
    suspensoesGravadas: () => suspensoes,
    separacoesGravadas: () => separacoes,
    exemplar: (exemplarId: string) => exemplares.get(exemplarId),
    exemplarAtualizadoDentroDaTransacao: () => atualizouExemplarDentroDaTransacao,

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

    devolucao: {
      async emprestimoAtivoPorTombo(tombo: string) {
        return emprestimosAtivos.get(tombo) ?? null
      },
      async registrarDevolucao(dados: {
        emprestimoId: string
        devolvidaEm: Date
        operadorDevolucaoId: string
        estado: EstadoDeConservacao
        observacao: string | null
      }): Promise<boolean> {
        // O fake espelha o `updateMany` condicional do repositório real:
        // quem já foi devolvido não é devolvido de novo, e quem chega
        // segundo recebe `false` em vez de sobrescrever o primeiro.
        const jaGravada = devolucoes.some((d) => d.emprestimoId === dados.emprestimoId)
        if (jaGravada) return false

        devolucoes.push({ ...dados, dentroDaTransacao })
        for (const [tombo, emprestimo] of emprestimosAtivos) {
          if (emprestimo.id === dados.emprestimoId) emprestimosAtivos.delete(tombo)
        }
        return true
      },
      async atualizarExemplarNaDevolucao(
        exemplarId: string,
        situacao: SituacaoDoExemplar,
        estado: EstadoDeConservacao,
      ): Promise<void> {
        atualizouExemplarDentroDaTransacao = dentroDaTransacao
        exemplares.set(exemplarId, { situacao, estado })
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
    },

    reservas: {
      async proximaDaFila(obraId: string): Promise<ReservaNaFila | null> {
        const aguardando = (fila.get(obraId) ?? []).filter((r) => r.status === 'AGUARDANDO')
        return aguardando[0] ?? null
      },
      async separarExemplar(reservaId: string, exemplarId: string, retirarAte: Date) {
        separacoes.push({ reservaId, exemplarId, retirarAte, dentroDaTransacao })
        for (const reservas of fila.values()) {
          for (const reserva of reservas) {
            if (reserva.id === reservaId) {
              reserva.status = 'DISPONIVEL'
              reserva.exemplarSeparadoId = exemplarId
              reserva.retirarAte = retirarAte
            }
          }
        }
      },
    },

    penalidades: {
      async registrarSuspensao(dados: {
        alunoId: string
        inicio: Date
        fim: Date
        motivo: string
        emprestimoOrigemId: string
      }) {
        suspensoes.push({ ...dados, dentroDaTransacao })
        return { id: `pen_${proximaPenalidade++}`, fim: dados.fim }
      },
    },
  }

  return fake satisfies DependenciasDeDevolucao & Record<string, unknown>
}
