import type { ReactElement } from 'react'
import { Chip } from '@/components/ui/chip'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone } from '@/components/ui/icones'
import { formatarDiaEMes } from './datas'
import type { SituacaoDaRetirada } from './reservas-na-tela'

/**
 * Os dois estados que esta tela mostra e o catálogo do kit
 * (`ui/estados.ts`) ainda não desenhou: o PRAZO DE RETIRADA e a espera na
 * fila.
 *
 * Ficam aqui, e não no kit, pelo mesmo motivo de
 * `acervo/[obraId]/chip-de-situacao.tsx`: o kit é de outra frente. E não
 * são resolvidos com um estado parecido de nome errado — chamar "prazo
 * vencido" de `ATRASADO` misturaria o aluno que não devolveu o livro com
 * o aluno que não veio buscar o que reservou, que são cobranças
 * diferentes.
 *
 * O estado do EXEMPLAR continua saindo do kit, com a fita terracota:
 * `<Chip estado="SEPARADO_PARA_RESERVA" />`. É a fita que impede a
 * operadora de devolver à estante um exemplar reservado e travar a fila.
 *
 * A regra dura vale igual: palavra E ícone, sempre. Nunca só a cor.
 */

/** A moldura do chip do kit, repetida porque o kit não a exporta. */
const MOLDURA =
  'inline-flex h-[23px] shrink-0 items-center gap-[5px] rounded-full px-[9px] ' +
  'text-[11.5px] leading-none font-semibold'

interface Aparencia {
  palavra: string
  icone: NomeDeIcone
  classes: string
}

/**
 * O prazo de retirada como chip.
 *
 * Exaustivo sobre `SituacaoDaRetirada` pelo `switch` sem `default`: um
 * quarto caso obrigaria o compilador a cobrar palavra e ícone dele, em
 * vez de deixá-lo cair num rótulo genérico.
 */
export function ChipDeRetirada({
  situacao,
  retirarAte,
}: {
  situacao: SituacaoDaRetirada
  retirarAte: Date
}): ReactElement {
  const aparencia = aparenciaDaRetirada(situacao, retirarAte)

  return (
    <span className={`${MOLDURA} ${aparencia.classes}`}>
      <Icone nome={aparencia.icone} tamanho={11} traco={2.4} />
      <span>{aparencia.palavra}</span>
    </span>
  )
}

function aparenciaDaRetirada(situacao: SituacaoDaRetirada, retirarAte: Date): Aparencia {
  switch (situacao.tipo) {
    case 'VENCIDO':
      // Alerta, e com o número de dias: é a linha em que a operadora tem
      // de agir — avisar o próximo da fila ou devolver o livro à estante.
      return {
        palavra: `Prazo vencido há ${situacao.diasVencidos} dia(s)`,
        icone: 'aviso',
        classes: 'bg-alerta-suave text-alerta',
      }
    case 'VENCE_HOJE':
      // Atenção, não alerta: quem vence hoje ainda tem o dia inteiro, e
      // pintar de vermelho quem está no prazo ensina a desconfiar da cor.
      return { palavra: 'Vence hoje', icone: 'relogio', classes: 'bg-atencao-suave text-atencao' }
    case 'NO_PRAZO':
      return {
        palavra: `Retirar até ${formatarDiaEMes(retirarAte)}`,
        icone: 'relogio',
        classes: 'bg-papel-2 text-tinta-2',
      }
  }
}

/**
 * A posição na fila como chip.
 *
 * `DISPONIVEL` sai pelo chip do KIT, com a fita: é o mesmo estado que a
 * prateleira mostra, e dizê-lo com outra palavra aqui faria parecer que
 * são duas coisas.
 */
export function ChipNaFila({
  status,
  ehOProximo,
}: {
  status: 'AGUARDANDO' | 'DISPONIVEL'
  /** O primeiro que ainda espera — quem leva a próxima cópia que voltar. */
  ehOProximo: boolean
}): ReactElement {
  if (status === 'DISPONIVEL') return <Chip estado="SEPARADO_PARA_RESERVA" />

  const aparencia: Aparencia = ehOProximo
    ? { palavra: 'Próximo da fila', icone: 'info', classes: 'bg-atencao-suave text-atencao' }
    : { palavra: 'Esperando', icone: 'relogio', classes: 'bg-papel-2 text-tinta-2' }

  return (
    <span className={`${MOLDURA} ${aparencia.classes}`}>
      <Icone nome={aparencia.icone} tamanho={11} traco={2.4} />
      <span>{aparencia.palavra}</span>
    </span>
  )
}
