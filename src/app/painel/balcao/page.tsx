'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Botao } from '@/components/ui/botao'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { CabecalhoDeCartao, Cartao } from '@/components/ui/cartao'
import { CampoComRotulo, classesDeCampo } from '@/components/ui/campo'
import { Chip } from '@/components/ui/chip'
import { Matricula, Tombo } from '@/components/ui/codigo'
import { Faixa, FaixaDaFita, type TomDeFaixa } from '@/components/ui/faixa'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import {
  buscarLeitorAction,
  emprestarAction,
  devolverAction,
  type LeitorDaTela,
  type RespostaDaDevolucao,
} from './actions'
import type { Bloqueio, TipoDeBloqueio } from '@/modules/circulacao/bloqueios'
import type { EstadoDeConservacao } from '@/modules/acervo/exemplares.service'

type Aba = 'emprestar' | 'devolver'

/**
 * A linha de bipagem tem 52px — o campo de matrícula, o de tombo e o
 * botão que fecha a ação ficam alinhados por baixo.
 *
 * O kit só tem botão de 40 e de 44px, de propósito: 52 é medida desta
 * tela, não do sistema. O `!` é o que faz a altura local vencer o `h-10`
 * do primitivo — sem ele, quem ganha depende da ordem em que o Tailwind
 * emitiu as duas classes no CSS, e isso não é coisa para se descobrir no
 * balcão.
 */
const ALTURA_DA_BIPAGEM = 'h-[52px]!'

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

export default function PaginaDoBalcao() {
  const [aba, setAba] = useState<Aba>('emprestar')

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
        {/*
          A largura para de crescer: o campo de bipagem é conferido dígito
          a dígito contra a etiqueta, e uma linha de 1400px obriga a
          operadora a varrer a tela com os olhos entre o campo e o botão.
        */}
        <div className="max-w-[780px]">
          {aba === 'emprestar' ? (
            <div role="tabpanel" id="painel-emprestar" aria-labelledby="aba-emprestar">
              <Emprestar />
            </div>
          ) : (
            <div role="tabpanel" id="painel-devolver" aria-labelledby="aba-devolver">
              <Devolver />
            </div>
          )}
        </div>
      </div>
    </main>
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

function Emprestar() {
  const [matricula, setMatricula] = useState('')
  const [leitor, setLeitor] = useState<LeitorDaTela | null>(null)
  const [tombo, setTombo] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [bloqueiosDaRecusa, setBloqueiosDaRecusa] = useState<Bloqueio[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [emprestado, setEmprestado] = useState<EmprestimoFeito | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const campoDeMatricula = useRef<HTMLInputElement>(null)
  const campoDeTombo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    campoDeMatricula.current?.focus()
  }, [])

  // Depois de emprestar, volta para a matrícula: o próximo aluno da fila
  // é sempre outro. Voltar para o tombo obrigaria a operadora a tirar a
  // mão do teclado para recomeçar (spec §5.1).
  const recomecar = useCallback(() => {
    setLeitor(null)
    setMatricula('')
    setTombo('')
    setJustificativa('')
    setBloqueiosDaRecusa(null)
    campoDeMatricula.current?.focus()
  }, [])

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
      setLeitor(resposta.leitor)
      // O cursor pula direto para o tombo: a operadora já pode passar o
      // leitor de código de barras no livro sem tocar no mouse.
      setTimeout(() => campoDeTombo.current?.focus(), 0)
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!leitor) return
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
    } finally {
      setOcupado(false)
    }
  }

  // Os bloqueios da recusa entram junto com os da busca: o serviço pode
  // recusar por um bloqueio que nasceu entre a busca e a confirmação
  // (outro atendimento no mesmo minuto), e esconder isso deixaria a
  // operadora sem entender o "não".
  const bloqueios = leitor ? unirBloqueios(leitor.bloqueios, bloqueiosDaRecusa) : []
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
        <form onSubmit={buscar} className="flex items-end gap-3">
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
        </form>
      </Cartao>

      {leitor && (
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
                {leitor.turma && <span className="text-[13.5px] text-tinta-2">· {leitor.turma}</span>}
              </div>
              <div className="mt-[2px] text-[13px] text-tinta-2">
                matrícula <Matricula valor={leitor.matricula} /> ·{' '}
                {leitor.emprestimosAtivos} de {leitor.limiteDaSerie}{' '}
                {leitor.limiteDaSerie === 1 ? 'livro' : 'livros'} em mãos
              </div>
            </div>
            <div className="grow" />
            <VagasDoLeitor
              emMaos={leitor.emprestimosAtivos}
              limite={leitor.limiteDaSerie}
            />
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

            <div className="mt-5 flex items-center gap-[10px]">
              <Botao
                type="submit"
                tamanho="grande"
                icone="check"
                disabled={ocupado || tombo.trim().length === 0}
              >
                Confirmar empréstimo
              </Botao>
              <Botao type="button" variante="secundaria" tamanho="grande" onClick={cancelar}>
                Cancelar
              </Botao>
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

function Devolver() {
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
          <div className="flex items-end gap-[14px]">
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
            disso o sistema passa a vez sozinho.
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
  const partes = nome.trim().split(/\s+/).filter((parte) => parte.length > 0)
  const primeira = partes.at(0)
  if (primeira === undefined) return ''

  const ultima = partes.at(-1)
  const segunda = partes.length > 1 && ultima !== undefined ? ultima.charAt(0) : ''
  return (primeira.charAt(0) + segunda).toUpperCase()
}
