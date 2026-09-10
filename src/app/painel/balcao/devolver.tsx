'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'
import { Cartao } from '@/components/ui/cartao'
import { CampoComRotulo, classesDeCampo } from '@/components/ui/campo'
import { Chip } from '@/components/ui/chip'
import { Tombo } from '@/components/ui/codigo'
import { Faixa, FaixaDaFita } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { ALTURA_DA_BIPAGEM } from './bipagem'
import { devolverAction, type RespostaDaDevolucao } from './actions'
import type { EstadoDeConservacao } from '@/modules/acervo/exemplares.service'

const ROTULO_DO_ESTADO: Record<EstadoDeConservacao, string> = {
  NOVO: 'Novo',
  BOM: 'Bom',
  DESGASTADO: 'Desgastado',
  DANIFICADO: 'Danificado',
}

/** Bom primeiro: é o estado da esmagadora maioria das devoluções. */
const ESTADOS_NA_ORDEM_DO_BALCAO: EstadoDeConservacao[] = [
  'BOM',
  'NOVO',
  'DESGASTADO',
  'DANIFICADO',
]

export function Devolver({
  devolvidosHoje,
  onDevolucao,
}: {
  /** `null` enquanto a consulta do dia não chegou. Não se desenha zero. */
  devolvidosHoje: number | null
  onDevolucao: () => void
}): ReactElement {
  const [tombo, setTombo] = useState('')
  const [estado, setEstado] = useState<EstadoDeConservacao>('BOM')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [devolvido, setDevolvido] = useState<DevolucaoFeita | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const campoDeTombo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    campoDeTombo.current?.focus()
  }, [])

  const limpar = useCallback(() => {
    setTombo('')
    setEstado('BOM')
    setObservacao('')
    setErro(null)
    setDevolvido(null)
    campoDeTombo.current?.focus()
  }, [])

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setDevolvido(null)
    setOcupado(true)
    try {
      const resposta = await devolverAction({
        tombo,
        estado,
        observacao: observacao.trim() || undefined,
      })

      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setDevolvido({ resposta, tombo: tombo.trim(), estado })
      // O campo esvazia e o cursor volta para ele — o resultado FICA na
      // tela, porque é nele que está o "separe este exemplar".
      setTombo('')
      setEstado('BOM')
      setObservacao('')
      campoDeTombo.current?.focus()
      // A trilha refaz o dia: esta devolução entra na tira, o contador
      // sobe, e o exemplar pode ter acabado de aparecer na prateleira.
      onDevolucao()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') limpar()
      }}
      className="flex flex-col gap-4"
    >
      <Cartao className="px-[22px] py-5">
        <form onSubmit={confirmar} className="flex flex-col gap-[18px]">
          <div className="flex flex-wrap items-end gap-[14px]">
            <div className="w-[250px]">
              <CampoComRotulo
                id="devolucao-tombo"
                rotulo="Tombo do livro"
                variante="bipagem"
                placeholder="bipe a etiqueta"
                ref={campoDeTombo}
                value={tombo}
                onChange={(evento) => setTombo(evento.target.value)}
              />
            </div>

            <SelecaoComRotulo
              id="devolucao-estado"
              rotulo="Como o livro voltou"
              value={estado}
              onChange={(evento) => setEstado(evento.target.value as EstadoDeConservacao)}
            >
              {ESTADOS_NA_ORDEM_DO_BALCAO.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_DO_ESTADO[valor]}
                </option>
              ))}
            </SelecaoComRotulo>

            <Botao
              type="submit"
              icone="troca"
              className={ALTURA_DA_BIPAGEM}
              disabled={ocupado || tombo.trim().length === 0}
            >
              Registrar devolução
            </Botao>

            <div className="grow" />
            <ContadorDeDevolucoes quantos={devolvidosHoje} />
          </div>

          {estado === 'DANIFICADO' && (
            <CampoComRotulo
              id="devolucao-observacao"
              rotulo="O que houve"
              dica="Fica no histórico deste exemplar, para a coordenação decidir depois."
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
            />
          )}
        </form>
      </Cartao>

      {erro && <Faixa tom="erro">{erro}</Faixa>}

      {devolvido && <ResultadoDaDevolucao devolucao={devolvido} />}

      {/*
        Permanente, e não só quando "Danificado" está escolhido: assim a
        operadora lê ANTES de escolher, e não fica esperando que o sistema
        puna alguém por ela.
      */}
      <p className="flex items-center gap-[10px] px-1 text-[13px] text-tinta-2">
        <span className="shrink-0 text-tinta-3">
          <Icone nome="info" tamanho={16} traco={1.6} />
        </span>
        <span>
          Estado <strong>Danificado</strong> não gera penalidade automática — a decisão é da
          coordenação.
        </span>
      </p>
    </div>
  )
}

