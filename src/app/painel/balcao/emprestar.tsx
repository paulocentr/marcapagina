'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'
import { CabecalhoDeCartao, Cartao } from '@/components/ui/cartao'
import { CampoComRotulo } from '@/components/ui/campo'
import { Matricula, Tombo } from '@/components/ui/codigo'
import { Faixa, type TomDeFaixa } from '@/components/ui/faixa'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Rotulo } from '@/components/ui/rotulo'
import { ChipDeSituacao } from '../acervo/[obraId]/chip-de-situacao'
import { ALTURA_DA_BIPAGEM } from './bipagem'
import { textoDaLocalizacao } from './trilha'
import {
  buscarLeitorAction,
  conferirTomboAction,
  emprestarAction,
  type ExemplarConferido,
  type LeitorDaTela,
} from './actions'
import type { Bloqueio, TipoDeBloqueio } from '@/modules/circulacao/bloqueios'

/**
 * Quanto tempo o tombo fica parado antes de a tela conferir o exemplar.
 *
 * O leitor de código de barras despeja os dígitos de uma vez, então na
 * prática a conferência sai numa chamada só. A espera existe para a
 * digitação à mão não virar seis consultas de um tombo de seis dígitos.
 */
const ESPERA_DA_CONFERENCIA = 320

/**
 * A aba de emprestar.
 *
 * O `leitor` é do PAI e não daqui: a trilha lateral mostra a lista de
 * livros em mãos do mesmo leitor, e duas cópias do mesmo estado é como se
 * abre caminho para a ficha e a trilha discordarem na frente do aluno.
 */
