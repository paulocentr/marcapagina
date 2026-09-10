import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant, tenantAtual } from '@/core/tenant/context'
import { dbDoTenant } from '@/core/db/tenant-extension'
import { SemTenantError } from '@/core/errors'

let escolaA = ''
let escolaB = ''

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'Escola A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'Escola B' } })
  escolaA = a.id
  escolaB = b.id

  await prisma.aluno.createMany({
    data: [
      { escolaId: a.id, matricula: '1', nome: 'Ana da Escola A', dataNascimento: new Date('2012-01-01') },
      { escolaId: b.id, matricula: '1', nome: 'Bruno da Escola B', dataNascimento: new Date('2012-01-01') },
    ],
  })
})

describe('isolamento entre tenants', () => {
  it('findMany só enxerga o tenant corrente', async () => {
    const vistos = await executarComTenant(escolaA, () => dbDoTenant().aluno.findMany())

    expect(vistos).toHaveLength(1)
    expect(vistos[0]?.nome).toBe('Ana da Escola A')
  })

  it('findFirst não alcança registro de outro tenant nem quando o filtro pede', async () => {
    // Simula exatamente o ataque: alguém passa o escolaId do vizinho.
    const achado = await executarComTenant(escolaA, () =>
      dbDoTenant().aluno.findFirst({ where: { escolaId: escolaB } }),
    )

    expect(achado).toBeNull()
  })

  it('findUnique por chave composta não vaza entre tenants', async () => {
    const achado = await executarComTenant(escolaA, () =>
      dbDoTenant().aluno.findUnique({
        where: { escolaId_matricula: { escolaId: escolaB, matricula: '1' } },
      }),
    )

    expect(achado).toBeNull()
  })

  it('create carimba o tenant corrente, ignorando escolaId recebido', async () => {
    const criado = await executarComTenant(escolaA, () =>
      dbDoTenant().aluno.create({
        data: {
          escolaId: escolaB, // tentativa de gravar no vizinho
          matricula: '99',
          nome: 'Intruso',
          dataNascimento: new Date('2010-01-01'),
        },
      }),
    )

    expect(criado.escolaId).toBe(escolaA)
  })

  it('update não alcança registro de outro tenant', async () => {
    const resultado = await executarComTenant(escolaA, () =>
      dbDoTenant().aluno.updateMany({
        where: { matricula: '1' },
        data: { nome: 'Renomeado' },
      }),
    )

    expect(resultado.count).toBe(1)
    const bruno = await prisma.aluno.findFirst({ where: { escolaId: escolaB } })
    expect(bruno?.nome).toBe('Bruno da Escola B')
  })

  it('delete não alcança registro de outro tenant', async () => {
    await executarComTenant(escolaA, () => dbDoTenant().aluno.deleteMany({ where: {} }))

    const restantes = await prisma.aluno.findMany()
    expect(restantes).toHaveLength(1)
    expect(restantes[0]?.escolaId).toBe(escolaB)
  })

  it('count respeita o tenant', async () => {
    const total = await executarComTenant(escolaA, () => dbDoTenant().aluno.count())
    expect(total).toBe(1)
  })

  it('Escola não é escopada — é a raiz do tenant', async () => {
    const todas = await executarComTenant(escolaA, () => dbDoTenant().escola.findMany())
    expect(todas).toHaveLength(2)
  })

  it('upsert não sobrescreve registro de outro tenant: cria no próprio', async () => {
    // O aluno de matrícula "1" existe nas duas escolas. Um upsert feito
    // pela escola A apontando para a chave da escola B não pode editar o
    // registro do vizinho — tem que criar o seu.
    await executarComTenant(escolaA, () =>
      dbDoTenant().aluno.upsert({
        where: { escolaId_matricula: { escolaId: escolaB, matricula: '1' } },
        update: { nome: 'Sequestrado' },
        create: {
          escolaId: escolaB,
          matricula: '2',
          nome: 'Criado por A',
          dataNascimento: new Date('2010-01-01'),
        },
      }),
    )

    const bruno = await prisma.aluno.findFirst({ where: { escolaId: escolaB, matricula: '1' } })
    expect(bruno?.nome).toBe('Bruno da Escola B')

    const criado = await prisma.aluno.findFirst({ where: { matricula: '2' } })
    expect(criado?.escolaId).toBe(escolaA)
  })

  it('update não consegue mudar o dono: escolaId no data é ignorado', async () => {
    // Sem esta guarda, quem pode editar o próprio registro pode EMPURRÁ-LO
    // para outra escola — entregando o dado ao vizinho pela porta da frente.
    await executarComTenant(escolaA, () =>
      dbDoTenant().aluno.updateMany({
        where: { matricula: '1' },
        data: { escolaId: escolaB, nome: 'Mudou de escola' },
      }),
    )

    const daEscolaA = await prisma.aluno.findMany({ where: { escolaId: escolaA } })
    expect(daEscolaA).toHaveLength(1)
    expect(daEscolaA[0]?.nome).toBe('Mudou de escola')

    const daEscolaB = await prisma.aluno.findMany({ where: { escolaId: escolaB } })
    expect(daEscolaB).toHaveLength(1)
    expect(daEscolaB[0]?.nome).toBe('Bruno da Escola B')
  })

  it('upsert não consegue mudar o dono pelo ramo de update', async () => {
    await executarComTenant(escolaA, () =>
      dbDoTenant().aluno.upsert({
        where: { escolaId_matricula: { escolaId: escolaA, matricula: '1' } },
        update: { escolaId: escolaB },
        create: { escolaId: escolaA, matricula: '1', nome: 'X', dataNascimento: new Date('2010-01-01') },
      }),
    )

    const ana = await prisma.aluno.findFirst({ where: { nome: 'Ana da Escola A' } })
    expect(ana?.escolaId).toBe(escolaA)
  })

  it('updateManyAndReturn não alcança registro de outro tenant', async () => {
    // A variante *AndReturn é uma operação à parte no Prisma. Se a extensão
    // não a tratar, ela escapa sem filtro e edita o banco inteiro.
    const devolvidos = await executarComTenant(escolaA, () =>
      dbDoTenant().aluno.updateManyAndReturn({
        where: {},
        data: { nome: 'Renomeado em massa' },
      }),
    )

    expect(devolvidos).toHaveLength(1)
    const bruno = await prisma.aluno.findFirst({ where: { escolaId: escolaB } })
    expect(bruno?.nome).toBe('Bruno da Escola B')
  })

  it('createManyAndReturn carimba o tenant corrente', async () => {
    const criados = await executarComTenant(escolaA, () =>
      dbDoTenant().aluno.createManyAndReturn({
        data: [
          { escolaId: escolaB, matricula: '77', nome: 'Intruso', dataNascimento: new Date('2010-01-01') },
        ],
      }),
    )

    expect(criados[0]?.escolaId).toBe(escolaA)
  })

  it('operação não prevista pela extensão falha em vez de passar sem filtro', async () => {
    // Fail-closed: uma operação que a extensão não sabe escopar tem que
    // parar a chamada. Deixar passar transformaria cada versão nova do
    // Prisma numa porta de vazamento aberta em silêncio.
    await expect(
      executarComTenant(escolaA, async () => {
        const db = dbDoTenant() as unknown as {
          aluno: { operacaoInventada: (args: unknown) => Promise<unknown> }
        }
        return db.aluno.operacaoInventada({ where: {} })
      }),
    ).rejects.toThrow()
  })

  it('usar o banco fora do contexto de tenant é erro, não silêncio', async () => {
    expect(() => tenantAtual()).toThrow(SemTenantError)
  })
})
