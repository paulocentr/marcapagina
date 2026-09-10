'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Botao } from '@/components/ui/botao'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { CampoComRotulo } from '@/components/ui/campo'
import { Cartao } from '@/components/ui/cartao'
import { Tombo } from '@/components/ui/codigo'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import type { MetadadosDeObra } from '@/infra/metadados/provedor'
import { consultarIsbnAction, catalogarAction, type ObraJaNoAcervo } from './actions'

interface Ficha {
  isbn: string
  titulo: string
  autores: string
  editora: string
  anoPublicacao: string
  numeroDePaginas: string
  sinopse: string
  capaUrl: string
  quantidadeDeExemplares: string
  obraExistenteId: string
}

const FICHA_VAZIA: Ficha = {
  isbn: '',
  titulo: '',
  autores: '',
  editora: '',
  anoPublicacao: '',
  numeroDePaginas: '',
  sinopse: '',
  capaUrl: '',
  quantidadeDeExemplares: '1',
  obraExistenteId: '',
}

/**
 * O que a tela mostra depois de uma consulta ou de uma gravação.
 *
 * É UM estado só, e não dois, de propósito: "salvo" e "ISBN não
 * encontrado" nunca são verdade ao mesmo tempo, e mantê-los no mesmo
 * lugar garante que a região de aviso da tela tenha um recado por vez —
 * dois recados sobrepostos no balcão é a operadora lendo o de ontem.
 */
type Resultado =
  | { tipo: 'salvo'; titulo: string; tombos: string[] }
  | { tipo: 'sem-metadados' }

interface ItemDaSessao {
  chave: string
  titulo: string
  tombos: string[]
  aMao: boolean
}

function fichaDeMetadados(isbn: string, m: MetadadosDeObra | null): Ficha {
  return {
    ...FICHA_VAZIA,
    isbn,
    titulo: m?.titulo ?? '',
    autores: m?.autores.join('; ') ?? '',
    editora: m?.editora ?? '',
    anoPublicacao: m?.anoPublicacao ? String(m.anoPublicacao) : '',
    numeroDePaginas: m?.numeroDePaginas ? String(m.numeroDePaginas) : '',
    sinopse: m?.sinopse ?? '',
    capaUrl: m?.capaUrl ?? '',
  }
}

