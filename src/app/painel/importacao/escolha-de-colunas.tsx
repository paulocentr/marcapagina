'use client'

import type { ReactElement } from 'react'
import { classesDeCampo } from '@/components/ui/campo'
import { Rotulo } from '@/components/ui/rotulo'
import { rotuloDaColuna } from './mapeamento'
import type { CampoNaTela } from './actions'

/**
 * De qual coluna da planilha sai cada campo.
 *
 * Isto é o coração da tela, e não um ajuste avançado escondido num
 * "mais opções". O erro mais caro do importador não é a linha recusada —
 * é a coluna trocada: o nome da mãe no campo do aluno passa por todas as
 * validações, grava trezentos cadastros errados e ninguém vê. A escolha
 * fica à vista, já preenchida com o que o sistema reconheceu, para a
 * operadora conferir em cinco segundos em vez de descobrir em um mês.
 */
export function EscolhaDeColunas({
  campos,
  cabecalho,
  escolhido,
  desabilitado,
  onEscolher,
}: {
  campos: CampoNaTela[]
  cabecalho: string[]
  /** chave do campo → índice da coluna em texto; `''` é "não usar". */
  escolhido: Record<string, string>
  desabilitado: boolean
  onEscolher: (chave: string, coluna: string) => void
}): ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {campos.map((campo) => {
        const id = `coluna-${campo.chave}`
        const valor = escolhido[campo.chave]
        const semColuna = valor === undefined || valor === ''

        return (
          <div key={campo.chave} className="flex flex-col gap-[7px]">
            <label htmlFor={id}>
              <Rotulo>
                {campo.rotulo}
                {campo.obrigatorio ? ' *' : ''}
              </Rotulo>
            </label>

            <select
              id={id}
              value={valor === undefined ? '' : valor}
              disabled={desabilitado}
              // Obrigatório sem coluna é erro de verdade: a planilha não
              // pode ser analisada assim, e a borda vermelha acompanha a
              // frase embaixo — nunca sozinha.
              aria-invalid={campo.obrigatorio && semColuna ? true : undefined}
              aria-describedby={campo.obrigatorio && semColuna ? `${id}-apoio` : undefined}
              onChange={(evento) => onEscolher(campo.chave, evento.target.value)}
              className={classesDeCampo('normal', campo.obrigatorio && semColuna)}
            >
              <option value="">
                {campo.obrigatorio ? '— escolha a coluna —' : '— não usar —'}
              </option>
              {cabecalho.map((titulo, indice) => (
                <option key={`${indice}-${titulo}`} value={String(indice)}>
                  {rotuloDaColuna(indice, titulo)}
                </option>
              ))}
            </select>

            {campo.obrigatorio && semColuna && (
              <span id={`${id}-apoio`} role="alert" className="text-xs text-alerta">
                Este campo é obrigatório: diga em qual coluna ele está.
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
