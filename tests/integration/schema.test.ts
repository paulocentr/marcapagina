import { describe, it, expect } from 'vitest'
import { prisma } from '@/core/db/client'

describe('schema da fundação', () => {
  it('cria uma escola e impede slug duplicado', async () => {
    await prisma.escola.create({ data: { slug: 'escola-a', nome: 'Escola A' } })

    await expect(
      prisma.escola.create({ data: { slug: 'escola-a', nome: 'Outra' } }),
    ).rejects.toThrow()
  })

  it('permite a mesma matrícula em escolas diferentes', async () => {
    const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
    const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })

    await prisma.aluno.create({
      data: { escolaId: a.id, matricula: '2024001', nome: 'Ana', dataNascimento: new Date('2012-03-01') },
    })
    const segundo = await prisma.aluno.create({
      data: { escolaId: b.id, matricula: '2024001', nome: 'Bruno', dataNascimento: new Date('2011-07-20') },
    })

    expect(segundo.matricula).toBe('2024001')
  })

  it('impede matrícula duplicada dentro da mesma escola', async () => {
    const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
    await prisma.aluno.create({
      data: { escolaId: a.id, matricula: '2024001', nome: 'Ana', dataNascimento: new Date('2012-03-01') },
    })

    await expect(
      prisma.aluno.create({
        data: { escolaId: a.id, matricula: '2024001', nome: 'Clone', dataNascimento: new Date('2012-03-01') },
      }),
    ).rejects.toThrow()
  })
})
