import type { ComponentPropsWithRef, ReactElement } from 'react'
import { Rotulo } from '@/components/ui/rotulo'

/**
 * Campos do kit.
 *
 * `normal` é o campo de 40px da interface. `bipagem` é o campo de 52px,
 * mono e com letra grande, para matrícula, tombo e ISBN: é onde o leitor
 * de código de barras despeja dígitos e onde a operadora confere contra
 * a etiqueta sem se aproximar da tela.
 */
export type VarianteDeCampo = 'normal' | 'bipagem'

const BASE =
  'w-full rounded-controle border bg-superficie px-3 text-tinta placeholder:text-tinta-3 ' +
  'focus:outline-none focus:ring-[3px]'

const POR_VARIANTE: Record<VarianteDeCampo, string> = {
  normal: 'h-10 text-sm',
  bipagem: 'h-[52px] font-mono text-[19px] tracking-[0.05em]',
}

export function classesDeCampo(variante: VarianteDeCampo = 'normal', comErro = false): string {
  const estado = comErro
    ? 'border-alerta focus:border-alerta focus:ring-alerta/20'
    : 'border-linha-2 focus:border-marca focus:ring-marca/15'
  return `${BASE} ${POR_VARIANTE[variante]} ${estado}`
}

interface PropsDoCampo extends ComponentPropsWithRef<'input'> {
  variante?: VarianteDeCampo
  /** Só a borda vermelha; a mensagem é responsabilidade de quem chama. */
  comErro?: boolean
}

export function Campo({
  variante = 'normal',
  comErro = false,
  className,
  autoComplete,
  ...resto
}: PropsDoCampo): ReactElement {
  // Campo de bipagem nunca aceita autocomplete: a sugestão do navegador
  // cobre o campo justamente quando a fila anda. Quem chamou pode dizer
  // outra coisa — o padrão só vale quando ninguém disse nada.
  const autoCompletar =
    autoComplete === undefined && variante === 'bipagem' ? 'off' : autoComplete

  return (
    <input
      {...resto}
      autoComplete={autoCompletar}
      aria-invalid={comErro || undefined}
      className={`${classesDeCampo(variante, comErro)}${className ? ` ${className}` : ''}`}
    />
  )
}

interface PropsDoCampoComRotulo extends Omit<PropsDoCampo, 'comErro' | 'id'> {
  /** Obrigatório: é o que amarra rótulo, campo e mensagem sem hook. */
  id: string
  rotulo: string
  /** Texto de apoio permanente. */
  dica?: string
  /**
   * A mensagem de erro. É a mensagem que liga o estado de erro — não
   * existe borda vermelha sem alguém dizer o que está errado.
   */
  erro?: string
}

export function CampoComRotulo({
  id,
  rotulo,
  dica,
  erro,
  variante = 'normal',
  ...resto
}: PropsDoCampoComRotulo): ReactElement {
  // O erro cobre a dica: quem errou precisa ler o que corrigir, não o
  // texto de ajuda que já não serviu.
  const mensagem = erro !== undefined ? erro : dica
  const idDaMensagem = mensagem ? `${id}-apoio` : undefined

  return (
    <div className="flex flex-col gap-[7px]">
      <label htmlFor={id}>
        <Rotulo>{rotulo}</Rotulo>
      </label>

      <Campo
        {...resto}
        id={id}
        variante={variante}
        comErro={erro !== undefined}
        aria-describedby={idDaMensagem}
      />

      {mensagem && (
        <span
          id={idDaMensagem}
          role={erro ? 'alert' : undefined}
          className={`text-xs ${erro ? 'text-alerta' : 'text-tinta-2'}`}
        >
          {mensagem}
        </span>
      )}
    </div>
  )
}
