import { Chip } from '@/components/ui/chip'
import type { EstadoDeChip } from '@/components/ui/estados'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone } from '@/components/ui/icones'
import type { SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

/**
 * A situação de um exemplar como chip.
 *
 * Existe porque o catálogo de estados do kit (`ui/estados.ts`) cobre o
 * que as pranchas desenharam — disponível, emprestado, separado para
 * reserva, baixado — e o schema tem três situações que nenhuma prancha
 * mostrou: no carrinho, em manutenção e extraviado. A ficha da obra é
 * onde elas aparecem, e um exemplar sem chip nenhum some da conferência
 * da estante.
 *
 * Fica AQUI, e não no kit, porque o kit é de outra frente de trabalho.
 * Quando estas três forem desenhadas, elas entram em `estados.ts` — que é
 * onde o tipo cobra palavra e ícone — e este arquivo desaparece.
 *
 * A regra dura vale igual nos dois caminhos: palavra E ícone sempre,
 * nunca só a cor.
 */
type Aparencia =
  /** Estado que o kit já conhece: quem desenha é o `Chip`. */
  | { doKit: EstadoDeChip }
  /** Situação ainda sem prancha: palavra e ícone obrigatórios pelo tipo. */
  | { palavra: string; icone: NomeDeIcone; classes: string }

const POR_SITUACAO: Record<SituacaoDoExemplar, Aparencia> = {
  DISPONIVEL: { doKit: 'DISPONIVEL' },
  EMPRESTADO: { doKit: 'EMPRESTADO' },
  // Exemplar reservado é exemplar separado no balcão com a fita — é a
  // mesma coisa que a prancha desenhou, com o nome que o schema usa.
  RESERVADO: { doKit: 'SEPARADO_PARA_RESERVA' },
  BAIXADO: { doKit: 'BAIXADO' },
  EM_CARRINHO: {
    palavra: 'No carrinho',
    icone: 'carrinho',
    classes: 'bg-papel-2 text-tinta-2',
  },
  EM_MANUTENCAO: {
    palavra: 'Em manutenção',
    icone: 'ajustes',
    classes: 'bg-atencao-suave text-atencao',
  },
  // Extraviado não é "baixado": um saiu por decisão, o outro
  // desapareceu. Dizer a palavra errada aqui é ensinar a operadora a
  // procurar na estante um livro que a escola já deu por perdido.
  EXTRAVIADO: {
    palavra: 'Extraviado',
    icone: 'aviso',
    classes: 'bg-papel-2 text-tinta-3',
  },
}

/** A moldura do chip do kit, repetida porque o kit não a exporta. */
const MOLDURA =
  'inline-flex h-[23px] shrink-0 items-center gap-[5px] rounded-full px-[9px] ' +
  'text-[11.5px] leading-none font-semibold'

export function ChipDeSituacao({ situacao }: { situacao: SituacaoDoExemplar }) {
  const aparencia = POR_SITUACAO[situacao]

  if ('doKit' in aparencia) return <Chip estado={aparencia.doKit} />

  return (
    <span className={`${MOLDURA} ${aparencia.classes}`}>
      <Icone nome={aparencia.icone} tamanho={11} traco={2.4} />
      <span>{aparencia.palavra}</span>
    </span>
  )
}

/** Situações que tiram o exemplar da estante para sempre. */
export function saiuDoAcervo(situacao: SituacaoDoExemplar): boolean {
  return situacao === 'BAIXADO' || situacao === 'EXTRAVIADO'
}
