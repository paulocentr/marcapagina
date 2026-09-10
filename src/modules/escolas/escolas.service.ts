import { dbDoTenant } from '@/core/db/tenant-extension'
import { prisma } from '@/core/db/client'

/**
 * As escolas que os jobs de manutenção precisam varrer.
 *
 * Sai pelo cliente CRU, não pelo `dbDoTenant()`: quem chama é o cron, que
 * acorda FORA de qualquer tenant — é justamente a lista que ele usa para
 * entrar em um de cada vez. Escola é a raiz do tenant e o único modelo
 * sem `escolaId`, então não há escopo a aplicar aqui.
 *
 * Inativa fica de fora: escola desligada não deve ter reserva expirando
 * nem e-mail saindo em nome dela.
 */
export function listarEscolasAtivas(): Promise<{ id: string; slug: string }[]> {
  return prisma.escola.findMany({
    where: { ativa: true },
    select: { id: true, slug: true },
    orderBy: { slug: 'asc' },
  })
}

// Versão do formato: um backup restaurado meses depois, quando o schema
// já mudou, precisa dizer de que época ele é. Incrementar sempre que a
// forma do pacote mudar de maneira incompatível.
const VERSAO_DO_FORMATO = 1

export interface PacoteDeExportacao {
  versaoDoFormato: number
  exportadoEm: string
  usuarios: unknown[]
  papeis: unknown[]
  anosLetivos: unknown[]
  turmas: unknown[]
  alunos: { nome: string }[]
}

// O free tier do Neon não dá retenção longa (spec §8.4). O acervo
// catalogado à mão é o ativo mais caro do projeto e não pode depender do
// free tier de ninguém.
export async function exportarEscola(): Promise<PacoteDeExportacao> {
  const db = dbDoTenant()

  const [usuarios, papeis, anosLetivos, turmas, alunos] = await Promise.all([
    // senhaHash fica de fora: um backup não precisa carregar credencial.
    db.usuario.findMany({
      select: { id: true, nome: true, email: true, ativo: true, criadoEm: true },
    }),
    db.papel.findMany(),
    db.anoLetivo.findMany(),
    db.turma.findMany(),
    db.aluno.findMany(),
  ])

  return {
    versaoDoFormato: VERSAO_DO_FORMATO,
    exportadoEm: new Date().toISOString(),
    usuarios,
    papeis,
    anosLetivos,
    turmas,
    alunos,
  }
}
