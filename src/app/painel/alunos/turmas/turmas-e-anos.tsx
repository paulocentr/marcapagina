'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Botao } from '@/components/ui/botao'
import { CampoComRotulo } from '@/components/ui/campo'
import { Cartao } from '@/components/ui/cartao'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { SERIES_VALIDAS, rotuloDaSerie } from '@/modules/leitores/serie'
import {
  criarAnoLetivoAction,
  criarTurmaAction,
  definirAnoLetivoAtivoAction,
  editarTurmaAction,
} from '../actions'

export interface AnoLetivoNaTela {
  id: string
  ano: number
  /** dd/mm/aaaa — como a escola escreve. */
  dataInicio: string
  dataFim: string
  ativo: boolean
}

export interface TurmaNaTela {
  id: string
  nome: string
  serie: string
  turno: string
  anoLetivoId: string
  ano: number
  anoLetivoAtivo: boolean
  alunos: number
}

const TURNOS_NA_TELA = [
  { valor: 'MANHA', rotulo: 'Manhã' },
  { valor: 'TARDE', rotulo: 'Tarde' },
  { valor: 'NOITE', rotulo: 'Noite' },
  { valor: 'INTEGRAL', rotulo: 'Integral' },
]

const CLASSES_DE_SELECT =
  'h-10 w-full rounded-controle border border-linha-2 bg-superficie px-3 text-sm ' +
  'text-tinta focus:border-marca focus:ring-[3px] focus:ring-marca/15 focus:outline-none'

/**
 * Turmas e ano letivo, na mesma tela.
 *
 * Juntas de propósito: turma pende de ano letivo, e a coordenação que
 * abre o ano seguinte cadastra as duas coisas na mesma sessão. Separar em
 * duas telas faria ela navegar de ida e volta doze vezes.
 *
 * ─── Por que a série é um `select` e não um campo de texto ──────────
 *
 * A série é lida pelo filtro de faixa etária do Carrinho
 * (`idadeTipicaDaSerie`) e pelo override de circulação por série, os dois
 * interpretando o texto. Um campo livre deixaria a operadora escrever
 * "5º A" ou "quinto", e os dois consumidores parariam de entender aquela
 * turma — sem erro nenhum na tela, semanas depois. O `select` só oferece
 * as doze séries que o sistema sabe ler, e o serviço valida de novo
 * porque Server Action recebe o que mandarem.
 */
export function TurmasEAnos({
  anos,
  turmas,
}: {
  anos: AnoLetivoNaTela[]
  turmas: TurmaNaTela[]
}) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <ListaDeTurmas anos={anos} turmas={turmas} />
      <AnosLetivos anos={anos} />
    </div>
  )
}

