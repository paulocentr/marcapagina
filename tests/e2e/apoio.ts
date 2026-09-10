import { prisma } from '@/core/db/client'

/**
 * Limpa só o acervo, preservando escola, usuário e aluno da seed.
 *
 * Os testes de catalogação bipam o MESMO ISBN de propósito — é assim que
 * se verifica o aviso de obra repetida. Sem limpar entre um teste e outro,
 * o segundo já encontraria a obra do primeiro e o aviso apareceria onde
 * não devia, transformando isolamento ruim em falha misteriosa.
 */
export async function limparAcervo(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "ObraAutor", "Exemplar", "Obra", "Autor" RESTART IDENTITY CASCADE',
  )
}
