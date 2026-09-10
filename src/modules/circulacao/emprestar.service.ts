import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import { avaliarBloqueios, type Bloqueio } from '@/modules/circulacao/bloqueios'
import { resolverConfiguracao, type ConfiguracaoDaEscola, type OverrideDeSerie } from '@/modules/circulacao/configuracao'
import { calcularDataDeDevolucao } from '@/modules/circulacao/prazo'
import type { Principal } from '@/core/auth/principal'
import type { SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'
import type { EventoDeAuditoria } from '@/core/audit/audit.service'

export interface LeitorDoBalcao {
  id: string
  nome: string
  ativo: boolean
  /** Série da turma, para resolver o override. `null` para staff. */
  serie: string | null
  suspensaoAte: Date | null
}

export interface ExemplarDoBalcao {
  id: string
  tombo: string
  obraId: string
  situacao: SituacaoDoExemplar
}

export interface EmprestimoCriado {
  id: string
  exemplarId: string
  alunoId: string
  previstaPara: Date
  liberacaoForcada: boolean
}

export interface EntradaDeEmprestimo {
  alunoId: string
  tombo: string
  hoje: Date
  liberacaoForcada?: boolean
  justificativa?: string
}

export interface RepositorioDoBalcao {
  obterLeitor(alunoId: string): Promise<LeitorDoBalcao | null>
  obterExemplarPorTombo(tombo: string): Promise<ExemplarDoBalcao | null>
  configuracaoDaEscola(): Promise<ConfiguracaoDaEscola>
  overridesPorSerie(): Promise<OverrideDeSerie[]>
  diasNaoLetivos(): Promise<Set<string>>
  contarAtivosDoAluno(alunoId: string): Promise<number>
  contarAtrasadosDoAluno(alunoId: string, hoje: Date): Promise<number>
  /** A reserva que separou este exemplar, se houver. */
  reservaQueSeparou(exemplarId: string): Promise<{ id: string; alunoId: string } | null>
  atenderReserva(reservaId: string): Promise<void>
  gravarEmprestimo(dados: {
    exemplarId: string
    alunoId: string
    previstaPara: Date
    operadorRetiradaId: string
    liberacaoForcada: boolean
    justificativaDaLiberacao: string | null
  }): Promise<EmprestimoCriado>
  marcarExemplar(exemplarId: string, situacao: SituacaoDoExemplar): Promise<void>
}

export interface DependenciasDoBalcao {
  balcao: RepositorioDoBalcao
  emTransacao<T>(fn: () => Promise<T>): Promise<T>
  registrarAuditoria(evento: EventoDeAuditoria): Promise<void>
}

export class LeitorInexistenteError extends ErroDeDominio {
  constructor() {
    super('Este leitor não existe nesta escola.', 'LEITOR_INEXISTENTE')
  }
}

export class ExemplarIndisponivelError extends ErroDeDominio {
  constructor(readonly tombo: string, readonly situacao: SituacaoDoExemplar | null) {
    super(
      situacao === null
        ? `Não achei o tombo ${tombo} nesta escola. Confira o número.`
        : `O tombo ${tombo} não está disponível (${situacao.toLowerCase()}).`,
      'EXEMPLAR_INDISPONIVEL',
    )
  }
}

export class ExemplarReservadoParaOutroError extends ErroDeDominio {
  constructor() {
    super(
      'Este exemplar está separado para outro leitor da fila de reserva. ' +
        'Emprestá-lo aqui tiraria a vez de quem esperou.',
      'EXEMPLAR_RESERVADO_PARA_OUTRO',
    )
  }
}

export class BloqueiosDoLeitorError extends ErroDeDominio {
  constructor(readonly bloqueios: Bloqueio[]) {
    super(bloqueios.map((b) => b.mensagem).join(' '), 'LEITOR_BLOQUEADO')
  }
}

export class JustificativaObrigatoriaError extends ErroDeDominio {
  constructor() {
    super(
      'Para liberar sobre um bloqueio é obrigatório escrever a justificativa — ' +
        'ela fica registrada na auditoria.',
      'JUSTIFICATIVA_OBRIGATORIA',
    )
  }
}

/**
 * Empréstimo no balcão. Roda dezenas de vezes por dia (spec §5.1).
 */
export async function emprestar(
  principal: Principal,
  entrada: EntradaDeEmprestimo,
  deps: DependenciasDoBalcao,
): Promise<EmprestimoCriado> {
  exigirPermissao(principal, 'emprestimo:criar')

  const [leitor, exemplar] = await Promise.all([
    deps.balcao.obterLeitor(entrada.alunoId),
    deps.balcao.obterExemplarPorTombo(entrada.tombo),
  ])

  if (!leitor) throw new LeitorInexistenteError()
  if (!exemplar) throw new ExemplarIndisponivelError(entrada.tombo, null)

  // A reserva é checada ANTES da disponibilidade porque um exemplar
  // separado está justamente em RESERVADO: cair no erro genérico de
  // indisponível esconderia da operadora que ele é de alguém da fila.
  const reserva =
    exemplar.situacao === 'RESERVADO' ? await deps.balcao.reservaQueSeparou(exemplar.id) : null

  if (reserva && reserva.alunoId !== leitor.id) throw new ExemplarReservadoParaOutroError()
  if (exemplar.situacao !== 'DISPONIVEL' && !reserva) {
    throw new ExemplarIndisponivelError(entrada.tombo, exemplar.situacao)
  }

  const config = await resolverConfiguracaoDoLeitor(leitor, deps)

  const [ativos, atrasados] = await Promise.all([
    deps.balcao.contarAtivosDoAluno(leitor.id),
    deps.balcao.contarAtrasadosDoAluno(leitor.id, entrada.hoje),
  ])

  const bloqueios = avaliarBloqueios(
    {
      ativo: leitor.ativo,
      emprestimosAtivos: ativos,
      emprestimosEmAtraso: atrasados,
      suspensaoAte: leitor.suspensaoAte,
    },
    config,
    entrada.hoje,
  )

  const justificativa = entrada.justificativa?.trim() ?? ''
  const querForcar = entrada.liberacaoForcada === true

  if (bloqueios.length > 0) {
    // Só existe UM caminho para emprestar sobre bloqueio, e ele sempre
    // audita (Global Constraint 18). Um `if` que pula a checagem "porque
    // é caso especial" é o começo do fim da confiança no relatório de
    // atrasados.
    if (!querForcar) throw new BloqueiosDoLeitorError(bloqueios)
    exigirPermissao(principal, 'emprestimo:forcar')
    if (!justificativa) throw new JustificativaObrigatoriaError()
  }

  // A exceção é o que se audita. Auditar o caminho normal encheria o log
  // de ruído e esconderia justamente o que interessa.
  const ehExcecao = bloqueios.length > 0 && querForcar

  const diasNaoLetivos = await deps.balcao.diasNaoLetivos()
  const previstaPara = calcularDataDeDevolucao(entrada.hoje, config.prazoEmDias, (dia) =>
    diasNaoLetivos.has(dia.toISOString().slice(0, 10)),
  )

  const emprestimo = await deps.emTransacao(async () => {
    const criado = await deps.balcao.gravarEmprestimo({
      exemplarId: exemplar.id,
      alunoId: leitor.id,
      previstaPara,
      operadorRetiradaId: principal.id,
      liberacaoForcada: ehExcecao,
      justificativaDaLiberacao: ehExcecao ? justificativa : null,
    })

    // Na MESMA transação: empréstimo gravado com o exemplar ainda
    // DISPONIVEL faz o mesmo livro ser emprestado duas vezes.
    await deps.balcao.marcarExemplar(exemplar.id, 'EMPRESTADO')
    if (reserva) await deps.balcao.atenderReserva(reserva.id)

    return criado
  })

  if (ehExcecao) {
    // Fora da transação e sem `await` que derrube: o livro já saiu com o
    // aluno, e desfazer o empréstimo por causa do registro seria pior que
    // o registro faltando. `registrarAuditoria` já engole o próprio erro.
    await deps
      .registrarAuditoria({
        autor: principal,
        acao: 'emprestimo.forcar',
        entidade: 'Emprestimo',
        entidadeId: emprestimo.id,
        dadosDepois: {
          justificativa,
          bloqueios: bloqueios.map((b) => b.tipo),
          leitor: leitor.nome,
          tombo: exemplar.tombo,
        },
      })
      .catch(() => undefined)
  }

  return emprestimo
}

async function resolverConfiguracaoDoLeitor(
  leitor: LeitorDoBalcao,
  deps: DependenciasDoBalcao,
): Promise<ConfiguracaoDaEscola> {
  const [daEscola, overrides] = await Promise.all([
    deps.balcao.configuracaoDaEscola(),
    deps.balcao.overridesPorSerie(),
  ])
  return resolverConfiguracao(leitor.serie, daEscola, overrides)
}
