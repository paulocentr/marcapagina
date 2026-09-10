import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import {
  MatriculaEmUsoError,
  type AlunoRegistrado,
  type DadosDeAlunoParaGravar,
  type FichaDoAluno,
  type FiltroDeAlunos,
  type PaginaDeAlunos,
  type RepositorioDeAlunos,
} from '@/modules/leitores/alunos.service'

/**
 * O `select` que TODA leitura de aluno usa.
 *
 * Repare no que não está aqui: `dataNascimento`. Ela é a metade secreta
 * do login do aluno (decisão 3), e não pedi-la no `select` é mais forte
 * que filtrá-la depois — a coluna não sai do banco, então não existe
 * objeto intermediário de onde ela possa escapar para um log, para uma
 * serialização de Server Action ou para o payload de um componente de
 * cliente. A escrita a grava; nenhuma leitura desta camada a devolve.
 */
const CAMPOS = {
  id: true,
  matricula: true,
  nome: true,
  ativo: true,
  turma: { select: { id: true, nome: true, serie: true } },
} satisfies Prisma.AlunoSelect

const CAMPOS_DA_FICHA = {
  ...CAMPOS,
  responsavelNome: true,
  responsavelEmail: true,
  responsavelTelefone: true,
  /**
   * Os livros em mãos, contados pelo banco: `devolvidaEm IS NULL`.
   *
   * NÃO existe campo "atrasado" nem "quantidade em mãos" no schema
   * (Global Constraint 16) — um campo materializado mentiria todo dia em
   * que o cron falhasse, e mentiria na direção pior.
   */
  _count: { select: { emprestimos: { where: { devolvidaEm: null } } } },
} satisfies Prisma.AlunoSelect

type LinhaDaFicha = AlunoRegistrado & {
  responsavelNome: string | null
  responsavelEmail: string | null
  responsavelTelefone: string | null
  _count: { emprestimos: number }
}

/**
 * A data de nascimento para o banco.
 *
 * O `T00:00:00.000Z` não é enfeite: a coluna é `@db.Date` e, sem a hora
 * em UTC, `new Date('2012-03-15')` lido em São Paulo já nasceria como 14
 * de março — e o aluno não conseguiria entrar no portal com a data que
 * sabe de cor. É o mesmo carimbo que o importador aplica
 * (`alunos-importacao.repository.ts`), de propósito: os dois caminhos de
 * cadastro têm de gravar o mesmo dia para a mesma entrada.
 */
function dataParaBanco(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function paraGravar(dados: Partial<DadosDeAlunoParaGravar>): Record<string, unknown> {
  const linha: Record<string, unknown> = {}

  if (dados.matricula !== undefined) linha.matricula = dados.matricula
  if (dados.nome !== undefined) linha.nome = dados.nome
  if (dados.dataNascimento !== undefined) {
    linha.dataNascimento = dataParaBanco(dados.dataNascimento)
  }
  if (dados.turmaId !== undefined) linha.turmaId = dados.turmaId
  if (dados.responsavelNome !== undefined) linha.responsavelNome = dados.responsavelNome
  if (dados.responsavelEmail !== undefined) linha.responsavelEmail = dados.responsavelEmail
  if (dados.responsavelTelefone !== undefined) {
    linha.responsavelTelefone = dados.responsavelTelefone
  }

  return linha
}

/**
 * O erro do índice único `escolaId_matricula`, virado mensagem em pt-BR.
 *
 * Existe porque a checagem prévia do serviço tem uma janela: duas
 * operadoras cadastrando a mesma matrícula ao mesmo tempo passam as duas
 * por ela, e o índice único do banco é o único guarda que resta. Sem esta
 * tradução, o que apareceria na tela da operadora é
 * "Unique constraint failed on the fields: (`escolaId`,`matricula`)" —
 * uma frase que não diz o que fazer e não está no idioma dela.
 *
 * O código é lido por propriedade em vez de `instanceof
 * PrismaClientKnownRequestError` para não trazer o runtime do Prisma para
 * dentro do módulo; `P2002` é violação de restrição única.
 */
function ehColisaoDeUnico(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code: unknown }).code === 'P2002'
  )
}

