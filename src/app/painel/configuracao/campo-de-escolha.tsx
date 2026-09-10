'use client'

import type { ReactElement } from 'react'
import { classesDeCampo } from '@/components/ui/campo'
import { Rotulo } from '@/components/ui/rotulo'

/**
 * O campo de escolha desta tela.
 *
 * O kit tem campo de texto e não tem `<select>` — e esta tela precisa de
 * um, porque "o aluno pode reservar" tem duas respostas na escola e TRÊS
 * na série (herda, pode, não pode). Uma caixa de marcar não sabe dizer
 * "herda", e é justamente a herança que a coordenação precisa ver.
 *
 * Segue o mesmo desenho do campo do kit reusando `classesDeCampo`, e
 * amarra rótulo, campo e mensagem pelos mesmos ids — assim ele não fica
 * parecendo peça de outro sistema. Não mora em `src/components/ui/`
 * porque nasceu para esta tela; se uma segunda precisar, é lá que ele
 * passa a morar.
 */
export interface OpcaoDeEscolha {
  valor: string
  rotulo: string
}

export function CampoDeEscolha({
  id,
  rotulo,
  dica,
  erro,
  valor,
  opcoes,
  onEscolher,
  disabled,
}: {
  id: string
  rotulo: string
  dica?: string
  erro?: string
  valor: string
  opcoes: readonly OpcaoDeEscolha[]
  onEscolher: (valor: string) => void
  disabled?: boolean
}): ReactElement {
  // O erro cobre a dica: quem errou precisa ler o que corrigir, não o
  // texto de ajuda que já não serviu.
  const mensagem = erro !== undefined ? erro : dica
  const idDaMensagem = mensagem === undefined ? undefined : `${id}-apoio`

  return (
    <div className="flex flex-col gap-[7px]">
      <label htmlFor={id}>
        <Rotulo>{rotulo}</Rotulo>
      </label>

      <select
        id={id}
        value={valor}
        disabled={disabled}
        onChange={(evento) => onEscolher(evento.target.value)}
        aria-invalid={erro !== undefined || undefined}
        aria-describedby={idDaMensagem}
        className={classesDeCampo('normal', erro !== undefined)}
      >
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>

      {mensagem !== undefined && (
        <span
          id={idDaMensagem}
          role={erro === undefined ? undefined : 'alert'}
          className={`text-xs ${erro === undefined ? 'text-tinta-2' : 'text-alerta'}`}
        >
          {mensagem}
        </span>
      )}
    </div>
  )
}
