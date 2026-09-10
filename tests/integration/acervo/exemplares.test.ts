import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { exemplaresRepository } from '@/modules/acervo/exemplares.repository'
import {
  criarExemplares,
  baixarExemplar,
  contarPorSituacao,
  ExemplarInexistenteError,
} from '@/modules/acervo/exemplares.service'
import type { Principal } from '@/core/auth/principal'

let escolaA = ''
let escolaB = ''
let obraA = ''
let obraB = ''

const deps = { exemplares: exemplaresRepository }

const principalDe = (escolaId: string): Principal => ({
  reino: 'STAFF',
  id: 'usr_1',
  escolaId,
  nome: 'Bibliotecária',
  permissoes: ['exemplar:criar', 'exemplar:editar', 'exemplar:baixar'],
})

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id

  const oa = await prisma.obra.create({
    data: { escolaId: escolaA, titulo: 'Dom Casmurro', tituloNormalizado: 'dom casmurro' },
  })
  const ob = await prisma.obra.create({
    data: { escolaId: escolaB, titulo: 'Dom Casmurro', tituloNormalizado: 'dom casmurro' },
  })
  obraA = oa.id
  obraB = ob.id
})

describe('exemplares contra banco', () => {
  it('gera tombos sequenciais a partir de 000001', async () => {
    const criados = await executarComTenant(escolaA, () =>
      criarExemplares(principalDe(escolaA), { obraId: obraA, quantidade: 3 }, deps),
    )

    expect(criados.map((e) => e.tombo)).toEqual(['000001', '000002', '000003'])
  })

  it('continua a sequência na segunda remessa', async () => {
    await executarComTenant(escolaA, () =>
      criarExemplares(principalDe(escolaA), { obraId: obraA, quantidade: 2 }, deps),
    )
    const segunda = await executarComTenant(escolaA, () =>
      criarExemplares(principalDe(escolaA), { obraId: obraA, quantidade: 2 }, deps),
    )

    expect(segunda.map((e) => e.tombo)).toEqual(['000003', '000004'])
  })

  it('a sequência é POR ESCOLA: a vizinha começa do 1 de novo', async () => {
    await executarComTenant(escolaA, () =>
      criarExemplares(principalDe(escolaA), { obraId: obraA, quantidade: 3 }, deps),
    )
    const naVizinha = await executarComTenant(escolaB, () =>
      criarExemplares(principalDe(escolaB), { obraId: obraB, quantidade: 1 }, deps),
    )

    expect(naVizinha[0]?.tombo).toBe('000001')
  })

  it('não repete tombo sob concorrência', async () => {
    // Duas operadoras catalogando ao mesmo tempo é o caso NORMAL numa
    // biblioteca com dois computadores. Sem trava, as duas leem o mesmo
    // máximo e a segunda gravação estoura no índice único.
    const resultados = await Promise.all([
      executarComTenant(escolaA, () =>
        criarExemplares(principalDe(escolaA), { obraId: obraA, quantidade: 5 }, deps),
      ),
      executarComTenant(escolaA, () =>
        criarExemplares(principalDe(escolaA), { obraId: obraA, quantidade: 5 }, deps),
      ),
      executarComTenant(escolaA, () =>
        criarExemplares(principalDe(escolaA), { obraId: obraA, quantidade: 5 }, deps),
      ),
    ])

    const tombos = resultados.flat().map((e) => e.tombo)
    expect(tombos).toHaveLength(15)
    expect(new Set(tombos).size).toBe(15)
  })

  it('tombo alfanumérico de acervo importado não derruba a geração', async () => {
    // Um CAST cego sobre 'ABC-12' quebraria a consulta do próximo tombo e
    // travaria a catalogação inteira da escola.
    await prisma.exemplar.create({
      data: { escolaId: escolaA, obraId: obraA, tombo: 'ANTIGO-42' },
    })

    const criados = await executarComTenant(escolaA, () =>
      criarExemplares(principalDe(escolaA), { obraId: obraA, quantidade: 1 }, deps),
    )

    expect(criados[0]?.tombo).toBe('000001')
  })

  it('exemplar nasce DISPONIVEL e o estoque é contagem, não campo', async () => {
    await executarComTenant(escolaA, () =>
      criarExemplares(principalDe(escolaA), { obraId: obraA, quantidade: 4 }, deps),
    )

    const contagem = await executarComTenant(escolaA, () => contarPorSituacao(obraA, deps))

    expect(contagem.DISPONIVEL).toBe(4)
    expect(contagem.EMPRESTADO).toBe(0)
    expect(contagem.BAIXADO).toBe(0)
  })

  it('baixa muda a situação e some do disponível', async () => {
    const [criado] = await executarComTenant(escolaA, () =>
      criarExemplares(principalDe(escolaA), { obraId: obraA, quantidade: 2 }, deps),
    )

    await executarComTenant(escolaA, () =>
      baixarExemplar(
        principalDe(escolaA),
        { exemplarId: criado!.id, situacao: 'BAIXADO', motivo: 'capa destruída' },
        deps,
      ),
    )

    const contagem = await executarComTenant(escolaA, () => contarPorSituacao(obraA, deps))
    expect(contagem.DISPONIVEL).toBe(1)
    expect(contagem.BAIXADO).toBe(1)
  })

  it('não alcança exemplar de outra escola', async () => {
    const [daVizinha] = await executarComTenant(escolaB, () =>
      criarExemplares(principalDe(escolaB), { obraId: obraB, quantidade: 1 }, deps),
    )

    await expect(
      executarComTenant(escolaA, () =>
        baixarExemplar(
          principalDe(escolaA),
          { exemplarId: daVizinha!.id, situacao: 'BAIXADO', motivo: 'x' },
          deps,
        ),
      ),
    ).rejects.toBeInstanceOf(ExemplarInexistenteError)

    const intacto = await prisma.exemplar.findUniqueOrThrow({ where: { id: daVizinha!.id } })
    expect(intacto.situacao).toBe('DISPONIVEL')
  })

  it('buscar por tombo não encontra o da escola vizinha', async () => {
    await executarComTenant(escolaB, () =>
      criarExemplares(principalDe(escolaB), { obraId: obraB, quantidade: 1 }, deps),
    )

    const achado = await executarComTenant(escolaA, () =>
      exemplaresRepository.obterPorTombo('000001'),
    )

    expect(achado).toBeNull()
  })
})
