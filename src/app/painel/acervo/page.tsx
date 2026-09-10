import Link from 'next/link'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { dependenciasDoAcervo } from '@/modules/acervo/acervo.deps'
import { buscarObras } from '@/modules/acervo/obras.service'

export const runtime = 'nodejs'

export default async function PaginaDoAcervo({
  searchParams,
}: {
  searchParams: Promise<{ termo?: string; pagina?: string }>
}) {
  const { termo, pagina } = await searchParams

  const resultado = await comStaffNoTenant(() =>
    buscarObras(
      { termo, pagina: pagina ? Number(pagina) : 1 },
      dependenciasDoAcervo(),
    ),
  )

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Acervo</h1>
        <Link href="/painel/acervo/novo" className="text-sm underline">
          Catalogar por ISBN
        </Link>
      </header>

      {/* Busca por título é caminho de primeira classe (spec §2.2): o
          sistema tem que servir com a estante inteira sem etiqueta. */}
      <form method="get" className="mb-6 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Buscar por título</span>
          <input
            name="termo"
            defaultValue={termo ?? ''}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">
          Buscar
        </button>
      </form>

      {resultado.itens.length === 0 ? (
        <p className="text-neutral-600">Nenhuma obra encontrada.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-neutral-600">
            {resultado.total} obra(s) no acervo
          </p>
          <ul className="flex flex-col gap-3">
            {resultado.itens.map((obra) => (
              <li key={obra.id} className="rounded border border-neutral-200 p-4">
                <Link
                  href={`/painel/acervo/${obra.id}`}
                  className="text-lg font-medium underline"
                >
                  {obra.titulo}
                </Link>
                {obra.autores.length > 0 && (
                  <p className="text-sm text-neutral-600">
                    {obra.autores.map((a) => a.nome).join(', ')}
                  </p>
                )}
                {/* Estoque é contagem de exemplares disponíveis, nunca um
                    número digitado (spec §2.2). */}
                <p className="mt-1 text-sm text-neutral-700">
                  {obra.exemplaresDisponiveis} de {obra.totalDeExemplares} exemplar(es)
                  disponível(is)
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
