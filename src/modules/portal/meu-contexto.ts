import { resolverConfiguracao, type ConfiguracaoDaEscola } from '@/modules/circulacao/configuracao'
import { exigirMeuProprioDado } from '@/modules/portal/autorizacao-do-aluno'
import { NaoAutenticadoError } from '@/core/errors'
import type { PrincipalAluno } from '@/core/auth/principal'
import type { DependenciasDoPortal, EstadoDoMeuCadastro } from '@/modules/portal/portal.tipos'

export interface MeuContexto {
  cadastro: EstadoDoMeuCadastro
  config: ConfiguracaoDaEscola
}

/**
 * O cadastro e a configuração que valem para o aluno da SESSÃO.
 *
 * Fica num módulo próprio porque os dois serviços do portal — ver a
 * estante e renovar — precisam do mesmo par, e porque é aqui que mora a
 * conferência que não pode ser esquecida em nenhum dos dois: o cadastro
 * lido é MESMO do aluno da sessão.
 *
 * Não é `.service.ts` de propósito: não é uma operação do domínio, é o
 * preâmbulo comum das duas que são.
 */
export async function meuContexto(
  principal: PrincipalAluno,
  deps: DependenciasDoPortal,
): Promise<MeuContexto> {
  const [leitor, daEscola, overrides] = await Promise.all([
    // `principal.id` e não um parâmetro: é o que faz a consulta ser
    // sobre quem está logado, sempre.
    deps.leitor.obterLeitor(principal.id),
    deps.leitor.configuracaoDaEscola(),
    deps.leitor.overridesPorSerie(),
  ])

  // Cadastro nulo com sessão válida significa que o token fala de um
  // aluno que não é desta escola — o repositório é escopado por tenant.
  // Desenhar a tela vazia diria "você não tem livro nenhum" a quem
  // talvez tenha; mandar entrar de novo é honesto.
  if (!leitor) throw new NaoAutenticadoError()

  // Defesa em profundidade: o filtro do repositório é a primeira barreira,
  // esta é a segunda. Duas barreiras porque a primeira é uma linha de
  // `where` que alguém pode reescrever sem perceber.
  exigirMeuProprioDado(principal, leitor.id)

  return {
    cadastro: { ativo: leitor.ativo, suspensaoAte: leitor.suspensaoAte },
    config: resolverConfiguracao(leitor.serie, daEscola, overrides),
  }
}