export default function PaginaDeCatalogacaoEmSerie() {
  const [isbnBipado, setIsbnBipado] = useState('')
  const [ficha, setFicha] = useState<Ficha | null>(null)
  // `null` = nenhuma base achou o ISBN e a ficha foi preenchida à mão.
  // O nome da base é separado do fato de ter havido base: provedor que
  // responde sem se identificar não pode virar "digitado pela operadora"
  // na lista da sessão.
  const [basesDaFicha, setBasesDaFicha] = useState<{ fonte: string | null } | null>(null)
  const [jaCadastrada, setJaCadastrada] = useState<ObraJaNoAcervo | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  // A lista É o contador: um número guardado à parte teria como divergir
  // da lista que a operadora está lendo ao lado dele.
  const [catalogados, setCatalogados] = useState<ItemDaSessao[]>([])

  const campoDeIsbn = useRef<HTMLInputElement>(null)

  // O cursor volta ao campo de ISBN sempre que a ficha sai da tela. É o
  // requisito da spec §5.5, e é ele que torna plausível catalogar um
  // acervo inteiro: sem navegar menu entre um livro e o próximo.
  const voltarParaOIsbn = useCallback(() => {
    setFicha(null)
    setBasesDaFicha(null)
    setJaCadastrada(null)
    setIsbnBipado('')
    campoDeIsbn.current?.focus()
  }, [])

  useEffect(() => {
    campoDeIsbn.current?.focus()
  }, [])

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setResultado(null)
    setOcupado(true)

    try {
      const resposta = await consultarIsbnAction(isbnBipado)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setJaCadastrada(resposta.jaCadastrada)
      setFicha(fichaDeMetadados(resposta.isbn, resposta.metadados))
      setBasesDaFicha(
        resposta.metadados === null ? null : { fonte: resposta.metadados.fonte ?? null },
      )

      if (!resposta.metadados) {
        // Não é erro: didático e infantojuvenil nacional faltam nas duas
        // APIs com frequência. O formulário abre em branco, já com o ISBN.
        setResultado({ tipo: 'sem-metadados' })
      }
    } finally {
      setOcupado(false)
    }
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!ficha) return
    setErro(null)
    setResultado(null)
    setOcupado(true)

    try {
      const resposta = await catalogarAction(ficha)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      const aMao = basesDaFicha === null && ficha.obraExistenteId === ''
      setCatalogados((atual) => [
        {
          chave: resposta.tombos.join('-'),
          titulo: resposta.titulo,
          tombos: resposta.tombos,
          aMao,
        },
        ...atual,
      ])
      // Os tombos ficam na tela depois do reset: é com eles que a
      // operadora escreve a etiqueta do livro que acabou de passar.
      setResultado({ tipo: 'salvo', titulo: resposta.titulo, tombos: resposta.tombos })
      voltarParaOIsbn()
    } finally {
      setOcupado(false)
    }
  }

  function acrescentarAObraExistente() {
    if (!jaCadastrada) return
    setFicha((atual) =>
      atual ? { ...atual, obraExistenteId: jaCadastrada.id, titulo: jaCadastrada.titulo } : atual,
    )
    setJaCadastrada(null)
  }

  const acrescentando = ficha !== null && ficha.obraExistenteId !== ''

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo="Catalogar por ISBN"
        descricao="Bipe o código de barras da contracapa — o cursor volta sozinho para o ISBN."
      />

      <div className="mt-[18px] flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* bipagem */}
          <Cartao semPadding>
            <div className="flex flex-wrap items-end gap-[14px] px-[22px] py-5">
              <form onSubmit={buscar} className="flex items-end gap-[14px]">
                <div className="w-[330px]">
                  <CampoComRotulo
                    ref={campoDeIsbn}
                    id="isbn-bipado"
                    // Este rótulo é "ISBN" e nada mais: o campo da ficha
                    // é "ISBN da obra", e é assim que os dois se
                    // distinguem para quem usa leitor de tela — e para o
                    // teste de ponta a ponta.
                    rotulo="ISBN"
                    variante="bipagem"
                    name="isbn"
                    value={isbnBipado}
                    onChange={(evento) => setIsbnBipado(evento.target.value)}
                    // Leitor USB se comporta como teclado e termina com
                    // Enter, então o submit do formulário já é o "bipar"
                    // (spec §7).
                    inputMode="numeric"
                  />
                </div>
                <Botao
                  type="submit"
                  variante="secundaria"
                  disabled={ocupado || isbnBipado.trim().length === 0}
                  // A altura do campo de bipagem, para os dois formarem
                  // uma linha só; `!` porque a classe do tamanho do botão
                  // também declara altura.
                  className="h-[52px]!"
                >
                  Buscar
                </Botao>
              </form>

              <div className="flex-1" />

              <div data-testid="contador-da-sessao" className="pb-1 text-right">
                <Rotulo tom="discreto">nesta sessão</Rotulo>
                <div className="font-serif text-[34px] leading-none font-bold tracking-[-0.03em] text-tinta">
                  {catalogados.length}
                </div>
              </div>
            </div>
          </Cartao>

          {/* Erro e obra repetida nunca aparecem juntos: são duas regiões
              `alert`, e duas ao mesmo tempo fazem o leitor de tela
              atropelar uma com a outra. */}
          {erro ? (
            <Faixa tom="erro" titulo={erro} />
          ) : (
            jaCadastrada && (
              <Faixa
                tom="atencao"
                icone="aviso"
                titulo={`"${jaCadastrada.titulo}" já está no acervo, com ${contarExemplares(
                  jaCadastrada.exemplares,
                )}.`}
              >
                <div className="mt-[2px]">
                  Cadastrar de novo criaria uma segunda ficha do mesmo livro.
                </div>
                <Botao
                  type="button"
                  variante="secundaria"
                  onClick={acrescentarAObraExistente}
                  className="mt-[10px]"
                >
                  Acrescentar exemplares a esta obra
                </Botao>
              </Faixa>
            )
          )}

          {ficha && (
            <Cartao semPadding>
              <form onSubmit={salvar} className="p-[22px]">
                <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-serif text-[17px] font-semibold text-tinta">
                    {acrescentando ? 'Acrescentando exemplares' : 'Confira antes de salvar'}
                  </h2>
                  {!acrescentando && basesDaFicha !== null && (
                    // Não é chip de estado — é procedência, e por isso
                    // não sai do catálogo de `ui/estados.ts`: dizer QUEM
                    // preencheu é o que faz a operadora saber o que
                    // conferir com o livro na mão.
                    <span className="inline-flex h-[23px] shrink-0 items-center gap-[5px] rounded-full bg-marca-suave px-[9px] text-[11.5px] leading-none font-semibold text-marca-forte">
                      <Icone nome="check" tamanho={11} traco={2.4} />
                      {basesDaFicha.fonte === null
                        ? 'preenchido pelas bases consultadas'
                        : `preenchido por ${basesDaFicha.fonte}`}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-[22px]">
                  {/* Lugar da capa vinda da API. Ver relato: a imagem
                      ainda não é exibida, e o espaço fica reservado para
                      a ficha não mudar de forma quando ela chegar. */}
                  <div className="w-[132px] shrink-0">
                    <div className="flex h-[196px] w-[132px] items-center justify-center rounded-[3px] border border-linha-2 bg-papel-2 text-tinta-3">
                      <Icone nome="imagem" tamanho={34} />
                    </div>
                    <p className="mt-2 text-center text-[11.5px] text-tinta-3">capa da API</p>
                  </div>

                  <div className="grid min-w-[280px] flex-1 grid-cols-1 gap-[14px] sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <CampoComRotulo
                        id="ficha-titulo"
                        rotulo="Título"
                        value={ficha.titulo}
                        onChange={(evento) => setFicha({ ...ficha, titulo: evento.target.value })}
                        readOnly={acrescentando}
                        className="read-only:bg-papel-2 read-only:text-tinta-2"
                      />
                    </div>

                    {!acrescentando && (
                      <>
                        <div className="sm:col-span-2">
                          <CampoComRotulo
                            id="ficha-autores"
                            rotulo="Autores"
                            dica="separe por ponto e vírgula"
                            value={ficha.autores}
                            onChange={(evento) =>
                              setFicha({ ...ficha, autores: evento.target.value })
                            }
                          />
                        </div>
                        <CampoComRotulo
                          id="ficha-editora"
                          rotulo="Editora"
                          value={ficha.editora}
                          onChange={(evento) => setFicha({ ...ficha, editora: evento.target.value })}
                        />
                      </>
                    )}

                    <CampoComRotulo
                      id="ficha-isbn"
                      rotulo="ISBN da obra"
                      value={ficha.isbn}
                      onChange={(evento) => setFicha({ ...ficha, isbn: evento.target.value })}
                      readOnly={acrescentando}
                      className="font-mono read-only:bg-papel-2 read-only:text-tinta-2"
                    />

                    {!acrescentando && (
                      <>
                        <CampoComRotulo
                          id="ficha-ano"
                          rotulo="Ano"
                          inputMode="numeric"
                          value={ficha.anoPublicacao}
                          onChange={(evento) =>
                            setFicha({ ...ficha, anoPublicacao: evento.target.value })
                          }
                          className="font-mono"
                        />
                        <CampoComRotulo
                          id="ficha-paginas"
                          rotulo="Páginas"
                          inputMode="numeric"
                          value={ficha.numeroDePaginas}
                          onChange={(evento) =>
                            setFicha({ ...ficha, numeroDePaginas: evento.target.value })
                          }
                          className="font-mono"
                        />
                      </>
                    )}
                  </div>

                  <div className="w-[180px] shrink-0 rounded-controle border border-linha bg-papel-2 p-4">
                    <CampoComRotulo
                      id="ficha-quantidade"
                      rotulo="Quantos exemplares"
                      variante="bipagem"
                      inputMode="numeric"
                      value={ficha.quantidadeDeExemplares}
                      onChange={(evento) =>
                        setFicha({ ...ficha, quantidadeDeExemplares: evento.target.value })
                      }
                      className="text-center"
                    />
                    <p className="mt-[10px] text-[12px] text-tinta-2">
                      O tombo de cada um é gerado em sequência, sob trava — nunca digitado.
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-[10px] border-t border-linha pt-5">
                  <Botao type="submit" tamanho="grande" icone="mais" disabled={ocupado}>
                    Salvar e próximo
                  </Botao>
                  <Botao
                    type="button"
                    variante="secundaria"
                    tamanho="grande"
                    onClick={voltarParaOIsbn}
                  >
                    Descartar
                  </Botao>
                  <p className="ml-auto max-w-[330px] text-right text-[12.5px] text-tinta-2">
                    Se nenhuma das bases achar o ISBN, o formulário abre em branco com o número
                    já guardado — comum em didático e infantojuvenil nacional.
                  </p>
                </div>
              </form>
            </Cartao>
          )}
        </div>

        {/* trilha lateral: o que acabou de acontecer, e a sessão inteira */}
        <div className="flex w-full flex-col gap-4 xl:w-[336px] xl:shrink-0">
          {resultado?.tipo === 'salvo' && (
            <Faixa tom="sucesso" titulo={`"${resultado.titulo}" salvo.`}>
              <div className="mt-[3px]">
                <TombosGravados tombos={resultado.tombos} />
              </div>
            </Faixa>
          )}

          {/* `status` e não `alert`: ISBN fora das bases é rotina em livro
              didático nacional, não recusa. Interromper a operadora aqui
              ensinaria a ela que a tela grita por nada. */}
          {resultado?.tipo === 'sem-metadados' && (
            <div
              role="status"
              className="flex gap-[10px] rounded-controle border border-linha-2 bg-papel-2 px-[15px] py-[13px] text-[13.5px] text-tinta-2"
            >
              <span className="mt-px shrink-0 text-tinta-3">
                <Icone nome="info" tamanho={18} traco={1.8} />
              </span>
              <div>
                <strong className="text-tinta">
                  Este ISBN não foi encontrado nas bases consultadas.
                </strong>{' '}
                Preencha os dados à mão — o ISBN já está guardado.
              </div>
            </div>
          )}

          <Cartao semPadding>
            <div className="flex items-baseline justify-between px-5 pt-[18px]">
              <h2 className="font-sans text-[15px] font-semibold text-tinta">
                Catalogados nesta sessão
              </h2>
              <span className="text-[12.5px] text-tinta-3">{catalogados.length}</span>
            </div>

            {catalogados.length === 0 ? (
              <p className="px-5 pt-2 pb-[18px] text-[12.5px] text-tinta-2">
                Cada livro salvo aparece aqui com os seus tombos, para a operadora escrever as
                etiquetas sem voltar tela nenhuma.
              </p>
            ) : (
              <ul className="px-5 pt-1 pb-[18px]">
                {catalogados.map((item) => (
                  <li
                    key={item.chave}
                    className="flex items-start gap-[11px] border-b border-linha py-[11px] last:border-b-0"
                  >
                    <span className="h-9 w-[26px] shrink-0 rounded-[2px] border border-linha-2 bg-papel-2" />
                    <span className="min-w-0 flex-1 text-[13px]">
                      <span className="block leading-[1.3] font-semibold text-tinta">
                        {item.titulo}
                      </span>
                      <span className="block text-[12px] text-tinta-2">
                        {contarExemplares(item.tombos.length)}
                        {item.aMao && <span className="text-tinta-3"> · à mão</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <FaixaDeTombos tombos={item.tombos} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </main>
  )
}

/** "1 exemplar" / "3 exemplares" — nenhuma tela escreve o plural à mão. */
function contarExemplares(quantidade: number): string {
  return quantidade === 1 ? '1 exemplar' : `${quantidade} exemplares`
}

/**
 * Os tombos que acabaram de nascer, em mono e por extenso.
 *
 * É a única informação da tela que não se recupera depois sem procurar a
 * obra: é com ela que a operadora escreve a etiqueta do livro que ainda
 * está na mão dela.
 */
function TombosGravados({ tombos }: { tombos: string[] }) {
  const primeiro = tombos.at(0)
  const ultimo = tombos.at(-1)
  if (primeiro === undefined || ultimo === undefined) return null

  if (primeiro === ultimo) {
    return (
      <>
        Tombo <Tombo valor={primeiro} /> — escreva na etiqueta.
      </>
    )
  }

  return (
    <>
      Tombos <Tombo valor={primeiro} /> a <Tombo valor={ultimo} /> — escreva nas etiquetas.
    </>
  )
}

/** O mesmo intervalo, discreto, para a lista da sessão. */
function FaixaDeTombos({ tombos }: { tombos: string[] }) {
  const primeiro = tombos.at(0)
  const ultimo = tombos.at(-1)
  if (primeiro === undefined || ultimo === undefined) return null

  return (
    <span className="block text-[11.5px] text-tinta-3">
      <Tombo valor={primeiro} tamanho="discreto" />
      {primeiro !== ultimo && (
        <>
          <br />–<Tombo valor={ultimo} tamanho="discreto" />
        </>
      )}
    </span>
  )
}
