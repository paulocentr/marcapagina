import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type {
  DadosDeTurmaParaGravar,
  RepositorioDeTurmas,
  TurmaNaLista,
  TurmaRegistrada,
} from '@/modules/leitores/turmas.service'

const CAMPOS = {
  id: true,
  nome: true,
  serie: true,
  turno: true,
  anoLetivoId: true,
} as const

/**
 * A turma com o ano letivo e a contagem de alunos ATIVOS.
 *
 * A contagem sai do banco como contagem, nunca de um campo "quantidade"
 * mantido à mão — mesmo princípio do estoque do acervo (spec §2.2). E ela
 * filtra por `ativo: true`: "27 alunos" ao lado de uma turma com três
 * evadidos faria a coordenação planejar rodada de carrinho para gente que
 * não está mais na escola.
 */
const CAMPOS_NA_LISTA = {
  ...CAMPOS,
  anoLetivo: { select: { ano: true, ativo: true } },
  _count: { select: { alunos: { where: { ativo: true } } } },
} satisfies Prisma.TurmaSelect

type LinhaNaLista = TurmaRegistrada & {
  anoLetivo: { ano: number; ativo: boolean }
  _count: { alunos: number }
}

function paraLista(linha: LinhaNaLista): TurmaNaLista {
  return {
    id: linha.id,
    nome: linha.nome,
    serie: linha.serie,
    turno: linha.turno,
    anoLetivoId: linha.anoLetivoId,
    ano: linha.anoLetivo.ano,
    anoLetivoAtivo: linha.anoLetivo.ativo,
    alunos: linha._count.alunos,
  }
}

export const turmasRepository: RepositorioDeTurmas = {
  async listar(filtro: { anoLetivoId?: string } = {}): Promise<TurmaNaLista[]> {
    const linhas = (await dbDoTenant().turma.findMany({
      where: filtro.anoLetivoId ? { anoLetivoId: filtro.anoLetivoId } : {},
      select: CAMPOS_NA_LISTA,
      // Ano decrescente e nome crescente: o ano corrente em cima, e
      // dentro dele as turmas na ordem em que a escola as lista.
      orderBy: [{ anoLetivo: { ano: 'desc' } }, { nome: 'asc' }],
    })) as unknown as LinhaNaLista[]

    return linhas.map(paraLista)
  },

  async obter(id: string): Promise<TurmaRegistrada | null> {
    return dbDoTenant().turma.findFirst({ where: { id }, select: CAMPOS })
  },

  async obterPorNome(anoLetivoId: string, nome: string): Promise<TurmaRegistrada | null> {
    // O índice único é (escolaId, anoLetivoId, nome); o escolaId entra
    // pela extensão de tenant, então a busca aqui é pelas outras duas
    // pontas — e turma homônima da escola vizinha não é achada.
    return dbDoTenant().turma.findFirst({ where: { anoLetivoId, nome }, select: CAMPOS })
  },

  async criar(dados: DadosDeTurmaParaGravar): Promise<TurmaRegistrada> {
    // Cast pelo mesmo motivo dos outros repositórios: o tipo gerado exige
    // escolaId, que a extensão de tenant injeta em runtime.
    return dbDoTenant().turma.create({
      data: dados as unknown as Prisma.TurmaCreateInput,
      select: CAMPOS,
    })
  },

  async atualizar(
    id: string,
    dados: Partial<DadosDeTurmaParaGravar>,
  ): Promise<TurmaRegistrada | null> {
    // `data` vazio não casa linha nenhuma no updateMany, e o count viria
    // 0 — a turma existente seria reportada como inexistente. Nesse caso
    // não há o que atualizar: basta confirmar que ela existe.
    if (Object.keys(dados).length === 0) {
      return dbDoTenant().turma.findFirst({ where: { id }, select: CAMPOS })
    }

    const { count } = await dbDoTenant().turma.updateMany({
      where: { id },
      data: dados as unknown as Prisma.TurmaUpdateManyMutationInput,
    })
    if (count === 0) return null

    return dbDoTenant().turma.findFirst({ where: { id }, select: CAMPOS })
  },

  async contarAlunos(id: string): Promise<number> {
    return dbDoTenant().aluno.count({ where: { turmaId: id, ativo: true } })
  },
}
