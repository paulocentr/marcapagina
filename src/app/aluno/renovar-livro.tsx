'use client'

import { useActionState } from 'react'
import type { ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'
import { Faixa } from '@/components/ui/faixa'
import { renovarLivroDoAluno, RENOVACAO_INICIAL } from './actions'

/**
 * O botão de renovar, com o resultado ao lado do livro a que ele
 * pertence.
 *
 * Um componente por livro, e não um estado só para a tela: com um estado
 * compartilhado, renovar o segundo livro escreveria a resposta em cima do
 * primeiro. Aqui a mensagem nasce embaixo do botão que a produziu.
 *
 * O `emprestimoId` viaja em campo escondido do formulário. Isso é entrada
 * do cliente e o servidor a trata como tal: o serviço só alcança
 * empréstimo do aluno da sessão, então mandar outro id não renova nada de
 * ninguém — a garantia está lá, não neste `type="hidden"`.
 */
export function RenovarLivro({
  emprestimoId,
  porDias,
}: {
  emprestimoId: string
  porDias: number
}): ReactElement {
  const [estado, acao, pendente] = useActionState(renovarLivroDoAluno, RENOVACAO_INICIAL)

  return (
    <form action={acao} className="mt-[10px] flex flex-col gap-2">
      <input type="hidden" name="emprestimoId" value={emprestimoId} />
      {/* `grande` é 44px de altura: o alvo mínimo de toque no celular. */}
      <Botao
        type="submit"
        variante="secundaria"
        tamanho="grande"
        icone="troca"
        disabled={pendente}
        className="w-full"
      >
        {pendente ? 'Renovando…' : `Renovar por ${porDias} dias`}
      </Botao>

      {/* A `Faixa` carrega ícone E palavra: o resultado nunca é dito só
          pela cor. */}
      {estado.mensagem !== null && <Faixa tom={estado.tom}>{estado.mensagem}</Faixa>}
    </form>
  )
}
