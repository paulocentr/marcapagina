import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import { resolverConfiguracao, type ConfiguracaoDaEscola, type OverrideDeSerie } from '@/modules/circulacao/configuracao'
import { calcularSuspensao, diasDeAtraso } from '@/modules/circulacao/penalidade'
import { calcularDataDeDevolucao } from '@/modules/circulacao/prazo'
import type { RepositorioDeReservas } from '@/modules/circulacao/reservas.tipos'
import type { Principal } from '@/core/auth/principal'
import type { EstadoDeConservacao, SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'
import type { EventoDeAuditoria } from '@/core/audit/audit.service'

/**
 * O empréstimo ativo de um tombo, com o que a devolução precisa decidir.
 *
 * Traz `serieDoLeitor` e `obraId` já resolvidos porque a devolução precisa
 * dos dois — o fator de suspensão sai da configuração da série e a fila de
 * reserva é da OBRA, não do exemplar.
 */
export interface EmprestimoParaDevolucao {
  id: string
  exemplarId: string
  obraId: string
  tombo: string
  /** `null` quando quem levou foi da equipe: não há aluno a suspender. */
  alunoId: string | null
  nomeDoLeitor: string
  tituloDaObra: string
  previstaPara: Date
  serieDoLeitor: string | null
}

export interface RepositorioDeDevolucao {
  /**
   * O tombo identifica o empréstimo ativo. Só o ATIVO: um tombo tem uma
   * fila inteira de empréstimos passados, e devolver o de ano passado
   * reabriria o histórico.
   */
  emprestimoAtivoPorTombo(tombo: string): Promise<EmprestimoParaDevolucao | null>
  /**
   * Grava a devolução. Devolve `true` quando ESTA chamada foi a que
   * devolveu — a escrita é condicionada a `devolvidaEm IS NULL`, então
   * duas operadoras no mesmo tombo não geram duas devoluções.
   */
  registrarDevolucao(dados: {
    emprestimoId: string
    devolvidaEm: Date
    operadorDevolucaoId: string
    estado: EstadoDeConservacao
    observacao: string | null
  }): Promise<boolean>
  /** Situação e estado juntos: os dois mudam no mesmo instante. */
  atualizarExemplarNaDevolucao(
    exemplarId: string,
    situacao: SituacaoDoExemplar,
    estado: EstadoDeConservacao,
  ): Promise<void>
  configuracaoDaEscola(): Promise<ConfiguracaoDaEscola>
  overridesPorSerie(): Promise<OverrideDeSerie[]>
  diasNaoLetivos(): Promise<Set<string>>
}

export interface RepositorioDePenalidades {
  registrarSuspensao(dados: {
    alunoId: string
    inicio: Date
    fim: Date
    motivo: string
    emprestimoOrigemId: string
  }): Promise<{ id: string; fim: Date }>
}

export interface DependenciasDeDevolucao {
  devolucao: RepositorioDeDevolucao
  // Só os dois métodos que a devolução usa, do contrato compartilhado de
  // reservas. Pedir a interface inteira obrigaria todo fake da devolução
  // a implementar nove métodos para exercitar dois.
  reservas: Pick<RepositorioDeReservas, 'proximaDaFila' | 'separarExemplar'>
  penalidades: RepositorioDePenalidades
  emTransacao<T>(fn: () => Promise<T>): Promise<T>
  registrarAuditoria(evento: EventoDeAuditoria): Promise<void>
}

export interface EntradaDeDevolucao {
  tombo: string
  hoje: Date
  /** Como o livro voltou. A operadora sempre informa. */
  estado: EstadoDeConservacao
  observacao?: string
}

export interface SuspensaoAplicada {
  dias: number
  /** Último dia da suspensão, inclusive. */
  ate: Date
  motivo: string
  limitadaPeloTeto: boolean
}

export interface ReservaSeparada {
  reservaId: string
  alunoId: string
  retirarAte: Date
}

export interface ResultadoDaDevolucao {
  emprestimoId: string
  tombo: string
  tituloDaObra: string
  nomeDoLeitor: string
  diasDeAtraso: number
  suspensaoAplicada: SuspensaoAplicada | null
  /** Preenchido quando o exemplar saiu separado para a fila. */
  reservaSeparada: ReservaSeparada | null
  situacaoDoExemplar: SituacaoDoExemplar
}

export class SemEmprestimoAtivoError extends ErroDeDominio {
  constructor(readonly tombo: string) {
    super(
      `O tombo ${tombo} não consta emprestado. Confira o número — ` +
        `ou ele já foi devolvido.`,
      'SEM_EMPRESTIMO_ATIVO',
    )
  }
}

/**
 * Devolução no balcão.
 *
 * Faz quatro coisas que precisam valer juntas ou não valer: registra a
 * devolução, atualiza o exemplar, passa a vez para a fila de reserva e —
 * quando houve atraso — aplica a suspensão. Por isso tudo roda dentro de
 * UMA transação: penalidade gravada sem devolução registrada deixa um
 * aluno suspenso por um livro que consta em aberto.
 */
export async function devolver(
  principal: Principal,
  entrada: EntradaDeDevolucao,
  deps: DependenciasDeDevolucao,
): Promise<ResultadoDaDevolucao> {
  exigirPermissao(principal, 'emprestimo:devolver')

  const emprestimo = await deps.devolucao.emprestimoAtivoPorTombo(entrada.tombo)
  if (!emprestimo) throw new SemEmprestimoAtivoError(entrada.tombo)

  const config = await resolverConfiguracaoDoLeitor(emprestimo.serieDoLeitor, deps)

  const atraso = diasDeAtraso(emprestimo.previstaPara, entrada.hoje)

  // A suspensão é do ATRASO, e só dele. Devolver DANIFICADO não entra
  // nesta conta: dano vira observação e decisão humana. Automatizar
  // transformaria a devolução num tribunal e a operadora deixaria de
  // registrar o estado real para evitar o constrangimento — perdendo o
  // único dado que a coordenação teria sobre a conservação do acervo.
  const suspensao =
    emprestimo.alunoId === null
      ? // Penalidade é de aluno. Não há a quem prender a suspensão de um
        // empréstimo da equipe, e inventar um dono seria pior que não punir.
        null
      : calcularSuspensao(atraso, config.diasDeSuspensaoPorDiaDeAtraso)

  const proxima = await deps.reservas.proximaDaFila(emprestimo.obraId)

  // COM fila o exemplar não volta para a estante: ele fica separado para
  // quem esperou. Devolvê-lo a DISPONIVEL faria o próximo da fila perder
  // a vez para quem passasse no balcão por acaso (spec §5.2).
  const situacaoFinal: SituacaoDoExemplar = proxima ? 'RESERVADO' : 'DISPONIVEL'

  const retirarAte = proxima ? await calcularRetirarAte(entrada.hoje, config, deps) : null

  const observacao = entrada.observacao?.trim()

  const resultado = await deps.emTransacao(async () => {
    const devolveu = await deps.devolucao.registrarDevolucao({
      emprestimoId: emprestimo.id,
      devolvidaEm: entrada.hoje,
      operadorDevolucaoId: principal.id,
      estado: entrada.estado,
      // String vazia e `null` significam coisas diferentes no relatório:
      // uma é "a operadora escreveu nada", a outra é "não havia o que
      // escrever". Guardar `''` polui a busca por observação.
      observacao: observacao ? observacao : null,
    })

    // Zero linhas atualizadas significa que outra operadora devolveu este
    // empréstimo entre a leitura e a escrita. Seguir em frente aqui
    // aplicaria a penalidade duas vezes pelo mesmo atraso.
    if (!devolveu) throw new SemEmprestimoAtivoError(entrada.tombo)

    await deps.devolucao.atualizarExemplarNaDevolucao(
      emprestimo.exemplarId,
      situacaoFinal,
      entrada.estado,
    )

    if (proxima && retirarAte) {
      await deps.reservas.separarExemplar(proxima.id, emprestimo.exemplarId, retirarAte)
    }

    if (suspensao && emprestimo.alunoId) {
      await deps.penalidades.registrarSuspensao({
        alunoId: emprestimo.alunoId,
        inicio: diaDe(entrada.hoje),
        fim: ultimoDiaDaSuspensao(entrada.hoje, suspensao.dias),
        motivo: suspensao.motivo,
        emprestimoOrigemId: emprestimo.id,
      })
    }

    return {
      emprestimoId: emprestimo.id,
      tombo: emprestimo.tombo,
      tituloDaObra: emprestimo.tituloDaObra,
      nomeDoLeitor: emprestimo.nomeDoLeitor,
      diasDeAtraso: atraso,
      suspensaoAplicada: suspensao
        ? {
            dias: suspensao.dias,
            ate: ultimoDiaDaSuspensao(entrada.hoje, suspensao.dias),
            motivo: suspensao.motivo,
            limitadaPeloTeto: suspensao.limitadaPeloTeto,
          }
        : null,
      reservaSeparada:
        proxima && retirarAte
          ? { reservaId: proxima.id, alunoId: proxima.alunoId, retirarAte }
          : null,
      situacaoDoExemplar: situacaoFinal,
    } satisfies ResultadoDaDevolucao
  })

  if (resultado.suspensaoAplicada) {
    // A tabela Penalidade não guarda quem aplicou. Sem este registro,
    // ninguém consegue responder ao responsável, meses depois, de onde
    // veio a suspensão do filho dele.
    //
    // Fora da transação e com o erro engolido: o livro já está de volta na
    // estante, e recusar a devolução por causa do registro dela seria pior
    // que o registro faltando.
    await deps
      .registrarAuditoria({
        autor: principal,
        acao: 'penalidade.aplicar',
        entidade: 'Penalidade',
        entidadeId: resultado.emprestimoId,
        dadosDepois: {
          leitor: emprestimo.nomeDoLeitor,
          tombo: emprestimo.tombo,
          diasDeAtraso: atraso,
          diasDeSuspensao: resultado.suspensaoAplicada.dias,
          ate: resultado.suspensaoAplicada.ate.toISOString().slice(0, 10),
        },
      })
      .catch(() => undefined)
  }

  return resultado
}

async function resolverConfiguracaoDoLeitor(
  serie: string | null,
  deps: DependenciasDeDevolucao,
): Promise<ConfiguracaoDaEscola> {
  const [daEscola, overrides] = await Promise.all([
    deps.devolucao.configuracaoDaEscola(),
    deps.devolucao.overridesPorSerie(),
  ])
  return resolverConfiguracao(serie, daEscola, overrides)
}

/**
 * Até quando o exemplar separado espera pelo próximo da fila.
 *
 * Passa pelo calendário da escola pelo mesmo motivo que o prazo de
 * empréstimo: um prazo que vence com a escola fechada tira a vez de quem
 * não tinha como vir buscar.
 */
async function calcularRetirarAte(
  hoje: Date,
  config: ConfiguracaoDaEscola,
  deps: DependenciasDeDevolucao,
): Promise<Date> {
  const diasNaoLetivos = await deps.devolucao.diasNaoLetivos()
  return calcularDataDeDevolucao(hoje, config.prazoDeRetiradaEmDias, (dia) =>
    diasNaoLetivos.has(dia.toISOString().slice(0, 10)),
  )
}

/**
 * O último dia da suspensão, INCLUSIVE — é assim que `avaliarBloqueios`
 * lê `suspensaoAte`.
 *
 * Três dias a partir de hoje são hoje, amanhã e depois: `hoje + 3` daria
 * quatro dias de castigo onde a regra prometeu três.
 */
function ultimoDiaDaSuspensao(hoje: Date, dias: number): Date {
  return somarDias(diaDe(hoje), dias - 1)
}

/** Meia-noite UTC do dia, como faz `diasDeAtraso` — as colunas são @db.Date. */
function diaDe(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()))
}

function somarDias(data: Date, dias: number): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate() + dias))
}