export function Emprestar({
  leitor,
  onLeitor,
  atendidosHoje,
  onAtendimento,
}: {
  leitor: LeitorDaTela | null
  onLeitor: (leitor: LeitorDaTela | null) => void
  /** `null` enquanto a consulta do dia não chegou. Não se desenha zero. */
  atendidosHoje: number | null
  onAtendimento: () => void
}): ReactElement {
  const [matricula, setMatricula] = useState('')
  const [tombo, setTombo] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [bloqueiosDaRecusa, setBloqueiosDaRecusa] = useState<Bloqueio[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [emprestado, setEmprestado] = useState<EmprestimoFeito | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [conferido, setConferido] = useState<ExemplarConferido | null>(null)
  const [semConferencia, setSemConferencia] = useState<string | null>(null)

  const campoDeMatricula = useRef<HTMLInputElement>(null)
  const campoDeTombo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    campoDeMatricula.current?.focus()
  }, [])

  const bipado = tombo.trim()
  const temLeitor = leitor !== null

  /**
   * Confere o tombo bipado enquanto a operadora ainda tem o livro na mão.
   *
   * A resposta atrasada é descartada (`atual`): sem isso, a conferência de
   * um tombo já apagado chegaria depois e pintaria na tela um livro que
   * não é o da mão — que é exatamente o erro que esta conferência existe
   * para evitar.
   */
  useEffect(() => {
    if (!temLeitor || bipado.length === 0) {
      setConferido(null)
      setSemConferencia(null)
      return
    }

    let atual = true
    const agendado = setTimeout(() => {
      conferirTomboAction(bipado)
        .then((resposta) => {
          if (!atual) return
          if (resposta.ok) {
            setConferido(resposta.exemplar)
            setSemConferencia(null)
            return
          }
          // Tombo incompleto é o estado NORMAL enquanto se digita: a
          // recusa sai discreta, e não como alarme, para a tela não
          // acusar a operadora no meio da própria digitação.
          setConferido(null)
          setSemConferencia(resposta.erro)
        })
        .catch(() => {
          if (!atual) return
          setConferido(null)
          setSemConferencia(
            'Não consegui conferir este tombo agora — confira o livro na mão antes de confirmar.',
          )
        })
    }, ESPERA_DA_CONFERENCIA)

    return () => {
      atual = false
      clearTimeout(agendado)
    }
  }, [bipado, temLeitor])

  // Depois de emprestar, volta para a matrícula: o próximo aluno da fila
  // é sempre outro. Voltar para o tombo obrigaria a operadora a tirar a
  // mão do teclado para recomeçar (spec §5.1).
  const recomecar = useCallback(() => {
    onLeitor(null)
    setMatricula('')
    setTombo('')
    setJustificativa('')
    setBloqueiosDaRecusa(null)
    campoDeMatricula.current?.focus()
  }, [onLeitor])

  // Cancelar limpa também o que estava escrito na tela. Recomeçar sem
  // isso deixaria a recusa do aluno anterior no ar enquanto o próximo já
  // está na frente do balcão.
  const cancelar = useCallback(() => {
    setErro(null)
    setEmprestado(null)
    recomecar()
  }, [recomecar])

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEmprestado(null)
    setOcupado(true)
    try {
      const resposta = await buscarLeitorAction(matricula)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      onLeitor(resposta.leitor)
      // O cursor pula direto para o tombo: a operadora já pode passar o
      // leitor de código de barras no livro sem tocar no mouse.
      setTimeout(() => campoDeTombo.current?.focus(), 0)
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault()
    if (leitor === null) return
    setErro(null)
    setEmprestado(null)
    setOcupado(true)
    try {
      const resposta = await emprestarAction({
        alunoId: leitor.id,
        tombo,
        justificativa: justificativa.trim() || undefined,
      })

      if (!resposta.ok) {
        setErro(resposta.erro)
        setBloqueiosDaRecusa(resposta.bloqueios ?? null)
        return
      }

      setEmprestado({
        tombo: resposta.tombo,
        leitor: leitor.nome,
        turma: leitor.turma,
        previstaPara: resposta.previstaPara,
        forcado: resposta.forcado,
      })
      recomecar()
      // A trilha refaz o dia: este empréstimo é a linha mais recente de
      // "Últimos do balcão" e mais um em "atendidos hoje".
      onAtendimento()
    } finally {
      setOcupado(false)
    }
  }

  // Os bloqueios da recusa entram junto com os da busca: o serviço pode
  // recusar por um bloqueio que nasceu entre a busca e a confirmação
  // (outro atendimento no mesmo minuto), e esconder isso deixaria a
  // operadora sem entender o "não".
  const bloqueios = leitor !== null ? unirBloqueios(leitor.bloqueios, bloqueiosDaRecusa) : []
  const precisaJustificar = bloqueios.length > 0

  return (
    // Esc recomeça o atendimento. O keydown sobe dos campos, então vale
    // com o cursor onde ele estiver — e é o que a legenda do cabeçalho
    // promete.
    <div
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') cancelar()
      }}
      className="flex flex-col gap-4"
    >
      <Cartao className="px-[22px] py-5">
        <form onSubmit={buscar} className="flex flex-wrap items-end gap-3">
          <div className="w-[280px]">
            <CampoComRotulo
              id="balcao-matricula"
              rotulo="1 · Matrícula do aluno"
              variante="bipagem"
              inputMode="numeric"
              ref={campoDeMatricula}
              value={matricula}
              onChange={(evento) => setMatricula(evento.target.value)}
            />
          </div>
          <Botao
            type="submit"
            variante="secundaria"
            icone="busca"
            className={ALTURA_DA_BIPAGEM}
            disabled={ocupado || matricula.trim().length === 0}
          >
            Buscar
          </Botao>
          <div className="grow" />
          <ContadorDoDia rotulo="atendidos hoje" quantos={atendidosHoje} />
        </form>
      </Cartao>

      {leitor !== null && (
        <Cartao semPadding>
          <CabecalhoDeCartao>
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-linha-2 bg-superficie font-serif text-base font-bold"
            >
              {iniciais(leitor.nome)}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-[9px]">
                <span className="font-serif text-[19px] font-semibold">{leitor.nome}</span>
                {leitor.turma && (
                  <span className="text-[13.5px] text-tinta-2">· {leitor.turma}</span>
                )}
              </div>
              <div className="mt-[2px] text-[13px] text-tinta-2">
                matrícula <Matricula valor={leitor.matricula} /> ·{' '}
                {/* A contagem é o tamanho da lista que a trilha imprime ao
                    lado — não um número vindo de outra consulta. */}
                {leitor.emMaos.length} de {leitor.limiteDaSerie}{' '}
                {leitor.limiteDaSerie === 1 ? 'livro' : 'livros'} em mãos · prazo da série:{' '}
                {leitor.prazoDaSerieEmDias}{' '}
                {leitor.prazoDaSerieEmDias === 1 ? 'dia' : 'dias'}
              </div>
            </div>
            <div className="grow" />
            <VagasDoLeitor emMaos={leitor.emMaos.length} limite={leitor.limiteDaSerie} />
          </CabecalhoDeCartao>

          {/* Os bloqueios aparecem ANTES do campo do livro. Achar o livro e
              só então descobrir a suspensão é trabalho desfeito na frente
              do aluno (spec §5.1). */}
          {bloqueios.length > 0 && (
            <div className="mt-4 flex flex-col gap-[10px] px-[22px]">
              {bloqueios.map((bloqueio) => (
                <Faixa
                  key={bloqueio.tipo}
                  tom={TOM_DO_BLOQUEIO[bloqueio.tipo]}
                  icone={ICONE_DO_BLOQUEIO[bloqueio.tipo]}
                >
                  {bloqueio.mensagem}
                </Faixa>
              ))}
            </div>
          )}

          <form onSubmit={confirmar} className="px-[22px] pt-[18px] pb-[22px]">
            <div className="flex flex-wrap items-end gap-[14px]">
              <div className="w-[280px]">
                <CampoComRotulo
                  id="balcao-tombo"
                  rotulo="2 · Tombo do livro"
                  variante="bipagem"
                  placeholder="bipe a etiqueta"
                  ref={campoDeTombo}
                  value={tombo}
                  onChange={(evento) => setTombo(evento.target.value)}
                />
              </div>
              <ExemplarNaMao conferido={conferido} recusa={semConferencia} />
            </div>

            {conferido !== null && conferido.proximoDaFila !== null && (
              <div className="mt-[14px]">
                <FilaDoExemplar
                  fila={conferido.proximoDaFila}
                  tombo={conferido.tombo}
                  titulo={conferido.titulo}
                />
              </div>
            )}

            {/* O campo só existe quando há bloqueio a liberar: pedir
                justificativa em todo empréstimo ensina a operadora a
                escrever qualquer coisa, e aí a auditoria não vale nada. */}
            {precisaJustificar && (
              <div className="mt-[18px]">
                <CampoComRotulo
                  id="balcao-justificativa"
                  rotulo="3 · Justificativa para liberar sobre o bloqueio"
                  dica="Obrigatória para emprestar sobre um bloqueio. Fica registrada na auditoria com seu nome e a hora."
                  value={justificativa}
                  onChange={(evento) => setJustificativa(evento.target.value)}
                />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-[10px]">
              <Botao
                type="submit"
                tamanho="grande"
                icone="check"
                disabled={ocupado || bipado.length === 0}
              >
                Confirmar empréstimo
              </Botao>
              <Botao type="button" variante="secundaria" tamanho="grande" onClick={cancelar}>
                Cancelar
              </Botao>
              <div className="grow" />
              {/* A data que a operadora lê em voz alta ANTES de confirmar.
                  Sai do mesmo cálculo que o empréstimo grava — calendário
                  de dias não letivos incluído. */}
              <p className="text-[13px] text-tinta-2">
                devolução prevista:{' '}
                <strong className="font-mono text-sm text-tinta">
                  {leitor.devolucaoPrevistaSeEmprestarHoje}
                </strong>
              </p>
            </div>
          </form>
        </Cartao>
      )}

      {/* A mensagem fica no fim da coluna, que é logo abaixo do botão que
          acabou de ser apertado nos dois casos: sem leitor na tela, embaixo
          do "Buscar"; com leitor, embaixo do "Confirmar empréstimo". */}
      {erro && <Faixa tom="erro">{erro}</Faixa>}

      {emprestado && (
        // O tombo sai por `children` e não por `titulo`: `titulo` é
        // string, e o tombo tem de sair em mono para a operadora conferir
        // contra a etiqueta que ela ainda tem na mão.
        <Faixa tom="sucesso">
          <strong>
            Tombo <Tombo valor={emprestado.tombo} /> emprestado a {emprestado.leitor}
            {emprestado.turma === null ? '' : ` (${emprestado.turma})`}.
          </strong>{' '}
          Devolver até <strong className="font-mono">{emprestado.previstaPara}</strong>.
          {emprestado.forcado && ' Liberação registrada na auditoria.'}
        </Faixa>
      )}
    </div>
  )
}

