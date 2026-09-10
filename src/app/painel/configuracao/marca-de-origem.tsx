import type { ReactElement } from 'react'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone } from '@/components/ui/icones'
import type { OrigemDoValor } from './configuracao-na-tela'

/**
 * De onde vem o valor: herdado da escola ou ajustado nesta série.
 *
 * **Não é um `Chip`**, e a diferença é deliberada. O `Chip` só aceita
 * chave do catálogo de `estados.ts`, que é o catálogo de estados de
 * EXEMPLAR e de LEITOR — origem de configuração não é estado de nada, e
 * o catálogo não é desta tela para estender.
 *
 * O que a regra do kit exige, este componente cumpre por construção: a
 * única entrada é a origem, e cada origem tem **palavra e ícone** fixos
 * na tabela abaixo. Não existe caminho para dizer a origem só pela cor —
 * que é o que importa numa tela lida com pressa e em monitor ruim.
 */
const POR_ORIGEM: Record<
  OrigemDoValor,
  { palavra: string; icone: NomeDeIcone; classes: string }
> = {
  ESCOLA: {
    palavra: 'herdado da escola',
    icone: 'info',
    classes: 'bg-papel-2 text-tinta-2',
  },
  SERIE: {
    // A fita é a cor de identidade e marca o que foge do padrão — é a
    // mesma leitura de "separe este exemplar": olhe aqui, é diferente.
    palavra: 'ajustado nesta série',
    icone: 'ajustes',
    classes: 'bg-fita-suave text-fita',
  },
}

export function MarcaDeOrigem({ origem }: { origem: OrigemDoValor }): ReactElement {
  const { palavra, icone, classes } = POR_ORIGEM[origem]

  return (
    <span
      className={`inline-flex h-[23px] shrink-0 items-center gap-[5px] rounded-full px-[9px] text-[11.5px] leading-none font-semibold ${classes}`}
    >
      <Icone nome={icone} tamanho={11} traco={2.4} />
      <span>{palavra}</span>
    </span>
  )
}
