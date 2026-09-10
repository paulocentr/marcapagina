import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone } from '@/components/ui/icones'

/**
 * O destino de uma linha da planilha, como chip.
 *
 * Não sai do catálogo do kit (`ui/estados.ts`) porque nenhum dos três
 * existe lá: o catálogo descreve exemplar e leitor, e aqui a pergunta é
 * outra — "o que vai acontecer com esta linha quando eu confirmar?".
 * Pegar emprestado um estado de palavra parecida diria à operadora um
 * motivo que não é o dela.
 *
 * Fica aqui, e não no kit, porque o kit é de outra frente. Quando estes
 * três forem desenhados, entram em `estados.ts` — que é onde o tipo cobra
 * palavra e ícone — e este arquivo desaparece.
 *
 * A regra dura vale igual: palavra E ícone sempre, nunca só a cor. O
 * `Record` é exaustivo, então um quarto destino é erro de compilação
 * aqui e não um chip em branco na tela.
 */
export type DestinoDaLinha = 'ENTRA' | 'JA_CADASTRADO' | 'COM_PROBLEMA'

const POR_DESTINO: Record<
  DestinoDaLinha,
  { palavra: string; icone: NomeDeIcone; classes: string }
> = {
  ENTRA: { palavra: 'Entra no cadastro', icone: 'mais', classes: 'bg-certo-suave text-certo' },
  // "Já cadastrado" é neutro de propósito: não é erro nem conquista.
  // Reimportar a planilha inteira da secretaria é o caso NORMAL, e pintar
  // isso de amarelo ensinaria a operadora a temer o normal.
  JA_CADASTRADO: { palavra: 'Já cadastrado', icone: 'info', classes: 'bg-papel-2 text-tinta-2' },
  COM_PROBLEMA: { palavra: 'Com problema', icone: 'aviso', classes: 'bg-alerta-suave text-alerta' },
}

/** A moldura do chip do kit, repetida porque o kit não a exporta. */
const MOLDURA =
  'inline-flex h-[23px] shrink-0 items-center gap-[5px] rounded-full px-[9px] ' +
  'text-[11.5px] leading-none font-semibold'

export function ChipDoPlano({ destino }: { destino: DestinoDaLinha }) {
  const { palavra, icone, classes } = POR_DESTINO[destino]

  return (
    <span className={`${MOLDURA} ${classes}`}>
      <Icone nome={icone} tamanho={11} traco={2.4} />
      <span>{palavra}</span>
    </span>
  )
}
