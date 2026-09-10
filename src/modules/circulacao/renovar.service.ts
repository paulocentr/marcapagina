import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import { avaliarBloqueios } from '@/modules/circulacao/bloqueios'
import { calcularDataDeDevolucao } from '@/modules/circulacao/prazo'
import {
  resolverConfiguracao,
  type ConfiguracaoDaEscola,
} from '@/modules/circulacao/configuracao'
import { BloqueiosDoLeitorError } from '@/modules/circulacao/emprestar.service'
import type { RepositorioDeContextoDoLeitor } from '@/modules/circulacao/reservas.service'
import type { RepositorioDeReservas } from '@/modules/circulacao/reservas.tipos'
import type {
  EmprestimoEmCurso,
  RepositorioDeEmprestimosEmCurso,
} from '@/modules/circulacao/emprestimos-em-curso.tipos'
import type { Principal } from '@/core/auth/principal'

export interface DependenciasDeRenovacao {
  emprestimosEmCurso: Pick<RepositorioDeEmprestimosEmCurso, 'obter' | 'registrarRenovacao'>
  reservas: Pick<RepositorioDeReservas, 'contarAguardando'>
  balcao: Pick<
    RepositorioDeContextoDoLeitor,
    'obterLeitor' | 'configuracaoDaEscola' | 'overridesPorSerie' | 'diasNaoLetivos'
  >
}

export interface EntradaDeRenovacao {
  emprestimoId: string
  hoje: Date
}

export interface EmprestimoRenovado {
  emprestimoId: string
  previstaPara: Date
  renovacoes: number
}

export class EmprestimoInexistenteError extends ErroDeDominio {
  constructor() {
    super('Este empréstimo não existe nesta escola.', 'EMPRESTIMO_INEXISTENTE')
  }
}

export class EmprestimoJaDevolvidoError extends ErroDeDominio {
  constructor() {
    super('Este livro já foi devolvido — não há o que renovar.', 'EMPRESTIMO_JA_DEVOLVIDO')
  }
}

export class MaximoDeRenovacoesError extends ErroDeDominio {
  constructor(readonly maximo: number) {
    super(
      maximo === 0
        ? 'A coordenação não permite renovação para esta série.'
        : `Este empréstimo já foi renovado ${maximo} vez(es), que é o máximo desta série.`,
      'MAXIMO_DE_RENOVACOES',
    )
  }
}

export class ObraComFilaError extends ErroDeDominio {
  constructor(readonly naFila: number) {
    super(
      `Há ${naFila} leitor(es) esperando por este livro. Renovar agora daria a vez ` +
        `de quem esperou a quem já leu.`,
      'OBRA_COM_FILA',
    )
  }
}

/**
 * Renovação do empréstimo (spec §5.1).
 *
 * Nasce pronta para os dois reinos: o balcão renova pelo painel e o portal
 * do aluno vai renovar em m-3 pela mesma função. Por isso ela não sabe
 * quem está do outro lado — recebe o `Principal` e a permissão decide.
 */
export async function renovar(
  principal: Principal,
  entrada: EntradaDeRenovacao,
  deps: DependenciasDeRenovacao,
): Promise<EmprestimoRenovado> {
  exigirPermissao(principal, 'emprestimo:renovar')

  const emprestimo = await deps.emprestimosEmCurso.obter(entrada.emprestimoId)
  if (!emprestimo) throw new EmprestimoInexistenteError()
  if (emprestimo.devolvidaEm !== null) throw new EmprestimoJaDevolvidoError()

  const config = await configuracaoDoEmprestimo(emprestimo, deps)

  if (emprestimo.renovacoes >= config.maximoDeRenovacoes) {
    throw new MaximoDeRenovacoesError(config.maximoDeRenovacoes)
  }

  // A fila é consultada ANTES de mexer na data: renovar com gente
  // esperando é dar a vez de quem esperou a quem já leu (spec §5.2).
  const naFila = await deps.reservas.contarAguardando(emprestimo.obraId)
  if (naFila > 0) throw new ObraComFilaError(naFila)

  await exigirLeitorLiberado(emprestimo, config, entrada.hoje, deps)

  const diasNaoLetivos = await deps.balcao.diasNaoLetivos()
  const previstaPara = calcularDataDeDevolucao(
    baseDaRenovacao(emprestimo.previstaPara, entrada.hoje),
    config.prazoEmDias,
    (dia) => diasNaoLetivos.has(dia.toISOString().slice(0, 10)),
  )

  const linhas = await deps.emprestimosEmCurso.registrarRenovacao(emprestimo.id, previstaPara)
  // Zero linhas: o empréstimo foi devolvido entre a leitura e a escrita.
  // Tratar como sucesso deixaria o livro emprestado para sempre, já de
  // volta na estante e com data futura.
  if (linhas === 0) throw new EmprestimoJaDevolvidoError()

  return {
    emprestimoId: emprestimo.id,
    previstaPara,
    renovacoes: emprestimo.renovacoes + 1,
  }
}

