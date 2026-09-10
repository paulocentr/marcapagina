import { ehAluno, type Principal, type PrincipalAluno } from '@/core/auth/principal'
import { ErroDeDominio, NaoAutenticadoError } from '@/core/errors'

/**
 * A autorização do PORTAL, e por que ela não é uma permissão.
 *
 * O RBAC do sistema responde "esta pessoa pode fazer X?" — e é o certo
 * para a equipe, porque a operadora pode ver a ficha de qualquer leitor.
 * O aluno não. Dar `aluno:ver` a ele responderia a pergunta errada: ele
 * passaria a poder ver a ficha de QUALQUER aluno, e a spec §2.3 proíbe
 * que o portal mostre dado sensível de colega. Não existe permissão que
 * signifique "só a sua própria ficha" — permissão é sobre a ação, não
 * sobre a linha.
 *
 * Então o portal autoriza por ESCOPO, não por permissão: toda consulta é
 * escopada pelo `id` da sessão, e nenhuma função do portal aceita id de
 * aluno como parâmetro de fora. Este módulo é o par de primitivas que
 * torna essa regra verificável em vez de combinada:
 *
 * - `exigirSessaoDeAluno` — o principal É um aluno (e não uma sessão de
 *   equipe passando pelo portal);
 * - `exigirMeuProprioDado` — todo registro que sobe para a tela veio
 *   mesmo do aluno da sessão.
 *
 * A segunda é defesa em profundidade e existe de propósito mesmo com o
 * repositório filtrando por `alunoId` no WHERE: se um dia alguém
 * acrescentar um método que esquece o filtro, o serviço RECUSA em vez de
 * desenhar a ficha do colega. Funções puras, sem I/O — é o que permite
 * provar o vazamento numa suíte de milissegundos.
 */
export class SessaoNaoEhDeAlunoError extends ErroDeDominio {
  constructor() {
    super('O portal do aluno só abre com sessão de aluno.', 'SESSAO_NAO_EH_DE_ALUNO')
  }
}

export class DadoDeOutroLeitorError extends ErroDeDominio {
  constructor() {
    // A mensagem NÃO diz de quem era o dado, nem se o registro existe.
    // Dizer transformaria a recusa num oráculo — quem experimentasse ids
    // na barra de endereço descobriria quais existem.
    super('Este dado não é seu.', 'DADO_DE_OUTRO_LEITOR')
  }
}

export function exigirSessaoDeAluno(
  principal: Principal | null,
): asserts principal is PrincipalAluno {
  // Sem sessão e sessão errada são casos diferentes para quem chama: o
  // primeiro redireciona para o login, o segundo mostra recusa.
  if (!principal) throw new NaoAutenticadoError()
  if (!ehAluno(principal)) throw new SessaoNaoEhDeAlunoError()
}

/**
 * O registro é do aluno da sessão?
 *
 * `null` recusa: empréstimo da equipe tem `alunoId` nulo, e tratar nulo
 * como "sem dono, então pode" entregaria ao aluno o empréstimo que a
 * biblioteca fez para um professor.
 */
export function exigirMeuProprioDado(
  principal: PrincipalAluno,
  alunoIdDoRegistro: string | null,
): void {
  if (alunoIdDoRegistro === null || alunoIdDoRegistro !== principal.id) {
    throw new DadoDeOutroLeitorError()
  }
}

/** A versão em lote, para a lista que sobe inteira para a tela. */
export function exigirTodosMeus(
  principal: PrincipalAluno,
  alunoIdsDosRegistros: readonly (string | null)[],
): void {
  for (const alunoId of alunoIdsDosRegistros) exigirMeuProprioDado(principal, alunoId)
}
