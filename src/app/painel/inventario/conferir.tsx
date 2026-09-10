'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Botao } from '@/components/ui/botao'
import { classesDeCampo, CampoComRotulo } from '@/components/ui/campo'
import { Cartao, CabecalhoDeCartao } from '@/components/ui/cartao'
import { Tombo } from '@/components/ui/codigo'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { ChipDaConferencia } from './chip-da-conferencia'
import {
  fraseDaSituacaoNaAbertura,
  fraseDeExemplares,
  fraseDeForaDoEscopo,
  progressoDaConferencia,
  registrarBipagem,
  type ProgressoDaConferencia,
  type ResultadoDaBipagem,
  type SituacaoNaConferencia,
  type TomboBipado,
} from './conferencia'
import {
  abrirConferenciaAction,
  conferirTomboAction,
  fecharConferenciaAction,
  type ConferenciaAberta,
  type LinhaDoRelatorio,
  type RelatorioNaTela,
} from './actions'

/**
 * A conferência de acervo, do jeito que ela acontece de verdade.
 *
 * Alguém percorre a estante de pé, com o leitor de código de barras numa
 * mão e o livro na outra, e bipa tombo por tombo. A tela serve a isso ou
 * não serve a nada: campo de bipagem de 52px em mono, o cursor voltando
 * sozinho para ele depois de cada leitura, e a lista do que já passou
 * sempre visível — é essa lista que responde "onde eu parei?" quando o
 * telefone toca no meio da prateleira.
 *
 * A conferência dura DIAS. Por isso a tela retoma a sessão que já estava
 * aberta em vez de recusar, e por isso o relatório do fim é a última
 * coisa que aparece, não a primeira.
 */

export interface EscopoNaTela {
  id: string
  /** O caminho físico legível, como `descreverLocalizacao` o escreve. */
  caminho: string
}

/** O escopo "acervo inteiro" é a ausência de estante — nunca um id vazio. */
const ACERVO_INTEIRO = ''

interface UltimaLeitura {
  tombo: string
  resultado: ResultadoDaBipagem
  vezes: number
}

