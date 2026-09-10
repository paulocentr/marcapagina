'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ErroDeDominio } from '@/core/errors'
import { comAlunoNoTenant } from '@/modules/portal/contexto-do-aluno'
import { dependenciasDoPortal } from '@/modules/portal/portal.deps'
import { renovarMeuLivro } from '@/modules/portal/minha-renovacao.service'
import { formatarDia } from './formato'

export type EstadoDaRenovacao =
  | { tom: null; mensagem: null }
  | { tom: 'sucesso' | 'erro'; mensagem: string }

export const RENOVACAO_INICIAL: EstadoDaRenovacao = { tom: null, mensagem: null }

/**
 * O id vem do formulário, ou seja do cliente — e é validado como tal.
 *
 * Sem `Number()` e sem `?? ''`: um id ausente ou vazio é pedido malformado
 * e a resposta é recusa, não uma consulta com string vazia que "não acha
 * nada" por acidente. O teto de tamanho existe para não levar um megabyte
 * de campo até o banco.
 */
const entradaSchema = z.object({
  emprestimoId: z.string().min(1, 'Não entendi qual livro renovar.').max(64),
})

/**
 * Renovar um livro pelo portal.
 *
 * Quem lê a sessão é ESTA camada, com `comAlunoNoTenant`. Quem autoriza é
 * o serviço, e a autorização dele não é uma permissão: é o escopo do
 * próprio id da sessão. Nenhum `alunoId` atravessa este formulário — se
 * atravessasse, alguém acabaria mandando o do colega.
 */
export async function renovarLivroDoAluno(
  _anterior: EstadoDaRenovacao,
  dados: FormData,
): Promise<EstadoDaRenovacao> {
  const analisado = entradaSchema.safeParse({ emprestimoId: dados.get('emprestimoId') })
  if (!analisado.success) {
    return { tom: 'erro', mensagem: analisado.error.issues[0]?.message ?? 'Pedido inválido.' }
  }

  try {
    const renovado = await comAlunoNoTenant((principal) =>
      renovarMeuLivro(
        principal,
        { emprestimoId: analisado.data.emprestimoId, agora: new Date() },
        dependenciasDoPortal(),
      ),
    )

    // A tela é servidor: sem isto ela continuaria mostrando o prazo
    // antigo ao lado da mensagem dizendo que renovou.
    revalidatePath('/aluno')

    return {
      tom: 'sucesso',
      mensagem: `Renovado. Devolva até ${formatarDia(renovado.previstaPara)}.`,
    }
  } catch (erro) {
    // Só erro de DOMÍNIO vira mensagem — são os que foram escritos para o
    // aluno ler ("uma pessoa está esperando por este livro"). Qualquer
    // outro sobe: falha de banco não pode virar "não foi possível
    // renovar" e desaparecer do log.
    if (erro instanceof ErroDeDominio) return { tom: 'erro', mensagem: erro.message }
    throw erro
  }
}
