'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Botao } from '@/components/ui/botao'
import { Faixa } from '@/components/ui/faixa'
import { desativarAlunoAction, reativarAlunoAction } from '../actions'

/**
 * Desativar e reativar o cadastro do aluno.
 *
 * ─── Por que desativar é em DUAS passadas ───────────────────────────
 *
 * Aluno desativado é bloqueio de empréstimo (`avaliarBloqueios` trata o
 * caso `INATIVO`) — e o bloqueio vale para a DEVOLUÇÃO também. Desativar
 * quem está com dois livros na mochila tira do balcão o caminho de volta
 * daqueles livros, e nada na tela teria dito isso.
 *
 * Então a primeira tentativa não confirma nada: ela pergunta ao serviço,
 * que RECUSA quando há livro em mãos e devolve a frase com o número. A
 * tela mostra aquela frase e só então oferece o botão de confirmar. O
 * número vem do serviço, contado no banco na mesma transação da escrita —
 * a tela não o calcula, para não haver dois números discordando.
 *
 * Desativar NÃO apaga: o histórico de empréstimo, reserva e penalidade
 * fica inteiro. Não existe botão de excluir aluno nesta tela, e não é
 * esquecimento — excluir órfanaria o histórico e o relatório de
 * engajamento passaria a contar um ano letivo que não bate com nada.
 */
export function SituacaoDoCadastro({
  alunoId,
  ativo,
  nome,
}: {
  alunoId: string
  ativo: boolean
  nome: string
}) {
  const router = useRouter()
  const [aviso, setAviso] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function desativar(confirmado: boolean) {
    setFeito(null)
    setOcupado(true)

    try {
      const resposta = await desativarAlunoAction(alunoId, confirmado)

      if (!resposta.ok) {
        // A recusa por livro em mãos vem por aqui, com o número dentro
        // da frase. É ela que habilita o botão de confirmar.
        setAviso(resposta.erro)
        return
      }

      setAviso(null)
      setFeito(
        resposta.livrosEmMaos > 0
          ? `${nome} foi desativado, e ${
              resposta.livrosEmMaos === 1
                ? '1 livro continua'
                : `${resposta.livrosEmMaos} livros continuam`
            } com ele. O balcão não vai aceitar a devolução enquanto ele estiver desativado.`
          : `${nome} foi desativado. O histórico dele continua inteiro.`,
      )
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function reativar() {
    setAviso(null)
    setFeito(null)
    setOcupado(true)

    try {
      const resposta = await reativarAlunoAction(alunoId)
      if (!resposta.ok) {
        setAviso(resposta.erro)
        return
      }
      setFeito(`${nome} voltou à ativa e já pode levar livros.`)
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  if (!ativo) {
    return (
      <div className="flex flex-col gap-[10px]">
        <p className="text-[13px] text-tinta-2">
          Este cadastro está desativado: o balcão recusa empréstimo e devolução dele. O
          histórico de leitura continua guardado.
        </p>
        <Botao
          type="button"
          variante="secundaria"
          onClick={reativar}
          disabled={ocupado}
          className="self-start"
        >
          Reativar cadastro
        </Botao>
        {feito !== null && <Faixa tom="sucesso" titulo={feito} />}
        {aviso !== null && <Faixa tom="erro" titulo={aviso} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[10px]">
      <p className="text-[13px] text-tinta-2">
        Desativar bloqueia empréstimo e devolução no balcão. Não apaga nada — é o que se
        faz quando o aluno sai da escola.
      </p>

      {/* O aviso é a recusa que veio do serviço, com o número de livros
          em mãos. Enquanto ele está na tela, o botão é "confirmar" —
          nunca há um botão que desativa em silêncio quem tem livro. */}
      {aviso !== null && <Faixa tom="atencao" icone="aviso" titulo={aviso} />}

      <div className="flex flex-wrap gap-[9px]">
        {aviso === null ? (
          <Botao
            type="button"
            variante="perigo"
            onClick={() => desativar(false)}
            disabled={ocupado}
          >
            Desativar cadastro
          </Botao>
        ) : (
          <>
            <Botao
              type="button"
              variante="perigo"
              onClick={() => desativar(true)}
              disabled={ocupado}
            >
              Desativar mesmo assim
            </Botao>
            <Botao
              type="button"
              variante="secundaria"
              onClick={() => setAviso(null)}
              disabled={ocupado}
            >
              Cancelar
            </Botao>
          </>
        )}
      </div>

      {feito !== null && <Faixa tom="sucesso" titulo={feito} />}
    </div>
  )
}