export function Conferir({ localizacoes }: { localizacoes: EscopoNaTela[] }) {
  const [escopo, setEscopo] = useState(ACERVO_INTEIRO)
  const [conferencia, setConferencia] = useState<ConferenciaAberta | null>(null)
  const [bipados, setBipados] = useState<TomboBipado[]>([])
  const [tombo, setTombo] = useState('')
  const [ultima, setUltima] = useState<UltimaLeitura | null>(null)
  const [relatorio, setRelatorio] = useState<RelatorioNaTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmandoFecho, setConfirmandoFecho] = useState(false)

  const campoDeTombo = useRef<HTMLInputElement>(null)

  /**
   * A lista de bipados como ela está AGORA, para a leitura seguinte.
   *
   * O leitor USB despeja dígitos e um Enter mais rápido do que a ação do
   * servidor responde, então duas leituras podem estar em vôo ao mesmo
   * tempo. Lendo a lista do estado, a segunda partiria da lista de antes
   * da primeira e apagaria um livro que a operadora bipou — o defeito
   * mais grave possível numa conferência, porque produz uma perda que
   * não existe.
   */
  const listaDeAgora = useRef<TomboBipado[]>([])

  const aplicar = useCallback((lista: TomboBipado[]) => {
    listaDeAgora.current = lista
    setBipados(lista)
  }, [])

  // O cursor volta ao campo de tombo assim que a sessão abre — é o mesmo
  // requisito que torna plausível catalogar um acervo inteiro (spec §5.5)
  // e é o que permite conferir uma estante sem tocar no mouse.
  useEffect(() => {
    if (conferencia !== null) campoDeTombo.current?.focus()
  }, [conferencia])

  async function abrir(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setOcupado(true)

    try {
      const resposta = await abrirConferenciaAction(escopo)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setRelatorio(null)
      setUltima(null)
      setConfirmandoFecho(false)
      // Retomando, a lista já vem com o que foi conferido antes: mostrar
      // zero numa estante meio conferida faria a pessoa recomeçar do
      // primeiro livro.
      aplicar(resposta.conferencia.jaConferidos)
      setConferencia(resposta.conferencia)
    } finally {
      setOcupado(false)
    }
  }

  async function bipar(evento: React.FormEvent) {
    evento.preventDefault()
    if (conferencia === null) return

    const lido = tombo.trim()
    if (lido.length === 0) return

    setErro(null)
    setOcupado(true)

    try {
      const resposta = await conferirTomboAction(conferencia.inventarioId, lido)

      if (!resposta.ok) {
        setErro(resposta.erro)
        setUltima(null)
        // A sessão foi encerrada em outra máquina (ou não existe mais).
        // Seguir aceitando leituras empilharia bipagens que não estão
        // sendo gravadas em lugar nenhum.
        if (resposta.codigo === 'INVENTARIO_FECHADO' || resposta.codigo === 'INVENTARIO_INEXISTENTE') {
          setConferencia(null)
          aplicar([])
        }
        return
      }

      const registro = registrarBipagem(listaDeAgora.current, {
        tombo: resposta.tombo,
        foraDoLugar: resposta.foraDoLugar,
      })
      aplicar(registro.bipados)

      const linha = registro.bipados.find((b) => b.tombo === resposta.tombo)
      setUltima(
        linha === undefined
          ? null
          : { tombo: linha.tombo, resultado: registro.resultado, vezes: linha.vezes },
      )
    } finally {
      // O campo esvazia e o cursor volta SEMPRE, inclusive depois de um
      // tombo recusado: a operadora já está com o livro seguinte na mão.
      setTombo('')
      setOcupado(false)
      campoDeTombo.current?.focus()
    }
  }

  async function encerrar() {
    if (conferencia === null) return
    setErro(null)
    setOcupado(true)

    try {
      const resposta = await fecharConferenciaAction(conferencia.inventarioId)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setRelatorio(resposta.relatorio)
      setConferencia(null)
      setUltima(null)
      setConfirmandoFecho(false)
      aplicar([])
    } finally {
      setOcupado(false)
    }
  }

  function recomecar() {
    setRelatorio(null)
    setErro(null)
    setUltima(null)
    setEscopo(ACERVO_INTEIRO)
    aplicar([])
  }

  const progresso =
    conferencia === null ? null : progressoDaConferencia(bipados, conferencia.tombosEsperados)

  return (
    <div className="mt-[18px] flex flex-col gap-4 xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {conferencia === null ? (
          <EscolhaDoEscopo
            localizacoes={localizacoes}
            escopo={escopo}
            onEscopo={setEscopo}
            ocupado={ocupado}
            mostrando={relatorio !== null}
            onAbrir={abrir}
          />
        ) : (
          <Cartao semPadding>
            <CabecalhoDeCartao>
              <span className="shrink-0 text-tinta-3">
                <Icone nome="codigo-de-barras" tamanho={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[17px] font-semibold text-tinta">
                  {nomeDoEscopo(localizacoes, conferencia.localizacaoId)}
                </div>
                <div className="text-[12.5px] text-tinta-2">
                  aberta por {conferencia.responsavelNome}
                </div>
              </div>
              {progresso !== null && <Contador progresso={progresso} />}
            </CabecalhoDeCartao>

            <div className="px-[22px] py-5">
              <form onSubmit={bipar} className="flex flex-wrap items-end gap-[14px]">
                <div className="w-[300px]">
                  <CampoComRotulo
                    ref={campoDeTombo}
                    id="tombo-bipado"
                    rotulo="Tombo"
                    variante="bipagem"
                    name="tombo"
                    value={tombo}
                    onChange={(evento) => setTombo(evento.target.value)}
                    // O leitor USB se comporta como teclado e termina com
                    // Enter, então o submit do formulário já é o "bipar"
                    // (spec §7) — sem tocar no mouse entre dois livros.
                    inputMode="numeric"
                  />
                </div>
                <Botao
                  type="submit"
                  variante="secundaria"
                  disabled={ocupado || tombo.trim().length === 0}
                  // A altura do campo de bipagem, para os dois formarem
                  // uma linha só; `!` porque a classe do tamanho do botão
                  // também declara altura.
                  className="h-[52px]!"
                >
                  Conferir
                </Botao>

                {ultima !== null && (
                  <div className="flex items-center gap-[10px] pb-[6px]">
                    <Rotulo tom="discreto">última leitura</Rotulo>
                    <Tombo valor={ultima.tombo} tamanho="destaque" />
                    <ChipDaConferencia
                      situacao={ultima.resultado}
                      complemento={ultima.vezes > 1 ? `· ${ultima.vezes} leituras` : undefined}
                    />
                  </div>
                )}
              </form>

              {conferencia.retomada && (
                // `status` e não `alert`: retomar é o caminho normal de
                // uma conferência que dura dias, não uma recusa.
                <div
                  role="status"
                  className="mt-4 flex gap-[10px] rounded-controle border border-linha-2 bg-papel-2 px-[15px] py-[13px] text-[13.5px] text-tinta-2"
                >
                  <span className="mt-px shrink-0 text-tinta-3">
                    <Icone nome="info" tamanho={18} traco={1.8} />
                  </span>
                  <div>
                    <strong className="text-tinta">Esta conferência já estava aberta.</strong>{' '}
                    {conferencia.jaConferidos.length === 0
                      ? 'Nada havia sido conferido nela ainda — continue de onde a estante começa.'
                      : `${fraseDeExemplares(
                          conferencia.jaConferidos.length,
                        )} já estavam conferidos e continuam na lista ao lado.`}
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-[10px] border-t border-linha pt-5">
                {confirmandoFecho ? (
                  <>
                    <Botao type="button" variante="perigo" onClick={encerrar} disabled={ocupado}>
                      Encerrar agora
                    </Botao>
                    <Botao
                      type="button"
                      variante="fantasma"
                      onClick={() => {
                        setConfirmandoFecho(false)
                        campoDeTombo.current?.focus()
                      }}
                    >
                      Continuar bipando
                    </Botao>
                    <p className="max-w-[420px] text-[12.5px] text-alerta-texto">
                      O relatório aparece UMA vez. Depois de encerrar, esta sessão não abre de
                      novo — o que faltar bipar entra como não encontrado.
                    </p>
                  </>
                ) : (
                  <>
                    <Botao
                      type="button"
                      variante="secundaria"
                      onClick={() => setConfirmandoFecho(true)}
                      disabled={ocupado}
                    >
                      Encerrar e ver o relatório
                    </Botao>
                    <p className="text-[12.5px] text-tinta-2">
                      Pode fechar esta tela e voltar amanhã: a conferência continua aberta.
                    </p>
                  </>
                )}
              </div>
            </div>
          </Cartao>
        )}

        {erro !== null && <Faixa tom="erro" titulo={erro} />}

        {/* O fora do lugar é a única leitura que pede uma ação IMEDIATA:
            o livro está na mão da operadora e mora em outra estante. */}
        {ultima?.resultado === 'FORA_DO_LUGAR' && erro === null && (
          <Faixa tom="atencao" icone="troca" titulo="Este exemplar mora em outra estante.">
            Separe-o agora, com a etiqueta para cima — ele entra na lista de fora do lugar do
            relatório, e é lá que a devolução ao lugar certo vai ser conferida.
          </Faixa>
        )}

        {relatorio !== null && <Relatorio relatorio={relatorio} onRecomecar={recomecar} />}
      </div>

      <aside className="flex w-full flex-col gap-4 xl:w-[336px] xl:shrink-0">
        <ListaDeBipados bipados={bipados} progresso={progresso} />
      </aside>
    </div>
  )
}

