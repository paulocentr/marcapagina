import type { ComponentPropsWithRef, ReactElement } from 'react'

/**
 * Tabela do kit: cabeçalho em rótulo de 11px, divisores de linha, sem
 * zebra. A lista de exemplares das pranchas é feita destes três.
 *
 * Cada linha é um livro físico — por isso a tabela não tem visual de
 * planilha: quem lê está procurando um tombo, não somando coluna.
 */
export function Tabela({ className, ...resto }: ComponentPropsWithRef<'table'>): ReactElement {
  return <table {...resto} className={`w-full border-collapse${className ? ` ${className}` : ''}`} />
}

export function CelulaDeTitulo({
  className,
  ...resto
}: ComponentPropsWithRef<'th'>): ReactElement {
  return (
    <th
      {...resto}
      scope={resto.scope === undefined ? 'col' : resto.scope}
      className={`border-b border-linha-2 pr-[14px] pb-[9px] text-left text-[11px] font-semibold tracking-[0.07em] text-tinta-3 uppercase${
        className ? ` ${className}` : ''
      }`}
    />
  )
}

export function Celula({ className, ...resto }: ComponentPropsWithRef<'td'>): ReactElement {
  return (
    <td
      {...resto}
      className={`border-b border-linha py-3 pr-[14px] align-middle text-[13.5px]${
        className ? ` ${className}` : ''
      }`}
    />
  )
}
