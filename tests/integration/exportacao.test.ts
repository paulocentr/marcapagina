import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { exportarEscola } from '@/modules/escolas/escolas.service'

let escolaA = ''
let escolaB = ''

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id

  await prisma.aluno.createMany({
    data: [
      { escolaId: a.id, matricula: '1', nome: 'Ana', dataNascimento: new Date('2012-01-01') },
      { escolaId: b.id, matricula: '1', nome: 'Bruno', dataNascimento: new Date('2012-01-01') },
    ],
  })
})

describe('exportação', () => {
  it('exporta apenas os dados do tenant corrente', async () => {
    const pacote = await executarComTenant(escolaA, exportarEscola)

    expect(pacote.alunos).toHaveLength(1)
    expect(pacote.alunos[0]?.nome).toBe('Ana')
  })

  it('inclui a versão do formato e a data', async () => {
    const pacote = await executarComTenant(escolaA, exportarEscola)

    // Sem versão, um backup restaurado meses depois é um enigma.
    expect(pacote.versaoDoFormato).toBe(1)
    expect(typeof pacote.exportadoEm).toBe('string')
  })

  it('não vaza dados do outro tenant nem quando ele tem mais registros', async () => {
    await prisma.aluno.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        escolaId: escolaB,
        matricula: `b${i}`,
        nome: `Aluno B ${i}`,
        dataNascimento: new Date('2012-01-01'),
      })),
    })

    const pacote = await executarComTenant(escolaA, exportarEscola)
    expect(pacote.alunos).toHaveLength(1)
  })

  it('não carrega senhaHash: backup não é lugar de credencial', async () => {
    await prisma.usuario.create({
      data: {
        escolaId: escolaA,
        nome: 'Coordenação',
        email: 'coord@escola.br',
        senhaHash: '$argon2id$fingido',
      },
    })

    const pacote = await executarComTenant(escolaA, exportarEscola)

    expect(pacote.usuarios).toHaveLength(1)
    expect(JSON.stringify(pacote)).not.toContain('senhaHash')
    expect(JSON.stringify(pacote)).not.toContain('argon2id')
  })
})
