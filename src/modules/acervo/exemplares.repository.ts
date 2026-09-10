import { dbDoTenant, executarEmTransacao } from '@/core/db/tenant-extension'
import { tenantAtual } from '@/core/tenant/context'
import type { Prisma } from '@prisma/client'
import type {
  RepositorioDeExemplares,
  ExemplarRegistrado,
  DadosParaCriarExemplares,
  SituacaoDoExemplar,
} from '@/modules/acervo/exemplares.service'

const CAMPOS = {
  id: true,
  obraId: true,
  tombo: true,
  estado: true,
  situacao: true,
  localizacaoId: true,
  origem: true,
  observacao: true,
} as const

const LARGURA_DO_TOMBO = 6

const SITUACOES: SituacaoDoExemplar[] = [
  'DISPONIVEL',
  'EMPRESTADO',
  'RESERVADO',
  'EM_CARRINHO',
  'EM_MANUTENCAO',
  'EXTRAVIADO',
  'BAIXADO',
]

export const exemplaresRepository: RepositorioDeExemplares = {
  async criarSequencial(dados: DadosParaCriarExemplares): Promise<ExemplarRegistrado[]> {
    const escolaId = tenantAtual()

    // Transação com trava consultiva: duas operadoras catalogando ao mesmo
    // tempo é o caso NORMAL numa biblioteca com dois computadores. Sem a
    // trava, as duas leem o mesmo máximo, geram os mesmos tombos e a
    // segunda gravação estoura no índice único — no meio de uma sessão em
    // série, que é exatamente quando ninguém tem paciência.
    //
    // A trava é liberada no fim da transação, sem cleanup manual, e a
    // chave sai do escolaId: escolas diferentes catalogam em paralelo sem
    // esperar uma pela outra.
    // Reentrante: quando a catalogação já abriu uma transação, esta roda
    // dentro dela — obra e exemplares vivem ou morrem juntos. Chamado
    // sozinho, abre a sua própria.
    return executarEmTransacao(async () => {
      // Pelo cliente da transação corrente: a trava só vale se for
      // adquirida DENTRO da mesma transação que grava os tombos.
      const db = dbDoTenant()
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${escolaId}))`

      // SQL cru NÃO passa pela extensão de tenant, então o escolaId entra
      // aqui explicitamente — e vem de tenantAtual(), nunca do cliente
      // (Global Constraint 3). O filtro por tombo numérico existe porque
      // acervo importado pode trazer tombo alfanumérico, e um CAST cego
      // sobre ele derrubaria a consulta.
      const [linha] = await db.$queryRaw<{ maximo: number }[]>`
        SELECT COALESCE(MAX(CAST(tombo AS BIGINT)), 0)::int AS maximo
        FROM "Exemplar"
        WHERE "escolaId" = ${escolaId} AND tombo ~ '^[0-9]+$'
      `
      const proximo = (linha?.maximo ?? 0) + 1

      const aCriar: Prisma.ExemplarCreateManyInput[] = Array.from(
        { length: dados.quantidade },
        (_, i) => ({
          escolaId,
          obraId: dados.obraId,
          tombo: String(proximo + i).padStart(LARGURA_DO_TOMBO, '0'),
          estado: dados.estado ?? 'BOM',
          // Nasce DISPONIVEL: estoque é contagem de disponíveis (spec
          // §2.2), e nascer em outra situação faria o livro novo não
          // aparecer no acervo.
          situacao: 'DISPONIVEL',
          localizacaoId: dados.localizacaoId ?? null,
          origem: dados.origem ?? 'COMPRA',
          dataDeAquisicao: dados.dataDeAquisicao ?? null,
          valorDeAquisicao: dados.valorDeAquisicao ?? null,
        }),
      )

      // Pela extensão de tenant (que enxerga a transação corrente), não
      // pelo tx cru: assim o escolaId continua sendo carimbado pelo mesmo
      // caminho de sempre, em vez de por uma exceção só deste arquivo.
      return dbDoTenant().exemplar.createManyAndReturn({
        data: aCriar,
        select: CAMPOS,
      }) as unknown as Promise<ExemplarRegistrado[]>
    })
  },

  async obter(exemplarId: string): Promise<ExemplarRegistrado | null> {
    return dbDoTenant().exemplar.findFirst({
      where: { id: exemplarId },
      select: CAMPOS,
    }) as unknown as Promise<ExemplarRegistrado | null>
  },

  async listarDaObra(obraId: string): Promise<ExemplarRegistrado[]> {
    return dbDoTenant().exemplar.findMany({
      where: { obraId },
      select: CAMPOS,
      orderBy: { tombo: 'asc' },
    }) as unknown as Promise<ExemplarRegistrado[]>
  },

  async obterPorTombo(tombo: string): Promise<ExemplarRegistrado | null> {
    return dbDoTenant().exemplar.findFirst({
      where: { tombo },
      select: CAMPOS,
    }) as unknown as Promise<ExemplarRegistrado | null>
  },

  async atualizarSituacao(
    exemplarId: string,
    situacao: SituacaoDoExemplar,
    observacao: string,
  ): Promise<ExemplarRegistrado | null> {
    const { count } = await dbDoTenant().exemplar.updateMany({
      where: { id: exemplarId },
      data: { situacao, observacao },
    })
    if (count === 0) return null

    return dbDoTenant().exemplar.findFirst({
      where: { id: exemplarId },
      select: CAMPOS,
    }) as unknown as Promise<ExemplarRegistrado | null>
  },

  async contarPorSituacao(obraId: string): Promise<Record<SituacaoDoExemplar, number>> {
    const agrupado = await dbDoTenant().exemplar.groupBy({
      by: ['situacao'],
      where: { obraId },
      _count: { _all: true },
    })

    // Começa zerado em TODAS as situações: devolver só as que têm registro
    // obrigaria cada chamador a lembrar do `?? 0`, e a Global Constraint 9
    // proíbe exatamente esse tipo de zero implícito espalhado pelo código.
    const contagem = Object.fromEntries(SITUACOES.map((s) => [s, 0])) as Record<
      SituacaoDoExemplar,
      number
    >
    for (const linha of agrupado) {
      contagem[linha.situacao as SituacaoDoExemplar] = linha._count._all
    }
    return contagem
  },
}
