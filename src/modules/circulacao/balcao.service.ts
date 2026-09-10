import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import { avaliarBloqueios, type Bloqueio } from '@/modules/circulacao/bloqueios'
import {
  resolverConfiguracao,
  type ConfiguracaoDaEscola,
  type OverrideDeSerie,
} from '@/modules/circulacao/configuracao'
import type { Principal } from '@/core/auth/principal'

export interface LeitorParaBalcao {
  id: string
  nome: string
  matricula: string
  turma: string | null
  serie: string | null
  ativo: boolean
  suspensaoAte: Date | null
}

export interface LeitorComSituacao extends LeitorParaBalcao {
  bloqueios: Bloqueio[]
  emprestimosAtivos: number
  limiteDaSerie: number
}

/**
 * Consultas que só a TELA do balcão precisa.
 *
 * Vive separado do contrato de `emprestar` de propósito: acrescentar
 * métodos de tela àquela interface obrigaria todo fake de empréstimo a
 * implementá-los para exercitar regra que não tem nada a ver com eles.
 */
export interface RepositorioDeConsultaDoBalcao {
  obterPorMatricula(matricula: string): Promise<LeitorParaBalcao | null>
  configuracaoDaEscola(): Promise<ConfiguracaoDaEscola>
  overridesPorSerie(): Promise<OverrideDeSerie[]>
  contarAtivosDoAluno(alunoId: string): Promise<number>
  contarAtrasadosDoAluno(alunoId: string, hoje: Date): Promise<number>
}

export interface DependenciasDeConsultaDoBalcao {
  consultaDoBalcao: RepositorioDeConsultaDoBalcao
}

export class LeitorNaoEncontradoError extends ErroDeDominio {
  constructor(readonly matricula: string) {
    super(
      `Não achei a matrícula ${matricula} nesta escola. Confira o número.`,
      'LEITOR_NAO_ENCONTRADO',
    )
  }
}

/**
 * O leitor E a situação dele, numa chamada só.
 *
 * Os bloqueios vêm JUNTO porque a spec §5.1 manda mostrá-los antes de
 * escolher o livro. Buscar o leitor e consultar bloqueios numa segunda
 * chamada deixaria uma janela em que a tela mostra o aluno como liberado
 * — e a operadora começaria a procurar o livro por nada.
 */
export async function buscarLeitorParaBalcao(
  principal: Principal,
  matricula: string,
  hoje: Date,
  deps: DependenciasDeConsultaDoBalcao,
): Promise<LeitorComSituacao> {
  exigirPermissao(principal, 'aluno:ver')

  // Leitor de código de barras às vezes entrega espaço junto do número.
  const buscada = matricula.trim()
  const leitor = await deps.consultaDoBalcao.obterPorMatricula(buscada)
  if (!leitor) throw new LeitorNaoEncontradoError(buscada)

  const [daEscola, overrides, ativos, atrasados] = await Promise.all([
    deps.consultaDoBalcao.configuracaoDaEscola(),
    deps.consultaDoBalcao.overridesPorSerie(),
    deps.consultaDoBalcao.contarAtivosDoAluno(leitor.id),
    deps.consultaDoBalcao.contarAtrasadosDoAluno(leitor.id, hoje),
  ])

  const config = resolverConfiguracao(leitor.serie, daEscola, overrides)

  return {
    ...leitor,
    emprestimosAtivos: ativos,
    // O número, não só o sim/não: a operadora decide melhor sabendo que
    // o aluno está com 2 de 3 do que sabendo apenas "pode".
    limiteDaSerie: config.limiteSimultaneo,
    bloqueios: avaliarBloqueios(
      {
        ativo: leitor.ativo,
        emprestimosAtivos: ativos,
        emprestimosEmAtraso: atrasados,
        suspensaoAte: leitor.suspensaoAte,
      },
      config,
      hoje,
    ),
  }
}
