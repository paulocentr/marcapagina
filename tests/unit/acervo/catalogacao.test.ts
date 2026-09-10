import { describe, it, expect, beforeEach, vi } from 'vitest'
import { consultarIsbn, catalogar } from '@/modules/acervo/catalogacao.service'
import { SemPermissaoError } from '@/core/errors'
import { IsbnInvalidoError } from '@/modules/acervo/catalogacao.service'
import type { Principal } from '@/core/auth/principal'
import type { MetadadosDeObra, ProvedorDeMetadados } from '@/infra/metadados/provedor'
import {
  criarFakeDeAutores,
  criarFakeDeObras,
  criarFakeDeExemplares,
} from '../../apoio/fakes/acervo.fake'

const BIBLIOTECARIO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Bibliotecária',
  permissoes: ['obra:ver', 'obra:criar', 'obra:editar', 'exemplar:criar'],
}

const SO_VE: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['obra:ver'],
}

const SEM_EXEMPLAR: Principal = {
  reino: 'STAFF',
  id: 'usr_3',
  escolaId: 'esc_1',
  nome: 'Auxiliar',
  permissoes: ['obra:ver', 'obra:criar'],
}

const DOM_CASMURRO: MetadadosDeObra = {
  isbn: '9788535902778',
  titulo: 'Dom Casmurro',
  autores: ['Machado de Assis'],
  editora: 'Companhia das Letras',
  anoPublicacao: 2016,
  fonte: 'google-books',
}

function provedorQueAcha(metadados: MetadadosDeObra = DOM_CASMURRO): ProvedorDeMetadados {
  return { nome: 'fake', buscarPorIsbn: vi.fn().mockResolvedValue(metadados) }
}

function provedorQueNaoAcha(): ProvedorDeMetadados {
  return { nome: 'fake', buscarPorIsbn: vi.fn().mockResolvedValue(null) }
}

let deps: {
  obras: ReturnType<typeof criarFakeDeObras>
  autores: ReturnType<typeof criarFakeDeAutores>
  exemplares: ReturnType<typeof criarFakeDeExemplares>
  metadados: ProvedorDeMetadados
  emTransacao: <T>(fn: () => Promise<T>) => Promise<T>
}

beforeEach(() => {
  deps = {
    obras: criarFakeDeObras(),
    autores: criarFakeDeAutores(),
    exemplares: criarFakeDeExemplares(),
    metadados: provedorQueAcha(),
    // Nos testes de unidade a "transação" é só executar: a garantia real
    // de atomicidade é do banco e está coberta em teste de integração.
    emTransacao: <T,>(fn: () => Promise<T>) => fn(),
  }
})

describe('consultarIsbn', () => {
  it('devolve os metadados encontrados', async () => {
    const resultado = await consultarIsbn(BIBLIOTECARIO, '9788535902778', deps)

    expect(resultado.metadados?.titulo).toBe('Dom Casmurro')
  })

  it('avisa quando a obra JÁ está no acervo', async () => {
    // Sem este aviso, a operadora cria a segunda ficha do mesmo livro — o
    // erro mais comum de catalogação em série, e o mais chato de desfazer.
    // O certo é oferecer "acrescentar exemplares a esta obra".
    await catalogar(
      BIBLIOTECARIO,
      { metadados: DOM_CASMURRO, quantidadeDeExemplares: 1 },
      deps,
    )

    const resultado = await consultarIsbn(BIBLIOTECARIO, '9788535902778', deps)

    expect(resultado.jaCadastrada?.titulo).toBe('Dom Casmurro')
  })

  it('não avisa quando a obra ainda não existe', async () => {
    const resultado = await consultarIsbn(BIBLIOTECARIO, '9788535902778', deps)

    expect(resultado.jaCadastrada).toBeNull()
  })

  it('devolve metadados null quando nenhum provedor acha, sem lançar', async () => {
    // As duas APIs falharem é comum em didático e infantojuvenil nacional.
    // A tela abre o formulário manual; não é erro.
    deps.metadados = provedorQueNaoAcha()

    const resultado = await consultarIsbn(BIBLIOTECARIO, '9788535902778', deps)

    expect(resultado.metadados).toBeNull()
  })

  it('devolve o ISBN normalizado mesmo quando nada é achado', async () => {
    // A tela precisa dele para já preencher o formulário manual.
    deps.metadados = provedorQueNaoAcha()

    const resultado = await consultarIsbn(BIBLIOTECARIO, '978-85-359-0277-8', deps)

    expect(resultado.isbn).toBe('9788535902778')
  })

  it('recusa ISBN inválido ANTES de consultar a rede', async () => {
    const resultado = consultarIsbn(BIBLIOTECARIO, '9788535902779', deps)

    await expect(resultado).rejects.toBeInstanceOf(IsbnInvalidoError)
    expect(deps.metadados.buscarPorIsbn).not.toHaveBeenCalled()
  })

  it('exige permissão obra:ver', async () => {
    const semNada: Principal = { ...SO_VE, permissoes: [] }

    await expect(consultarIsbn(semNada, '9788535902778', deps)).rejects.toBeInstanceOf(
      SemPermissaoError,
    )
  })
})

