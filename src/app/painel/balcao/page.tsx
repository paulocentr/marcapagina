'use client'

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Rotulo } from '@/components/ui/rotulo'
import { Emprestar } from './emprestar'
import { Devolver } from './devolver'
import { TrilhaDaDevolucao, TrilhaDoEmprestimo } from './trilha-lateral'
import {
  carregarPainelAction,
  type LeitorDaTela,
  type PainelDoBalcaoNaTela,
} from './actions'

type Aba = 'emprestar' | 'devolver'

/**
 * A tela do balcão: duas colunas, como a prancha.
 *
 * A da esquerda é o atendimento de AGORA — uma matrícula, um tombo,
 * confirma. A da direita é a trilha: o contexto que diz se aquele
 * atendimento está certo. Elas não são decoração uma da outra; a trilha
 * mostra o que o leitor já tem em mãos, o que passou pelo balcão hoje e o
 * que está guardado esperando quem reservou.
 *
 * O estado do leitor e o do dia moram AQUI, e não dentro das abas, porque
 * as duas colunas falam do mesmo leitor e do mesmo dia. Uma segunda cópia
 * de qualquer um dos dois é como a ficha e a trilha passariam a discordar
 * na frente do aluno.
 */
export default function PaginaDoBalcao(): ReactElement {
  const [aba, setAba] = useState<Aba>('emprestar')
  const [leitor, setLeitor] = useState<LeitorDaTela | null>(null)
  const [painel, setPainel] = useState<PainelDoBalcaoNaTela | null>(null)
  const [erroDoPainel, setErroDoPainel] = useState<string | null>(null)

  const carregarPainel = useCallback(async () => {
    try {
      const resposta = await carregarPainelAction()
      if (!resposta.ok) {
        setErroDoPainel(resposta.erro)
        return
      }
      setErroDoPainel(null)
      setPainel(resposta.painel)
    } catch {
      // A trilha é contexto: quando ela não carrega, o atendimento da
      // coluna da esquerda continua inteiro. O que não pode acontecer é
      // a tela seguir mostrando números velhos como se fossem de agora —
      // por isso a frase de aviso aparece junto deles logo abaixo.
      setErroDoPainel('Não consegui ler o dia do balcão agora.')
    }
  }, [])

  useEffect(() => {
    void carregarPainel()
  }, [carregarPainel])

  const recarregarTrilha = useCallback(() => {
    void carregarPainel()
  }, [carregarPainel])

  return (
    // `<main>` próprio: a casca do painel (src/app/painel/layout.tsx)
    // entrega um `<div>`, e é aqui que o conteúdo principal começa.
    <main className="min-h-screen">
      <div className="px-8 pt-6">
        <CabecalhoDeTela
          titulo="Balcão"
          descricao="Uma matrícula, um tombo, confirma. A fila não espera o mouse."
          acoes={
            aba === 'emprestar' ? (
              <Atalhos
                itens={[
                  { tecla: 'Enter', oque: 'busca' },
                  { tecla: 'Esc', oque: 'recomeça' },
                ]}
              />
            ) : (
              <Atalhos
                itens={[
                  { tecla: 'Enter', oque: 'registra' },
                  { tecla: 'Esc', oque: 'limpa' },
                ]}
              />
            )
          }
        />
      </div>

      <div className="mt-[18px] border-b border-linha px-8">
        <div className="flex gap-[2px]" role="tablist" aria-label="Operação do balcão">
          {(['emprestar', 'devolver'] as const).map((valor) => (
            <BotaoDeAba
              key={valor}
              valor={valor}
              ativa={aba === valor}
              onSelecionar={() => setAba(valor)}
            />
          ))}
        </div>
      </div>

      <div className="px-8 py-6">
        {aba === 'emprestar' ? (
          <div
            role="tabpanel"
            id="painel-emprestar"
            aria-labelledby="aba-emprestar"
            className="flex flex-wrap items-start gap-6"
          >
            {/*
              A coluna operacional para de crescer: o campo de bipagem é
              conferido dígito a dígito contra a etiqueta, e uma linha de
              1400px obriga a operadora a varrer a tela com os olhos entre
              o campo e o botão.
            */}
            <div className="min-w-0 grow basis-[560px] md:max-w-[780px]">
              <Emprestar
                leitor={leitor}
                onLeitor={setLeitor}
                atendidosHoje={painel === null ? null : painel.atendidosHoje}
                onAtendimento={recarregarTrilha}
              />
            </div>
            <Trilha erro={erroDoPainel} painel={painel}>
              <TrilhaDoEmprestimo leitor={leitor} painel={painel} erro={erroDoPainel} />
            </Trilha>
          </div>
        ) : (
          <div
            role="tabpanel"
            id="painel-devolver"
            aria-labelledby="aba-devolver"
            className="flex flex-wrap items-start gap-6"
          >
            <div className="min-w-0 grow basis-[560px] md:max-w-[780px]">
              <Devolver
                devolvidosHoje={painel === null ? null : painel.devolvidosHoje}
                onDevolucao={recarregarTrilha}
              />
            </div>
            <Trilha erro={erroDoPainel} painel={painel}>
              <TrilhaDaDevolucao painel={painel} erro={erroDoPainel} />
            </Trilha>
          </div>
        )}
      </div>
    </main>
  )
}