/**
 * De que data se conta o novo prazo: a MAIOR entre o vencimento atual e
 * hoje.
 *
 * Contar sempre de hoje puniria quem renova cedo — devolveria as mesmas
 * duas semanas que já estavam garantidas. Contar sempre do vencimento
 * daria a quem está atrasado um prazo novo que já nasce vencido.
 */
function baseDaRenovacao(previstaPara: Date, hoje: Date): Date {
  const vencimento = comoInstanteDoDiaDaEscola(previstaPara)
  return vencimento.getTime() > hoje.getTime() ? vencimento : hoje
}

/**
 * `previstaPara` vem de coluna `@db.Date`: meia-noite UTC.
 *
 * `calcularDataDeDevolucao` converte o instante recebido para o dia LOCAL
 * da escola (UTC-3), e meia-noite UTC de 24/09 é 21h de 23/09 em São
 * Paulo. Passar o valor cru faria toda renovação nascer um dia curta.
 * Meio-dia UTC cai às 9h da manhã na escola — o mesmo dia, com folga
 * larga dos dois lados.
 */
function comoInstanteDoDiaDaEscola(dataDoBanco: Date): Date {
  return new Date(
    Date.UTC(
      dataDoBanco.getUTCFullYear(),
      dataDoBanco.getUTCMonth(),
      dataDoBanco.getUTCDate(),
      12,
    ),
  )
}

async function exigirLeitorLiberado(
  emprestimo: EmprestimoEmCurso,
  config: ConfiguracaoDaEscola,
  hoje: Date,
  deps: DependenciasDeRenovacao,
): Promise<void> {
  // Empréstimo da equipe não tem aluno, e a equipe não é suspensa pelo
  // sistema — não há estado de leitor para avaliar.
  if (emprestimo.alunoId === null) return

  const leitor = await deps.balcao.obterLeitor(emprestimo.alunoId)
  if (!leitor) return

  const bloqueios = avaliarBloqueios(
    {
      ativo: leitor.ativo,
      // Zeros deliberados, não dados faltando: o que impede CONTINUAR com
      // um livro que já está em mãos é o leitor estar suspenso ou
      // desativado. Estar no limite de livros ou com outro atrasado
      // impede LEVAR mais um — recusar a renovação por isso obrigaria a
      // devolver e pegar de novo o mesmo livro, no mesmo balcão.
      emprestimosAtivos: 0,
      emprestimosEmAtraso: 0,
      suspensaoAte: leitor.suspensaoAte,
    },
    config,
    hoje,
  )

  if (bloqueios.length > 0) throw new BloqueiosDoLeitorError(bloqueios)
}

async function configuracaoDoEmprestimo(
  emprestimo: EmprestimoEmCurso,
  deps: DependenciasDeRenovacao,
): Promise<ConfiguracaoDaEscola> {
  const [daEscola, overrides] = await Promise.all([
    deps.balcao.configuracaoDaEscola(),
    deps.balcao.overridesPorSerie(),
  ])

  const leitor = emprestimo.alunoId ? await deps.balcao.obterLeitor(emprestimo.alunoId) : null
  return resolverConfiguracao(leitor?.serie ?? null, daEscola, overrides)
}
