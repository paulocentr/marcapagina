import { PrismaClient } from '@prisma/client'

// ÚNICO lugar do sistema que instancia PrismaClient (Global Constraint 2).
// O teste de arquitetura da Tarefa 11 reprova qualquer outro.
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalParaPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalParaPrisma.prisma = prisma
