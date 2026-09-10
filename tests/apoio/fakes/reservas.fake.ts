import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'
import type { LeitorDoBalcao } from '@/modules/circulacao/emprestar.service'
import type { SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'
import type { ReservaNaFila, StatusDaReserva } from '@/modules/circulacao/reservas.tipos'
import type { DependenciasDeReserva } from '@/modules/circulacao/reservas.service'
import type { DependenciasDeRenovacao } from '@/modules/circulacao/renovar.service'
import type { EmprestimoEmCurso } from '@/modules/circulacao/emprestimos-em-curso.tipos'

const CONFIG_PADRAO: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

function meiaNoiteUtc(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()))
}

/**
 * Estado em memória compartilhado por reservas e renovação.
 *
 * As duas faces do fake mexem no MESMO acervo e na MESMA fila de propósito:
 * "renovar é recusado quando há fila" só é provável de verdade se a fila
 * que a renovação enxerga for a mesma que `reservar` alimentou.
 */
export function criarBibliotecaFalsa() {
  const leitores = new Map<string, LeitorDoBalcao>([
    ['alu_1', { id: 'alu_1', nome: 'Ana Souza', ativo: true, serie: null, suspensaoAte: null }],
    ['alu_2', { id: 'alu_2', nome: 'Bruno Lima', ativo: true, serie: null, suspensaoAte: null }],
    ['alu_3', { id: 'alu_3', nome: 'Clara Dias', ativo: true, serie: null, suspensaoAte: null }],
  ])

  const situacoes = new Map<string, SituacaoDoExemplar>([
    ['exe_1', 'DISPONIVEL'],
    ['exe_2', 'DISPONIVEL'],
  ])

  // O acervo desta escola. Um id fora daqui é obra de outra escola (ou
  // digitação), e a reserva tem de recusar em vez de gravar uma fila que
  // ninguém vai atender.
  const obras = new Set(['obr_1', 'obr_2'])

  const reservas: ReservaNaFila[] = []
  const emprestimos = new Map<string, EmprestimoEmCurso>()
  const emMaos = new Set<string>()
  const overrides: OverrideDeSerie[] = []
  const diasNaoLetivos = new Set<string>()

  let config = { ...CONFIG_PADRAO }
  let proximoId = 1
  let dentroDaTransacao = false
  const criouDentroDaTransacao: boolean[] = []
  let falharAoMudarStatusDe: string | null = null

  const estado = {
    transacoesAbertas: 0,

    // ─── controles do teste ─────────────────────────────────────────
    definirConfiguracao(parcial: Partial<ConfiguracaoDaEscola>) {
      config = { ...config, ...parcial }
    },
    definirOverride(override: OverrideDeSerie) {
      overrides.push(override)
    },
    definirSerieDoAluno(alunoId: string, serie: string) {
      const leitor = leitores.get(alunoId)
      if (leitor) leitores.set(alunoId, { ...leitor, serie })
    },
    definirSuspensao(alunoId: string, ate: Date | null) {
      const leitor = leitores.get(alunoId)
      if (leitor) leitores.set(alunoId, { ...leitor, suspensaoAte: ate })
    },
    desativarLeitor(alunoId: string) {
      const leitor = leitores.get(alunoId)
      if (leitor) leitores.set(alunoId, { ...leitor, ativo: false })
    },
    definirDiaNaoLetivo(iso: string) {
      diasNaoLetivos.add(iso)
    },
    definirExemplarEmMaosDe(alunoId: string, obraId: string) {
      emMaos.add(`${alunoId}|${obraId}`)
    },
    definirSituacaoDoExemplar(exemplarId: string, situacao: SituacaoDoExemplar) {
      situacoes.set(exemplarId, situacao)
    },
    /** Faz `mudarStatus` explodir para uma reserva — prova que uma falha
     *  isolada não impede o resto do lote. */
    fazerFalharAoExpirar(reservaId: string) {
      falharAoMudarStatusDe = reservaId
    },
    inserirReserva(parcial: Partial<ReservaNaFila> & { obraId: string; alunoId: string }) {
      const reserva: ReservaNaFila = {
        id: parcial.id ?? `res_${proximoId++}`,
        obraId: parcial.obraId,
        alunoId: parcial.alunoId,
        posicao: parcial.posicao ?? reservas.length + 1,
        status: parcial.status ?? 'AGUARDANDO',
        exemplarSeparadoId: parcial.exemplarSeparadoId ?? null,
        retirarAte: parcial.retirarAte ?? null,
      }
      reservas.push(reserva)
      return reserva
    },
    inserirEmprestimo(parcial: Partial<EmprestimoEmCurso> & { id: string }) {
      const emprestimo: EmprestimoEmCurso = {
        id: parcial.id,
        alunoId: parcial.alunoId ?? 'alu_1',
        exemplarId: parcial.exemplarId ?? 'exe_1',
        obraId: parcial.obraId ?? 'obr_1',
        previstaPara: parcial.previstaPara ?? new Date(Date.UTC(2026, 8, 24)),
        devolvidaEm: parcial.devolvidaEm ?? null,
        renovacoes: parcial.renovacoes ?? 0,
      }
      emprestimos.set(emprestimo.id, emprestimo)
      return emprestimo
    },

    // ─── leitura do que aconteceu ───────────────────────────────────
    reservasDaObra: (obraId: string) => reservas.filter((r) => r.obraId === obraId),
    reserva: (id: string) => reservas.find((r) => r.id === id),
    emprestimo: (id: string) => emprestimos.get(id),
    situacaoDoExemplar: (exemplarId: string) => situacoes.get(exemplarId),
    criouReservaDentroDaTransacao: () => criouDentroDaTransacao,

    // ─── dependências de verdade ────────────────────────────────────
    async emTransacao<T>(fn: () => Promise<T>): Promise<T> {
      estado.transacoesAbertas += 1
      const jaEstava = dentroDaTransacao
      dentroDaTransacao = true
      try {
        return await fn()
      } finally {
        dentroDaTransacao = jaEstava
      }
    },

    balcao: {
      async obterLeitor(alunoId: string) {
        return leitores.get(alunoId) ?? null
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
      async marcarExemplar(exemplarId: string, situacao: SituacaoDoExemplar) {
        situacoes.set(exemplarId, situacao)
      },
    },

    acervo: {
      async obraExiste(obraId: string) {
        return obras.has(obraId)
      },
    },

    reservas: {
      async proximaDaFila(obraId: string) {
        const fila = reservas
          .filter((r) => r.obraId === obraId && r.status === 'AGUARDANDO')
          .sort((a, b) => a.posicao - b.posicao)
        return fila[0] ?? null
      },
      async listarFila(obraId: string) {
        return reservas
          .filter((r) => r.obraId === obraId && (r.status === 'AGUARDANDO' || r.status === 'DISPONIVEL'))
          .sort((a, b) => a.posicao - b.posicao)
      },
      async contarAguardando(obraId: string) {
        return reservas.filter((r) => r.obraId === obraId && r.status === 'AGUARDANDO').length
      },
      async reservaVivaDoAluno(obraId: string, alunoId: string) {
        return (
          reservas.find(
            (r) =>
              r.obraId === obraId &&
              r.alunoId === alunoId &&
              (r.status === 'AGUARDANDO' || r.status === 'DISPONIVEL'),
          ) ?? null
        )
      },
      async ultimaPosicao(obraId: string) {
        const vivas = reservas.filter(
          (r) => r.obraId === obraId && (r.status === 'AGUARDANDO' || r.status === 'DISPONIVEL'),
        )
        return vivas.reduce((maior, r) => Math.max(maior, r.posicao), 0)
      },
      async criar(dados: { obraId: string; alunoId: string; posicao: number }) {
        criouDentroDaTransacao.push(dentroDaTransacao)
        return estado.inserirReserva(dados)
      },
      async separarExemplar(reservaId: string, exemplarId: string, retirarAte: Date) {
        const reserva = reservas.find((r) => r.id === reservaId)
        if (!reserva) return
        reserva.status = 'DISPONIVEL'
        reserva.exemplarSeparadoId = exemplarId
        reserva.retirarAte = retirarAte
      },
      async listarComRetiradaVencida(hoje: Date) {
        // Mesma fronteira do repositório real: quem tem até HOJE ainda
        // tem o dia inteiro.
        const limite = meiaNoiteUtc(hoje).getTime()
        return reservas
          .filter((r) => r.status === 'DISPONIVEL' && r.retirarAte !== null && r.retirarAte.getTime() < limite)
          .sort((a, b) => (a.retirarAte?.getTime() ?? 0) - (b.retirarAte?.getTime() ?? 0))
      },
      async mudarStatus(reservaId: string, status: StatusDaReserva) {
        if (falharAoMudarStatusDe === reservaId) {
          throw new Error('banco fora do ar para esta reserva')
        }
        const reserva = reservas.find((r) => r.id === reservaId)
        if (!reserva) return
        reserva.status = status
        if (status === 'AGUARDANDO') {
          reserva.exemplarSeparadoId = null
          reserva.retirarAte = null
        }
      },
      async obter(reservaId: string) {
        return reservas.find((r) => r.id === reservaId) ?? null
      },
    },

    emprestimosEmCurso: {
      async alunoEstaComAObra(alunoId: string, obraId: string) {
        return emMaos.has(`${alunoId}|${obraId}`)
      },
      async obter(emprestimoId: string) {
        const emprestimo = emprestimos.get(emprestimoId)
        // CÓPIA, como o repositório real devolve. Entregar a referência
        // viva faria o serviço enxergar a própria escrita acontecer
        // debaixo dele e o fake provaria algo que o banco não faz.
        return emprestimo ? { ...emprestimo } : null
      },
      async registrarRenovacao(emprestimoId: string, novaPrevista: Date) {
        const emprestimo = emprestimos.get(emprestimoId)
        // Mesma condição do UPDATE real: só renova o que ainda está fora.
        if (!emprestimo || emprestimo.devolvidaEm !== null) return 0
        emprestimo.previstaPara = novaPrevista
        emprestimo.renovacoes += 1
        return 1
      },
    },
  }

  return estado
}

export function criarFakeDeReservas() {
  return criarBibliotecaFalsa() satisfies DependenciasDeReserva & Record<string, unknown>
}

export function criarFakeDeRenovacao() {
  return criarBibliotecaFalsa() satisfies DependenciasDeRenovacao & Record<string, unknown>
}
