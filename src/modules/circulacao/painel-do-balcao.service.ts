import { exigirPermissao, exigirQualquerPermissao } from '@/core/rbac/verificar'
import { intervaloDoDiaDaEscola } from '@/modules/circulacao/prazo'
import { diasDeAtraso } from '@/modules/circulacao/penalidade'
import type { Principal } from '@/core/auth/principal'

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Quantas linhas o histórico do balcão devolve quando ninguém pede outro
 * número. A tira da prancha mostra cinco; doze cobre a rolagem sem
 * transformar a consulta num relatório.
 */
const LIMITE_PADRAO_DO_HISTORICO = 12

/**
 * Um exemplar na prateleira física, esperando quem reservou — como o
 * banco o conhece.
 *
 * Sem campo dizendo "vence hoje": isso é decidido por
 * `situacaoDaRetirada`, contra a data. O cron de expiração usa a MESMA
 * fronteira, então a tela não pode dizer "ainda dá tempo" de um exemplar
 * que o cron já devolveu à estante.
 */
export interface ExemplarSeparadoBruto {
  reservaId: string
  exemplarId: string
  tombo: string
  tituloDaObra: string
  nomeDoLeitor: string
  turma: string | null
  /** Onde o exemplar está guardado, para a operadora ir buscar. */
  localizacao: string | null
  retirarAte: Date
}

export interface ExemplarSeparado extends ExemplarSeparadoBruto {
  /** Negativo quando o prazo já passou; 0 quando vence hoje. */
  diasParaRetirar: number
  venceHoje: boolean
  vencido: boolean
}

export type TipoDeMovimento = 'RETIRADA' | 'DEVOLUCAO'

/**
 * Um atendimento do balcão, como o banco o conhece.
 *
 * `quando` é `retiradaEm` na retirada e `devolvidaEm` na devolução — o
 * repositório resolve qual, porque são colunas diferentes da mesma linha.
 * `previstaPara` vem junto para o serviço poder derivar o atraso sem uma
 * segunda consulta.
 */
export interface MovimentoBruto {
  emprestimoId: string
  quando: Date
  nomeDoLeitor: string
  turma: string | null
  tituloDaObra: string
  tombo: string
  previstaPara: Date
}

export interface MovimentoDoBalcao extends MovimentoBruto {
  tipo: TipoDeMovimento
  /**
   * Dias de atraso da devolução; 0 quando voltou em dia.
   *
   * `null` na RETIRADA, e não zero: o livro acabou de sair e não existe
   * atraso a informar. Zero ali seria uma afirmação — "voltou em dia" —
   * sobre um evento que não é devolução.
   */
  diasDeAtraso: number | null
}

export interface ResumoDoDiaNoBalcao {
  /** Empréstimos entregues hoje. Conta o DIA, não a tira exibida. */
  atendidosHoje: number
  devolvidosHoje: number
  movimentos: MovimentoDoBalcao[]
}

/**
 * Consultas dos PAINÉIS do balcão: a prateleira de separados e o
 * histórico do dia.
 *
 * Contrato próprio, separado tanto de `emprestar` quanto da consulta da
 * ficha do leitor, pelo mesmo critério: nenhuma delas fala de um leitor
 * específico, e juntá-las na ficha obrigaria todo fake da ficha a
 * implementar três métodos de painel para exercitar uma regra de bloqueio.
 */
export interface RepositorioDoPainelDoBalcao {
  /** Tudo que está separado agora, sem filtro de data — a tela decide. */
  exemplaresSeparados(): Promise<ExemplarSeparadoBruto[]>
  /** `inicio` inclusivo, `fim` exclusivo. */
  retiradasEntre(inicio: Date, fim: Date): Promise<MovimentoBruto[]>
  devolucoesEntre(inicio: Date, fim: Date): Promise<MovimentoBruto[]>
}

export interface DependenciasDoPainelDoBalcao {
  painelDoBalcao: RepositorioDoPainelDoBalcao
}

export interface EntradaDoResumoDoDia {
  hoje: Date
  /** Quantas linhas do histórico devolver. Não afeta os contadores. */
  limite?: number
}

/**
 * A prateleira de separados: o que está guardado atrás do balcão
 * esperando quem reservou, e o que vence hoje.
 *
 * Exige `reserva:gerenciar` e não `relatorio:ver`: quem trabalha nesta
 * prateleira é quem opera a fila, e o MONITOR — que faz exatamente isso —
 * não tem permissão de relatório.
 */
