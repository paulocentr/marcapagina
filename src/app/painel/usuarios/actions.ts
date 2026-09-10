'use server'

import { revalidatePath } from 'next/cache'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { ErroDeDominio } from '@/core/errors'
import { dependenciasDeUsuarios } from '@/modules/usuarios/usuarios.deps'
import {
  criarUsuario,
  definirPermissoesDoPapel,
  definirSituacaoDoUsuario,
  trocarPapelDoUsuario,
} from '@/modules/usuarios/usuarios.service'
import {
  entradaDeNovaContaSchema,
  entradaDePermissoesDoPapelSchema,
  entradaDeSituacaoSchema,
  entradaDeTrocaDePapelSchema,
} from '@/modules/usuarios/usuarios.schema'

/**
 * As Server Actions da tela de contas da equipe.
 *
 * Quem lê a sessão é esta camada, com `comStaffNoTenant`; quem autoriza é
 * o serviço, que recebe o `Principal` por parâmetro (decisão 13). A tela
 * nunca vê repositório, `@prisma/client` nem `@/core/db` — há gate no CI.
 *
 * `escolaId` não aparece em assinatura nenhuma daqui: ele sai da SESSÃO,
 * dentro de `comStaffNoTenant`, e a extensão de tenant o injeta em toda
 * query. Aceitá-lo do formulário seria o caminho para criar conta na
 * escola do vizinho.
 */

/** A rota que se recarrega depois de qualquer escrita desta tela. */
const ROTA = '/painel/usuarios'

export type RespostaSimples = { ok: true } | { ok: false; erro: string }

export interface EstadoDaNovaConta {
  erro: string | null
  /** O nome da conta recém-criada, para a faixa de confirmação. */
  criada: string | null
}

export const ESTADO_INICIAL_DA_NOVA_CONTA: EstadoDaNovaConta = { erro: null, criada: null }

/**
 * Cria a conta de uma pessoa da equipe.
 *
 * A senha viaja no `FormData` do POST e não volta em resposta nenhuma —
 * nem em log. O que volta é o nome, para a tela poder dizer à coordenação
 * qual conta acabou de nascer e a quem entregar a senha.
 */
export async function criarContaAction(
  _anterior: EstadoDaNovaConta,
  dados: FormData,
): Promise<EstadoDaNovaConta> {
  const analisado = entradaDeNovaContaSchema.safeParse({
    nome: dados.get('nome'),
    email: dados.get('email'),
    senha: dados.get('senha'),
    papelId: dados.get('papelId'),
  })

  if (!analisado.success) {
    return { erro: analisado.error.issues[0]?.message ?? 'Dados inválidos.', criada: null }
  }

  try {
    const criada = await comStaffNoTenant((principal) =>
      criarUsuario(principal, analisado.data, dependenciasDeUsuarios()),
    )

    revalidatePath(ROTA)
    return { erro: null, criada: criada.nome }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { erro: erro.message, criada: null }
    throw erro
  }
}

/**
 * Desativa ou reativa uma conta.
 *
 * As duas recusas que importam — não desativar a própria conta e não
 * desativar o último administrador — moram no SERVIÇO. A tela desabilita
 * o botão e explica o motivo antes do clique, mas essa é cortesia: esta
 * Server Action é alcançável sem passar por botão nenhum.
 */
export async function definirSituacaoAction(
  usuarioId: string,
  ativo: boolean,
): Promise<RespostaSimples> {
  const analisado = entradaDeSituacaoSchema.safeParse({ usuarioId, ativo })
  if (!analisado.success) return { ok: false, erro: 'Dados inválidos.' }

  try {
    await comStaffNoTenant((principal) =>
      definirSituacaoDoUsuario(principal, analisado.data, dependenciasDeUsuarios()),
    )

    revalidatePath(ROTA)
    return { ok: true }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export async function trocarPapelAction(
  usuarioId: string,
  papelId: string,
): Promise<RespostaSimples> {
  const analisado = entradaDeTrocaDePapelSchema.safeParse({ usuarioId, papelId })
  if (!analisado.success) {
    return { ok: false, erro: analisado.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  try {
    await comStaffNoTenant((principal) =>
      trocarPapelDoUsuario(principal, analisado.data, dependenciasDeUsuarios()),
    )

    // Recarrega porque a lista mostra o papel de cada conta E o aviso de
    // "única conta que administra a escola" — trocar um papel pode mudar
    // esse aviso em OUTRA linha da tabela.
    revalidatePath(ROTA)
    return { ok: true }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

/**
 * Reescreve as permissões de um papel.
 *
 * Recebe a lista COMPLETA, não um delta: o formulário manda o estado
 * final das caixas marcadas. Um delta ("marque isto, desmarque aquilo")
 * aplicado sobre um papel que outra pessoa editou no meio produziria um
 * papel que ninguém montou.
 */
export async function definirPermissoesAction(
  papelId: string,
  permissoes: string[],
): Promise<RespostaSimples> {
  const analisado = entradaDePermissoesDoPapelSchema.safeParse({ papelId, permissoes })
  if (!analisado.success) return { ok: false, erro: 'Dados inválidos.' }

  try {
    await comStaffNoTenant((principal) =>
      definirPermissoesDoPapel(principal, analisado.data, dependenciasDeUsuarios()),
    )

    revalidatePath(ROTA)
    return { ok: true }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}
