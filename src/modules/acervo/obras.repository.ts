import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type {
  RepositorioDeObras,
  ObraRegistrada,
  ObraComDetalhes,
  DadosDeObraParaGravar,
  FiltroDeBusca,
  PaginaDeObras,
} from '@/modules/acervo/obras.service'

const CAMPOS: Prisma.ObraSelect = {
  id: true,
  titulo: true,
  subtitulo: true,
  editora: true,
  anoPublicacao: true,
  isbn: true,
  edicao: true,
  idioma: true,
  numeroDePaginas: true,
  sinopse: true,
  capaUrl: true,
  cdd: true,
  faixaEtaria: true,
  categoriaId: true,
}

// Autores vêm na ordem da capa, e as contagens de exemplar saem do banco
// como contagem — nunca de um campo "quantidade" mantido à mão, que é
// exatamente o que a spec §2.2 rejeitou.
const CAMPOS_COM_DETALHES = {
  ...CAMPOS,
  autores: {
    select: { autor: { select: { id: true, nome: true } } },
    orderBy: { ordem: 'asc' },
  },
  _count: {
    select: {
      exemplares: true,
    },
  },
} satisfies Prisma.ObraSelect

type LinhaComDetalhes = ObraRegistrada & {
  autores: { autor: { id: string; nome: string } }[]
  _count: { exemplares: number }
}

async function montarDetalhes(linhas: LinhaComDetalhes[]): Promise<ObraComDetalhes[]> {
  if (linhas.length === 0) return []

  // A contagem de DISPONIVEL sai numa consulta agrupada só, em vez de uma
  // por obra: a tela de busca mostra 20 fichas e N+1 aqui apareceria como
  // lentidão sem causa aparente.
  const disponiveis = await dbDoTenant().exemplar.groupBy({
    by: ['obraId'],
    where: { obraId: { in: linhas.map((l) => l.id) }, situacao: 'DISPONIVEL' },
    _count: { _all: true },
  })
  const porObra = new Map(disponiveis.map((d) => [d.obraId, d._count._all]))

  return linhas.map(({ autores, _count, ...obra }) => ({
    ...obra,
    autores: autores.map((v) => v.autor),
    totalDeExemplares: _count.exemplares,
    exemplaresDisponiveis: porObra.get(obra.id) ?? 0,
  }))
}

export const obrasRepository: RepositorioDeObras = {
  async criar(dados: DadosDeObraParaGravar): Promise<ObraRegistrada> {
    // Cast pelo mesmo motivo documentado em audit.repository.ts: o tipo
    // gerado exige escolaId, que a extensão de tenant injeta em runtime.
    return dbDoTenant().obra.create({
      data: dados as unknown as Prisma.ObraCreateInput,
      select: CAMPOS,
    }) as unknown as Promise<ObraRegistrada>
  },

  async atualizar(
    id: string,
    dados: Partial<DadosDeObraParaGravar>,
  ): Promise<ObraRegistrada | null> {
    // Editar SÓ a autoria não altera campo nenhum da obra, e um
    // `updateMany` com data vazio não casa linha nenhuma — o count viria
    // 0 e a obra existente seria reportada como inexistente. Nesse caso
    // não há o que atualizar: basta confirmar que ela existe.
    if (Object.keys(dados).length === 0) {
      return dbDoTenant().obra.findFirst({
        where: { id },
        select: CAMPOS,
      }) as unknown as Promise<ObraRegistrada | null>
    }

    // updateMany e não update: a extensão converte um para o outro de
    // qualquer forma, e assim id de outra escola não casa em vez de
    // estourar. O count diz se achou — é ele que vira ObraInexistente.
    const { count } = await dbDoTenant().obra.updateMany({
      where: { id },
      data: dados as unknown as Prisma.ObraUpdateManyMutationInput,
    })
    if (count === 0) return null

    return dbDoTenant().obra.findFirst({
      where: { id },
      select: CAMPOS,
    }) as unknown as Promise<ObraRegistrada | null>
  },

  async obter(id: string): Promise<ObraComDetalhes | null> {
    const linha = (await dbDoTenant().obra.findFirst({
      where: { id },
      select: CAMPOS_COM_DETALHES,
    })) as LinhaComDetalhes | null

    if (!linha) return null
    const [detalhada] = await montarDetalhes([linha])
    return detalhada ?? null
  },

  async buscar(filtro: FiltroDeBusca & { termoNormalizado?: string }): Promise<PaginaDeObras> {
    const pagina = filtro.pagina ?? 1
    const porPagina = filtro.porPagina ?? 20

    const where: Prisma.ObraWhereInput = {
      ...(filtro.termoNormalizado
        ? { tituloNormalizado: { contains: filtro.termoNormalizado } }
        : {}),
      ...(filtro.isbn ? { isbn: filtro.isbn } : {}),
      ...(filtro.categoriaId ? { categoriaId: filtro.categoriaId } : {}),
    }

    const [linhas, total] = await Promise.all([
      dbDoTenant().obra.findMany({
        where,
        select: CAMPOS_COM_DETALHES,
        orderBy: { tituloNormalizado: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }) as unknown as Promise<LinhaComDetalhes[]>,
      dbDoTenant().obra.count({ where }),
    ])

    return { itens: await montarDetalhes(linhas), total, pagina, porPagina }
  },

  async definirAutores(obraId: string, autorIds: string[]): Promise<void> {
    // ObraAutor não é escopado por tenant (é junção, escopada pelas
    // pontas), então aqui o filtro por obraId é o que garante o
    // isolamento — e obraId já veio de uma consulta escopada.
    await dbDoTenant().$transaction(async (tx) => {
      await tx.obraAutor.deleteMany({ where: { obraId } })
      if (autorIds.length === 0) return
      await tx.obraAutor.createMany({
        data: autorIds.map((autorId, ordem) => ({ obraId, autorId, ordem })),
      })
    })
  },

  async contarExemplares(obraId: string): Promise<number> {
    return dbDoTenant().exemplar.count({ where: { obraId } })
  },

  async excluir(id: string): Promise<void> {
    await dbDoTenant().obra.deleteMany({ where: { id } })
  },
}
