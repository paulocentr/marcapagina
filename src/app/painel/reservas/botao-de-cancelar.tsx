'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Botao } from '@/components/ui/botao'
import { Faixa } from '@/components/ui/faixa'
import { cancelarReservaAction } from './actions'

/**
 * Cancelar uma reserva, em dois passos.
 *
 * Dois passos porque o balcão é apertado e o clique errado aqui não é
 * reversível: cancelar tira o aluno da fila, e voltar significa recadastrar
 * a reserva no fim dela — atrás de quem chegou depois.
 *
 * A confirmação DIZ a consequência antes de acontecer. Quando a reserva já
 * tem exemplar separado, o serviço passa a vez na mesma transação: o livro
 * segue para o próximo da fila, ou volta à estante se não houver próximo.
 * Sem avisar, a operadora cancelaria "só para tirar da lista" e o livro
 * mudaria de dono sem ela saber.
 */
export function BotaoDeCancelar({
  reservaId,
  nomeDoLeitor,
  comExemplarSeparado,
}: {
  reservaId: string
  nomeDoLeitor: string
  comExemplarSeparado: boolean
}) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function cancelar() {
    setErro(null)
    setEnviando(true)

    try {
      const resposta = await cancelarReservaAction(reservaId)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      setConfirmando(false)
      // A prateleira e as filas são lidas no servidor: sem recarregar, a
      // linha cancelada continuaria na tela e a que herdou o exemplar não
      // apareceria. A operadora procuraria na prateleira um livro que já
      // é de outro aluno.
      router.refresh()
    } finally {
      setEnviando(false)
    }
  }

  if (!confirmando) {
    return (
      <div className="flex flex-col items-end gap-[6px]">
        <Botao
          type="button"
          variante="fantasma"
          icone="xis"
          onClick={() => {
            setErro(null)
            setConfirmando(true)
          }}
        >
          Cancelar reserva
        </Botao>
        {erro !== null && <Faixa tom="erro">{erro}</Faixa>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-[8px]">
      <p className="max-w-[320px] text-right text-[12.5px] text-tinta-2">
        Tirar <strong className="text-tinta">{nomeDoLeitor}</strong> da fila?{' '}
        {comExemplarSeparado
          ? 'O exemplar separado segue na hora para o próximo da fila — ou volta à estante, se não houver próximo.'
          : 'Para voltar, ele entra no fim da fila, atrás de quem chegou depois.'}
      </p>

      <div className="flex items-center gap-[8px]">
        <Botao
          type="button"
          variante="fantasma"
          onClick={() => setConfirmando(false)}
          disabled={enviando}
        >
          Não
        </Botao>
        <Botao type="button" variante="perigo" icone="xis" onClick={cancelar} disabled={enviando}>
          {enviando ? 'Cancelando…' : 'Confirmar cancelamento'}
        </Botao>
      </div>

      {erro !== null && <Faixa tom="erro">{erro}</Faixa>}
    </div>
  )
}
