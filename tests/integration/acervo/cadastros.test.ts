import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { autoresRepository } from '@/modules/acervo/autores.repository'
import { categoriasRepository } from '@/modules/acervo/categorias.repository'
import { localizacoesRepository } from '@/modules/acervo/localizacoes.repository'
import { garantirAutores, normalizarNomeDeAutor } from '@/modules/acervo/autores.service'
import { criarCategoria, excluirCategoria } from '@/modules/acervo/categorias.service'
import { CategoriaEmUsoError } from '@/modules/acervo/categorias.service'
import type { Principal } from '@/core/auth/principal'

let escolaA = ''
let escolaB = ''

const principalDe = (escolaId: string): Principal => ({
  reino: 'STAFF',
  id: 'usr_1',
  escolaId,
  nome: 'Coordenação',
  permissoes: ['obra:criar', 'config:editar'],
})

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id
})

describe('cadastros de apoio do acervo, contra banco', () => {
  it('garantirAutores grava e deduplica de verdade', async () => {
    const deps = { autores: autoresRepository }

    const primeira = await executarComTenant(escolaA, () =>
      garantirAutores(principalDe(escolaA), ['Machado de Assis', 'Clarice Lispector'], deps),
    )
    const segunda = await executarComTenant(escolaA, () =>
      garantirAutores(principalDe(escolaA), ['MACHADO DE ASSÍS'], deps),
    )

    expect(primeira).toHaveLength(2)
    expect(segunda[0]).toBe(primeira[0])
    expect(await prisma.autor.count()).toBe(2)
  })

  it('o mesmo autor em escolas diferentes são registros diferentes', async () => {
    const deps = { autores: autoresRepository }

    const naA = await executarComTenant(escolaA, () =>
      garantirAutores(principalDe(escolaA), ['Ziraldo'], deps),
    )
    const naB = await executarComTenant(escolaB, () =>
      garantirAutores(principalDe(escolaB), ['Ziraldo'], deps),
    )

    expect(naB[0]).not.toBe(naA[0])
    expect(await prisma.autor.count()).toBe(2)
  })

  it('autor da escola vizinha não é encontrado nem reaproveitado', async () => {
    await prisma.autor.create({
      data: {
        escolaId: escolaB,
        nome: 'Ziraldo',
        nomeNormalizado: normalizarNomeDeAutor('Ziraldo'),
      },
    })

    const achados = await executarComTenant(escolaA, () =>
      autoresRepository.buscarPorNormalizados([normalizarNomeDeAutor('Ziraldo')]),
    )

    expect(achados).toEqual([])
  })

  it('criar categoria com mãe de OUTRA escola é recusado', async () => {
    const maeVizinha = await prisma.categoria.create({
      data: { escolaId: escolaB, nome: 'Literatura' },
    })

    await expect(
      executarComTenant(escolaA, () =>
        criarCategoria(
          principalDe(escolaA),
          { nome: 'Infantil', parentId: maeVizinha.id },
          { categorias: categoriasRepository },
        ),
      ),
    ).rejects.toThrow()
  })

  it('excluir categoria em uso é recusado, contando as obras reais', async () => {
    const deps = { categorias: categoriasRepository }
    const cat = await executarComTenant(escolaA, () =>
      criarCategoria(principalDe(escolaA), { nome: 'Literatura' }, deps),
    )
    await prisma.obra.create({
      data: {
        escolaId: escolaA,
        titulo: 'Dom Casmurro',
        tituloNormalizado: 'dom casmurro',
        categoriaId: cat.id,
      },
    })

    await expect(
      executarComTenant(escolaA, () => excluirCategoria(principalDe(escolaA), cat.id, deps)),
    ).rejects.toBeInstanceOf(CategoriaEmUsoError)
  })

  it('localização criada numa escola não aparece na outra', async () => {
    await executarComTenant(escolaA, () =>
      localizacoesRepository.criar({
        nome: 'Infantil A',
        corredor: '2',
        estante: 'B',
        prateleira: null,
      }),
    )

    const naVizinha = await executarComTenant(escolaB, () => localizacoesRepository.listar())

    expect(naVizinha).toEqual([])
  })
})
