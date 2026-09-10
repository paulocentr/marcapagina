import { exigirQualquerPermissao } from '@/core/rbac/verificar'
import type { Principal } from '@/core/auth/principal'

/**
 * A fila de reserva vista POR OBRA — a consulta que a tela de reservas
 * abre com.
 *
 * `filaDaObra`, em `reservas.service.ts`, responde por UMA obra e devolve
 * `ReservaNaFila`, que carrega só identificadores. Serve ao balcão, que
 * já tem a obra na mão e só precisa da posição. Não serve à tela de
 * reservas: ali a pergunta é "quem é o próximo de cada fila", e um
 * `alunoId` na tela não responde "quem" a ninguém.
 *
 * Por isso o contrato é próprio, e por isso ele é de CONSULTA: nada aqui
 * escreve. Quem cria, cancela e passa a vez continua sendo
 * `reservas.service.ts`, com a transação e as regras.
 */

/** Reserva VIVA: ainda espera, ou já tem exemplar guardado no balcão. */
export type StatusVivoDaReserva = 'AGUARDANDO' | 'DISPONIVEL'

/**
 * Uma reserva viva como o banco a conhece, com os joins que a tela lê.
 *
 * `tomboSeparado` e `retirarAte` andam juntos e só existem na reserva já
 * separada — é assim que `separarExemplar` os grava, na mesma escrita.
 */
export interface ReservaVivaBruta {
  reservaId: string
  obraId: string
  tituloDaObra: string
  posicao: number
  status: StatusVivoDaReserva
  alunoId: string
  nomeDoLeitor: string
  matricula: string
  turma: string | null
  tomboSeparado: string | null
  retirarAte: Date | null
}

interface PessoaNaFilaBase {
  reservaId: string
  posicao: number
  alunoId: string
  nomeDoLeitor: string
  matricula: string
  turma: string | null
}

/**
 * Uma pessoa na fila, com o estado no TIPO e não em campo opcional.
 *
 * A união discriminada é o que impede a tela de escrever "reservado até
 * —": no ramo `DISPONIVEL` o tombo e o prazo existem, e no ramo
 * `AGUARDANDO` eles não existem para serem lidos por engano.
 */
export type PessoaNaFila =
  | (PessoaNaFilaBase & { status: 'AGUARDANDO' })
  | (PessoaNaFilaBase & { status: 'DISPONIVEL'; tomboSeparado: string; retirarAte: Date })

export interface FilaDaObra {
  obraId: string
  tituloDaObra: string
  /** Quantos ainda esperam por uma cópia que volte. */
  esperando: number
  /**
   * Quantas cópias desta obra já estão guardadas esperando quem reservou.
   *
   * Pode ser mais de uma, e legitimamente: duas cópias devolvidas no
   * mesmo dia separam duas reservas da mesma fila.
   */
  separados: number
  /** A fila inteira, em ordem de chegada. */
  pessoas: PessoaNaFila[]
}

export interface RepositorioDaFilaDeReservas {
  /**
   * Toda reserva viva da escola, com nome, matrícula, turma, título e o
   * tombo já separado. Sem filtro de obra: a tela mostra as filas todas,
   * e uma consulta por obra seria um N+1 num painel que a operadora
   * deixa aberto.
   */
  reservasVivas(): Promise<ReservaVivaBruta[]>
}

export interface DependenciasDaFilaDeReservas {
  filaDeReservas: RepositorioDaFilaDeReservas
}

/**
 * As filas vivas da escola, uma por obra.
 *
 * Exige `reserva:criar` OU `reserva:gerenciar`, o mesmo par de
 * `filaDaObra`: "sou o quantos?" é respondido na frente do aluno pelo
 * monitor, que alimenta a fila. Exigir só `reserva:gerenciar` o deixaria
 * sem conseguir informar a fila que ele mesmo criou.
 */
export async function listarFilasDeReserva(
  principal: Principal,
  deps: DependenciasDaFilaDeReservas,
): Promise<FilaDaObra[]> {
  exigirQualquerPermissao(principal, ['reserva:criar', 'reserva:gerenciar'])

  const vivas = await deps.filaDeReservas.reservasVivas()
  return agruparFilasPorObra(vivas)
}

/**
 * Agrupa as reservas vivas por obra. Função pura, exportada para o teste
 * de unidade poder provar a ordem e as contagens sem banco.
 */
export function agruparFilasPorObra(vivas: ReservaVivaBruta[]): FilaDaObra[] {
  const porObra = new Map<string, FilaDaObra>()

  for (const viva of vivas) {
    // `?? { … }` seria o atalho errado aqui: a fila nova tem de nascer com
    // título e id, e um objeto vazio como padrão criaria uma obra sem nome
    // na tela em vez de falhar onde o dado falta.
    const jaVista = porObra.get(viva.obraId)
    const fila: FilaDaObra =
      jaVista === undefined
        ? {
            obraId: viva.obraId,
            tituloDaObra: viva.tituloDaObra,
            esperando: 0,
            separados: 0,
            pessoas: [],
          }
        : jaVista

    fila.pessoas.push(comoPessoa(viva))
    if (viva.status === 'DISPONIVEL') fila.separados += 1
    else fila.esperando += 1

    porObra.set(viva.obraId, fila)
  }

  for (const fila of porObra.values()) {
    // Ordem de chegada, com desempate por id de reserva. O desempate
    // existe porque duas reservas simultâneas ainda podem nascer com a
    // MESMA posição (ver `ordemDaFila` em reservas.repository.ts) — e sem
    // ele a fila mudaria de ordem a cada recarga da tela.
    fila.pessoas.sort((a, b) => a.posicao - b.posicao || a.reservaId.localeCompare(b.reservaId))
  }

  // Fila maior em cima: é onde a coordenação precisa de outra cópia e
  // onde a operadora tem mais gente para atender. Desempate por título e
  // depois por id, para a tela não trocar de ordem sozinha entre duas
  // obras com a mesma fila.
  return [...porObra.values()].sort(
    (a, b) =>
      b.pessoas.length - a.pessoas.length ||
      a.tituloDaObra.localeCompare(b.tituloDaObra, 'pt-BR') ||
      a.obraId.localeCompare(b.obraId),
  )
}

function comoPessoa(viva: ReservaVivaBruta): PessoaNaFila {
  const base: PessoaNaFilaBase = {
    reservaId: viva.reservaId,
    posicao: viva.posicao,
    alunoId: viva.alunoId,
    nomeDoLeitor: viva.nomeDoLeitor,
    matricula: viva.matricula,
    turma: viva.turma,
  }

  if (viva.status === 'AGUARDANDO') return { ...base, status: 'AGUARDANDO' }

  // Uma reserva DISPONIVEL sem prazo é uma que o cron nunca vai expirar:
  // o exemplar fica preso a ela para sempre, fora da estante e fora da
  // fila. Falhar alto é melhor que desenhar "reservado até —" e esconder
  // o defeito de quem poderia avisar.
  if (viva.retirarAte === null || viva.tomboSeparado === null) {
    throw new Error(
      `Reserva ${viva.reservaId} está DISPONIVEL sem exemplar separado ou sem prazo de retirada.`,
    )
  }

  return {
    ...base,
    status: 'DISPONIVEL',
    tomboSeparado: viva.tomboSeparado,
    retirarAte: viva.retirarAte,
  }
}