interface EmprestimoFeito {
  tombo: string
  leitor: string
  turma: string | null
  previstaPara: string
  forcado: boolean
}

/**
 * "atendidos hoje · 31" — o contador do dia, ao lado da linha de bipagem.
 *
 * Sem painel, sem número: um zero desenhado enquanto a consulta ainda
 * está no ar diria que o balcão não atendeu ninguém hoje.
 */
function ContadorDoDia({
  rotulo,
  quantos,
}: {
  rotulo: string
  quantos: number | null
}): ReactElement | null {
  if (quantos === null) return null

  return (
    <div className="pb-[6px] text-right">
      <Rotulo tom="discreto">{rotulo}</Rotulo>
      <div className="font-serif text-[22px] font-bold text-tinta">{quantos}</div>
    </div>
  )
}

/**
 * O livro que o tombo bipado É, ao lado do campo.
 *
 * O tombo sozinho não confirma nada: bipar o exemplar errado só se
 * descobre na devolução, quando o livro certo já está com outra pessoa.
 * Título, autoria e estante ao lado do número são o que a operadora
 * confere contra a capa que tem na mão.
 */
function ExemplarNaMao({
  conferido,
  recusa,
}: {
  conferido: ExemplarConferido | null
  recusa: string | null
}): ReactElement | null {
  if (conferido === null) {
    if (recusa === null) return null
    // Discreto de propósito: tombo incompleto é o estado normal de quem
    // está digitando, e alarme aqui treina a operadora a ignorar alarmes.
    return (
      <p className="min-w-0 grow pb-2 text-[12.5px] text-tinta-3">{recusa}</p>
    )
  }

  const onde = textoDaLocalizacao(conferido.localizacao)

  return (
    <div className="min-w-0 grow pb-2">
      <div className="font-serif text-base font-semibold text-tinta">{conferido.titulo}</div>
      <div className="text-[13px] text-tinta-2">
        {conferido.autores.length === 0 ? 'sem autoria catalogada' : conferido.autores.join(' · ')}
        {onde !== null && ` · ${onde}`}
      </div>
      <div className="mt-[6px]">
        <ChipDeSituacao situacao={conferido.situacao} />
      </div>
    </div>
  )
}

