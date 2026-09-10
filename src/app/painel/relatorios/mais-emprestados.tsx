import type { ReactElement } from 'react'
import { Cartao } from '@/components/ui/cartao'
import { Rotulo } from '@/components/ui/rotulo'
import type { PainelDoLeitor } from '@/modules/relatorios/painel-do-leitor.service'

/** Quantas obras paradas a tela lista antes de dizer "e mais N". */
const OBRAS_PARADAS_NA_TELA = 8

/**
 * O ranking do período e o acervo parado, no mesmo cartão.
 *
 * Estão juntos de propósito: é a mesma pergunta vista pelos dois lados —
 * o que a escola lê e o que a escola tem e não lê. A segunda lista é a
 * que alimenta o Carrinho da Leitura, e é a que muda decisão de compra.
 */
export function MaisEmprestados({
  painel,
}: {
  painel: PainelDoLeitor
}): ReactElement {
  const paradas = painel.acervoParado.obras.slice(0, OBRAS_PARADAS_NA_TELA)
  const restantes = painel.acervoParado.total - paradas.length

  return (
    <Cartao semPadding className="px-[22px] py-5">
      <h2 className="text-base font-semibold text-tinta">Mais emprestados</h2>
      <p className="mt-[3px] text-[12.5px] text-tinta-2">
        {painel.periodo.rotulo}, todas as turmas
      </p>

      {painel.maisEmprestadas.length === 0 ? (
        <p className="mt-[14px] text-[13.5px] text-tinta-2">
          Nenhum empréstimo no período.
        </p>
      ) : (
        <ol className="mt-[14px] flex flex-col">
          {painel.maisEmprestadas.map((obra, indice) => (
            <li
              key={obra.obraId}
              className="flex items-center gap-3 border-b border-linha py-[9px] last:border-b-0"
            >
              <span className="w-[14px] shrink-0 font-mono text-xs text-tinta-3">
                {indice + 1}
              </span>
              <span className="min-w-0 grow">
                <span className="block text-[13.5px] leading-[1.3] font-semibold text-tinta">
                  {obra.titulo}
                </span>
                <span className="block text-xs text-tinta-2">
                  {obra.autor === null ? 'sem autoria catalogada' : obra.autor}
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold">{obra.quantidade}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 border-t border-linha pt-[14px]">
        <Rotulo tom="discreto">Nunca emprestados</Rotulo>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-serif text-2xl font-bold">{painel.acervoParado.total}</span>
          <span className="text-[12.5px] text-tinta-2">
            obras paradas desde a catalogação
          </span>
        </div>

        {/*
          A lista aparece AQUI, e não atrás de um link: não existe tela de
          acervo parado, e um atalho para 404 ensina a operadora a
          desconfiar do resto do sistema. O arquivo exportado leva a lista
          completa (até o limite da consulta).
        */}
        {paradas.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-tinta-2">
            Nenhuma obra com exemplar e sem nenhum empréstimo. Obra catalogada sem exemplar
            não entra nesta conta — não há livro para pôr no carrinho.
          </p>
        ) : (
          <>
            <ul className="mt-2 flex flex-col gap-[5px]">
              {paradas.map((obra) => (
                <li key={obra.obraId} className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="min-w-0 grow text-tinta">
                    {obra.titulo}
                    {obra.autor !== null && (
                      <span className="text-tinta-3"> · {obra.autor}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] text-tinta-3">
                    {obra.exemplares}
                  </span>
                </li>
              ))}
            </ul>
            {restantes > 0 && (
              <p className="mt-2 text-[12.5px] text-tinta-3">
                e mais {restantes} — a lista completa vai no CSV.
              </p>
            )}
          </>
        )}
      </div>
    </Cartao>
  )
}
