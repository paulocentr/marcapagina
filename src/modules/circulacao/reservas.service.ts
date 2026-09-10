import { exigirPermissao, exigirQualquerPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import { calcularDataDeDevolucao } from '@/modules/circulacao/prazo'
import {
  resolverConfiguracao,
  type ConfiguracaoDaEscola,
} from '@/modules/circulacao/configuracao'
import {
  LeitorInexistenteError,
  type LeitorDoBalcao,
  type RepositorioDoBalcao,
} from '@/modules/circulacao/emprestar.service'
import { ObraInexistenteError } from '@/modules/acervo/obras.service'
import {
  JaEstaNaFilaError,
  ReservaInexistenteError,
  ReservaNaoPermitidaError,
  type RepositorioDeReservas,
  type ReservaNaFila,
} from '@/modules/circulacao/reservas.tipos'
import type { RepositorioDeEmprestimosEmCurso } from '@/modules/circulacao/emprestimos-em-curso.tipos'
import type { Principal } from '@/core/auth/principal'

/**
 * O que a reserva precisa saber do leitor e do acervo.
 *
 * Recorte do repositório do balcão em vez de contrato novo: é literalmente
 * a mesma consulta ("quem é este leitor, o que vale para a série dele"), e
 * duplicá-la deixaria as duas cópias divergirem no dia em que a
 * configuração ganhar um campo.
 */
export type RepositorioDeContextoDoLeitor = Pick<
  RepositorioDoBalcao,
  'obterLeitor' | 'configuracaoDaEscola' | 'overridesPorSerie' | 'diasNaoLetivos' | 'marcarExemplar'
>

export interface RepositorioDoAcervoParaReserva {
  /** A obra existe no acervo DESTA escola? */
  obraExiste(obraId: string): Promise<boolean>
}

export interface DependenciasDeReserva {
  reservas: RepositorioDeReservas
  balcao: RepositorioDeContextoDoLeitor
  acervo: RepositorioDoAcervoParaReserva
  emprestimosEmCurso: Pick<RepositorioDeEmprestimosEmCurso, 'alunoEstaComAObra'>
  emTransacao<T>(fn: () => Promise<T>): Promise<T>
}

export interface EntradaDeReserva {
  alunoId: string
  obraId: string
}

export interface EntradaDeCancelamento {
  reservaId: string
  /** Data de hoje: o próximo da fila ganha o prazo de retirada a partir dela. */
  hoje: Date
}

export interface ResultadoDaExpiracao {
  expiradas: number
  /** Quantas vezes o exemplar separado seguiu para o próximo da fila. */
  passadasAdiante: number
  /** Quantas vezes o exemplar voltou para a estante por não haver fila. */
  exemplaresLiberados: number
  /**
   * O que não deu certo, reserva a reserva. Existe porque o job roda
   * sozinho de madrugada: devolver sucesso escondendo o que não foi feito
   * é pior que devolver erro.
   */
  falhas: { reservaId: string; motivo: string }[]
}

export class LeitorJaEstaComAObraError extends ErroDeDominio {
  constructor() {
    super(
      'Este leitor já está com este livro em mãos. Para ficar mais tempo com ele, ' +
        'a renovação é o caminho.',
      'JA_ESTA_COM_A_OBRA',
    )
  }
}

export class LeitorInativoError extends ErroDeDominio {
  constructor() {
    super('Este leitor está desativado e não pode entrar na fila.', 'LEITOR_INATIVO')
  }
}

export class ReservaNaoCancelavelError extends ErroDeDominio {
  constructor(readonly status: string) {
    super(
      `Esta reserva está ${status.toLowerCase()} e não há o que cancelar.`,
      'RESERVA_NAO_CANCELAVEL',
    )
  }
}

/**
 * Entra na fila de uma OBRA (spec §5.2).
 *
 * Da obra e não do exemplar: o aluno quer o livro, e qualquer cópia serve.
 * Reservar exemplar específico faria a fila parar porque justamente
 * aquela cópia está com alguém.
 *
 * O que este serviço NÃO faz, de propósito: separar na hora um exemplar
 * que esteja na estante. Quem separa é a DEVOLUÇÃO, quando o livro volta.
 * Havendo cópia disponível o caminho é emprestar no balcão, não entrar
 * numa fila de um.
 */
export async function reservar(
  principal: Principal,
  entrada: EntradaDeReserva,
  deps: DependenciasDeReserva,
): Promise<ReservaNaFila> {
  exigirPermissao(principal, 'reserva:criar')

  const [leitor, obraExiste] = await Promise.all([
    deps.balcao.obterLeitor(entrada.alunoId),
    deps.acervo.obraExiste(entrada.obraId),
  ])

  if (!leitor) throw new LeitorInexistenteError()
  // A obra vem do cliente. Sem esta checagem, um id de outra escola
  // gravava uma reserva apontando para fora do tenant: a fila daqui
  // nunca a atenderia e a de lá nunca a enxergaria — o aluno esperaria
  // para sempre, sem ninguém conseguir explicar por quê.
  if (!obraExiste) throw new ObraInexistenteError()
  // Quem saiu da escola segurando lugar na fila atrasa quem ficou, e o
  // lugar só venceria no prazo de retirada — que ele nunca vem cumprir.
  if (!leitor.ativo) throw new LeitorInativoError()

  const config = await resolverConfiguracaoDoLeitor(leitor, deps)
  // A coordenação desligou a reserva para esta série. Deixar o balcão
  // criar assim mesmo faria a configuração não significar nada e a fila
  // voltaria pela porta dos fundos.
  if (!config.alunoPodeReservar) throw new ReservaNaoPermitidaError()

  const [jaNaFila, jaComAObra] = await Promise.all([
    deps.reservas.reservaVivaDoAluno(entrada.obraId, entrada.alunoId),
    deps.emprestimosEmCurso.alunoEstaComAObra(entrada.alunoId, entrada.obraId),
  ])

  if (jaNaFila) throw new JaEstaNaFilaError(jaNaFila.posicao)
  // Reservar o que já se tem em mãos põe o leitor na frente dele mesmo:
  // ao devolver, o sistema separaria a cópia de volta para ele e a fila
  // nunca andaria.
  if (jaComAObra) throw new LeitorJaEstaComAObraError()

  return deps.emTransacao(async () => {
    // Ler a última posição e gravar na MESMA transação. Fora dela, duas
    // reservas simultâneas leem o mesmo número e nascem empatadas.
    const ultima = await deps.reservas.ultimaPosicao(entrada.obraId)
    return deps.reservas.criar({
      obraId: entrada.obraId,
      alunoId: entrada.alunoId,
      posicao: ultima + 1,
    })
  })
}

/** A fila viva da obra, em ordem de chegada. */
export async function filaDaObra(
  principal: Principal,
  obraId: string,
  deps: DependenciasDeReserva,
): Promise<ReservaNaFila[]> {
  // Quem opera o balcão precisa responder "sou o quantos?" na hora, e
  // tanto o monitor quanto a coordenação atendem. Exigir só
  // `reserva:gerenciar` deixaria o monitor sem conseguir informar a fila
  // que ele mesmo alimenta.
  exigirQualquerPermissao(principal, ['reserva:criar', 'reserva:gerenciar'])
  return deps.reservas.listarFila(obraId)
}

/**
 * Cancela uma reserva e, se ela já tinha exemplar separado, passa a vez.
 *
 * Sem passar a vez, cancelar uma reserva com livro separado deixaria o
 * exemplar em RESERVADO para ninguém — sumido da estante e invisível na
 * fila.
 */
export async function cancelarReserva(
  principal: Principal,
  entrada: EntradaDeCancelamento,
  deps: DependenciasDeReserva,
): Promise<void> {
  exigirPermissao(principal, 'reserva:gerenciar')

  const reserva = await deps.reservas.obter(entrada.reservaId)
  if (!reserva) throw new ReservaInexistenteError()
  if (reserva.status !== 'AGUARDANDO' && reserva.status !== 'DISPONIVEL') {
    throw new ReservaNaoCancelavelError(reserva.status)
  }

  await deps.emTransacao(async () => {
    await deps.reservas.mudarStatus(reserva.id, 'CANCELADA')
    await passarAVezOuLiberar(reserva, entrada.hoje, deps)
  })

  // A posição dos que vêm depois NÃO é recalculada. A ordem é dada pela
  // comparação entre posições, não pelo valor absoluto: fechar o buraco
  // custaria um UPDATE em toda a fila para não mudar resultado nenhum.
}

/**
 * Passa a vez das reservas cujo prazo de retirada venceu (spec §5.2).
 *
 * Acionada pelo cron uma vez por dia, por escola — e disponível para a
 * coordenação disparar à mão quando desconfiar do agendador.
 *
 * `acionador` é `'SISTEMA'` quando quem chama é o job: ali não há usuário
 * logado, e a autorização é o segredo do endpoint de cron. Vindo de
 * gente, a permissão é exigida como em qualquer outra ação.
 */
export async function expirarReservasVencidas(
  acionador: Principal | 'SISTEMA',
  hoje: Date,
  deps: DependenciasDeReserva,
): Promise<ResultadoDaExpiracao> {
  if (acionador !== 'SISTEMA') exigirPermissao(acionador, 'reserva:gerenciar')

  const vencidas = await deps.reservas.listarComRetiradaVencida(hoje)

  const resultado: ResultadoDaExpiracao = {
    expiradas: 0,
    passadasAdiante: 0,
    exemplaresLiberados: 0,
    falhas: [],
  }

  for (const reserva of vencidas) {
    try {
      // Uma transação POR RESERVA, não uma para o lote inteiro: uma linha
      // ruim no meio da madrugada não pode desfazer as que já deram certo
      // nem travar o acervo até alguém olhar o log.
      const efeito = await deps.emTransacao(async () => {
        await deps.reservas.mudarStatus(reserva.id, 'EXPIRADA')
        return passarAVezOuLiberar(reserva, hoje, deps)
      })

      resultado.expiradas += 1
      if (efeito === 'PASSOU_ADIANTE') resultado.passadasAdiante += 1
      if (efeito === 'LIBEROU') resultado.exemplaresLiberados += 1
    } catch (erro) {
      // Registrado, nunca engolido: o job devolve o que conseguiu fazer
      // E o que não conseguiu, e o chamador decide o que fazer com isso.
      resultado.falhas.push({
        reservaId: reserva.id,
        motivo: erro instanceof Error ? erro.message : String(erro),
      })
    }
  }

  return resultado
}

type EfeitoNoExemplar = 'PASSOU_ADIANTE' | 'LIBEROU' | 'NADA'

/**
 * O exemplar que estava separado para uma reserva que saiu de cena segue
 * para o próximo da fila; não havendo próximo, volta para a estante.
 */
async function passarAVezOuLiberar(
  reserva: ReservaNaFila,
  hoje: Date,
  deps: DependenciasDeReserva,
): Promise<EfeitoNoExemplar> {
  const exemplarId = reserva.exemplarSeparadoId
  if (!exemplarId) return 'NADA'

  const proxima = await deps.reservas.proximaDaFila(reserva.obraId)

  if (!proxima) {
    await deps.balcao.marcarExemplar(exemplarId, 'DISPONIVEL')
    return 'LIBEROU'
  }

  // O exemplar continua RESERVADO — só troca de dono. Passá-lo por
  // DISPONIVEL, ainda que por um instante, abriria a janela para o
  // primeiro que aparecesse no balcão levar o livro de quem esperou.
  const retirarAte = await prazoDeRetirada(proxima.alunoId, hoje, deps)
  await deps.reservas.separarExemplar(proxima.id, exemplarId, retirarAte)
  return 'PASSOU_ADIANTE'
}

/**
 * Até quando o próximo da fila tem para vir buscar.
 *
 * Usa o mesmo cálculo do prazo de empréstimo porque sofre do mesmo
 * problema: vencer num dia em que a escola está fechada tira a vez de
 * quem não tinha como vir buscar.
 */
async function prazoDeRetirada(
  alunoId: string,
  hoje: Date,
  deps: DependenciasDeReserva,
): Promise<Date> {
  const leitor = await deps.balcao.obterLeitor(alunoId)
  // Leitor sumido (desativado e removido da turma, por exemplo) ainda tem
  // direito ao prazo: usar o da escola é melhor que deixar a reserva sem
  // relógio, que é o estado que nunca expira.
  const config = leitor
    ? await resolverConfiguracaoDoLeitor(leitor, deps)
    : await deps.balcao.configuracaoDaEscola()

  const diasNaoLetivos = await deps.balcao.diasNaoLetivos()
  return calcularDataDeDevolucao(hoje, config.prazoDeRetiradaEmDias, (dia) =>
    diasNaoLetivos.has(dia.toISOString().slice(0, 10)),
  )
}

async function resolverConfiguracaoDoLeitor(
  leitor: LeitorDoBalcao,
  deps: DependenciasDeReserva,
): Promise<ConfiguracaoDaEscola> {
  const [daEscola, overrides] = await Promise.all([
    deps.balcao.configuracaoDaEscola(),
    deps.balcao.overridesPorSerie(),
  ])
  return resolverConfiguracao(leitor.serie, daEscola, overrides)
}