function EscolhaDoEscopo({
  localizacoes,
  escopo,
  onEscopo,
  ocupado,
  mostrando,
  onAbrir,
}: {
  localizacoes: EscopoNaTela[]
  escopo: string
  onEscopo: (valor: string) => void
  ocupado: boolean
  /** Já há um relatório na tela: o cartão vira o começo da PRÓXIMA estante. */
  mostrando: boolean
  onAbrir: (evento: React.FormEvent) => void
}) {
  return (
    <Cartao semPadding>
      <form onSubmit={onAbrir} className="px-[22px] py-5">
        <h2 className="font-serif text-[17px] font-semibold text-tinta">
          {mostrando ? 'Conferir outra estante' : 'Escolha o que vai ser conferido'}
        </h2>
        <p className="mt-[3px] mb-4 text-[13px] text-tinta-2">
          Uma estante por vez é o que permite terminar: a conferência congela a foto do acervo na
          abertura e fica aberta pelos dias que a estante levar.
        </p>

        <div className="flex flex-wrap items-end gap-[14px]">
          <div className="flex min-w-[280px] flex-1 flex-col gap-[7px]">
            <label htmlFor="escopo-da-conferencia">
              <Rotulo>Localização</Rotulo>
            </label>
            <select
              id="escopo-da-conferencia"
              name="escopo"
              value={escopo}
              onChange={(evento) => onEscopo(evento.target.value)}
              className={classesDeCampo()}
            >
              <option value={ACERVO_INTEIRO}>Todo o acervo</option>
              {localizacoes.map((localizacao) => (
                <option key={localizacao.id} value={localizacao.id}>
                  {localizacao.caminho}
                </option>
              ))}
            </select>
          </div>

          <Botao type="submit" icone="codigo-de-barras" tamanho="grande" disabled={ocupado}>
            Começar a conferir
          </Botao>
        </div>

        {localizacoes.length === 0 && (
          <p className="mt-[10px] text-[12.5px] text-tinta-2">
            Nenhuma localização cadastrada ainda — por isso a única opção é o acervo inteiro. Com
            as estantes cadastradas, a conferência passa a ser por estante.
          </p>
        )}
      </form>
    </Cartao>
  )
}