export async function listarPrateleiraDeSeparados(
  principal: Principal,
  hoje: Date,
  deps: DependenciasDoPainelDoBalcao,
): Promise<ExemplarSeparado[]> {
  exigirPermissao(principal, 'reserva:gerenciar')

  const separados = await deps.painelDoBalcao.exemplaresSeparados()

  return separados
    .map((item) => situacaoDaRetirada(item, hoje))
    // O que vence primeiro em cima. A ordem é regra de tela e fica
    // provada aqui, sem banco; o `orderBy` da consulta é a mesma ordem,
    // e ter as duas é o que mantém a lista certa se a consulta mudar.
    .sort((a, b) => a.retirarAte.getTime() - b.retirarAte.getTime())
}

/**
 * "Vence hoje" / "já venceu" decidido AQUI, sobre a data.
 *
 * A fronteira é a mesma de `listarComRetiradaVencida`, que é quem o cron
 * usa para devolver o exemplar à estante: `retirarAte < hoje` já venceu,
 * `retirarAte == hoje` ainda dá o dia inteiro. Duas fronteiras diferentes
 * fariam a tela prometer um exemplar que o cron já tirou da reserva.
 */
function situacaoDaRetirada(item: ExemplarSeparadoBruto, hoje: Date): ExemplarSeparado {
  const dias = diasInteirosEntre(hoje, item.retirarAte)

  return {
    ...item,
    diasParaRetirar: dias,
    venceHoje: dias === 0,
    vencido: dias < 0,
  }
}

/**
 * Dias inteiros de `de` até `ate`, com sinal, comparando os DIAS e não os
 * instantes. Negativo quando `ate` já passou.
 */
function diasInteirosEntre(de: Date, ate: Date): number {
  return Math.round((diaEmUtc(ate) - diaEmUtc(de)) / MILISSEGUNDOS_POR_DIA)
}

function diaEmUtc(data: Date): number {
  return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate())
}

/**
 * "Últimos do balcão": o dia de trabalho em uma linha do tempo, mais os
 * contadores de atendidos e devolvidos.
 *
 * Retirada e devolução são colunas diferentes da MESMA linha de
 * empréstimo, então um livro que saiu e voltou no mesmo dia aparece duas
 * vezes — e deve: foram dois atendimentos. Deduplicar por empréstimo
 * esconderia metade do trabalho do dia.
 *
 * Os contadores saem das listas COMPLETAS do dia, e o `limite` corta
 * apenas a tira devolvida. Contar o tamanho da tira transformaria "27
 * devoluções" em "5" e faria a coordenação ler o dia como um quinto do
 * que foi.
 */
export async function resumoDoDiaNoBalcao(
  principal: Principal,
  entrada: EntradaDoResumoDoDia,
  deps: DependenciasDoPainelDoBalcao,
): Promise<ResumoDoDiaNoBalcao> {
  // Quem empresta OU quem devolve: o histórico é do próprio balcão, e
  // barrar o monitor do turno da devolução não protegeria nada.
  exigirQualquerPermissao(principal, ['emprestimo:criar', 'emprestimo:devolver'])

  // A janela é o dia da ESCOLA, não o dia UTC nem o dia do processo. Ver
  // `intervaloDoDiaDaEscola`: às 21h em São Paulo o dia UTC já virou, e o
  // contador apagaria o trabalho da operadora na frente dela.
  const { inicio, fim } = intervaloDoDiaDaEscola(entrada.hoje)

  const [retiradas, devolucoes] = await Promise.all([
    deps.painelDoBalcao.retiradasEntre(inicio, fim),
    deps.painelDoBalcao.devolucoesEntre(inicio, fim),
  ])

  const limite = entrada.limite === undefined ? LIMITE_PADRAO_DO_HISTORICO : entrada.limite

  const movimentos = [
    ...retiradas.map((m): MovimentoDoBalcao => ({ ...m, tipo: 'RETIRADA', diasDeAtraso: null })),
    ...devolucoes.map(
      (m): MovimentoDoBalcao => ({
        ...m,
        tipo: 'DEVOLUCAO',
        // Derivado da data prevista contra a hora em que voltou — o mesmo
        // cálculo que a penalidade usou na devolução.
        diasDeAtraso: diasDeAtraso(m.previstaPara, m.quando),
      }),
    ),
  ]
    // Mais recente em cima: é a ordem em que a operadora confere o que
    // acabou de fazer. O desempate por id mantém a tira estável quando
    // dois atendimentos caem no mesmo instante gravado.
    .sort(
      (a, b) =>
        b.quando.getTime() - a.quando.getTime() || a.emprestimoId.localeCompare(b.emprestimoId),
    )
    .slice(0, limite)

  return {
    atendidosHoje: retiradas.length,
    devolvidosHoje: devolucoes.length,
    movimentos,
  }
}
