import type { ReactElement } from 'react'

/**
 * Tombo, ISBN e matrícula — SEMPRE em mono.
 *
 * É assim que a operadora confere dígito a dígito contra a etiqueta: em
 * sans, `0` e `O` e `1` e `l` têm largura e desenho parecidos, e a
 * conferência de um tombo de seis dígitos passa a depender de sorte.
 *
 * O componente existe para que nenhuma tela escreva o número solto: o
 * tipo é obrigatório, e é ele que rende o rótulo lido em voz alta pelo
 * leitor de tela ("tombo 000418", e não "quatrocentos e dezoito").
 */
export type TipoDeCodigo = 'tombo' | 'isbn' | 'matricula'

const ROTULO_FALADO: Record<TipoDeCodigo, string> = {
  tombo: 'tombo',
  isbn: 'ISBN',
  matricula: 'matrícula',
}

export type TamanhoDeCodigo = 'discreto' | 'normal' | 'destaque'

const POR_TAMANHO: Record<TamanhoDeCodigo, string> = {
  discreto: 'text-[11.5px] text-tinta-3',
  normal: 'text-[13.5px]',
  destaque: 'text-base font-medium',
}

export function Codigo({
  tipo,
  valor,
  tamanho = 'normal',
  className,
}: {
  tipo: TipoDeCodigo
  /** String, nunca número: zeros à esquerda são parte do tombo. */
  valor: string
  tamanho?: TamanhoDeCodigo
  className?: string
}): ReactElement {
  return (
    <span
      // O número aparece igual na tela; o rótulo é só para quem ouve.
      aria-label={`${ROTULO_FALADO[tipo]} ${valor}`}
      className={`font-mono ${POR_TAMANHO[tamanho]}${className ? ` ${className}` : ''}`}
    >
      {valor}
    </span>
  )
}

export function Tombo(props: Omit<Parameters<typeof Codigo>[0], 'tipo'>): ReactElement {
  return <Codigo {...props} tipo="tombo" />
}

export function Isbn(props: Omit<Parameters<typeof Codigo>[0], 'tipo'>): ReactElement {
  return <Codigo {...props} tipo="isbn" />
}

export function Matricula(props: Omit<Parameters<typeof Codigo>[0], 'tipo'>): ReactElement {
  return <Codigo {...props} tipo="matricula" />
}