/** "devolvidos hoje · 27". Conta o dia, não a tira da trilha. */
function ContadorDeDevolucoes({ quantos }: { quantos: number | null }): ReactElement | null {
  if (quantos === null) return null

  return (
    <div className="pb-[6px] text-right">
      <Rotulo tom="discreto">devolvidos hoje</Rotulo>
      <div className="font-serif text-[22px] font-bold text-tinta">{quantos}</div>
    </div>
  )
}

interface DevolucaoFeita {
  resposta: Extract<RespostaDaDevolucao, { ok: true }>
  tombo: string
  estado: EstadoDeConservacao
}

function ResultadoDaDevolucao({ devolucao }: { devolucao: DevolucaoFeita }) {
  const { resposta, tombo, estado } = devolucao
  const houvePenalidade = resposta.diasDeAtraso > 0 || resposta.suspensaoAte !== null

  return (
    <Cartao semPadding>
      <div
        role="status"
        className="flex items-center gap-3 border-b border-certo-borda bg-certo-suave px-[22px] py-[15px] text-certo-texto"
      >
        <span className="shrink-0 text-certo">
          <Icone nome="check" tamanho={20} traco={2.1} />
        </span>
        <span className="text-[14.5px]">
          <strong>
            “{resposta.titulo}” devolvido por {resposta.leitor}.
          </strong>{' '}
          Tombo <Tombo valor={tombo} /> · voltou em estado {ROTULO_DO_ESTADO[estado]}.
        </span>
      </div>

      <div className="flex flex-col gap-4 p-[22px]">
        {/* Sem este aviso a operadora devolve o livro à estante e a fila de
            reserva nunca anda. É a única faixa com fita — não troque por
            uma Faixa de atenção. */}
        {resposta.separadoAte !== null && (
          <FaixaDaFita titulo="Separe este exemplar — não devolva à estante">
            Reservado para o próximo da fila, que tem até{' '}
            <strong className="font-mono">{resposta.separadoAte}</strong> para retirar. Depois
            disso o sistema passa a vez sozinho. Ele já está na{' '}
            <strong>prateleira de separados</strong>, ao lado.
          </FaixaDaFita>
        )}

        {houvePenalidade && (
          <Faixa
            tom="atencao"
            // Sem atraso não existe frase de atraso: "0 dias de atraso"
            // seria o sistema inventando um número que ninguém contou.
            titulo={
              resposta.diasDeAtraso > 0 ? fraseDeAtraso(resposta.diasDeAtraso) : undefined
            }
          >
            {resposta.suspensaoAte === null ? (
              'Nenhuma suspensão foi aplicada nesta devolução.'
            ) : (
              <>
                Leitor suspenso até <strong className="font-mono">{resposta.suspensaoAte}</strong> —
                um dia de suspensão por dia de atraso.
              </>
            )}
          </Faixa>
        )}

        <div className="rounded-controle border border-linha bg-papel-2 px-4 py-[15px]">
          <Rotulo>Exemplar agora</Rotulo>
          <dl className="mt-[9px] flex flex-col gap-[7px] text-[13px]">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-tinta-2">Tombo</dt>
              <dd>
                <Tombo valor={tombo} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-tinta-2">Estado</dt>
              <dd>{ROTULO_DO_ESTADO[estado]}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-tinta-2">Situação</dt>
              <dd>
                <Chip
                  estado={
                    resposta.separadoAte === null ? 'DISPONIVEL' : 'SEPARADO_PARA_RESERVA'
                  }
                />
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Cartao>
  )
}

/**
 * O `<select>` com rótulo, que o kit não tem.
 *
 * Reaproveita `classesDeCampo` em vez de repintar a borda à mão: assim o
 * campo de estado continua idêntico ao campo de texto ao lado dele
 * quando o token da linha mudar. Fica local porque o kit compartilhado
 * não é meu para alterar.
 */
function SelecaoComRotulo({
  id,
  rotulo,
  children,
  ...resto
}: React.ComponentPropsWithRef<'select'> & { id: string; rotulo: string }) {
  return (
    <div className="flex w-[210px] flex-col gap-[7px]">
      <label htmlFor={id}>
        <Rotulo>{rotulo}</Rotulo>
      </label>
      <select
        {...resto}
        id={id}
        // Sem `appearance-none`: a seta nativa é a única coisa que diz
        // que este campo abre uma lista, e o kit não tem um chevron para
        // pôr no lugar dela.
        className={`${classesDeCampo()} h-[52px] text-[15px]`}
      >
        {children}
      </select>
    </div>
  )
}

function fraseDeAtraso(dias: number): string {
  if (dias === 1) return '1 dia de atraso.'
  return `${dias} dias de atraso.`
}
