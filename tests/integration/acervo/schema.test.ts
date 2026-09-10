import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'

let escolaA = ''
let escolaB = ''

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id
})

async function criarObra(escolaId: string, titulo: string, isbn?: string) {
  return prisma.obra.create({
    data: { escolaId, titulo, tituloNormalizado: titulo.toLowerCase(), isbn: isbn ?? null },
  })
}

describe('schema do acervo', () => {
  it('permite o mesmo tombo em escolas diferentes', async () => {
    const obraA = await criarObra(escolaA, 'Dom Casmurro')
    const obraB = await criarObra(escolaB, 'Dom Casmurro')

    await prisma.exemplar.create({ data: { escolaId: escolaA, obraId: obraA.id, tombo: '000001' } })
    const segundo = await prisma.exemplar.create({
      data: { escolaId: escolaB, obraId: obraB.id, tombo: '000001' },
    })

    expect(segundo.tombo).toBe('000001')
  })

  it('impede tombo duplicado dentro da mesma escola', async () => {
    const obra = await criarObra(escolaA, 'Dom Casmurro')
    await prisma.exemplar.create({ data: { escolaId: escolaA, obraId: obra.id, tombo: '000001' } })

    await expect(
      prisma.exemplar.create({ data: { escolaId: escolaA, obraId: obra.id, tombo: '000001' } }),
    ).rejects.toThrow()
  })

  it('permite duas obras com o mesmo ISBN na mesma escola', async () => {
    // Edições diferentes compartilham ISBN mais do que se imagina, e um
    // acervo escolar recebe doações repetidas. Unicidade de ISBN viraria
    // recusa de cadastro legítimo no meio de uma sessão em série — o pior
    // momento possível para o sistema dizer não sem explicação.
    await criarObra(escolaA, 'Dom Casmurro', '9788535902778')
    const segunda = await criarObra(escolaA, 'Dom Casmurro (edição escolar)', '9788535902778')

    expect(segunda.isbn).toBe('9788535902778')
  })

  it('categoria aponta para categoria-mãe', async () => {
    const mae = await prisma.categoria.create({ data: { escolaId: escolaA, nome: 'Literatura' } })
    const filha = await prisma.categoria.create({
      data: { escolaId: escolaA, nome: 'Infantojuvenil', parentId: mae.id },
    })

    const comFilhas = await prisma.categoria.findUniqueOrThrow({
      where: { id: mae.id },
      include: { filhas: true },
    })

    expect(comFilhas.filhas.map((f) => f.id)).toEqual([filha.id])
  })

  it('excluir obra com exemplar é recusado pelo banco', async () => {
    // Exemplar órfão é acervo perdido silenciosamente.
    const obra = await criarObra(escolaA, 'Dom Casmurro')
    await prisma.exemplar.create({ data: { escolaId: escolaA, obraId: obra.id, tombo: '000001' } })

    await expect(prisma.obra.delete({ where: { id: obra.id } })).rejects.toThrow()
  })

  it('autor é único por nome normalizado dentro da escola', async () => {
    await prisma.autor.create({
      data: { escolaId: escolaA, nome: 'Machado de Assis', nomeNormalizado: 'machado de assis' },
    })

    await expect(
      prisma.autor.create({
        data: { escolaId: escolaA, nome: 'MACHADO DE ASSIS', nomeNormalizado: 'machado de assis' },
      }),
    ).rejects.toThrow()
  })

  it('a mesma pessoa pode existir em escolas diferentes', async () => {
    await prisma.autor.create({
      data: { escolaId: escolaA, nome: 'Machado de Assis', nomeNormalizado: 'machado de assis' },
    })
    const naOutra = await prisma.autor.create({
      data: { escolaId: escolaB, nome: 'Machado de Assis', nomeNormalizado: 'machado de assis' },
    })

    expect(naOutra.escolaId).toBe(escolaB)
  })
})
