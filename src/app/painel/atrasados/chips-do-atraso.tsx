import type { ReactElement } from 'react'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone } from '@/components/ui/icones'
import type { LinhaDeAtraso, SeveridadeDoAtraso } from './atrasados-na-tela'

/**
 * Os dois estados desta tela que o catálogo do kit (`ui/estados.ts`) ainda
 * não desenhou: a IDADE do atraso e o acúmulo de livros do mesmo leitor.
 *
 * Ficam aqui, e não no kit, pelo mesmo motivo de
 * `reservas/chips-da-reserva.tsx` e de `acervo/[obraId]/chip-de-situacao.tsx`:
 * o kit é de outra frente. E não são resolvidos com o `ATRASADO` do kit,
 * que diz apenas "atrasado": nesta folha a informação que muda a decisão é
 * HÁ QUANTO TEMPO — é a diferença entre um recado na sala e uma conversa
 * com a família.
 *
 * A regra dura vale igual: palavra E ícone, sempre. Nunca só a cor. Aqui
 * ela pesa mais que em qualquer outra tela, porque esta é a única que sai
 * na impressora — e a folha da professora costuma sair em preto e branco,
 * onde cor nenhuma sobrevive.
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
 * A idade do atraso como chip.
 *
 * Exaustivo sobre `SeveridadeDoAtraso` pelo `switch` sem `default`: uma
 * quarta faixa obriga o compilador a cobrar palavra e ícone dela, em vez
 * de deixá-la cair num rótulo genérico.
 *
 * `PERSISTENTE` e `PROLONGADO` compartilham o tom de alerta de propósito:
 * o que os separa é a PALAVRA, não a cor. Inventar um sétimo tom para
 * dizer "é ainda mais grave" seria justamente pedir que a cor carregasse
 * a informação.
 */
export function ChipDeAtraso({ linha }: { linha: LinhaDeAtraso }): ReactElement {
  const aparencia = aparenciaDoAtraso(linha.severidade, linha.atrasoEmPalavras)

  return (
    <span className={`${MOLDURA} ${aparencia.classes}`}>
      <Icone nome={aparencia.icone} tamanho={11} traco={2.4} />
      <span>{aparencia.palavra}</span>
    </span>
  )
}

function aparenciaDoAtraso(severidade: SeveridadeDoAtraso, emPalavras: string): Aparencia {
  switch (severidade) {
    case 'RECENTE':
      // Atenção, não alerta: dentro de uma semana o mais provável é
      // esquecimento, e o recado na sala resolve. Pintar de vermelho a
      // primeira semana ensina a coordenação a ignorar o vermelho.
      return {
        palavra: `Atrasado há ${emPalavras}`,
        icone: 'relogio',
        classes: 'bg-atencao-suave text-atencao',
      }
    case 'PERSISTENTE':
      return {
        palavra: `Atrasado há ${emPalavras}`,
        icone: 'aviso',
        classes: 'bg-alerta-suave text-alerta',
      }
    case 'PROLONGADO':
      // A palavra muda porque a conversa muda: passado o mês, o livro
      // perdeu o ciclo inteiro e quem cobra deixa de ser a professora.
      return {
        palavra: `Um mês ou mais — ${emPalavras}`,
        icone: 'aviso',
        classes: 'bg-alerta-suave text-alerta',
      }
  }
}

/**
 * "2 livros em atraso" — ao lado do nome, quando o leitor deve mais de um.
 *
 * O número é CONTADO da própria lista (`livrosDoLeitor`), e conta a lista
 * inteira, não só esta folha: o aluno que trocou de turma no meio do ano
 * aparece nas duas e deve os dois livros nas duas.
 *
 * Não aparece com um livro só: um chip que diz "1 livro em atraso" em toda
 * linha de uma folha de atrasados não informa nada e some da vista junto
 * com os que informam.
 */
export function ChipDeAcumulo({ livrosDoLeitor }: { livrosDoLeitor: number }): ReactElement | null {
  if (!Number.isInteger(livrosDoLeitor) || livrosDoLeitor < 1) {
    throw new Error(
      `Contagem impossível de livros do leitor: ${livrosDoLeitor}. ` +
        'Desenhar o número errado ensina a coordenação a não confiar em nenhum.',
    )
  }

  if (livrosDoLeitor === 1) return null

  return (
    <span className={`${MOLDURA} bg-alerta-suave text-alerta`}>
      <Icone nome="livros" tamanho={11} traco={2.4} />
      <span>{livrosDoLeitor} livros em atraso</span>
    </span>
  )
}