export const alunosRepository: RepositorioDeAlunos = {
  async buscar(filtro: FiltroDeAlunos): Promise<PaginaDeAlunos> {
    const pagina = filtro.pagina === undefined ? 1 : filtro.pagina
    const porPagina = filtro.porPagina === undefined ? 20 : filtro.porPagina

    const where: Prisma.AlunoWhereInput = {}

    if (filtro.apenasAtivos === true) where.ativo = true
    // `semTurma` e `turmaId` são perguntas diferentes: a primeira é a
    // lista que a coordenação precisa no começo do ano (quem entrou pela
    // planilha e ainda não foi para uma turma).
    if (filtro.semTurma === true) where.turmaId = null
    else if (filtro.turmaId !== undefined) where.turmaId = filtro.turmaId

    if (filtro.termo !== undefined) {
      // Nome OU matrícula, porque a operadora digita o que tem na mão: o
      // nome que o aluno falou ou o número da carteirinha.
      //
      // `mode: 'insensitive'` cobre a caixa. NÃO cobre acento: `Aluno`
      // não tem coluna normalizada como `Obra.tituloNormalizado`, e
      // criar uma exigiria migração. Então "jose" NÃO acha "José" — está
      // documentado aqui e dito na tela, em vez de prometido e falso.
      where.OR = [
        { nome: { contains: filtro.termo, mode: 'insensitive' } },
        { matricula: { contains: filtro.termo } },
      ]
    }

    const [linhas, total] = await Promise.all([
      dbDoTenant().aluno.findMany({
        where,
        select: CAMPOS,
        // Ordem de nome: a operadora procura com o dedo na tela, e ordem
        // de inserção faria a lista mudar de forma a cada cadastro.
        orderBy: { nome: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      dbDoTenant().aluno.count({ where }),
    ])

    return { itens: linhas as AlunoRegistrado[], total, pagina, porPagina }
  },

  async obter(id: string): Promise<FichaDoAluno | null> {
    const linha = (await dbDoTenant().aluno.findFirst({
      where: { id },
      select: CAMPOS_DA_FICHA,
    })) as LinhaDaFicha | null

    if (!linha) return null

    return {
      id: linha.id,
      matricula: linha.matricula,
      nome: linha.nome,
      ativo: linha.ativo,
      turma: linha.turma,
      responsavelNome: linha.responsavelNome,
      responsavelEmail: linha.responsavelEmail,
      responsavelTelefone: linha.responsavelTelefone,
      livrosEmMaos: linha._count.emprestimos,
    }
  },

  async obterPorMatricula(matricula: string): Promise<{ id: string; nome: string } | null> {
    // Sem filtro por `ativo`: matrícula de aluno desativado continua
    // ocupada, porque o índice único do banco não sabe de `ativo`.
    // Filtrar aqui liberaria a matrícula e o banco recusaria depois, com
    // uma mensagem que a operadora não entenderia.
    return dbDoTenant().aluno.findFirst({
      where: { matricula },
      select: { id: true, nome: true },
    })
  },

  async criar(dados: DadosDeAlunoParaGravar): Promise<AlunoRegistrado> {
    try {
      // Cast pelo mesmo motivo dos outros repositórios: o tipo gerado
      // exige escolaId, que a extensão de tenant injeta em runtime.
      return (await dbDoTenant().aluno.create({
        data: paraGravar(dados) as unknown as Prisma.AlunoCreateInput,
        select: CAMPOS,
      })) as AlunoRegistrado
    } catch (erro) {
      if (ehColisaoDeUnico(erro)) throw new MatriculaEmUsoError(dados.matricula, null)
      throw erro
    }
  },

  async atualizar(
    id: string,
    dados: Partial<DadosDeAlunoParaGravar>,
  ): Promise<AlunoRegistrado | null> {
    const linha = paraGravar(dados)

    // `data` vazio não casa linha nenhuma no updateMany, e o count viria
    // 0 — o aluno existente seria reportado como inexistente. Nesse caso
    // não há o que atualizar: basta confirmar que ele existe.
    if (Object.keys(linha).length === 0) {
      return (await dbDoTenant().aluno.findFirst({
        where: { id },
        select: CAMPOS,
      })) as AlunoRegistrado | null
    }

    try {
      // updateMany e não update: a extensão converte um no outro de
      // qualquer forma, e assim um id de outra escola simplesmente não
      // casa em vez de estourar. O count é o que diz se achou.
      const { count } = await dbDoTenant().aluno.updateMany({
        where: { id },
        data: linha as unknown as Prisma.AlunoUpdateManyMutationInput,
      })
      if (count === 0) return null
    } catch (erro) {
      if (ehColisaoDeUnico(erro) && dados.matricula !== undefined) {
        throw new MatriculaEmUsoError(dados.matricula, null)
      }
      throw erro
    }

    return (await dbDoTenant().aluno.findFirst({
      where: { id },
      select: CAMPOS,
    })) as AlunoRegistrado | null
  },

  async definirAtivo(id: string, ativo: boolean): Promise<AlunoRegistrado | null> {
    const { count } = await dbDoTenant().aluno.updateMany({ where: { id }, data: { ativo } })
    if (count === 0) return null

    return (await dbDoTenant().aluno.findFirst({
      where: { id },
      select: CAMPOS,
    })) as AlunoRegistrado | null
  },

  async contarLivrosEmMaos(id: string): Promise<number> {
    // "Em mãos" é `devolvidaEm IS NULL`, calculado — nunca um campo
    // materializado (Global Constraint 16). Contar o histórico inteiro
    // faria o aviso de desativação aparecer para todo aluno que já leu
    // qualquer coisa na vida.
    return dbDoTenant().emprestimo.count({ where: { alunoId: id, devolvidaEm: null } })
  },
}
