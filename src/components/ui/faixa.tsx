import type { ReactElement, ReactNode } from 'react'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone } from '@/components/ui/icones'

/**
 * Faixa de resultado: o que aconteceu, dito onde a operadora já está
 * olhando. Como o chip, carrega ícone E palavra — cor sozinha não conta.
 */
export type TomDeFaixa = 'sucesso' | 'atencao' | 'erro'

const POR_TOM: Record<TomDeFaixa, { classes: string; icone: NomeDeIcone; papel: 'status' | 'alert' }> =
  {
    sucesso: {
      classes: 'bg-certo-suave border-certo-borda text-certo-texto',
      icone: 'check',
      papel: 'status',
    },
    atencao: {
      classes: 'bg-atencao-suave border-atencao-borda text-atencao-texto',
      icone: 'relogio',
      papel: 'alert',
    },
    erro: {
      classes: 'bg-alerta-suave border-alerta-borda text-alerta-texto',
      icone: 'aviso',
      papel: 'alert',
    },
  }

const COR_DO_ICONE: Record<TomDeFaixa, string> = {
  sucesso: 'text-certo',
  atencao: 'text-atencao',
  erro: 'text-alerta',
}

export function Faixa({
  tom,
  /** Ícone diferente do padrão do tom — atenção nem sempre é atraso. */
  icone,
  /** A frase curta que resume. Sai em negrito, antes do resto. */
  titulo,
  children,
  className,
}: {
  tom: TomDeFaixa
  icone?: NomeDeIcone
  titulo?: string
  children?: ReactNode
  className?: string
}): ReactElement {
  const { classes, icone: iconePadrao, papel } = POR_TOM[tom]

  return (
    <div
      // Sucesso é `status` (avisa sem interromper); atenção e erro são
      // `alert`, porque bloqueio e recusa param o atendimento e o leitor
      // de tela tem de dizer isso na hora.
      role={papel}
      className={`flex gap-[10px] rounded-controle border px-[15px] py-[13px] text-[13.5px] ${classes}${
        className ? ` ${className}` : ''
      }`}
    >
      <span className={`mt-px shrink-0 ${COR_DO_ICONE[tom]}`}>
        <Icone nome={icone === undefined ? iconePadrao : icone} tamanho={18} traco={1.8} />
      </span>
      <div>
        {titulo && <strong>{titulo}</strong>}
        {titulo && children ? ' ' : null}
        {children}
      </div>
    </div>
  )
}

/**
 * A fita: "separe este exemplar".
 *
 * É a única faixa com barra colorida à esquerda e título em serifa, e a
 * única aplicação da cor de identidade fora da marca. Sem ela a
 * operadora devolve o livro à estante e a fila de reserva nunca anda —
 * é por isso que ela não é uma variante de tom da `Faixa`, e sim um
 * componente com nome próprio que ninguém troca por engano.
 */
export function FaixaDaFita({
  titulo,
  children,
  className,
}: {
  titulo: string
  children?: ReactNode
  className?: string
}): ReactElement {
  return (
    <div
      role="alert"
      className={`flex gap-[14px] rounded-controle border border-fita-borda border-l-4 border-l-fita bg-fita-suave p-4${
        className ? ` ${className}` : ''
      }`}
    >
      <span className="shrink-0 text-fita">
        <Icone nome="fita" tamanho={22} />
      </span>
      <div>
        <div className="font-serif text-base font-bold text-fita-texto">{titulo}</div>
        {children && <div className="mt-1 text-[13px] text-fita-texto">{children}</div>}
      </div>
    </div>
  )
}
