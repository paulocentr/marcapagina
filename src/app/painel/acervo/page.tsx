import Link from 'next/link'
import { estilosDeBotao, Botao } from '@/components/ui/botao'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Campo } from '@/components/ui/campo'
import { Cartao } from '@/components/ui/cartao'
import { ChipDeContagem } from '@/components/ui/chip'
import { Icone } from '@/components/ui/icones'
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
    buscarObras({ termo, pagina: paginaPedida(pagina) }, dependenciasDoAcervo()),
  )

  const termoLimpo = termo?.trim()

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo="Acervo"
        descricao={
          <>
            Busque por parte do título — sem acento acha com acento.{' '}
            <span className="text-tinta-3">
              A etiquetagem é gradual: obra sem etiqueta se acha do mesmo jeito.
            </span>
          </>
        }
        acoes={
          <Link href="/painel/acervo/novo" className={estilosDeBotao('primaria')}>
            <Icone nome="mais" tamanho={16} traco={1.9} />
            Catalogar por ISBN
          </Link>
        }
      />

      {/* Busca por título é caminho de primeira classe (spec §2.2): o
          sistema tem que servir com a estante inteira sem etiqueta.

          `method="get"` de propósito: a busca fica na URL, então a
          operadora recarrega, guarda nos favoritos e volta pelo histórico
          sem perder o que já tinha digitado. */}
      <form method="get" className="mt-[18px] flex items-center gap-[10px]">
        {/* Rótulo invisível, e não `placeholder` sozinho: o campo tem de
            ter nome para quem usa leitor de tela, e o ícone da lupa não
            diz nada em voz alta. */}
        <label htmlFor="termo" className="sr-only">
          Buscar por título
        </label>
        <div className="relative max-w-[520px] flex-1">
          <span className="pointer-events-none absolute top-[11px] left-[13px] text-tinta-3">
            <Icone nome="busca" tamanho={17} />
          </span>
          <Campo
            id="termo"
            name="termo"
            defaultValue={termoLimpo}
            placeholder="parte do título"
            className="pl-[38px]"
          />
        </div>
        <Botao type="submit" variante="secundaria">
          Buscar
        </Botao>
      </form>

      {resultado.itens.length === 0 ? (
        <Cartao className="mt-5 max-w-[520px] text-center">
          <span className="inline-flex text-tinta-3">
            <Icone nome="busca" tamanho={26} />
          </span>
          {/* A frase exata que a operadora procura na tela, num elemento
              só — quebrá-la em pedaços faz a busca da tela achar duas
              coisas e nenhuma inteira. */}
          <p className="mt-2 font-serif text-[17px] font-semibold text-tinta">
            {termoLimpo ? 'Nenhuma obra encontrada' : 'O acervo ainda está vazio'}
          </p>
          <p className="mt-1 text-[13px] text-tinta-2">
            {termoLimpo
              ? 'A busca ignora acento e maiúscula. Se o livro é novo na escola, ele ainda precisa ser catalogado.'
              : 'Bipe o ISBN da contracapa do primeiro livro para começar.'}
          </p>
        </Cartao>
      ) : (
        <>
          <p className="mt-5 mb-[10px] text-[12.5px] text-tinta-2">
            {contagemDeObras(resultado.total, Boolean(termoLimpo))}
          </p>

          <ul className="grid gap-[9px] sm:grid-cols-2 xl:grid-cols-3">
            {resultado.itens.map((obra) => (
              <Cartao key={obra.id} como="li" semPadding>
                {/* O cartão inteiro é o link: no balcão a operadora está
                    de pé e com o livro na mão — alvo de clique pequeno
                    custa tempo de fila. */}
                <Link
                  href={`/painel/acervo/${obra.id}`}
                  className="flex gap-[13px] p-[14px] hover:bg-papel"
                >
                  {/* Lugar da capa. Fica reservado mesmo sem imagem para
                      a lista não pular de altura quando uma obra tem capa
                      e a vizinha não. */}
                  <span className="h-[62px] w-[44px] shrink-0 rounded-[2px] border border-linha-2 bg-papel-2" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-[15.5px] leading-[1.25] font-semibold text-tinta">
                      {obra.titulo}
                    </span>
                    {obra.autores.length > 0 && (
                      <span className="mt-[2px] block text-[12.5px] text-tinta-2">
                        {obra.autores.map((autor) => autor.nome).join('; ')}
                      </span>
                    )}
                    {/* Estoque é contagem de exemplares, nunca um número
                        digitado (spec §2.2) — e a frase e o tom saem do
                        kit, para nenhuma tela inventar o plural. */}
                    <span className="mt-[7px] flex">
                      <ChipDeContagem
                        disponiveis={obra.exemplaresDisponiveis}
                        total={obra.totalDeExemplares}
                      />
                    </span>
                  </span>
                </Link>
              </Cartao>
            ))}
          </ul>

          <Paginacao
            termo={termoLimpo}
            pagina={resultado.pagina}
            porPagina={resultado.porPagina}
            total={resultado.total}
          />
        </>
      )}
    </main>
  )
}

/**
 * A página pedida na URL.
 *
 * Só dígito conta: `Number('abc')` é `NaN`, e um `?? 1` por cima
 * transformaria URL torta em "primeira página" silenciosa. Devolver
 * `undefined` deixa o serviço aplicar o padrão dele, que é o único lugar
 * onde esse padrão está escrito.
 */
function paginaPedida(bruto: string | undefined): number | undefined {
  if (bruto === undefined || !/^\d+$/.test(bruto)) return undefined
  const numero = Number(bruto)
  return numero >= 1 ? numero : undefined
}

function contagemDeObras(total: number, comTermo: boolean): string {
  const quantidade = total.toLocaleString('pt-BR')
  if (comTermo) return total === 1 ? '1 obra encontrada' : `${quantidade} obras encontradas`
  return total === 1 ? '1 obra no acervo' : `${quantidade} obras no acervo`
}

/**
 * Ir e voltar uma página, com o termo preservado.
 *
 * Não é `<button>` nem JS: é `<Link>` para a mesma tela com outra query,
 * então a página 3 de "casmurro" é um endereço que a operadora pode
 * recarregar — e o histórico do navegador volta para onde ela estava.
 */
function Paginacao({
  termo,
  pagina,
  porPagina,
  total,
}: {
  termo: string | undefined
  pagina: number
  porPagina: number
  total: number
}) {
  const paginas = Math.ceil(total / porPagina)
  if (paginas <= 1) return null

  const termoNaUrl = termo === undefined ? '' : `termo=${encodeURIComponent(termo)}&`

  return (
    <nav aria-label="Páginas de resultados" className="mt-4 flex items-center gap-3">
      {pagina > 1 && (
        <Link
          href={`/painel/acervo?${termoNaUrl}pagina=${pagina - 1}`}
          className={estilosDeBotao('secundaria')}
        >
          Anteriores
        </Link>
      )}
      <span className="text-[12.5px] text-tinta-2">
        Página {pagina} de {paginas}
      </span>
      {pagina < paginas && (
        <Link
          href={`/painel/acervo?${termoNaUrl}pagina=${pagina + 1}`}
          className={estilosDeBotao('secundaria')}
        >
          Próximas
        </Link>
      )}
    </nav>
  )
}