describe('catalogar', () => {
  it('cria obra, autores e N exemplares de uma vez', async () => {
    const { obra, exemplares } = await catalogar(
      BIBLIOTECARIO,
      { metadados: DOM_CASMURRO, quantidadeDeExemplares: 3 },
      deps,
    )

    expect(obra.titulo).toBe('Dom Casmurro')
    expect(exemplares).toHaveLength(3)
    expect(deps.autores.todos()).toHaveLength(1)
  })

  it('os exemplares apontam para a obra criada', async () => {
    const { obra, exemplares } = await catalogar(
      BIBLIOTECARIO,
      { metadados: DOM_CASMURRO, quantidadeDeExemplares: 2 },
      deps,
    )

    expect(exemplares.every((e) => e.obraId === obra.id)).toBe(true)
  })

  it('acrescenta exemplares a obra existente em vez de duplicar a ficha', async () => {
    const primeira = await catalogar(
      BIBLIOTECARIO,
      { metadados: DOM_CASMURRO, quantidadeDeExemplares: 1 },
      deps,
    )

    const segunda = await catalogar(
      BIBLIOTECARIO,
      { metadados: DOM_CASMURRO, quantidadeDeExemplares: 2, obraExistenteId: primeira.obra.id },
      deps,
    )

    expect(segunda.obra.id).toBe(primeira.obra.id)
    expect(deps.obras.todas()).toHaveLength(1)
    expect(segunda.exemplares).toHaveLength(2)
  })

  it('repassa localização e origem para os exemplares', async () => {
    const { exemplares } = await catalogar(
      BIBLIOTECARIO,
      {
        metadados: DOM_CASMURRO,
        quantidadeDeExemplares: 1,
        localizacaoId: 'loc_1',
        origem: 'DOACAO',
      },
      deps,
    )

    expect(exemplares[0]?.origem).toBe('DOACAO')
    expect(exemplares[0]?.localizacaoId).toBe('loc_1')
  })

  it('exige obra:criar', async () => {
    await expect(
      catalogar(SO_VE, { metadados: DOM_CASMURRO, quantidadeDeExemplares: 1 }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('exige exemplar:criar', async () => {
    await expect(
      catalogar(SEM_EXEMPLAR, { metadados: DOM_CASMURRO, quantidadeDeExemplares: 1 }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('checa AS DUAS permissões antes de escrever qualquer coisa', async () => {
    // Checar exemplar:criar só na hora de criar o exemplar deixaria a obra
    // já gravada e uma ficha sem cópia nenhuma no acervo.
    await catalogar(
      SEM_EXEMPLAR,
      { metadados: DOM_CASMURRO, quantidadeDeExemplares: 1 },
      deps,
    ).catch(() => undefined)

    expect(deps.obras.todas()).toHaveLength(0)
    expect(deps.autores.todos()).toHaveLength(0)
  })

  it('recusa quantidade inválida sem criar a obra', async () => {
    // Mesma razão: obra órfã de exemplar é ficha pela metade que ninguém vê.
    await catalogar(
      BIBLIOTECARIO,
      { metadados: DOM_CASMURRO, quantidadeDeExemplares: 0 },
      deps,
    ).catch(() => undefined)

    expect(deps.obras.todas()).toHaveLength(0)
  })

  it('aceita metadados sem autor', async () => {
    const { obra } = await catalogar(
      BIBLIOTECARIO,
      {
        metadados: { isbn: '9788535902778', titulo: 'Cancioneiro', autores: [] },
        quantidadeDeExemplares: 1,
      },
      deps,
    )

    expect(obra.titulo).toBe('Cancioneiro')
  })
})