/**
 * Quem espera por este exemplar.
 *
 * Aviso, não bloqueio: quem recusa é o serviço. O que a tela não pode
 * fazer é deixar a operadora entregar a quem chegou primeiro um exemplar
 * que estava guardado para quem esperou na fila — e é por isso que os
 * dois casos dizem coisas diferentes.
 *
 * A fita não entra aqui: "SEPARE ESTE EXEMPLAR", na devolução, é a única
 * faixa com barra à esquerda e título em serifa, e repetir a forma em
 * outro aviso apagaria justamente a que não pode passar batido.
 */
function FilaDoExemplar({
  fila,
  tombo,
  titulo,
}: {
  fila: NonNullable<ExemplarConferido['proximoDaFila']>
  tombo: string
  titulo: string
}): ReactElement {
  const quem = `${fila.nome}${fila.turma === null ? '' : ` (${fila.turma})`}`

  if (fila.jaSeparadoParaEle) {
    return (
      <Faixa
        tom="atencao"
        icone="fita"
        titulo={`Este exemplar está separado para ${quem}.`}
      >
        O tombo <Tombo valor={tombo} /> saiu da estante para a reserva dele, que é o{' '}
        {fila.posicao}º da fila. Se não é ele no balcão, pegue outro exemplar de “{titulo}”.
      </Faixa>
    )
  }

  return (
    <Faixa tom="atencao" icone="info" titulo={`${quem} está na fila desta obra.`}>
      Ele é o {fila.posicao}º da fila de “{titulo}”, e este exemplar{' '}
      <strong>não está separado para ele</strong> — emprestar o tombo{' '}
      <Tombo valor={tombo} /> a quem está no balcão não tira a vez de ninguém.
    </Faixa>
  )
}

