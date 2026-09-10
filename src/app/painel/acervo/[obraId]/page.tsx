import Link from 'next/link'
import { notFound } from 'next/navigation'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { dependenciasDoAcervo } from '@/modules/acervo/acervo.deps'
import { obterObra, ObraInexistenteError } from '@/modules/acervo/obras.service'
import { listarExemplaresDaObra } from '@/modules/acervo/exemplares.service'

export const runtime = 'nodejs'

const ROTULO_DA_SITUACAO: Record<string, string> = {
  DISPONIVEL: 'Disponível',
  EMPRESTADO: 'Emprestado',
  RESERVADO: 'Reservado',
  EM_CARRINHO: 'No carrinho',
  EM_MANUTENCAO: 'Em manutenção',
  EXTRAVIADO: 'Extraviado',
  BAIXADO: 'Baixado',
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
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/painel/acervo" className="text-sm underline">
        ← Acervo
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">{obra.titulo}</h1>
      {obra.subtitulo && <p className="text-neutral-600">{obra.subtitulo}</p>}

      {obra.autores.length > 0 && (
        <p className="mt-2 text-neutral-700">{obra.autores.map((a) => a.nome).join(', ')}</p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Dado rotulo="Editora" valor={obra.editora} />
        <Dado rotulo="Ano" valor={obra.anoPublicacao} />
        <Dado rotulo="ISBN" valor={obra.isbn} />
        <Dado rotulo="Páginas" valor={obra.numeroDePaginas} />
      </dl>

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="text-lg font-medium">
          Exemplares · {obra.exemplaresDisponiveis} de {obra.totalDeExemplares} disponível(is)
        </h2>
        {exemplares.length > 0 && (
          <a
            href={`/api/etiquetas?obraId=${obra.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline"
          >
            Imprimir etiquetas
          </a>
        )}
      </div>

      {exemplares.length === 0 ? (
        <p className="mt-2 text-neutral-600">
          Esta ficha ainda não tem nenhum exemplar cadastrado.
        </p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className="py-2">Tombo</th>
              <th className="py-2">Situação</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {exemplares.map((exemplar) => (
              <tr key={exemplar.id} className="border-b border-neutral-100">
                <td className="py-2 font-mono">{exemplar.tombo}</td>
                <td className="py-2">
                  {ROTULO_DA_SITUACAO[exemplar.situacao] ?? exemplar.situacao}
                </td>
                <td className="py-2">{exemplar.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | number | null }) {
  return (
    <div>
      <dt className="text-neutral-500">{rotulo}</dt>
      {/* Campo ausente mostra travessão, não "0" nem string vazia: um
          branco a operadora reconhece como "falta preencher". */}
      <dd>{valor === null || valor === '' ? '—' : valor}</dd>
    </div>
  )
}
