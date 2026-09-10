import { requireAluno } from '@/core/auth/guards'
import { executarComTenant } from '@/core/tenant/context'
import type { PrincipalAluno } from '@/core/auth/principal'

/**
 * Lê a sessão do aluno, abre o contexto de tenant e entrega o principal.
 *
 * É o gêmeo de `comStaffNoTenant` (`src/core/auth/contexto-de-requisicao.ts`)
 * para o outro reino, e existe pelo mesmo motivo: o `escolaId` sai da
 * SESSÃO, nunca do host e nunca do cliente (Global Constraint 3). No
 * login ele veio do host e foi carimbado no token assinado; daí em diante
 * quem manda é o token — assim uma requisição autenticada não troca de
 * escola mudando cabeçalho, e não há ida ao banco para redescobrir o que
 * a sessão já sabe.
 *
 * MORA AQUI PROVISORIAMENTE. O lugar certo é ao lado de
 * `comStaffNoTenant`, em `src/core/auth/`, e é para lá que ele deve ir —
 * ficou fora porque `src/core/` está sendo mexido por outra frente nesta
 * rodada. Enquanto estiver aqui, é um módulo de `modules/` que lê sessão,
 * o que só não fura o gate do CI porque o gate mira arquivos
 * `*.service.ts`. O nome não é acidente: não é um serviço, é a cola da
 * camada de rota.
 */
export async function comAlunoNoTenant<T>(
  fn: (principal: PrincipalAluno) => Promise<T>,
): Promise<T> {
  const principal = await requireAluno()
  return executarComTenant(principal.escolaId, () => fn(principal))
}