/**
 * As vagas do leitor, em blocos — o desenho da prancha.
 *
 * Só desenha quando o número de blocos DIZ a verdade: acima do limite
 * (empréstimo liberado com justificativa) e com limite alto demais para
 * caber na linha, a contagem escrita ao lado continua e os blocos saem.
 * `aria-hidden` porque é a mesma informação da frase, em outra forma.
 */
function VagasDoLeitor({ emMaos, limite }: { emMaos: number; limite: number }) {
  const CABE_NA_LINHA = 8
  if (limite < 1 || limite > CABE_NA_LINHA || emMaos > limite) return null

  return (
    <div className="flex shrink-0 gap-[6px]" aria-hidden="true">
      {Array.from({ length: limite }, (_, posicao) => (
        <span
          key={posicao}
          className={`h-[26px] w-[11px] rounded-[2px] ${
            posicao < emMaos ? 'bg-marca' : 'border border-dashed border-linha-2 bg-superficie'
          }`}
        />
      ))}
    </div>
  )
}

const TOM_DO_BLOQUEIO: Record<TipoDeBloqueio, TomDeFaixa> = {
  // Inativo e suspenso são "não": vermelho e role=alert.
  INATIVO: 'erro',
  SUSPENSO: 'erro',
  // Limite e atraso são "não, a menos que a coordenação libere".
  NO_LIMITE: 'atencao',
  COM_ATRASO: 'atencao',
}

const ICONE_DO_BLOQUEIO: Record<TipoDeBloqueio, NomeDeIcone> = {
  INATIVO: 'xis',
  SUSPENSO: 'aviso',
  NO_LIMITE: 'info',
  COM_ATRASO: 'relogio',
}

/**
 * Os bloqueios da busca mais os que vieram na recusa, um por tipo.
 *
 * A recusa vence a busca no mesmo tipo: ela é a leitura mais recente do
 * estado do leitor.
 */
function unirBloqueios(daBusca: Bloqueio[], daRecusa: Bloqueio[] | null): Bloqueio[] {
  if (daRecusa === null) return daBusca

  const porTipo = new Map<TipoDeBloqueio, Bloqueio>()
  for (const bloqueio of daBusca) porTipo.set(bloqueio.tipo, bloqueio)
  for (const bloqueio of daRecusa) porTipo.set(bloqueio.tipo, bloqueio)
  return [...porTipo.values()]
}

/**
 * As iniciais do leitor para o círculo da ficha.
 *
 * Primeiro e último nome, que é como a escola chama o aluno em voz alta.
 * Sem nome nenhum não há inicial que se invente — o círculo sai vazio, e
 * o nome escrito ao lado continua sendo a identificação.
 */
function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((parte) => parte.length > 0)
  const primeira = partes.at(0)
  if (primeira === undefined) return ''

  const ultima = partes.at(-1)
  const segunda = partes.length > 1 && ultima !== undefined ? ultima.charAt(0) : ''
  return (primeira.charAt(0) + segunda).toUpperCase()
}
