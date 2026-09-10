'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Botao } from '@/components/ui/botao'
import { Cartao } from '@/components/ui/cartao'
import { CampoComRotulo, classesDeCampo } from '@/components/ui/campo'
import { Matricula, Tombo } from '@/components/ui/codigo'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import { ChipDoLote } from './chip-do-lote'
import {
  buscarAlunoAction,
  registrarLoteAction,
  type AlunoNaTela,
  type RodadaNaTela,
} from './actions'
import {
  montarResumoDoLote,
  type ItemMontado,
  type ResumoDoLote,
} from './resumo-do-lote'

/** 52px é a linha de bipagem, a mesma medida do balcão. */
const ALTURA_DA_BIPAGEM = 'h-[52px]!'

/**
 * Passo 2 — na volta do carrinho, empréstimo em LOTE.
 *
 * Uma tela para trinta alunos, não trinta telas. A operadora bipa
 * matrícula e tombo em sequência, a fila cresce na tela, e um único envio
 * grava tudo.
 *
 * A garantia que dá sentido ao recurso é que **um aluno bloqueado não
 * derruba o lote dos outros**: o serviço abre uma transação POR ALUNO. A
 * tela precisa mostrar isso sem ambiguidade — por isso o resultado sai
 * linha por linha, com o nome de quem foi recusado e o motivo ao lado, e
 * a frase de fecho diz em quantos empréstimos entraram apesar das
 * recusas.
 */
