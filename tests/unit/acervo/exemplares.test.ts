import { describe, it, expect, beforeEach } from 'vitest'
import {
  criarExemplares,
  baixarExemplar,
  QuantidadeInvalidaError,
  ExemplarEmprestadoError,
  ExemplarInexistenteError,
  LIMITE_DE_EXEMPLARES_POR_VEZ,
} from '@/modules/acervo/exemplares.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import { criarFakeDeExemplares } from '../../apoio/fakes/acervo.fake'

const BIBLIOTECARIO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Bibliotecária',
  permissoes: ['exemplar:criar', 'exemplar:editar', 'exemplar:baixar'],
}

const MONITOR: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['obra:ver'],
}

let deps: { exemplares: ReturnType<typeof criarFakeDeExemplares> }

beforeEach(() => {
  deps = { exemplares: criarFakeDeExemplares() }
})

describe('criarExemplares', () => {
  it('cria a quantidade pedida', async () => {
    const criados = await criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: 3 }, deps)
    expect(criados).toHaveLength(3)
  })

  it('recusa quantidade zero', async () => {
    await expect(
      criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: 0 }, deps),
    ).rejects.toBeInstanceOf(QuantidadeInvalidaError)
  })

  it('recusa quantidade negativa', async () => {
    await expect(
      criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: -5 }, deps),
    ).rejects.toBeInstanceOf(QuantidadeInvalidaError)
  })

  it('recusa quantidade fracionária', async () => {
    await expect(
      criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: 2.5 }, deps),
    ).rejects.toBeInstanceOf(QuantidadeInvalidaError)
  })

  it('recusa quantidade absurda de uma vez', async () => {
    // Um zero a mais em "10" vira 100 exemplares e uma limpeza manual —
    // com tombos já queimados, que não voltam.
    await expect(
      criarExemplares(
        BIBLIOTECARIO,
        { obraId: 'obr_1', quantidade: LIMITE_DE_EXEMPLARES_POR_VEZ + 1 },
        deps,
      ),
    ).rejects.toBeInstanceOf(QuantidadeInvalidaError)
  })

  it('a recusa por excesso diz qual é o limite', async () => {
    const erro = await criarExemplares(
      BIBLIOTECARIO,
      { obraId: 'obr_1', quantidade: 5000 },
      deps,
    ).catch((e: unknown) => e)

    expect((erro as Error).message).toContain(String(LIMITE_DE_EXEMPLARES_POR_VEZ))
  })

  it('não escreve nada quando a quantidade é inválida', async () => {
    await criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: 0 }, deps).catch(
      () => undefined,
    )
    expect(deps.exemplares.todos()).toHaveLength(0)
  })

  it('recusa sem permissão exemplar:criar', async () => {
    await expect(
      criarExemplares(MONITOR, { obraId: 'obr_1', quantidade: 1 }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('exemplar nasce DISPONIVEL', async () => {
    // Estoque é contagem de exemplares disponíveis (spec §2.2); nascer em
    // qualquer outra situação faria o livro novo não aparecer no acervo.
    const [criado] = await criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: 1 }, deps)
    expect(criado?.situacao).toBe('DISPONIVEL')
  })

  it('repassa localização e origem informadas', async () => {
    const [criado] = await criarExemplares(
      BIBLIOTECARIO,
      { obraId: 'obr_1', quantidade: 1, localizacaoId: 'loc_1', origem: 'DOACAO' },
      deps,
    )
    expect(criado?.origem).toBe('DOACAO')
    expect(criado?.localizacaoId).toBe('loc_1')
  })
})

describe('baixarExemplar', () => {
  it('marca como BAIXADO com o motivo', async () => {
    const [criado] = await criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: 1 }, deps)

    const baixado = await baixarExemplar(
      BIBLIOTECARIO,
      { exemplarId: criado!.id, situacao: 'BAIXADO', motivo: 'capa destruída' },
      deps,
    )

    expect(baixado.situacao).toBe('BAIXADO')
    expect(baixado.observacao).toContain('capa destruída')
  })

  it('aceita EXTRAVIADO como baixa', async () => {
    const [criado] = await criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: 1 }, deps)

    const baixado = await baixarExemplar(
      BIBLIOTECARIO,
      { exemplarId: criado!.id, situacao: 'EXTRAVIADO', motivo: 'não achado no inventário' },
      deps,
    )

    expect(baixado.situacao).toBe('EXTRAVIADO')
  })

  it('recusa baixar exemplar que está emprestado', async () => {
    // O livro está com um aluno. Dar baixa aqui esconderia um empréstimo
    // em aberto e o exemplar sumiria da cobrança sem ter voltado.
    const [criado] = await criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: 1 }, deps)
    deps.exemplares.definirSituacao(criado!.id, 'EMPRESTADO')

    await expect(
      baixarExemplar(
        BIBLIOTECARIO,
        { exemplarId: criado!.id, situacao: 'BAIXADO', motivo: 'x' },
        deps,
      ),
    ).rejects.toBeInstanceOf(ExemplarEmprestadoError)
  })

  it('exige motivo', async () => {
    // Baixa sem motivo é acervo sumindo sem explicação no relatório.
    const [criado] = await criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: 1 }, deps)

    await expect(
      baixarExemplar(
        BIBLIOTECARIO,
        { exemplarId: criado!.id, situacao: 'BAIXADO', motivo: '   ' },
        deps,
      ),
    ).rejects.toThrow()
  })

  it('recusa exemplar inexistente', async () => {
    await expect(
      baixarExemplar(
        BIBLIOTECARIO,
        { exemplarId: 'nao_existe', situacao: 'BAIXADO', motivo: 'x' },
        deps,
      ),
    ).rejects.toBeInstanceOf(ExemplarInexistenteError)
  })

  it('recusa sem permissão exemplar:baixar', async () => {
    const [criado] = await criarExemplares(BIBLIOTECARIO, { obraId: 'obr_1', quantidade: 1 }, deps)

    await expect(
      baixarExemplar(MONITOR, { exemplarId: criado!.id, situacao: 'BAIXADO', motivo: 'x' }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})
