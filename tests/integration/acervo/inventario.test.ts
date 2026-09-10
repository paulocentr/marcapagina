import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { inventarioRepository } from '@/modules/acervo/inventario.repository'
import {
  abrirInventario,
  conferirTombo,
  fecharInventario,
  InventarioJaAbertoError,
} from '@/modules/acervo/inventario.service'
import type { Principal } from '@/core/auth/principal'

let escolaA = ''
let escolaB = ''
let locA1 = ''
let locA2 = ''

const deps = { inventario: inventarioRepository }

const principalDe = (escolaId: string): Principal => ({
  reino: 'STAFF',
  id: 'usr_1',
  escolaId,
  nome: 'Bibliotecária',
  permissoes: ['inventario:executar'],
})

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id

  const l1 = await prisma.localizacao.create({ data: { escolaId: escolaA, nome: 'Estante 1' } })
  const l2 = await prisma.localizacao.create({ data: { escolaId: escolaA, nome: 'Estante 2' } })
  locA1 = l1.id
  locA2 = l2.id

  const obra = await prisma.obra.create({
    data: { escolaId: escolaA, titulo: 'Dom Casmurro', tituloNormalizado: 'dom casmurro' },
  })

  await prisma.exemplar.createMany({
    data: [
      { escolaId: escolaA, obraId: obra.id, tombo: '000001', localizacaoId: locA1 },
      { escolaId: escolaA, obraId: obra.id, tombo: '000002', localizacaoId: locA1 },
      {
        escolaId: escolaA,
        obraId: obra.id,
        tombo: '000003',
        localizacaoId: locA1,
        situacao: 'EMPRESTADO',
      },
      { escolaId: escolaA, obraId: obra.id, tombo: '000004', localizacaoId: locA2 },
      {
        escolaId: escolaA,
        obraId: obra.id,
        tombo: '000005',
        localizacaoId: locA1,
        situacao: 'BAIXADO',
      },
    ],
  })
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

describe('inventário contra banco', () => {
  it('congela apenas os exemplares da estante, sem os já baixados', async () => {
    // Cobrar um exemplar já baixado enterraria as perdas REAIS numa lista
    // de coisas que a escola já sabe que perdeu.
    const inv = await naEscolaA(() =>
      abrirInventario(principalDe(escolaA), { localizacaoId: locA1 }, deps),
    )

    const itens = await naEscolaA(() => inventarioRepository.listarItens(inv.id))
    expect(itens.map((i) => i.tombo)).toEqual(['000001', '000002', '000003'])
  })

  it('produz as três listas contra dados reais', async () => {
    const inv = await naEscolaA(() =>
      abrirInventario(principalDe(escolaA), { localizacaoId: locA1 }, deps),
    )

    await naEscolaA(() =>
      conferirTombo(principalDe(escolaA), { inventarioId: inv.id, tombo: '000001' }, deps),
    )
    await naEscolaA(() =>
      conferirTombo(principalDe(escolaA), { inventarioId: inv.id, tombo: '000004' }, deps),
    )

    const relatorio = await naEscolaA(() =>
      fecharInventario(principalDe(escolaA), inv.id, deps),
    )

    expect(relatorio.naoEncontrados.map((i) => i.tombo)).toEqual(['000002'])
    expect(relatorio.constamEmprestados.map((i) => i.tombo)).toEqual(['000003'])
    expect(relatorio.foraDoLugar.map((i) => i.tombo)).toEqual(['000004'])
    expect(relatorio.esperados).toBe(3)
    expect(relatorio.conferidos).toBe(1)
  })

  it('a abertura é atômica: sem itens, não há inventário', async () => {
    const inv = await naEscolaA(() =>
      abrirInventario(principalDe(escolaA), { localizacaoId: locA1 }, deps),
    )

    const itens = await prisma.inventarioItem.count({ where: { inventarioId: inv.id } })
    expect(itens).toBe(3)
  })

  it('recusa segunda sessão aberta na mesma estante', async () => {
    await naEscolaA(() => abrirInventario(principalDe(escolaA), { localizacaoId: locA1 }, deps))

    await expect(
      naEscolaA(() => abrirInventario(principalDe(escolaA), { localizacaoId: locA1 }, deps)),
    ).rejects.toBeInstanceOf(InventarioJaAbertoError)
  })

  it('sessão aberta numa escola não bloqueia a outra', async () => {
    // Se bloqueasse, uma escola travaria a conferência da vizinha —
    // vazamento disfarçado de trava.
    await naEscolaA(() => abrirInventario(principalDe(escolaA), { localizacaoId: locA1 }, deps))

    const naVizinha = await executarComTenant(escolaB, () =>
      abrirInventario(principalDe(escolaB), { localizacaoId: null }, deps),
    )

    expect(naVizinha.status).toBe('ABERTO')
  })

  it('não enxerga inventário da escola vizinha', async () => {
    const daVizinha = await executarComTenant(escolaB, () =>
      abrirInventario(principalDe(escolaB), { localizacaoId: null }, deps),
    )

    const achado = await naEscolaA(() => inventarioRepository.obter(daVizinha.id))
    expect(achado).toBeNull()
  })

  it('conferir o mesmo tombo duas vezes não duplica item', async () => {
    const inv = await naEscolaA(() =>
      abrirInventario(principalDe(escolaA), { localizacaoId: locA1 }, deps),
    )

    await naEscolaA(() =>
      conferirTombo(principalDe(escolaA), { inventarioId: inv.id, tombo: '000001' }, deps),
    )
    await naEscolaA(() =>
      conferirTombo(principalDe(escolaA), { inventarioId: inv.id, tombo: '000001' }, deps),
    )

    expect(await prisma.inventarioItem.count({ where: { inventarioId: inv.id } })).toBe(3)
  })

  it('o exemplar de outra estante entra como item novo, não some', async () => {
    const inv = await naEscolaA(() =>
      abrirInventario(principalDe(escolaA), { localizacaoId: locA1 }, deps),
    )

    await naEscolaA(() =>
      conferirTombo(principalDe(escolaA), { inventarioId: inv.id, tombo: '000004' }, deps),
    )

    expect(await prisma.inventarioItem.count({ where: { inventarioId: inv.id } })).toBe(4)
  })
})
