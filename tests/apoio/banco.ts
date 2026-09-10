import { beforeEach, afterAll } from 'vitest'
import { prisma } from '@/core/db/client'

// Ordem importa: filhos antes de pais, senão a FK reclama.
const TABELAS_EM_ORDEM = [
  'LogAuditoria',
  'TentativaLogin',
  'UsuarioPapel',
  'InventarioItem',
  'Inventario',
  'ObraAutor',
  'Exemplar',
  'Obra',
  'Autor',
  'Categoria',
  'Localizacao',
  'Aluno',
  'Turma',
  'AnoLetivo',
  'Papel',
  'Usuario',
  'Escola',
] as const

export async function limparBanco(): Promise<void> {
  const lista = TABELAS_EM_ORDEM.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`)
}

beforeEach(limparBanco)
afterAll(async () => {
  await prisma.$disconnect()
})
