import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { estilosDeBotao } from '@/components/ui/botao'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Cartao } from '@/components/ui/cartao'
import { ChipDeContagem } from '@/components/ui/chip'
import { Isbn, Tombo } from '@/components/ui/codigo'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { dependenciasDoAcervo } from '@/modules/acervo/acervo.deps'
import type {
  EstadoDeConservacao,
  OrigemDoExemplar,
} from '@/modules/acervo/exemplares.service'
import { listarExemplaresDaObra } from '@/modules/acervo/exemplares.service'
import { obterObra, ObraInexistenteError } from '@/modules/acervo/obras.service'
import { ChipDeSituacao, saiuDoAcervo } from './chip-de-situacao'

export const runtime = 'nodejs'

const ESTADO_LEGIVEL: Record<EstadoDeConservacao, string> = {
  NOVO: 'Novo',
  BOM: 'Bom',
  DESGASTADO: 'Desgastado',
  DANIFICADO: 'Danificado',
}

const ORIGEM_LEGIVEL: Record<OrigemDoExemplar, string> = {
  COMPRA: 'Compra',
  DOACAO: 'Doação',
  GOVERNO: 'Governo',
}

export default async function PaginaDaObra({
  params,
}: {
  params: Promise<{ obraId: string }>
}) {
  const { obraId } = await params

  const dados = await comStaffNoTenant(async () => {
    const deps = dependenciasDoAcervo()
    try {
      const obra = await obterObra(obraId, deps)
      const exemplares = await listarExemplaresDaObra(obraId, deps)
      return { obra, exemplares }
    } catch (erro) {
      // Obra de outra escola chega aqui como inexistente, e é assim que
      // deve aparecer: 404, não "sem permissão", que confirmaria que ela
      // existe em algum lugar.
      if (erro instanceof ObraInexistenteError) return null
      throw erro
    }
  })

  if (!dados) notFound()
  const { obra, exemplares } = dados

  return (
    <main className="px-8 py-6">
      <Link href="/painel/acervo" className="text-[12.5px] font-semibold text-tinta-2">
        ← Acervo
      </Link>

      <CabecalhoDeTela
        className="mt-3"
        titulo={obra.titulo}
        descricao={
          obra.autores.length > 0
            ? obra.autores.map((autor) => autor.nome).join('; ')
            : 'Autoria não informada'
        }
        acoes={
          exemplares.length > 0 ? (
            // `<a href>`, NUNCA `<Link>`: o App Router prefetcha todo
            // <Link> que aparece na tela e o Route Handler das etiquetas
            // executaria sem ninguém clicar. Há gate no CI para isto.
            <a
              href={`/api/etiquetas?obraId=${obra.id}`}
              target="_blank"
              rel="noreferrer"
              className={estilosDeBotao('secundaria')}
            >
              <Icone nome="impressora" tamanho={16} traco={1.6} />
              Imprimir etiquetas
            </a>
          ) : null
        }
      />

      <Cartao className="mt-5">
        <div className="flex flex-wrap gap-6">
          {/* Lugar da capa: a imagem vinda da API ainda não é exibida
              (ver relato), então o espaço fica reservado em vez de a
              ficha mudar de forma quando ela chegar. */}
          <div className="flex h-[222px] w-[150px] shrink-0 items-center justify-center rounded-[3px] border border-linha-2 bg-papel-2 text-tinta-3">
            <Icone nome="imagem" tamanho={36} />
          </div>

          <div className="min-w-[280px] flex-1">
            {obra.subtitulo && (
              <p className="font-serif text-[17px] text-tinta-2">{obra.subtitulo}</p>
            )}

            <dl className="mt-1 grid grid-cols-2 gap-x-5 gap-y-[14px] border-y border-linha py-4 sm:grid-cols-4">
              <Dado rotulo="Editora" valor={obra.editora} />
              <Dado rotulo="Ano" valor={emMono(obra.anoPublicacao)} />
              <Dado rotulo="Páginas" valor={emMono(obra.numeroDePaginas)} />
              <Dado
                rotulo="ISBN"
                valor={obra.isbn === null ? null : <Isbn valor={obra.isbn} />}
              />
              <Dado rotulo="Edição" valor={obra.edicao} />
              <Dado rotulo="Idioma" valor={obra.idioma} />
              <Dado rotulo="Faixa etária" valor={obra.faixaEtaria} />
              <Dado rotulo="CDD" valor={emMono(obra.cdd)} />
            </dl>

            {obra.sinopse && (
              <p className="mt-4 max-w-[640px] text-[13.5px] text-pretty text-tinta-2">
                {obra.sinopse}
              </p>
            )}
          </div>

          {/* O número de disponíveis é CONTADO (spec §2.2). Nenhum campo
              de estoque existe para divergir dele. */}
          <div className="w-[168px] shrink-0 rounded-controle border border-linha bg-papel-2 p-4 text-center">
            <div className="font-serif text-[34px] leading-none font-bold tracking-[-0.03em] text-tinta">
              {obra.exemplaresDisponiveis}
            </div>
            <div className="mt-[6px]">
              <Rotulo tom="discreto">disponíveis agora</Rotulo>
            </div>
          </div>
        </div>

        <section className="mt-[26px]">
          <div className="mb-3 flex flex-wrap items-baseline gap-[10px]">
            <h2 className="font-sans text-base font-semibold text-tinta">Exemplares</h2>
            <ChipDeContagem
              disponiveis={obra.exemplaresDisponiveis}
              total={obra.totalDeExemplares}
            />
            <span className="text-[12.5px] text-tinta-3">
              cada linha é um livro físico, com seu próprio tombo
            </span>
          </div>

          {exemplares.length === 0 ? (
            <p className="text-[13.5px] text-tinta-2">
              Esta ficha ainda não tem nenhum exemplar cadastrado.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Tabela>
                  <thead>
                    <tr>
                      <CelulaDeTitulo className="w-[110px]">Tombo</CelulaDeTitulo>
                      <CelulaDeTitulo className="w-[120px]">Estado</CelulaDeTitulo>
                      <CelulaDeTitulo className="w-[210px]">Situação</CelulaDeTitulo>
                      <CelulaDeTitulo className="w-[110px]">Origem</CelulaDeTitulo>
                      <CelulaDeTitulo>Observação</CelulaDeTitulo>
                    </tr>
                  </thead>
                  <tbody>
                    {exemplares.map((exemplar) => {
                      // Exemplar fora do acervo continua na ficha, mas
                      // apagado: é história, não erro a esconder.
                      const apagado = saiuDoAcervo(exemplar.situacao)
                      const cor = apagado ? 'text-tinta-3' : 'text-tinta'

                      return (
                        <tr key={exemplar.id}>
                          <Celula className={cor}>
                            <Tombo valor={exemplar.tombo} tamanho="destaque" />
                          </Celula>
                          <Celula className={cor}>{ESTADO_LEGIVEL[exemplar.estado]}</Celula>
                          <Celula>
                            <ChipDeSituacao situacao={exemplar.situacao} />
                          </Celula>
                          <Celula className={cor}>{ORIGEM_LEGIVEL[exemplar.origem]}</Celula>
                          <Celula className="text-tinta-2">
                            {exemplar.observacao === null ? (
                              <span className="text-tinta-3">—</span>
                            ) : (
                              exemplar.observacao
                            )}
                          </Celula>
                        </tr>
                      )
                    })}
                  </tbody>
                </Tabela>
              </div>

              <p className="mt-4 flex items-start gap-[10px] text-[12.5px] text-tinta-2">
                <span className="mt-px shrink-0 text-tinta-3">
                  <Icone nome="info" tamanho={15} traco={1.6} />
                </span>
                Baixado e extraviado saem da contagem de disponíveis, mas ficam na ficha — é
                história do acervo, não erro a esconder.
              </p>
            </>
          )}
        </section>
      </Cartao>
    </main>
  )
}

/** Ano, páginas e CDD saem em mono: são números que se conferem dígito a dígito. */
function emMono(valor: string | number | null): ReactNode {
  if (valor === null || valor === '') return null
  return <span className="font-mono">{valor}</span>
}

function Dado({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  // Campo ausente mostra travessão, não "0" nem string vazia: um branco a
  // operadora reconhece como "falta preencher", e um zero ela lê como dado.
  const vazio = valor === null || valor === undefined || valor === ''

  return (
    <div>
      <dt>
        <Rotulo tom="discreto">{rotulo}</Rotulo>
      </dt>
      <dd className="mt-[2px] text-[13.5px] text-tinta">
        {vazio ? <span className="text-tinta-3">—</span> : valor}
      </dd>
    </div>
  )
}
