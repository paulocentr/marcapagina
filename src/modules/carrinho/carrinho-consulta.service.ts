import { exigirPermissao } from '@/core/rbac/verificar'
import type { Principal } from '@/core/auth/principal'

/**
 * Consultas que só a TELA do Carrinho da Leitura precisa.
 *
 * Vive separado de `RepositorioDoCarrinho` pelo mesmo motivo que o balcão
 * separou o seu (`balcao.service.ts`): acrescentar método de tela àquela
 * interface obrigaria todo fake das regras do carrinho a implementá-lo
 * para exercitar regra que não tem nada a ver com ele.
 *
 * Existe porque `planejarRodada` e `sugerirExemplares` recebem um
 * `turmaId`, e até aqui NENHUM serviço do sistema sabia dizer que turmas
 * existem — o cadastro de turmas é m-3, ainda não construído. Sem esta
 * consulta a tela teria de pedir o identificador interno da turma
 * digitado à mão, e o recurso continuaria inalcançável.
 */

export interface TurmaDoCarrinho {
  id: string
  /** "5º A" — o que a operadora reconhece. */
  nome: string
  /** "5" ou "1EM": é o que decide prazo, limite e faixa etária. */
  serie: string
}

export interface LivroNoCarrinho {
  exemplarId: string
  tombo: string
  titulo: string
}

/**
 * Uma rodada PLANEJADA — o carrinho que está na rua, ou pronto para sair.
 *
 * Carrega os livros com tombo e título porque a rodada é planejada de
 * manhã e lançada à tarde, em outra aba e às vezes em outra máquina.
 * `obterRodada` devolve só os ids dos exemplares, e id não se confere
 * contra a etiqueta do livro que voltou na caixa.
 */
export interface RodadaEmAberto {
  id: string
  turmaId: string
  turmaNome: string
  turmaSerie: string
  data: Date
  responsavelNome: string
  observacao: string | null
  livros: LivroNoCarrinho[]
}

export interface RepositorioDeConsultaDoCarrinho {
  turmasDoAnoLetivoAtivo(): Promise<TurmaDoCarrinho[]>
  rodadasPlanejadas(): Promise<RodadaEmAberto[]>
}

export interface DependenciasDeConsultaDoCarrinho {
  consultaDoCarrinho: RepositorioDeConsultaDoCarrinho
}

/**
 * As turmas que a tela oferece para planejar uma rodada.
 *
 * A permissão é a mesma do resto do carrinho, e não `turma:gerenciar`:
 * quem empurra o carrinho pelas salas não administra turma nenhuma — só
 * precisa saber para qual sala está indo.
 */
export async function listarTurmasDoCarrinho(
  principal: Principal,
  deps: DependenciasDeConsultaDoCarrinho,
): Promise<TurmaDoCarrinho[]> {
  exigirPermissao(principal, 'carrinho:gerenciar')
  return deps.consultaDoCarrinho.turmasDoAnoLetivoAtivo()
}

/** As rodadas que ainda esperam o lançamento do lote. */
export async function listarRodadasPlanejadas(
  principal: Principal,
  deps: DependenciasDeConsultaDoCarrinho,
): Promise<RodadaEmAberto[]> {
  exigirPermissao(principal, 'carrinho:gerenciar')
  return deps.consultaDoCarrinho.rodadasPlanejadas()
}
