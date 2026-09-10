import { describe, it, expect, beforeEach } from 'vitest'
import { normalizarNomeDeAutor, garantirAutores } from '@/modules/acervo/autores.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import { criarFakeDeAutores } from '../../apoio/fakes/acervo.fake'

const BIBLIOTECARIO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Bibliotecária',
  permissoes: ['obra:criar'],
}

const MONITOR: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['obra:ver'],
}

let deps: { autores: ReturnType<typeof criarFakeDeAutores> }

beforeEach(() => {
  deps = { autores: criarFakeDeAutores() }
})

describe('normalizarNomeDeAutor', () => {
  it('ignora acento, caixa e espaço repetido', () => {
    expect(normalizarNomeDeAutor('  Clarice   LISPECTOR ')).toBe(
      normalizarNomeDeAutor('clarice lispector'),
    )
    expect(normalizarNomeDeAutor('Machado de Assis')).toBe(
      normalizarNomeDeAutor('MACHADO DE ASSÍS'),
    )
  })

  it('não colapsa autores diferentes', () => {
    expect(normalizarNomeDeAutor('Ana Maria Machado')).not.toBe(
      normalizarNomeDeAutor('Ana Machado'),
    )
  })

  it('preserva letras não latinas em vez de apagá-las', () => {
    // Um regex ganancioso demais transformaria um nome inteiro em string
    // vazia, e todos esses autores colidiriam num único registro vazio.
    expect(normalizarNomeDeAutor('Александр Пушкин')).not.toBe('')
    expect(normalizarNomeDeAutor('村上 春樹')).not.toBe('')
    expect(normalizarNomeDeAutor('Александр Пушкин')).not.toBe(normalizarNomeDeAutor('村上 春樹'))
  })
})

describe('garantirAutores', () => {
  it('cria os autores que faltam e devolve os ids na ordem recebida', async () => {
    const ids = await garantirAutores(BIBLIOTECARIO, ['Machado de Assis', 'Clarice Lispector'], deps)

    expect(ids).toHaveLength(2)
    expect(deps.autores.todos().map((a) => a.nome)).toEqual([
      'Machado de Assis',
      'Clarice Lispector',
    ])
  })

  it('não duplica autor já existente, mesmo escrito diferente', async () => {
    const [primeiro] = await garantirAutores(BIBLIOTECARIO, ['Machado de Assis'], deps)
    const [segundo] = await garantirAutores(BIBLIOTECARIO, ['MACHADO DE ASSÍS'], deps)

    expect(segundo).toBe(primeiro)
    expect(deps.autores.todos()).toHaveLength(1)
  })

  it('preserva a grafia da primeira vez no campo exibido', async () => {
    // O normalizado é chave de deduplicação, não o que aparece na tela.
    await garantirAutores(BIBLIOTECARIO, ['Machado de Assis'], deps)
    await garantirAutores(BIBLIOTECARIO, ['MACHADO DE ASSIS'], deps)

    expect(deps.autores.todos()[0]?.nome).toBe('Machado de Assis')
  })

  it('deduplica repetição dentro da MESMA chamada', async () => {
    // Um provedor de metadados devolvendo o autor duas vezes não pode
    // virar violação de unicidade em plena catalogação em série.
    const ids = await garantirAutores(BIBLIOTECARIO, ['Ziraldo', 'ZIRALDO'], deps)

    expect(deps.autores.todos()).toHaveLength(1)
    expect(ids[0]).toBe(ids[1])
  })

  it('ignora nome vazio ou só espaço', async () => {
    const ids = await garantirAutores(BIBLIOTECARIO, ['  ', '', 'Ziraldo'], deps)

    expect(ids).toHaveLength(1)
    expect(deps.autores.todos()).toHaveLength(1)
  })

  it('recusa sem permissão obra:criar', async () => {
    await expect(garantirAutores(MONITOR, ['Ziraldo'], deps)).rejects.toBeInstanceOf(
      SemPermissaoError,
    )
  })

  it('não escreve nada quando a permissão falta', async () => {
    await garantirAutores(MONITOR, ['Ziraldo'], deps).catch(() => undefined)
    expect(deps.autores.todos()).toHaveLength(0)
  })

  it('faz uma busca e uma escrita, não uma por autor', async () => {
    // N+1 aqui é a diferença entre catalogação fluida e travada.
    await garantirAutores(BIBLIOTECARIO, ['A', 'B', 'C', 'D'], deps)

    expect(deps.autores.chamadasDeBusca).toBe(1)
    expect(deps.autores.chamadasDeCriacao).toBe(1)
  })

  it('não chama a criação quando todos já existem', async () => {
    await garantirAutores(BIBLIOTECARIO, ['Ziraldo'], deps)
    deps.autores.zerarContadores()

    await garantirAutores(BIBLIOTECARIO, ['Ziraldo'], deps)

    expect(deps.autores.chamadasDeCriacao).toBe(0)
  })
})