function ListaDeTurmas({
  anos,
  turmas,
}: {
  anos: AnoLetivoNaTela[]
  turmas: TurmaNaTela[]
}) {
  const router = useRouter()
  const anoAtivo = anos.find((a) => a.ativo)

  const [emEdicao, setEmEdicao] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)

  function aoTerminar(mensagem: string) {
    setErro(null)
    setFeito(mensagem)
    setCriando(false)
    setEmEdicao(null)
    router.refresh()
  }

  if (anos.length === 0) {
    return (
      <Cartao>
        <h2 className="font-serif text-[17px] font-semibold text-tinta">Turmas</h2>
        <p className="mt-2 text-[13px] text-tinta-2">
          Antes da primeira turma é preciso um ano letivo — é dele que a turma pende.
          Cadastre o ano ao lado.
        </p>
      </Cartao>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao semPadding>
        <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] pt-[18px]">
          <h2 className="font-serif text-[17px] font-semibold text-tinta">Turmas</h2>
          <Botao
            type="button"
            variante={criando ? 'secundaria' : 'primaria'}
            icone={criando ? undefined : 'mais'}
            onClick={() => {
              setCriando((atual) => !atual)
              setEmEdicao(null)
              setFeito(null)
              setErro(null)
            }}
          >
            {criando ? 'Cancelar' : 'Nova turma'}
          </Botao>
        </div>

        {criando && (
          <div className="mt-4 border-t border-linha bg-papel-2 px-[22px] py-5">
            <FormularioDeTurma
              anos={anos}
              anoPadrao={anoAtivo === undefined ? anos[0]!.id : anoAtivo.id}
              onErro={setErro}
              onPronto={(nome) => aoTerminar(`Turma ${nome} criada.`)}
            />
          </div>
        )}

        {turmas.length === 0 ? (
          <p className="px-[22px] pt-2 pb-[18px] text-[13px] text-tinta-2">
            Nenhuma turma cadastrada. A turma é o que dá série ao aluno — e é a série que
            o Carrinho da Leitura usa para não sugerir livro fora da faixa etária.
          </p>
        ) : (
          <ul className="px-[22px] pt-2 pb-[18px]">
            {turmas.map((turma) => (
              <li key={turma.id} className="border-b border-linha py-3 last:border-b-0">
                {emEdicao === turma.id ? (
                  <FormularioDeTurma
                    anos={anos}
                    anoPadrao={turma.anoLetivoId}
                    turma={turma}
                    onErro={setErro}
                    onPronto={(nome) => aoTerminar(`Turma ${nome} salva.`)}
                    onCancelar={() => setEmEdicao(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-tinta">{turma.nome}</span>
                      <span className="block text-[12.5px] text-tinta-2">
                        {rotuloDaSerie(turma.serie)} ·{' '}
                        {TURNOS_NA_TELA.find((t) => t.valor === turma.turno)?.rotulo ??
                          turma.turno}{' '}
                        · {turma.ano}
                        {!turma.anoLetivoAtivo && (
                          <span className="text-tinta-3"> · ano encerrado</span>
                        )}
                      </span>
                    </span>
                    {/* Contado, nunca digitado — e só os ativos. */}
                    <span className="text-[12.5px] text-tinta-2">
                      {turma.alunos === 1 ? '1 aluno' : `${turma.alunos} alunos`}
                    </span>
                    <Botao
                      type="button"
                      variante="secundaria"
                      onClick={() => {
                        setEmEdicao(turma.id)
                        setCriando(false)
                        setFeito(null)
                        setErro(null)
                      }}
                    >
                      Editar
                    </Botao>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {erro !== null ? (
        <Faixa tom="erro" titulo={erro} />
      ) : (
        feito !== null && <Faixa tom="sucesso" titulo={feito} />
      )}
    </div>
  )
}

function FormularioDeTurma({
  anos,
  anoPadrao,
  turma,
  onErro,
  onPronto,
  onCancelar,
}: {
  anos: AnoLetivoNaTela[]
  anoPadrao: string
  turma?: TurmaNaTela
  onErro: (erro: string) => void
  onPronto: (nome: string) => void
  onCancelar?: () => void
}) {
  const [nome, setNome] = useState(turma === undefined ? '' : turma.nome)
  const [serie, setSerie] = useState(turma === undefined ? '1' : turma.serie)
  const [turno, setTurno] = useState(turma === undefined ? 'MANHA' : turma.turno)
  const [anoLetivoId, setAnoLetivoId] = useState(anoPadrao)
  const [ocupado, setOcupado] = useState(false)

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    setOcupado(true)

    try {
      const entrada = { nome, serie, turno, anoLetivoId }
      const resposta =
        turma === undefined
          ? await criarTurmaAction(entrada)
          : await editarTurmaAction(turma.id, entrada)

      if (!resposta.ok) {
        onErro(resposta.erro)
        return
      }
      onPronto(nome)
    } finally {
      setOcupado(false)
    }
  }

  // A série da turma em edição pode estar num formato antigo, fora das
  // doze que o sistema lê. Ela entra na lista para o `select` não trocá-la
  // em silêncio por "1" só porque a operadora abriu o formulário para
  // mudar o turno.
  const series = SERIES_VALIDAS.includes(serie) ? SERIES_VALIDAS : [serie, ...SERIES_VALIDAS]

  return (
    <form onSubmit={salvar} className="flex flex-wrap items-end gap-[14px]">
      <div className="w-[150px]">
        <CampoComRotulo
          id={`turma-nome-${turma === undefined ? 'nova' : turma.id}`}
          rotulo="Nome"
          dica='como "5º A"'
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          required
        />
      </div>

      <div className="w-[190px]">
        <label
          htmlFor={`turma-serie-${turma === undefined ? 'nova' : turma.id}`}
          className="mb-[7px] block"
        >
          <Rotulo>Série</Rotulo>
        </label>
        <select
          id={`turma-serie-${turma === undefined ? 'nova' : turma.id}`}
          value={serie}
          onChange={(evento) => setSerie(evento.target.value)}
          className={CLASSES_DE_SELECT}
        >
          {series.map((valor) => (
            <option key={valor} value={valor}>
              {rotuloDaSerie(valor)}
            </option>
          ))}
        </select>
      </div>

      <div className="w-[130px]">
        <label
          htmlFor={`turma-turno-${turma === undefined ? 'nova' : turma.id}`}
          className="mb-[7px] block"
        >
          <Rotulo>Turno</Rotulo>
        </label>
        <select
          id={`turma-turno-${turma === undefined ? 'nova' : turma.id}`}
          value={turno}
          onChange={(evento) => setTurno(evento.target.value)}
          className={CLASSES_DE_SELECT}
        >
          {TURNOS_NA_TELA.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div className="w-[120px]">
        <label
          htmlFor={`turma-ano-${turma === undefined ? 'nova' : turma.id}`}
          className="mb-[7px] block"
        >
          <Rotulo>Ano letivo</Rotulo>
        </label>
        <select
          id={`turma-ano-${turma === undefined ? 'nova' : turma.id}`}
          value={anoLetivoId}
          onChange={(evento) => setAnoLetivoId(evento.target.value)}
          className={CLASSES_DE_SELECT}
        >
          {anos.map((ano) => (
            <option key={ano.id} value={ano.id}>
              {ano.ano}
            </option>
          ))}
        </select>
      </div>

      <Botao type="submit" disabled={ocupado}>
        {turma === undefined ? 'Criar turma' : 'Salvar'}
      </Botao>
      {onCancelar && (
        <Botao type="button" variante="secundaria" onClick={onCancelar} disabled={ocupado}>
          Cancelar
        </Botao>
      )}
    </form>
  )
}

function AnosLetivos({ anos }: { anos: AnoLetivoNaTela[] }) {
  const router = useRouter()
  const [criando, setCriando] = useState(false)
  const [ano, setAno] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function criar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setFeito(null)
    setOcupado(true)

    try {
      const resposta = await criarAnoLetivoAction({
        ano,
        dataInicio,
        dataFim,
        // Nunca ativo na criação: abrir o ano que vem em outubro não pode
        // trocar o ano corrente debaixo do balcão. A troca é um clique
        // separado e explícito, embaixo.
        ativo: false,
      })

      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setFeito(`Ano letivo de ${ano} criado. Marque-o como ativo quando ele começar.`)
      setCriando(false)
      setAno('')
      setDataInicio('')
      setDataFim('')
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function ativar(anoLetivoId: string, numero: number) {
    setErro(null)
    setFeito(null)
    setOcupado(true)

    try {
      const resposta = await definirAnoLetivoAtivoAction(anoLetivoId)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      setFeito(`${numero} é o ano letivo corrente.`)
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao semPadding>
        <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] pt-[18px]">
          <h2 className="font-serif text-[17px] font-semibold text-tinta">Ano letivo</h2>
          <Botao
            type="button"
            variante="secundaria"
            onClick={() => {
              setCriando((atual) => !atual)
              setErro(null)
              setFeito(null)
            }}
          >
            {criando ? 'Cancelar' : 'Novo ano'}
          </Botao>
        </div>

        {criando && (
          <form onSubmit={criar} className="mt-4 border-t border-linha bg-papel-2 px-[22px] py-5">
            <div className="flex flex-col gap-[14px]">
              <CampoComRotulo
                id="ano-letivo-numero"
                rotulo="Ano"
                dica="quatro dígitos, como 2027"
                value={ano}
                onChange={(evento) => setAno(evento.target.value)}
                inputMode="numeric"
                className="font-mono"
                required
              />
              <CampoComRotulo
                id="ano-letivo-inicio"
                rotulo="Começa em"
                type="date"
                value={dataInicio}
                onChange={(evento) => setDataInicio(evento.target.value)}
                required
              />
              <CampoComRotulo
                id="ano-letivo-fim"
                rotulo="Termina em"
                type="date"
                value={dataFim}
                onChange={(evento) => setDataFim(evento.target.value)}
                required
              />
              <Botao type="submit" disabled={ocupado} className="self-start">
                Criar ano letivo
              </Botao>
            </div>
          </form>
        )}

        {anos.length === 0 ? (
          <p className="px-[22px] pt-2 pb-[18px] text-[13px] text-tinta-2">
            Nenhum ano letivo cadastrado. É dele que as turmas pendem — sem um, não há
            onde criar turma.
          </p>
        ) : (
          <ul className="px-[22px] pt-2 pb-[18px]">
            {anos.map((registro) => (
              <li
                key={registro.id}
                className="flex flex-wrap items-center gap-3 border-b border-linha py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[15px] font-semibold text-tinta">
                    {registro.ano}
                  </span>
                  <span className="block text-[12px] text-tinta-2">
                    {registro.dataInicio} a {registro.dataFim}
                  </span>
                </span>

                {registro.ativo ? (
                  /* Ícone E palavra, nunca só a cor. */
                  <span className="inline-flex h-[23px] shrink-0 items-center gap-[5px] rounded-full bg-certo-suave px-[9px] text-[11.5px] leading-none font-semibold text-certo">
                    <Icone nome="check" tamanho={11} traco={2.4} />
                    <span>Ano corrente</span>
                  </span>
                ) : (
                  <Botao
                    type="button"
                    variante="secundaria"
                    onClick={() => ativar(registro.id, registro.ano)}
                    disabled={ocupado}
                  >
                    Tornar corrente
                  </Botao>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {erro !== null ? (
        <Faixa tom="erro" titulo={erro} />
      ) : (
        feito !== null && <Faixa tom="sucesso" titulo={feito} />
      )}
    </div>
  )
}
