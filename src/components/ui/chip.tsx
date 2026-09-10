import type { ReactElement } from 'react'
import {
  ESTADOS_DE_CHIP,
  descreverDisponibilidade,
  type EstadoDeChip,
  type TomDeChip,
} from '@/components/ui/estados'
import { Icone } from '@/components/ui/icones'

/**
 * Chip de estado.
 *
 * A API é de propósito estreita: a ÚNICA entrada é a chave de um estado
 * do catálogo. Não existe prop de cor, de ícone nem de texto livre —
 * então não existe caminho para desenhar um chip que diz o estado só
 * pela cor, que é a regra dura do sistema. Quem precisa de um estado
 * novo o acrescenta em `estados.ts`, onde o tipo cobra palavra e ícone e
 * o teste de unidade confere as duas metades.
 */
const CLASSES_POR_TOM: Record<TomDeChip, string> = {
  certo: 'bg-certo-suave text-certo',
  neutro: 'bg-papel-2 text-tinta-2',
  atencao: 'bg-atencao-suave text-atencao',
  fita: 'bg-fita-suave text-fita',
  alerta: 'bg-alerta-suave text-alerta',
  apagado: 'bg-papel-2 text-tinta-3',
}

const MOLDURA =
  'inline-flex h-[23px] shrink-0 items-center gap-[5px] rounded-full px-[9px] ' +
  'text-[11.5px] leading-none font-semibold'

export function Chip({
  estado,
  /**
   * O que a palavra do estado não diz sozinha: "6 dias", "até 18/09".
   * Complementa, nunca substitui — a palavra do catálogo vem sempre.
   */
  complemento,
  className,
}: {
  estado: EstadoDeChip
  complemento?: string
  className?: string
}): ReactElement {
  const { palavra, icone, tom } = ESTADOS_DE_CHIP[estado]

  return (
    <span className={`${MOLDURA} ${CLASSES_POR_TOM[tom]}${className ? ` ${className}` : ''}`}>
      <Icone nome={icone} tamanho={11} traco={2.4} />
      <span>
        {palavra}
        {complemento ? ` ${complemento}` : ''}
      </span>
    </span>
  )
}

/**
 * "3 de 5 livres" — contagem, não estado.
 *
 * É componente separado justamente para não virar um `Chip` sem ícone:
 * número contado não é estado, e misturar os dois abriria a porta para
 * um chip de estado sem palavra. A frase e o tom saem de
 * `descreverDisponibilidade`, que recusa contagem impossível.
 */
export function ChipDeContagem({
  disponiveis,
  total,
  className,
}: {
  disponiveis: number
  total: number
  className?: string
}): ReactElement {
  const { palavra, tom } = descreverDisponibilidade(disponiveis, total)

  return (
    <span className={`${MOLDURA} ${CLASSES_POR_TOM[tom]}${className ? ` ${className}` : ''}`}>
      {palavra}
    </span>
  )
}
