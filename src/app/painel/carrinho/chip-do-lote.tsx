import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone } from '@/components/ui/icones'
import type { SituacaoNoLote } from './resumo-do-lote'

/**
 * O resultado de UMA linha do lote, como chip.
 *
 * Não sai do catálogo do kit (`ui/estados.ts`) de propósito. Lá
 * `EMPRESTADO` descreve um exemplar que está fora da estante — informação
 * de acervo, em tom neutro. Aqui a mesma palavra responde outra pergunta:
 * "esta entrega foi confirmada?". E `RECUSADO` e `NAO_LANCADO` não
 * existem em nenhum tom no catálogo; pegar emprestado um estado com a
 * palavra parecida (`LEITOR_SUSPENSO` para toda recusa, por exemplo)
 * diria à operadora um motivo que talvez não seja o dela.
 *
 * Fica aqui, e não no kit, porque o kit é de outra frente. Quando estes
 * três forem desenhados, entram em `estados.ts` — que é onde o tipo cobra
 * palavra e ícone — e este arquivo desaparece.
 *
 * A regra dura vale igual: palavra E ícone sempre, nunca só a cor. O
 * `Record` é exaustivo, então uma quarta situação no lote é erro de
 * compilação aqui e não um chip em branco na tela.
 */
const POR_SITUACAO: Record<
  SituacaoNoLote,
  { palavra: string; icone: NomeDeIcone; classes: string }
> = {
  EMPRESTADO: { palavra: 'Emprestado', icone: 'check', classes: 'bg-certo-suave text-certo' },
  RECUSADO: { palavra: 'Recusado', icone: 'xis', classes: 'bg-alerta-suave text-alerta' },
  // "Não lançado" não é recusa: ninguém disse não a este aluno, o lote
  // parou antes de chegar nele. Chamar de recusado faria a operadora
  // discutir um bloqueio que não existe.
  NAO_LANCADO: {
    palavra: 'Não lançado',
    icone: 'aviso',
    classes: 'bg-atencao-suave text-atencao',
  },
}

/** A moldura do chip do kit, repetida porque o kit não a exporta. */
const MOLDURA =
  'inline-flex h-[23px] shrink-0 items-center gap-[5px] rounded-full px-[9px] ' +
  'text-[11.5px] leading-none font-semibold'

export function ChipDoLote({ situacao }: { situacao: SituacaoNoLote }) {
  const { palavra, icone, classes } = POR_SITUACAO[situacao]

  return (
    <span className={`${MOLDURA} ${classes}`}>
      <Icone nome={icone} tamanho={11} traco={2.4} />
      <span>{palavra}</span>
    </span>
  )
}
