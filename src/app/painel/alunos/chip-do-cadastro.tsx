import { Icone } from '@/components/ui/icones'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'

/**
 * Ativo ou desativado, como chip.
 *
 * Existe pelo mesmo motivo que `acervo/[obraId]/chip-de-situacao.tsx`: o
 * catálogo do kit (`ui/estados.ts`) cobre o que as pranchas desenharam —
 * estado de exemplar e de leitor no balcão — e não tem estado de
 * CADASTRO. Usar `EM_DIA` para dizer "ativo" seria pior que não ter chip:
 * "Em dia" é sobre empréstimo em atraso, e um aluno desativado pode estar
 * perfeitamente em dia. A operadora leria a palavra errada.
 *
 * Fica AQUI, e não no kit, porque `src/components/` é de outra frente de
 * trabalho. Quando o cadastro de leitores for desenhado, estes dois
 * estados entram em `estados.ts` — onde o tipo cobra palavra e ícone — e
 * este arquivo desaparece.
 *
 * A regra dura vale igual: palavra E ícone sempre, nunca só a cor.
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

const ATIVO: Aparencia = {
  palavra: 'Ativo',
  icone: 'check',
  classes: 'bg-certo-suave text-certo',
}

// Desativado é "apagado", não "alerta": o aluno saiu da escola ou trocou
// de unidade, e isso é rotina de secretaria — não erro a corrigir.
// Vermelho aqui ensinaria a operadora a ignorar o vermelho.
const DESATIVADO: Aparencia = {
  palavra: 'Desativado',
  icone: 'xis',
  classes: 'bg-papel-2 text-tinta-3',
}

export function ChipDoCadastro({ ativo }: { ativo: boolean }) {
  const aparencia = ativo ? ATIVO : DESATIVADO

  return (
    <span className={`${MOLDURA} ${aparencia.classes}`}>
      <Icone nome={aparencia.icone} tamanho={11} traco={2.4} />
      <span>{aparencia.palavra}</span>
    </span>
  )
}

/**
 * "1 livro em mãos" / "3 livros em mãos" — contagem, não estado.
 *
 * Separado do chip de propósito, pelo mesmo motivo que o kit separa
 * `ChipDeContagem` de `Chip`: número contado não é estado, e misturar os
 * dois abriria a porta para um chip de estado sem palavra. Some da tela
 * quando é zero: "0 livros em mãos" é ruído em toda linha da lista.
 */
export function LivrosEmMaos({ quantos }: { quantos: number }) {
  if (quantos === 0) return null

  return (
    <span className={`${MOLDURA} bg-papel-2 text-tinta-2`}>
      <Icone nome="livros" tamanho={11} traco={2.4} />
      <span>
        {quantos} {quantos === 1 ? 'livro em mãos' : 'livros em mãos'}
      </span>
    </span>
  )
}
