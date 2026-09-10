import { Icone } from '@/components/ui/icones'
import { SITUACOES_DA_CONFERENCIA, type SituacaoNaConferencia } from './conferencia'

/**
 * O chip de um grupo da conferência.
 *
 * O `Chip` do kit só aceita chave do catálogo de `ui/estados.ts`, e nenhum
 * dos seis grupos desta tela está lá: eles não são estado de exemplar nem
 * de leitor, são estado de uma CONFERÊNCIA — "já bipado", "fora do
 * lugar", "não encontrado". Fica aqui, e não no kit, porque o kit é de
 * outra frente de trabalho; quando as pranchas desenharem estes grupos,
 * eles entram em `estados.ts` e este arquivo desaparece.
 *
 * A regra dura vale igual nos dois caminhos: a palavra e o ícone vêm do
 * catálogo em `conferencia.ts`, onde o tipo cobra as duas metades e o
 * teste de unidade confere que nenhuma entrada ficou só com cor.
 */

/** A moldura do chip do kit, repetida porque o kit não a exporta. */
const MOLDURA =
  'inline-flex h-[23px] shrink-0 items-center gap-[5px] rounded-full px-[9px] ' +
  'text-[11.5px] leading-none font-semibold'

export function ChipDaConferencia({
  situacao,
  /** O que a palavra não diz sozinha: "· 2 leituras". Complementa, nunca substitui. */
  complemento,
}: {
  situacao: SituacaoNaConferencia
  complemento?: string
}) {
  const { palavra, icone, classes } = SITUACOES_DA_CONFERENCIA[situacao]

  return (
    <span className={`${MOLDURA} ${classes}`}>
      <Icone nome={icone} tamanho={11} traco={2.4} />
      <span>
        {palavra}
        {complemento ? ` ${complemento}` : ''}
      </span>
    </span>
  )
}
