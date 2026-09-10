import { exigirPermissao } from '@/core/rbac/verificar'
import type { Principal } from '@/core/auth/principal'

export interface EmprestimoAtrasado {
  emprestimoId: string
  exemplarId: string
  tombo: string
  tituloDaObra: string
  leitorId: string
  nomeDoLeitor: string
  turma: string | null
  previstaPara: Date
  diasDeAtraso: number
}

/**
 * As consultas de atraso.
 *
 * Todas derivam de `previstaPara < hoje AND devolvidaEm IS NULL`
 * (Global Constraint 16). Não existe campo "atrasado" para ler: um campo
 * materializado por cron mente todo dia em que o cron falhar, e mente na
 * direção pior — dizendo que está tudo em ordem.
 */
export interface RepositorioDeEmprestimos {
  listarAtrasados(hoje: Date): Promise<EmprestimoAtrasado[]>
  contarAtrasadosDoAluno(alunoId: string, hoje: Date): Promise<number>
  contarAtivosDoAluno(alunoId: string): Promise<number>
}

export interface DependenciasDeEmprestimos {
  emprestimos: RepositorioDeEmprestimos
}

/**
 * A lista de atrasados do dia, ordenada do mais antigo para o mais
 * recente — é a ordem em que a coordenação quer cobrar.
 */
export async function listarAtrasados(
  principal: Principal,
  hoje: Date,
  deps: DependenciasDeEmprestimos,
): Promise<EmprestimoAtrasado[]> {
  exigirPermissao(principal, 'relatorio:ver')
  return deps.emprestimos.listarAtrasados(hoje)
}
