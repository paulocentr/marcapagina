import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { executarEmTransacao } from '@/core/db/tenant-extension'
import { obrasRepository } from '@/modules/acervo/obras.repository'
import { autoresRepository } from '@/modules/acervo/autores.repository'
import { exemplaresRepository } from '@/modules/acervo/exemplares.repository'
import { consultarIsbn, catalogar } from '@/modules/acervo/catalogacao.service'
import type { Principal } from '@/core/auth/principal'
import type { MetadadosDeObra, ProvedorDeMetadados } from '@/infra/metadados/provedor'

let escolaA = ''
let escolaB = ''

const DOM_CASMURRO: MetadadosDeObra = {
  isbn: '9788535902778',
  titulo: 'Dom Casmurro',
  autores: ['Machado de Assis'],
  editora: 'Companhia das Letras',
  anoPublicacao: 2016,
}

const provedor: ProvedorDeMetadados = {
  nome: 'fixture',
  buscarPorIsbn: async (isbn) => (isbn === DOM_CASMURRO.isbn ? DOM_CASMURRO : null),
}

function depsCom(metadados: ProvedorDeMetadados = provedor) {
  return {
    obras: obrasRepository,
    autores: autoresRepository,
    exemplares: exemplaresRepository,
    metadados,
    emTransacao: executarEmTransacao,
  }
}

const principalDe = (escolaId: string): Principal => ({
  reino: 'STAFF',
  id: 'usr_1',
  escolaId,
  nome: 'Bibliotecária',
  permissoes: ['obra:ver', 'obra:criar', 'obra:editar', 'exemplar:criar'],
})

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id
})

describe('catalogação em série contra banco', () => {
  it('cria obra, autor e exemplares com tombo numa passada', async () => {
    const { obra, exemplares } = await executarComTenant(escolaA, () =>
      catalogar(
        principalDe(escolaA),
        { metadados: DOM_CASMURRO, quantidadeDeExemplares: 3 },
        depsCom(),
      ),
    )

    expect(obra.titulo).toBe('Dom Casmurro')
    expect(exemplares.map((e) => e.tombo)).toEqual(['000001', '000002', '000003'])
    expect(await prisma.autor.count()).toBe(1)
  })

  it('NÃO deixa obra órfã quando a criação de exemplar falha', async () => {
    // Sem transação, o erro no exemplar deixaria no acervo uma ficha sem
    // cópia nenhuma, e ninguém saberia que ela está pela metade até
    // procurar o livro na estante e não achar sequer o tombo.
    const exemplaresQueFalham = {
      ...exemplaresRepository,
      criarSequencial: vi.fn().mockRejectedValue(new Error('banco caiu no meio')),
    }

    await expect(
      executarComTenant(escolaA, () =>
        catalogar(
          principalDe(escolaA),
          { metadados: DOM_CASMURRO, quantidadeDeExemplares: 2 },
          { ...depsCom(), exemplares: exemplaresQueFalham },
        ),
      ),
    ).rejects.toThrow('banco caiu no meio')

    expect(await prisma.obra.count()).toBe(0)
    expect(await prisma.autor.count()).toBe(0)
    expect(await prisma.exemplar.count()).toBe(0)
  })

  it('consultarIsbn avisa que a obra já está no acervo', async () => {
    await executarComTenant(escolaA, () =>
      catalogar(
        principalDe(escolaA),
        { metadados: DOM_CASMURRO, quantidadeDeExemplares: 1 },
        depsCom(),
      ),
    )

    const resultado = await executarComTenant(escolaA, () =>
      consultarIsbn(principalDe(escolaA), '978-85-359-0277-8', depsCom()),
    )

    expect(resultado.jaCadastrada?.titulo).toBe('Dom Casmurro')
  })

  it('a ficha da escola vizinha NÃO conta como já cadastrada', async () => {
    // Se contasse, a escola B seria impedida de catalogar um livro que ela
    // tem porque a escola A já o tem — vazamento disfarçado de conveniência.
    await executarComTenant(escolaB, () =>
      catalogar(
        principalDe(escolaB),
        { metadados: DOM_CASMURRO, quantidadeDeExemplares: 1 },
        depsCom(),
      ),
    )

    const resultado = await executarComTenant(escolaA, () =>
      consultarIsbn(principalDe(escolaA), DOM_CASMURRO.isbn, depsCom()),
    )

    expect(resultado.jaCadastrada).toBeNull()
  })

  it('acrescentar exemplares à obra existente não duplica a ficha', async () => {
    const primeira = await executarComTenant(escolaA, () =>
      catalogar(
        principalDe(escolaA),
        { metadados: DOM_CASMURRO, quantidadeDeExemplares: 1 },
        depsCom(),
      ),
    )

    const segunda = await executarComTenant(escolaA, () =>
      catalogar(
        principalDe(escolaA),
        {
          metadados: DOM_CASMURRO,
          quantidadeDeExemplares: 2,
          obraExistenteId: primeira.obra.id,
        },
        depsCom(),
      ),
    )

    expect(await prisma.obra.count()).toBe(1)
    expect(await prisma.exemplar.count()).toBe(3)
    expect(segunda.exemplares.map((e) => e.tombo)).toEqual(['000002', '000003'])
  })

  it('duas sessões em série simultâneas não colidem tombo', async () => {
    // O caso real: duas operadoras bipando ao mesmo tempo, cada uma numa
    // transação, ambas gerando tombo.
    const resultados = await Promise.all([
      executarComTenant(escolaA, () =>
        catalogar(
          principalDe(escolaA),
          { metadados: { ...DOM_CASMURRO, titulo: 'Livro A' }, quantidadeDeExemplares: 3 },
          depsCom(),
        ),
      ),
      executarComTenant(escolaA, () =>
        catalogar(
          principalDe(escolaA),
          { metadados: { ...DOM_CASMURRO, titulo: 'Livro B' }, quantidadeDeExemplares: 3 },
          depsCom(),
        ),
      ),
    ])

    const tombos = resultados.flatMap((r) => r.exemplares.map((e) => e.tombo))
    expect(new Set(tombos).size).toBe(6)

    // E o autor, que é o MESMO nos dois livros, tem que existir uma vez só.
    // Duas operadoras catalogando dois Ziraldos numa tarde comum leem que
    // ele não existe e tentam criá-lo as duas: sem tratar essa corrida, a
    // segunda estoura no índice único e perde a catalogação inteira por
    // causa de um registro que ela só precisava reaproveitar.
    expect(await prisma.autor.count()).toBe(1)
  })

  it('recusa ISBN com dígito trocado sem consultar a rede', async () => {
    const espiao = vi.fn().mockResolvedValue(null)

    await expect(
      executarComTenant(escolaA, () =>
        consultarIsbn(
          principalDe(escolaA),
          '9788535902779',
          depsCom({ nome: 'espiao', buscarPorIsbn: espiao }),
        ),
      ),
    ).rejects.toThrow()

    expect(espiao).not.toHaveBeenCalled()
  })
})