export function NaVolta({
  rodadas,
  rodadaAtual,
  onSelecionarRodada,
  onLoteLancado,
}: {
  rodadas: RodadaNaTela[]
  rodadaAtual: RodadaNaTela | null
  onSelecionarRodada: (rodada: RodadaNaTela | null) => void
  onLoteLancado: () => void
}) {
  const [matricula, setMatricula] = useState('')
  const [aluno, setAluno] = useState<AlunoNaTela | null>(null)
  const [tombo, setTombo] = useState('')
  const [itens, setItens] = useState<ItemMontado[]>([])
  const [resumo, setResumo] = useState<ResumoDoLote | null>(null)
  const [interrompido, setInterrompido] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const campoDeMatricula = useRef<HTMLInputElement>(null)
  const campoDeTombo = useRef<HTMLInputElement>(null)

  const voltarParaAMatricula = useCallback(() => {
    setAluno(null)
    setMatricula('')
    setTombo('')
    campoDeMatricula.current?.focus()
  }, [])

  useEffect(() => {
    if (rodadaAtual) campoDeMatricula.current?.focus()
  }, [rodadaAtual])

  async function buscarAluno(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      const resposta = await buscarAlunoAction(matricula)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      setAluno(resposta.aluno)
      // O cursor pula para o tombo: a operadora já pode bipar a etiqueta
      // do livro que este aluno devolveu na caixa, sem tocar no mouse.
      setTimeout(() => campoDeTombo.current?.focus(), 0)
    } finally {
      setOcupado(false)
    }
  }

  function acrescentar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!aluno || !rodadaAtual) return

    const bipado = tombo.trim()
    if (bipado.length === 0) return

    // Existe UM exemplar físico de cada tombo no carrinho. O serviço
    // recusa o lote INTEIRO quando um tombo aparece duas vezes, então
    // barrar aqui é o que evita a operadora perder a fila de trinta
    // alunos por um duplo clique.
    const jaNoLote = itens.find((item) => item.tombo === bipado)
    if (jaNoLote) {
      setErro(
        `O tombo ${bipado} já está neste lote, entregue a ${jaNoLote.alunoNome}. ` +
          'Confira a quem o livro foi.',
      )
      return
    }

    // O título só sai do romaneio da rodada. Um tombo bipado que não foi
    // no carrinho entra SEM título — inventar um seria pior que não ter
    // nenhum, e o serviço aceita o empréstimo do mesmo jeito.
    const doRomaneio = rodadaAtual.livros.find((livro) => livro.tombo === bipado)

    setErro(null)
    setItens((atual) => [
      ...atual,
      {
        alunoId: aluno.id,
        alunoNome: aluno.nome,
        matricula: aluno.matricula,
        tombo: bipado,
        titulo: doRomaneio === undefined ? null : doRomaneio.titulo,
      },
    ])
    voltarParaAMatricula()
  }

  function remover(indice: number) {
    setItens((atual) => atual.filter((_, posicao) => posicao !== indice))
  }

  async function registrar() {
    if (!rodadaAtual || itens.length === 0) return
    setErro(null)
    setOcupado(true)

    try {
      const resposta = await registrarLoteAction({
        rodadaId: rodadaAtual.id,
        itens: itens.map((item) => ({ alunoId: item.alunoId, tombo: item.tombo })),
      })

      if (resposta.ok) {
        setResumo(montarResumoDoLote(itens, resposta.resultado))
        setInterrompido(false)
        onLoteLancado()
        return
      }

      setErro(resposta.erro)

      // O lote parou por falha de infraestrutura: o parcial JÁ está
      // gravado e aqueles livros saíram com os alunos. Mostrar o parcial é
      // o que evita a operadora relançar tudo às cegas.
      if (resposta.parcial) {
        setResumo(montarResumoDoLote(itens, resposta.parcial))
        setInterrompido(true)
        onLoteLancado()
      }
    } finally {
      setOcupado(false)
    }
  }

  function tentarOsNaoLancados() {
    if (!resumo) return
    setItens(
      resumo.linhas
        .filter((linha) => linha.situacao === 'NAO_LANCADO')
        .map(({ alunoId, alunoNome, matricula: mat, tombo: tomboDaLinha, titulo }) => ({
          alunoId,
          alunoNome,
          matricula: mat,
          tombo: tomboDaLinha,
          titulo,
        })),
    )
    setResumo(null)
    setInterrompido(false)
    setErro(null)
    voltarParaAMatricula()
  }

  function comecarOutroLote() {
    setItens([])
    setResumo(null)
    setInterrompido(false)
    setErro(null)
    voltarParaAMatricula()
  }

  if (rodadas.length === 0 && rodadaAtual === null) {
    return (
      <Faixa tom="atencao" icone="info" titulo="Nenhuma rodada planejada.">
        O lote é lançado contra uma rodada. Monte o carrinho no passo{' '}
        <strong>1 · O que levar</strong> antes de voltar aqui.
      </Faixa>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao className="px-[22px] py-5">
        <div className="flex w-[320px] flex-col gap-[7px]">
          <label htmlFor="carrinho-rodada">
            <Rotulo>Rodada que voltou da sala</Rotulo>
          </label>
          <select
            id="carrinho-rodada"
            value={rodadaAtual === null ? '' : rodadaAtual.id}
            onChange={(evento) => {
              // Trocar de rodada zera a fila: as linhas montadas apontam
              // para os livros de OUTRO carrinho.
              comecarOutroLote()
              const escolhida = rodadas.find((r) => r.id === evento.target.value)
              onSelecionarRodada(escolhida === undefined ? null : escolhida)
            }}
            className={classesDeCampo()}
          >
            <option value="">Escolha a rodada</option>
            {rodadas.map((rodada) => (
              <option key={rodada.id} value={rodada.id}>
                {rodada.turmaNome} · {rodada.data} · {rodada.livros.length}{' '}
                {rodada.livros.length === 1 ? 'livro' : 'livros'}
              </option>
            ))}
          </select>
        </div>

        {rodadaAtual && <RomaneioDaRodada rodada={rodadaAtual} />}
      </Cartao>

      {rodadaAtual && resumo === null && (
        <Cartao semPadding>
          <div className="border-b border-linha bg-papel-2 px-[22px] py-[18px]">
            <h2 className="font-serif text-[19px] font-semibold text-tinta">
              Na volta do carrinho — empréstimo em lote
            </h2>
            <p className="mt-[3px] text-[13px] text-tinta-2">
              Bipe matrícula e tombo em sequência. Um aluno bloqueado não derruba o lote dos
              outros: cada empréstimo é gravado por conta.
            </p>
          </div>

          <div className="flex flex-col gap-[18px] px-[22px] py-5">
            <form onSubmit={buscarAluno} className="flex items-end gap-3">
              <div className="w-[260px]">
                <CampoComRotulo
                  id="carrinho-matricula"
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

            {aluno && (
              <form onSubmit={acrescentar} className="flex flex-col gap-[14px]">
                <div className="rounded-controle border border-linha bg-papel-2 px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-[9px]">
                    <span className="font-serif text-[17px] font-semibold text-tinta">
                      {aluno.nome}
                    </span>
                    {aluno.turma !== null && (
                      <span className="text-[13px] text-tinta-2">· {aluno.turma}</span>
                    )}
                    <span className="text-[13px] text-tinta-2">
                      · matrícula <Matricula valor={aluno.matricula} />
                    </span>
                  </div>

                  {/* Aviso, não bloqueio: quem recusa é o serviço, aluno
                      por aluno. Mostrar aqui deixa a operadora decidir se
                      põe este na fila antes de mandar as trinta linhas. */}
                  {aluno.bloqueios.length > 0 && (
                    <ul className="mt-[9px] flex flex-col gap-[5px]">
                      {aluno.bloqueios.map((bloqueio) => (
                        <li
                          key={bloqueio}
                          className="flex items-start gap-[7px] text-[12.5px] text-atencao-texto"
                        >
                          <span className="mt-px shrink-0 text-atencao">
                            <Icone nome="aviso" tamanho={14} traco={2} />
                          </span>
                          {bloqueio}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex items-end gap-3">
                  <div className="w-[260px]">
                    <CampoComRotulo
                      id="carrinho-tombo"
                      rotulo="2 · Tombo do livro que ele leva"
                      variante="bipagem"
                      placeholder="bipe a etiqueta"
                      ref={campoDeTombo}
                      value={tombo}
                      onChange={(evento) => setTombo(evento.target.value)}
                    />
                  </div>
                  <Botao
                    type="submit"
                    icone="mais"
                    className={ALTURA_DA_BIPAGEM}
                    disabled={tombo.trim().length === 0}
                  >
                    Acrescentar ao lote
                  </Botao>
                  <Botao
                    type="button"
                    variante="fantasma"
                    className={ALTURA_DA_BIPAGEM}
                    onClick={voltarParaAMatricula}
                  >
                    Trocar de aluno
                  </Botao>
                </div>
              </form>
            )}
          </div>

          {itens.length > 0 && (
            <>
              <div className="border-t border-linha px-[22px] pt-[18px]">
                <Rotulo>
                  Fila do lote — {itens.length} {itens.length === 1 ? 'entrega' : 'entregas'}
                </Rotulo>
                <div className="mt-[9px] overflow-x-auto">
                  <Tabela>
                    <thead>
                      <tr>
                        <CelulaDeTitulo>Aluno</CelulaDeTitulo>
                        <CelulaDeTitulo>Matrícula</CelulaDeTitulo>
                        <CelulaDeTitulo>Livro</CelulaDeTitulo>
                        <CelulaDeTitulo>Tombo</CelulaDeTitulo>
                        <CelulaDeTitulo>
                          <span className="sr-only">Tirar da fila</span>
                        </CelulaDeTitulo>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item, indice) => (
                        <tr key={`${item.alunoId} ${item.tombo}`}>
                          <Celula>{item.alunoNome}</Celula>
                          <Celula>
                            <Matricula valor={item.matricula} />
                          </Celula>
                          <Celula>
                            {item.titulo === null ? (
                              <span className="text-tinta-3">fora do romaneio da rodada</span>
                            ) : (
                              item.titulo
                            )}
                          </Celula>
                          <Celula>
                            <Tombo valor={item.tombo} />
                          </Celula>
                          <Celula className="text-right">
                            <Botao
                              type="button"
                              variante="fantasma"
                              onClick={() => remover(indice)}
                              disabled={ocupado}
                            >
                              Tirar
                            </Botao>
                          </Celula>
                        </tr>
                      ))}
                    </tbody>
                  </Tabela>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-[10px] px-[22px] py-[18px]">
                <Botao
                  type="button"
                  tamanho="grande"
                  icone="check"
                  onClick={registrar}
                  disabled={ocupado}
                >
                  Registrar o lote — {itens.length}{' '}
                  {itens.length === 1 ? 'empréstimo' : 'empréstimos'}
                </Botao>
                <Botao
                  type="button"
                  variante="secundaria"
                  tamanho="grande"
                  onClick={comecarOutroLote}
                  disabled={ocupado}
                >
                  Limpar a fila
                </Botao>
              </div>
            </>
          )}
        </Cartao>
      )}

      {erro && <Faixa tom="erro">{erro}</Faixa>}

      {resumo && (
        <ResultadoDoLote
          resumo={resumo}
          interrompido={interrompido}
          onTentarOsNaoLancados={tentarOsNaoLancados}
          onComecarOutroLote={comecarOutroLote}
        />
      )}
    </div>
  )
}

/** O que saiu no carrinho, para conferir contra a caixa que voltou. */
function RomaneioDaRodada({ rodada }: { rodada: RodadaNaTela }) {
  return (
    <details className="mt-[18px] rounded-controle border border-linha bg-papel-2 px-4 py-3">
      <summary className="cursor-pointer text-[13px] text-tinta-2">
        <strong className="text-tinta">{rodada.turmaNome}</strong> · {rodada.data} ·{' '}
        {rodada.livros.length} {rodada.livros.length === 1 ? 'livro' : 'livros'} no carrinho ·
        responsável {rodada.responsavelNome}
        {rodada.observacao === null ? '' : ` · ${rodada.observacao}`}
      </summary>

      {rodada.livros.length === 0 ? (
        <p className="mt-[9px] text-[13px] text-tinta-2">
          Esta rodada foi planejada sem nenhum exemplar.
        </p>
      ) : (
        <ul className="mt-[9px] flex flex-col gap-[5px]">
          {rodada.livros.map((livro) => (
            <li key={livro.exemplarId} className="flex items-baseline gap-[9px] text-[13px]">
              <Tombo valor={livro.tombo} tamanho="discreto" />
              <span className="text-tinta-2">{livro.titulo}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

/**
 * O resultado do lote, POR ALUNO.
 *
 * O cabeçalho diz o número dos dois lados e a frase diz o que eles
 * significam juntos: os empréstimos entraram, as recusas não desfizeram
 * nenhum deles. Sem essa frase a operadora lê "2 recusados" e não sabe se
 * perdeu o lote — e, na dúvida, volta a lançar um aluno por vez.
 */
function ResultadoDoLote({
  resumo,
  interrompido,
  onTentarOsNaoLancados,
  onComecarOutroLote,
}: {
  resumo: ResumoDoLote
  interrompido: boolean
  onTentarOsNaoLancados: () => void
  onComecarOutroLote: () => void
}) {
  return (
    <Cartao semPadding>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-linha bg-papel-2 px-[22px] py-[18px]">
        <Contagem numero={resumo.emprestados} palavra="confirmados" tom="certo" />
        {/* Zero recusas não é alarme: pintar o zero de vermelho faria a
            operadora procurar um problema que não existe. */}
        <Contagem
          numero={resumo.recusados}
          palavra="recusados"
          tom={resumo.recusados > 0 ? 'alerta' : 'neutro'}
        />
        {resumo.naoLancados > 0 && (
          <Contagem numero={resumo.naoLancados} palavra="não lançados" tom="atencao" />
        )}
      </div>

      <div className="flex flex-col gap-4 p-[22px]">
        {interrompido ? (
          <Faixa tom="erro" titulo="O lote parou no meio.">
            Os {resumo.emprestados} empréstimos confirmados abaixo{' '}
            <strong>já estão gravados</strong> e aqueles livros saíram com os alunos. Os{' '}
            {resumo.naoLancados} marcados como não lançados{' '}
            <strong>não foram tentados</strong> — lance só eles, não o lote inteiro.
          </Faixa>
        ) : (
          <FechoDoLote resumo={resumo} />
        )}

        {resumo.recusasPorMotivo.length > 0 && (
          <div className="rounded-controle border border-linha bg-papel-2 px-4 py-[15px]">
            <Rotulo>Por que os recusados não saíram</Rotulo>
            <ul className="mt-[9px] flex flex-col gap-[6px] text-[13px]">
              {resumo.recusasPorMotivo.map((grupo) => (
                <li key={grupo.motivo} className="flex items-baseline gap-[9px]">
                  <span className="font-mono text-tinta">{grupo.quantos}×</span>
                  <span className="text-tinta-2">{grupo.motivo}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto">
          <Tabela>
            <thead>
              <tr>
                <CelulaDeTitulo>Aluno</CelulaDeTitulo>
                <CelulaDeTitulo>Matrícula</CelulaDeTitulo>
                <CelulaDeTitulo>Livro</CelulaDeTitulo>
                <CelulaDeTitulo>Tombo</CelulaDeTitulo>
                <CelulaDeTitulo>Resultado</CelulaDeTitulo>
              </tr>
            </thead>
            <tbody>
              {resumo.linhas.map((linha) => (
                <tr key={`${linha.alunoId} ${linha.tombo}`}>
                  <Celula>{linha.alunoNome}</Celula>
                  <Celula>
                    <Matricula valor={linha.matricula} />
                  </Celula>
                  <Celula>
                    {linha.titulo === null ? (
                      <span className="text-tinta-3">fora do romaneio da rodada</span>
                    ) : (
                      linha.titulo
                    )}
                  </Celula>
                  <Celula>
                    <Tombo valor={linha.tombo} />
                  </Celula>
                  <Celula>
                    <div className="flex flex-wrap items-center gap-[9px]">
                      <ChipDoLote situacao={linha.situacao} />
                      {linha.previstaPara !== null && (
                        <span className="text-[12.5px] text-tinta-2">
                          devolver até{' '}
                          <strong className="font-mono">{linha.previstaPara}</strong>
                        </span>
                      )}
                      {linha.motivo !== null && (
                        <span className="text-[12.5px] text-tinta-2">{linha.motivo}</span>
                      )}
                    </div>
                  </Celula>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </div>

        <div className="flex flex-wrap items-center gap-[10px]">
          {resumo.naoLancados > 0 && (
            <Botao type="button" icone="troca" onClick={onTentarOsNaoLancados}>
              Lançar só os {resumo.naoLancados} não lançados
            </Botao>
          )}
          <Botao type="button" variante="secundaria" onClick={onComecarOutroLote}>
            Começar outro lote
          </Botao>
        </div>
      </div>
    </Cartao>
  )
}

/**
 * A frase de fecho do lote que terminou.
 *
 * Cada caso diz uma coisa diferente, e nenhuma delas é decorativa: com
 * empréstimo e recusa juntos, o recado é que a recusa não desfez nada;
 * sem nenhum empréstimo, o recado é que a rodada CONTINUA planejada —
 * porque o serviço só a fecha quando pelo menos um empréstimo entra, e a
 * operadora precisa saber que pode voltar a lançar nela.
 */
function FechoDoLote({ resumo }: { resumo: ResumoDoLote }) {
  if (resumo.emprestados === 0) {
    return (
      <Faixa tom="atencao" titulo="Nenhum empréstimo entrou neste lote.">
        A rodada <strong>continua planejada</strong>: resolva o que apareceu ao lado de cada
        aluno e lance de novo, nesta mesma rodada.
      </Faixa>
    )
  }

  if (resumo.recusados === 0) {
    return (
      <Faixa
        tom="sucesso"
        titulo={`${resumo.emprestados} ${
          resumo.emprestados === 1 ? 'empréstimo entrou' : 'empréstimos entraram'
        }, nenhuma recusa.`}
      >
        A rodada foi marcada como realizada.
      </Faixa>
    )
  }

  return (
    <Faixa
      tom="sucesso"
      titulo={`${resumo.emprestados} ${
        resumo.emprestados === 1 ? 'empréstimo entrou' : 'empréstimos entraram'
      }.`}
    >
      {resumo.recusados === 1 ? 'A recusa abaixo não desfez' : 'As recusas abaixo não desfizeram'}{' '}
      nenhum deles — cada aluno é uma gravação por conta. Os {resumo.recusados} livros recusados
      voltam para a estante.
    </Faixa>
  )
}

const TOM_DA_CONTAGEM = {
  certo: 'text-certo',
  alerta: 'text-alerta',
  atencao: 'text-atencao',
  neutro: 'text-tinta-3',
} as const

function Contagem({
  numero,
  palavra,
  tom,
}: {
  numero: number
  palavra: string
  tom: keyof typeof TOM_DA_CONTAGEM
}) {
  return (
    <p className="flex items-baseline gap-[7px]">
      <strong className={`font-mono text-[26px] leading-none ${TOM_DA_CONTAGEM[tom]}`}>
        {numero}
      </strong>
      <span className="text-[13px] text-tinta-2">{palavra}</span>
    </p>
  )
}
