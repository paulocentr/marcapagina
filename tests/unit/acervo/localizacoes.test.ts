import { describe, it, expect, beforeEach } from 'vitest'
import {
  criarLocalizacao,
  descreverLocalizacao,
  type RepositorioDeLocalizacoes,
  type LocalizacaoRegistrada,
} from '@/modules/acervo/localizacoes.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

const COORDENACAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: ['config:editar'],
}

const MONITOR: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['obra:ver'],
}

function criarFakeDeLocalizacoes() {
  const porId = new Map<string, LocalizacaoRegistrada>()
  let proximo = 1

  return {
    todas: () => [...porId.values()],
    async listar() {
      return [...porId.values()]
    },
    async criar(dados: Omit<LocalizacaoRegistrada, 'id'>) {
      const nova = { id: `loc_${proximo++}`, ...dados }
      porId.set(nova.id, nova)
      return nova
    },
  } satisfies RepositorioDeLocalizacoes & Record<string, unknown>
}

let deps: { localizacoes: ReturnType<typeof criarFakeDeLocalizacoes> }

beforeEach(() => {
  deps = { localizacoes: criarFakeDeLocalizacoes() }
})

describe('criarLocalizacao', () => {
  it('cria com corredor, estante e prateleira', async () => {
    const criada = await criarLocalizacao(
      COORDENACAO,
      { nome: 'Infantil A', corredor: '2', estante: 'B', prateleira: '3' },
      deps,
    )

    expect(criada.nome).toBe('Infantil A')
    expect(criada.corredor).toBe('2')
  })

  it('aceita localização só com nome', async () => {
    // Nem toda biblioteca escolar tem corredor numerado. Exigir os três
    // campos barraria a escola que guarda tudo em "Armário da sala 5".
    const criada = await criarLocalizacao(COORDENACAO, { nome: 'Armário da sala 5' }, deps)

    expect(criada.corredor).toBeNull()
  })

  it('recusa nome vazio', async () => {
    await expect(criarLocalizacao(COORDENACAO, { nome: '  ' }, deps)).rejects.toThrow()
  })

  it('recusa sem permissão config:editar', async () => {
    await expect(
      criarLocalizacao(MONITOR, { nome: 'Infantil A' }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('descreverLocalizacao', () => {
  it('monta o caminho físico legível', () => {
    expect(
      descreverLocalizacao({
        id: 'l1',
        nome: 'Infantil A',
        corredor: '2',
        estante: 'B',
        prateleira: '3',
      }),
    ).toBe('Infantil A · corredor 2 · estante B · prateleira 3')
  })

  it('omite o que não foi informado, sem deixar separador solto', () => {
    // "Infantil A ·  · " é o tipo de saída que faz a operadora achar que
    // o sistema perdeu o dado.
    expect(
      descreverLocalizacao({
        id: 'l1',
        nome: 'Infantil A',
        corredor: null,
        estante: 'B',
        prateleira: null,
      }),
    ).toBe('Infantil A · estante B')
  })

  it('localização só com nome descreve só o nome', () => {
    expect(
      descreverLocalizacao({
        id: 'l1',
        nome: 'Armário da sala 5',
        corredor: null,
        estante: null,
        prateleira: null,
      }),
    ).toBe('Armário da sala 5')
  })
})
