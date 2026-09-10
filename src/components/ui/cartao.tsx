import type { ElementType, ReactElement, ReactNode } from 'react'

/**
 * O cartão: superfície branca sobre o papel morno, borda de linha e
 * raio de 10px. É a única caixa do kit — o que não é cartão é faixa.
 */
export function Cartao({
  /**
   * O cartão selecionado da lista de resultados: borda na cor da marca
   * e anel suave. Serve para dizer "é este que a ficha ao lado mostra".
   */
  destacado = false,
  /** Sem padding interno, para o cartão que tem cabeçalho colado na borda. */
  semPadding = false,
  como: Como = 'div',
  className,
  children,
}: {
  destacado?: boolean
  semPadding?: boolean
  como?: ElementType
  className?: string
  children: ReactNode
}): ReactElement {
  const borda = destacado ? 'border-marca ring-[3px] ring-marca/10' : 'border-linha'
  const padding = semPadding ? 'overflow-hidden' : 'p-6'

  return (
    <Como
      className={`rounded-cartao border bg-superficie ${borda} ${padding}${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </Como>
  )
}

/**
 * A faixa de cabeçalho do cartão, em papel-2 e com divisor embaixo.
 * Nas pranchas é onde entra o leitor encontrado no balcão.
 */
export function CabecalhoDeCartao({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}): ReactElement {
  return (
    <div
      className={`flex items-center gap-[14px] border-b border-linha bg-papel-2 px-[22px] py-[18px]${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </div>
  )
}
