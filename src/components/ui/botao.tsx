import type { ComponentPropsWithRef, ReactElement } from 'react'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone } from '@/components/ui/icones'

/**
 * Botões do kit.
 *
 * Uma ação primária por tela. Não existe variante "fita": a fita
 * terracota é identidade e serve para "separe este exemplar" — em botão
 * ela competiria com a única cor de ação do produto.
 */
export type VarianteDeBotao = 'primaria' | 'secundaria' | 'perigo' | 'fantasma'

/** 40px é a altura de controle; 44px é a do botão que fecha o atendimento. */
export type TamanhoDeBotao = 'padrao' | 'grande'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-controle border ' +
  'font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-marca ' +
  // Desabilitado é o estado NORMAL do balcão antes de o tombo ser bipado:
  // tem de parecer desligado sem parecer quebrado.
  'disabled:cursor-not-allowed disabled:opacity-40'

const POR_VARIANTE: Record<VarianteDeBotao, string> = {
  primaria: 'border-transparent bg-marca text-white hover:bg-marca-forte',
  secundaria: 'border-linha-2 bg-superficie text-tinta hover:bg-papel',
  perigo: 'border-alerta-borda bg-superficie text-alerta hover:bg-alerta-suave',
  fantasma: 'border-transparent bg-transparent text-tinta-2 hover:bg-papel-2 hover:text-tinta',
}

const POR_TAMANHO: Record<TamanhoDeBotao, string> = {
  padrao: 'h-10 px-4 text-[13.5px]',
  grande: 'h-11 px-5 text-[14.5px]',
}

/**
 * As classes do botão, para o caso em que o elemento tem de ser um
 * `<Link>` (navegar não é submeter, e um `<button>` que navega perde
 * abrir em nova aba e o menu de contexto).
 */
export function estilosDeBotao(
  variante: VarianteDeBotao = 'primaria',
  tamanho: TamanhoDeBotao = 'padrao',
): string {
  return `${BASE} ${POR_VARIANTE[variante]} ${POR_TAMANHO[tamanho]}`
}

interface PropsDoBotao extends Omit<ComponentPropsWithRef<'button'>, 'type'> {
  /**
   * Obrigatório de propósito. O padrão do HTML é `submit`, e um botão
   * de ação secundária dentro de um formulário que submete sozinho
   * manda o atendimento inteiro para o servidor sem ninguém pedir.
   * Dizer qual é custa uma palavra e elimina a classe de bug.
   */
  type: 'button' | 'submit' | 'reset'
  variante?: VarianteDeBotao
  tamanho?: TamanhoDeBotao
  /** Ícone à esquerda do rótulo. O rótulo continua obrigatório. */
  icone?: NomeDeIcone
}

export function Botao({
  variante = 'primaria',
  tamanho = 'padrao',
  icone,
  className,
  children,
  ...resto
}: PropsDoBotao): ReactElement {
  return (
    <button
      {...resto}
      className={`${estilosDeBotao(variante, tamanho)}${className ? ` ${className}` : ''}`}
    >
      {icone && <Icone nome={icone} tamanho={tamanho === 'grande' ? 17 : 16} traco={1.9} />}
      {children}
    </button>
  )
}
