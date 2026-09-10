import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { obrasRepository } from '@/modules/acervo/obras.repository'
import { autoresRepository } from '@/modules/acervo/autores.repository'
import {
  criarObra,
  editarObra,
  excluirObra,
  obterObra,
  buscarObras,
  ObraComExemplaresError,
  ObraInexistenteError,
} from '@/modules/acervo/obras.service'
import type { Principal } from '@/core/auth/principal'

let escolaA = ''
let escolaB = ''

const deps = { obras: obrasRepository, autores: autoresRepository }

const principalDe = (escolaId: string): Principal => ({
  reino: 'STAFF',
  id: 'usr_1',
  escolaId,
  nome: 'Bibliotecária',
  permissoes: ['obra:ver', 'obra:criar', 'obra:editar', 'obra:excluir'],
})

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id
})

function naEscola<T>(escolaId: string, fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaId, fn)
}

describe('obras contra banco', () => {
  it('cria a obra com autores e devolve na ordem da capa', async () => {
    const obra = await naEscola(escolaA, () =>
      criarObra(
        principalDe(escolaA),
        { titulo: 'Dom Casmurro', autores: ['Machado de Assis', 'Prefaciador Qualquer'] },
        deps,
      ),
    )

    const detalhada = await naEscola(escolaA, () => obterObra(obra.id, deps))

    expect(detalhada.autores.map((a) => a.nome)).toEqual([
      'Machado de Assis',
      'Prefaciador Qualquer',
    ])
  })

  it('busca por parte do título ignorando acento e caixa', async () => {
    await naEscola(escolaA, () =>
      criarObra(principalDe(escolaA), { titulo: 'Grande Sertão: Veredas' }, deps),
    )

    const pagina = await naEscola(escolaA, () => buscarObras({ termo: 'sertao' }, deps))

    expect(pagina.itens.map((o) => o.titulo)).toEqual(['Grande Sertão: Veredas'])
  })

  it('a busca funciona sem nenhuma etiqueta existir', async () => {
    // Caminho de primeira classe (spec §2.2): a etiquetagem é gradual e
    // pode nunca terminar, então buscar por título não pode depender dela.
    await naEscola(escolaA, () =>
      criarObra(principalDe(escolaA), { titulo: 'O Menino Maluquinho' }, deps),
    )

    const pagina = await naEscola(escolaA, () => buscarObras({ termo: 'maluquinho' }, deps))

    expect(pagina.total).toBe(1)
    expect(pagina.itens[0]?.totalDeExemplares).toBe(0)
  })

  it('não enxerga obra de outra escola', async () => {
    await naEscola(escolaB, () =>
      criarObra(principalDe(escolaB), { titulo: 'Dom Casmurro' }, deps),
    )

    const pagina = await naEscola(escolaA, () => buscarObras({ termo: 'casmurro' }, deps))

    expect(pagina.total).toBe(0)
  })

  it('obter obra da escola vizinha é ObraInexistente, não vazamento', async () => {
    const daVizinha = await naEscola(escolaB, () =>
      criarObra(principalDe(escolaB), { titulo: 'Dom Casmurro' }, deps),
    )

    await expect(naEscola(escolaA, () => obterObra(daVizinha.id, deps))).rejects.toBeInstanceOf(
      ObraInexistenteError,
    )
  })

  it('editar obra da escola vizinha é recusado', async () => {
    const daVizinha = await naEscola(escolaB, () =>
      criarObra(principalDe(escolaB), { titulo: 'Dom Casmurro' }, deps),
    )

    await expect(
      naEscola(escolaA, () =>
        editarObra(principalDe(escolaA), daVizinha.id, { titulo: 'Sequestrado' }, deps),
      ),
    ).rejects.toBeInstanceOf(ObraInexistenteError)

    const intacta = await prisma.obra.findUniqueOrThrow({ where: { id: daVizinha.id } })
    expect(intacta.titulo).toBe('Dom Casmurro')
  })

  it('conta exemplares totais e disponíveis a partir dos exemplares reais', async () => {
    const obra = await naEscola(escolaA, () =>
      criarObra(principalDe(escolaA), { titulo: 'Dom Casmurro' }, deps),
    )

    await prisma.exemplar.createMany({
      data: [
        { escolaId: escolaA, obraId: obra.id, tombo: '1', situacao: 'DISPONIVEL' },
        { escolaId: escolaA, obraId: obra.id, tombo: '2', situacao: 'DISPONIVEL' },
        { escolaId: escolaA, obraId: obra.id, tombo: '3', situacao: 'EMPRESTADO' },
      ],
    })

    const detalhada = await naEscola(escolaA, () => obterObra(obra.id, deps))

    expect(detalhada.totalDeExemplares).toBe(3)
    expect(detalhada.exemplaresDisponiveis).toBe(2)
  })

  it('excluir obra com exemplar é recusado, com o número na mensagem', async () => {
    const obra = await naEscola(escolaA, () =>
      criarObra(principalDe(escolaA), { titulo: 'Dom Casmurro' }, deps),
    )
    await prisma.exemplar.create({
      data: { escolaId: escolaA, obraId: obra.id, tombo: '1' },
    })

    const erro = await naEscola(escolaA, () =>
      excluirObra(principalDe(escolaA), obra.id, deps),
    ).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ObraComExemplaresError)
    expect((erro as Error).message).toContain('1')
    expect(await prisma.obra.count()).toBe(1)
  })

  it('editar autoria troca o vínculo em vez de acumular', async () => {
    const obra = await naEscola(escolaA, () =>
      criarObra(principalDe(escolaA), { titulo: 'Antologia', autores: ['Autor A'] }, deps),
    )

    await naEscola(escolaA, () =>
      editarObra(principalDe(escolaA), obra.id, { autores: ['Autor B', 'Autor C'] }, deps),
    )

    const detalhada = await naEscola(escolaA, () => obterObra(obra.id, deps))
    expect(detalhada.autores.map((a) => a.nome)).toEqual(['Autor B', 'Autor C'])
  })

  it('pagina sem repetir nem perder obra', async () => {
    for (let i = 1; i <= 5; i++) {
      await naEscola(escolaA, () =>
        criarObra(principalDe(escolaA), { titulo: `Livro ${i}` }, deps),
      )
    }

    const p1 = await naEscola(escolaA, () => buscarObras({ pagina: 1, porPagina: 2 }, deps))
    const p2 = await naEscola(escolaA, () => buscarObras({ pagina: 2, porPagina: 2 }, deps))
    const p3 = await naEscola(escolaA, () => buscarObras({ pagina: 3, porPagina: 2 }, deps))

    const vistos = [...p1.itens, ...p2.itens, ...p3.itens].map((o) => o.id)
    expect(new Set(vistos).size).toBe(5)
    expect(p1.total).toBe(5)
  })
})
