import type { ReactElement, ReactNode } from 'react'

/**
 * O cabeçalho que abre toda tela do painel: título em serifa de 26px,
 * uma linha de contexto embaixo e as ações à direita.
 *
 * O `<h1>` mora aqui e em nenhum outro lugar da tela — uma tela com dois
 * h1 faz o leitor de tela perder o fio da navegação por títulos.
 */
export function CabecalhoDeTela({
  titulo,
  descricao,
  acoes,
  className,
}: {
  titulo: string
  descricao?: ReactNode
  acoes?: ReactNode
  className?: string
}): ReactElement {
  return (
    <header
      className={`flex flex-wrap items-end justify-between gap-6${className ? ` ${className}` : ''}`}
    >
      <div>
        <h1 className="font-serif text-[26px] font-semibold text-tinta">{titulo}</h1>
        {descricao && <p className="mt-[3px] text-[13.5px] text-tinta-2">{descricao}</p>}
      </div>
      {acoes && <div className="flex items-center gap-[9px]">{acoes}</div>}
    </header>
  )
}