/**
 * A coluna da trilha, com o aviso de leitura velha quando é o caso.
 *
 * Se a releitura falhou DEPOIS de uma que deu certo, os cartões abaixo
 * continuam desenhados — e passariam a mentir em silêncio, porque o
 * empréstimo que acabou de sair não está neles. A frase é o que impede
 * isso; sem painel nenhum, quem fala é o próprio cartão da trilha.
 */
function Trilha({
  erro,
  painel,
  children,
}: {
  erro: string | null
  painel: PainelDoBalcaoNaTela | null
  children: ReactElement
}): ReactElement {
  return (
    <aside className="flex w-[336px] max-w-full shrink-0 flex-col gap-3">
      {erro !== null && painel !== null && (
        <p className="rounded-controle border border-atencao-borda bg-atencao-suave px-3 py-2 text-[12px] text-atencao-texto">
          {erro} Os números abaixo são da última leitura que deu certo.
        </p>
      )}
      {children}
    </aside>
  )
}

function BotaoDeAba({
  valor,
  ativa,
  onSelecionar,
}: {
  valor: Aba
  ativa: boolean
  onSelecionar: () => void
}) {
  return (
    <button
      // Sem `type` o padrão do HTML é `submit`. Nenhuma aba mora dentro
      // de formulário hoje, e é justamente por isso que dizer custa nada
      // e a primeira que morar não vai enviar o atendimento sozinha.
      type="button"
      id={`aba-${valor}`}
      role="tab"
      aria-selected={ativa}
      aria-controls={`painel-${valor}`}
      onClick={onSelecionar}
      className={`h-10 px-[18px] text-[14.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca ${
        ativa
          ? 'font-semibold text-marca-forte shadow-[inset_0_-2px_0_var(--color-marca)]'
          : 'font-medium text-tinta-2 hover:text-tinta'
      }`}
    >
      {valor === 'emprestar' ? 'Emprestar' : 'Devolver'}
    </button>
  )
}

function Atalhos({ itens }: { itens: { tecla: string; oque: string }[] }) {
  return (
    <div className="flex items-center gap-2 pb-[2px]">
      <Rotulo tom="discreto">atalhos</Rotulo>
      {itens.map((item) => (
        <span key={item.tecla} className="flex items-center gap-2">
          <kbd className="rounded-[4px] border border-b-2 border-linha bg-papel-2 px-[5px] py-px font-mono text-[11px] text-tinta-2">
            {item.tecla}
          </kbd>
          <span className="text-xs text-tinta-3">{item.oque}</span>
        </span>
      ))}
    </div>
  )
}
