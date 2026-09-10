import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type {
  RepositorioDeAlunosParaImportacao,
  AlunoParaImportar,
} from '@/modules/importacao/plano-alunos'

export const alunosImportacaoRepository: RepositorioDeAlunosParaImportacao = {
  async matriculasExistentes(matriculas: string[]): Promise<Set<string>> {
    if (matriculas.length === 0) return new Set()

    // Uma consulta para todas as matrículas. Uma por linha transformaria
    // uma planilha de 400 alunos em 400 idas ao banco.
    const achados = await dbDoTenant().aluno.findMany({
      where: { matricula: { in: matriculas } },
      select: { matricula: true },
    })

    return new Set(achados.map((a) => a.matricula))
  },

  async gravarMuitos(alunos: AlunoParaImportar[]): Promise<void> {
    if (alunos.length === 0) return

    await dbDoTenant().aluno.createMany({
      data: alunos.map((aluno) => ({
        matricula: aluno.matricula,
        nome: aluno.nome,
        // A coluna é @db.Date; o T00:00:00Z evita que o fuso do servidor
        // desloque o dia — em São Paulo, `new Date('2012-03-15')` sem
        // hora já nasceria como 14 de março para quem lê em local time.
        dataNascimento: new Date(`${aluno.dataNascimento}T00:00:00.000Z`),
        responsavelNome: aluno.responsavelNome ?? null,
        responsavelEmail: aluno.responsavelEmail ?? null,
        responsavelTelefone: aluno.responsavelTelefone ?? null,
      })) as unknown as Prisma.AlunoCreateManyInput[],
    })
  },
}
