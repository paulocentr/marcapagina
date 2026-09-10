'use client'

import { useCallback, useEffect, useState } from 'react'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Faixa } from '@/components/ui/faixa'
import { NaVolta } from './na-volta'
import { OQueLevar } from './o-que-levar'
import { SugestaoDeCompra } from './sugestao-de-compra'
import { abrirCarrinhoAction, type RodadaNaTela, type TurmaNaTela } from './actions'

/**
 * A tela do Carrinho da Leitura.
 *
 * O carrinho é FÍSICO e itinerante: circula pelas salas de aula. A tela
 * segue os três passos da prancha, na ordem do trabalho real —
 *
 *  1. o que levar, sugerido a partir dos pedidos pendentes da turma;
 *  2. na volta, o empréstimo em LOTE, uma tela para trinta alunos;
 *  3. a sugestão de compra, que é o argumento da verba.
 *
 * `<main>` próprio: a casca do painel entrega um `<div>`, e é aqui que o
 * conteúdo principal começa.
 */
type Passo = 'levar' | 'volta' | 'compra'

const PASSOS: { valor: Passo; numero: string; rotulo: string }[] = [
  { valor: 'levar', numero: '1', rotulo: 'O que levar' },
  { valor: 'volta', numero: '2', rotulo: 'Empréstimo em lote na volta' },
  { valor: 'compra', numero: '3', rotulo: 'Sugestão de compra' },
]

export default function PaginaDoCarrinho() {
  const [passo, setPasso] = useState<Passo>('levar')
  const [turmas, setTurmas] = useState<TurmaNaTela[]>([])
  const [rodadas, setRodadas] = useState<RodadaNaTela[]>([])
  const [rodadaAtual, setRodadaAtual] = useState<RodadaNaTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const resposta = await abrirCarrinhoAction()
    if (!resposta.ok) {
      setErro(resposta.erro)
      return
    }
    setErro(null)
    setTurmas(resposta.turmas)
    setRodadas(resposta.rodadas)
  }, [])

  useEffect(() => {
    void carregar().finally(() => setCarregando(false))
  }, [carregar])

  return (
    <main className="min-h-screen">
      <div className="px-8 pt-6">
        <CabecalhoDeTela
          titulo="Carrinho da Leitura"
          descricao="O carrinho vai à sala · uma tela para trinta alunos, não trinta telas."
        />
      </div>

      <div className="mt-[18px] border-b border-linha px-8">
        <div className="flex flex-wrap gap-[2px]" role="tablist" aria-label="Passos do carrinho">
          {PASSOS.map((item) => (
            <BotaoDePasso
              key={item.valor}
              numero={item.numero}
              rotulo={item.rotulo}
              valor={item.valor}
              ativo={passo === item.valor}
              onSelecionar={() => setPasso(item.valor)}
            />
          ))}
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="max-w-[980px]">
          {erro !== null && (
            <div className="mb-4">
              <Faixa tom="erro">{erro}</Faixa>
            </div>
          )}

          {carregando ? (
            <p className="text-[13.5px] text-tinta-2">Abrindo o carrinho…</p>
          ) : (
            <>
              <div
                role="tabpanel"
                id="painel-levar"
                aria-labelledby="passo-levar"
                hidden={passo !== 'levar'}
              >
                {/* Montado sempre, escondido quando não é o passo: a
                    sugestão marcada e desmarcada à mão não pode se perder
                    porque a operadora foi conferir a lista de compra. */}
                <OQueLevar
                  turmas={turmas}
                  onRodadaPlanejada={(rodada) => {
                    setRodadas((atual) => [rodada, ...atual])
                    setRodadaAtual(rodada)
                    // A rodada acabou de ser planejada: o próximo passo
                    // dela é o lote, e é para lá que a tela vai.
                    setPasso('volta')
                  }}
                />
              </div>

              <div
                role="tabpanel"
                id="painel-volta"
                aria-labelledby="passo-volta"
                hidden={passo !== 'volta'}
              >
                <NaVolta
                  rodadas={rodadas}
                  rodadaAtual={rodadaAtual}
                  onSelecionarRodada={setRodadaAtual}
                  // Depois do lote a rodada pode ter sido fechada pelo
                  // serviço. Recarregar é o que tira do seletor um
                  // carrinho que já não está na rua.
                  onLoteLancado={() => void carregar()}
                />
              </div>

              {/* Este, sim, só monta quando aberto: ele consulta o
                  servidor ao montar, e o número tem de ser o de agora. */}
              {passo === 'compra' && (
                <div role="tabpanel" id="painel-compra" aria-labelledby="passo-compra">
                  <SugestaoDeCompra />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function BotaoDePasso({
  numero,
  rotulo,
  valor,
  ativo,
  onSelecionar,
}: {
  numero: string
  rotulo: string
  valor: Passo
  ativo: boolean
  onSelecionar: () => void
}) {
  return (
    <button
      // Sem `type` o padrão do HTML é `submit`. Nenhum passo mora dentro
      // de formulário hoje, e é por isso que dizer custa nada: o primeiro
      // que morar não vai enviar o lote sozinho.
      type="button"
      id={`passo-${valor}`}
      role="tab"
      aria-selected={ativo}
      aria-controls={`painel-${valor}`}
      onClick={onSelecionar}
      className={`flex h-10 items-center gap-[9px] px-[18px] text-[14.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca ${
        ativo
          ? 'font-semibold text-marca-forte shadow-[inset_0_-2px_0_var(--color-marca)]'
          : 'font-medium text-tinta-2 hover:text-tinta'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-[21px] w-[21px] items-center justify-center rounded-full font-mono text-[11.5px] ${
          ativo ? 'bg-marca text-white' : 'bg-papel-2 text-tinta-2'
        }`}
      >
        {numero}
      </span>
      {rotulo}
    </button>
  )
}