/** "12 de 87" — o número que diz onde a pessoa parou. */
function Contador({ progresso }: { progresso: ProgressoDaConferencia }) {
  const foraDoEscopo = fraseDeForaDoEscopo(progresso.foraDoEscopo)

  return (
    <div className="shrink-0 pb-[2px] text-right">
      <Rotulo tom="discreto">conferidos</Rotulo>
      <div className="font-serif text-[34px] leading-none font-bold tracking-[-0.03em] text-tinta">
        {progresso.conferidos}
        <span className="text-[19px] font-semibold text-tinta-3"> de {progresso.esperados}</span>
      </div>
      <div className="mt-[3px] text-[12px] text-tinta-2">
        faltam {progresso.faltam}
        {foraDoEscopo !== null && <span className="text-tinta-3"> · {foraDoEscopo}</span>}
      </div>
    </div>
  )
}

/**
 * O que já foi bipado, com o mais recente no alto.
 *
 * Fica na tela do começo ao fim porque é ela que responde "onde eu
 * parei?" — e é a lista que a operadora confere quando desconfia de ter
 * bipado o mesmo livro duas vezes. A lista É o contador: um número
 * guardado à parte teria como divergir do que está desenhado ao lado.
 */
function ListaDeBipados({
  bipados,
  progresso,
}: {
  bipados: TomboBipado[]
  progresso: ProgressoDaConferencia | null
}) {
  return (
    <Cartao semPadding>
      <div className="flex items-baseline justify-between px-5 pt-[18px]">
        <h2 className="font-sans text-[15px] font-semibold text-tinta">Bipados nesta estante</h2>
        <span className="text-[12.5px] text-tinta-3">{bipados.length}</span>
      </div>

      {bipados.length === 0 ? (
        <p className="px-5 pt-2 pb-[18px] text-[12.5px] text-tinta-2">
          {progresso === null
            ? 'Escolha a estante ao lado para começar. Cada tombo bipado aparece aqui.'
            : 'Bipe o primeiro tombo da estante. Cada leitura aparece aqui, com a mais recente no alto.'}
        </p>
      ) : (
        <ul className="px-5 pt-1 pb-[18px]">
          {bipados.map((bipado) => (
            <li
              key={bipado.tombo}
              className="flex items-center justify-between gap-[10px] border-b border-linha py-[9px] last:border-b-0"
            >
              <Tombo valor={bipado.tombo} />
              <span className="flex shrink-0 items-center gap-[6px]">
                {bipado.vezes > 1 && (
                  <span className="text-[11.5px] text-tinta-3">{bipado.vezes} leituras</span>
                )}
                <ChipDaConferencia situacao={bipado.foraDoLugar ? 'FORA_DO_LUGAR' : 'CONFERIDO'} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}

/**
 * As TRÊS listas do fechamento, cada uma dizendo o que fazer com o grupo.
 *
 * São as três do serviço (`RelatorioDeInventario`) e da spec §5.7 — não
 * existe uma quarta, e a mais importante das três é a separação entre
 * "não encontrado" e "consta emprestado": misturá-las manda a
 * coordenação caçar um livro que está legitimamente na mochila de um
 * aluno.
 */
function Relatorio({
  relatorio,
  onRecomecar,
}: {
  relatorio: RelatorioNaTela
  onRecomecar: () => void
}) {
  const grupos: {
    situacao: SituacaoNaConferencia
    titulo: string
    oQueFazer: string
    quandoVazia: string
    linhas: LinhaDoRelatorio[]
  }[] = [
    {
      situacao: 'NAO_ENCONTRADO',
      titulo: 'Não apareceram na estante',
      oQueFazer:
        'Procure na estante vizinha, no balcão e no carrinho antes de dar por perdido. ' +
        'Confirmada a falta, marque o exemplar como extraviado na ficha da obra — a ' +
        'conferência não muda a situação de ninguém, ela só relata.',
      quandoVazia: 'Nenhum exemplar deixou de aparecer. A estante fecha inteira.',
      linhas: relatorio.naoEncontrados,
    },
    {
      situacao: 'FORA_DO_LUGAR',
      titulo: 'Apareceram aqui, mas moram em outra estante',
      oQueFazer:
        'Leve cada um de volta ao lugar dele, com esta lista na mão. Eles não entram na ' +
        'conta desta estante de propósito: senão ela nunca fecharia em 100%.',
      quandoVazia: 'Nada apareceu fora do lugar.',
      linhas: relatorio.foraDoLugar,
    },
    {
      situacao: 'CONSTA_EMPRESTADO',
      titulo: 'Ausentes porque estão com um leitor',
      oQueFazer:
        'Não é perda e não há o que procurar na estante: na abertura da conferência, o ' +
        'sistema já registrava estes exemplares emprestados. Atraso se cobra no balcão.',
      quandoVazia: 'Nenhum exemplar desta estante estava emprestado na abertura.',
      linhas: relatorio.constamEmprestados,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Cartao semPadding>
        <div className="flex flex-wrap items-end justify-between gap-4 px-[22px] py-5">
          <div>
            <h2 className="font-serif text-[19px] font-semibold text-tinta">
              Relatório da conferência
            </h2>
            <p className="mt-[3px] text-[13px] text-tinta-2">
              A sessão foi encerrada. Anote ou imprima esta página antes de sair: o relatório é
              gerado no fechamento e não se abre de novo.
            </p>
          </div>
          <div className="text-right">
            <Rotulo tom="discreto">conferidos</Rotulo>
            <div className="font-serif text-[30px] leading-none font-bold tracking-[-0.03em] text-tinta">
              {relatorio.conferidos}
              <span className="text-[17px] font-semibold text-tinta-3">
                {' '}
                de {relatorio.esperados}
              </span>
            </div>
          </div>
        </div>
      </Cartao>

      {grupos.map((grupo) => (
        <Cartao key={grupo.situacao} semPadding>
          <div className="flex flex-wrap items-center gap-[10px] border-b border-linha bg-papel-2 px-[22px] py-[14px]">
            <ChipDaConferencia situacao={grupo.situacao} />
            <h3 className="font-sans text-[15px] font-semibold text-tinta">{grupo.titulo}</h3>
            <span className="ml-auto text-[12.5px] text-tinta-3">
              {fraseDeExemplares(grupo.linhas.length)}
            </span>
          </div>

          <div className="px-[22px] py-4">
            {grupo.linhas.length === 0 ? (
              <p className="text-[13px] text-tinta-2">{grupo.quandoVazia}</p>
            ) : (
              <>
                <p className="mb-3 text-[13px] text-tinta-2">{grupo.oQueFazer}</p>
                <ul>
                  {grupo.linhas.map((linha) => (
                    <li
                      key={linha.tombo}
                      className="flex flex-wrap items-baseline gap-x-[10px] border-b border-linha py-[9px] last:border-b-0"
                    >
                      <Tombo valor={linha.tombo} />
                      {/* O que o exemplar CONSTAVA ser na abertura é o que
                          explica a ausência: quem estava no carrinho ou em
                          manutenção não está na estante e não é perda. */}
                      <span className="text-[12.5px] text-tinta-3">
                        {fraseDaSituacaoNaAbertura(linha.situacaoNaAbertura)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Cartao>
      ))}

      <div>
        <Botao type="button" variante="secundaria" onClick={onRecomecar}>
          Conferir outra estante
        </Botao>
      </div>
    </div>
  )
}

/** O nome da estante como a operadora a escolheu, ou o acervo inteiro. */
function nomeDoEscopo(localizacoes: EscopoNaTela[], localizacaoId: string | null): string {
  if (localizacaoId === null) return 'Todo o acervo'

  const achada = localizacoes.find((l) => l.id === localizacaoId)
  // Sem o nome, o id não diz nada a ninguém — e a sessão retomada pode
  // ser de uma localização renomeada ou apagada depois da abertura.
  if (achada === undefined) return 'Estante desta conferência'
  return achada.caminho
}
