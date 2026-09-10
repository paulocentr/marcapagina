import type { ReactElement, ReactNode } from 'react'

/**
 * O rótulo de 11px em caixa alta das pranchas.
 *
 * "Apoio" é o rótulo de campo, que a operadora lê para saber o que
 * digitar; "discreto" é o rótulo de seção, que só organiza a tela.
 */
export function Rotulo({
  tom = 'apoio',
  className,
  children,
}: {
  tom?: 'apoio' | 'discreto'
  className?: string
  children: ReactNode
}): ReactElement {
  const cor = tom === 'apoio' ? 'text-tinta-2' : 'text-tinta-3'
  return (
    <span
      className={`text-[11px] font-semibold tracking-[0.07em] uppercase ${cor}${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </span>
  )
}
