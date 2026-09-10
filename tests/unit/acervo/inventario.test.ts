import { describe, it, expect, beforeEach } from 'vitest'
import {
  abrirInventario,
  conferirTombo,
  fecharInventario,
  InventarioJaAbertoError,
  InventarioFechadoError,
  TomboDesconhecidoError,
  type RepositorioDeInventario,
  type ItemDeInventario,
  type InventarioRegistrado,
} from '@/modules/acervo/inventario.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import type { ExemplarRegistrado } from '@/modules/acervo/exemplares.service'

const BIBLIOTECARIO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Bibliotecária',
  permissoes: ['inventario:executar'],
}

const MONITOR: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['obra:ver'],
}

function exemplar(
  tombo: string,
  situacao: ExemplarRegistrado['situacao'] = 'DISPONIVEL',
  localizacaoId: string | null = 'loc_1',
): ExemplarRegistrado {
  return {
    id: `exe_${tombo}`,
    obraId: 'obr_1',
    tombo,
    estado: 'BOM',
    situacao,
    localizacaoId,
    origem: 'COMPRA',
    observacao: null,
  }
}

function criarFakeDeInventario(exemplares: ExemplarRegistrado[]) {
  const inventarios = new Map<string, InventarioRegistrado>()
  const itens = new Map<string, ItemDeInventario[]>()
  let proximo = 1

  return {
    async buscarAbertoPorEscopo(localizacaoId: string | null) {
      for (const inv of inventarios.values()) {
        if (inv.status === 'ABERTO' && inv.localizacaoId === localizacaoId) return inv
      }
      return null
    },
    async listarExemplaresDoEscopo(localizacaoId: string | null) {
      return localizacaoId === null
        ? exemplares
        : exemplares.filter((e) => e.localizacaoId === localizacaoId)
    },
    async abrir(dados: Omit<InventarioRegistrado, 'id' | 'status'>, doEscopo: ExemplarRegistrado[]) {
      const inv: InventarioRegistrado = { ...dados, id: `inv_${proximo++}`, status: 'ABERTO' }
      inventarios.set(inv.id, inv)
      itens.set(
        inv.id,
        doEscopo.map((e) => ({
          exemplarId: e.id,
          tombo: e.tombo,
          situacaoNaAbertura: e.situacao,
          localizacaoEsperadaId: e.localizacaoId,
          conferido: false,
          localizacaoEncontradaId: null,
        })),
      )
      return inv
    },
    async obter(id: string) {
      return inventarios.get(id) ?? null
    },
    async listarItens(id: string) {
      return itens.get(id) ?? []
    },
    async buscarExemplarPorTombo(tombo: string) {
      return exemplares.find((e) => e.tombo === tombo) ?? null
    },
    async marcarConferido(
      inventarioId: string,
      exemplarId: string,
      localizacaoEncontradaId: string | null,
    ) {
      const lista = itens.get(inventarioId) ?? []
      const existente = lista.find((i) => i.exemplarId === exemplarId)
      if (existente) {
        existente.conferido = true
        existente.localizacaoEncontradaId = localizacaoEncontradaId
        return
      }
      // Exemplar de fora do escopo aparecendo na estante conferida.
      const e = exemplares.find((x) => x.id === exemplarId)!
      lista.push({
        exemplarId: e.id,
        tombo: e.tombo,
        situacaoNaAbertura: e.situacao,
        localizacaoEsperadaId: e.localizacaoId,
        conferido: true,
        localizacaoEncontradaId,
      })
      itens.set(inventarioId, lista)
    },
    async fechar(id: string) {
      const inv = inventarios.get(id)
      if (inv) inventarios.set(id, { ...inv, status: 'FECHADO' })
    },
  } satisfies RepositorioDeInventario & Record<string, unknown>
}

let deps: { inventario: ReturnType<typeof criarFakeDeInventario> }

const ACERVO = [
  exemplar('000001'),
  exemplar('000002'),
  exemplar('000003', 'EMPRESTADO'),
  exemplar('000004', 'DISPONIVEL', 'loc_2'),
]

beforeEach(() => {
  deps = { inventario: criarFakeDeInventario(ACERVO.map((e) => ({ ...e }))) }
})

describe('abrirInventario', () => {
  it('abre uma sessão para a localização', async () => {
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    expect(inv.status).toBe('ABERTO')
    expect(inv.responsavelNome).toBe('Bibliotecária')
  })

  it('congela os exemplares do escopo na abertura', async () => {
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)
    const itens = await deps.inventario.listarItens(inv.id)

    // Só os da loc_1: a operadora percorre UMA estante por vez.
    expect(itens.map((i) => i.tombo).sort()).toEqual(['000001', '000002', '000003'])
  })

  it('recusa abrir uma segunda sessão para a mesma localização', async () => {
    // Duas sessões abertas na mesma estante produzem duas verdades sobre
    // o mesmo acervo, e nenhuma das duas confiável.
    await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    await expect(
      abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps),
    ).rejects.toBeInstanceOf(InventarioJaAbertoError)
  })

  it('permite sessões simultâneas em localizações diferentes', async () => {
    await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    const outra = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_2' }, deps)
    expect(outra.status).toBe('ABERTO')
  })

  it('recusa sem permissão inventario:executar', async () => {
    await expect(
      abrirInventario(MONITOR, { localizacaoId: 'loc_1' }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('conferirTombo', () => {
  it('marca o exemplar como conferido', async () => {
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000001' }, deps)

    const itens = await deps.inventario.listarItens(inv.id)
    expect(itens.find((i) => i.tombo === '000001')?.conferido).toBe(true)
  })

  it('aceita tombo de exemplar que pertence a OUTRA estante', async () => {
    // É exatamente o "fora do lugar" que o inventário existe para achar.
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000004' }, deps)

    const itens = await deps.inventario.listarItens(inv.id)
    expect(itens.find((i) => i.tombo === '000004')?.conferido).toBe(true)
  })

  it('recusa tombo que não existe no acervo', async () => {
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    await expect(
      conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '999999' }, deps),
    ).rejects.toBeInstanceOf(TomboDesconhecidoError)
  })

  it('recusa conferir em inventário já fechado', async () => {
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)
    await fecharInventario(BIBLIOTECARIO, inv.id, deps)

    await expect(
      conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000001' }, deps),
    ).rejects.toBeInstanceOf(InventarioFechadoError)
  })

  it('conferir duas vezes o mesmo tombo não é erro', async () => {
    // A operadora bipa em sequência e repete sem perceber; recusar aqui
    // seria um alarme falso no meio da estante.
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000001' }, deps)
    await expect(
      conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000001' }, deps),
    ).resolves.toBeDefined()
  })
})

describe('fecharInventario', () => {
  it('produz AS TRÊS listas', async () => {
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    // 000001 conferido no lugar certo.
    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000001' }, deps)
    // 000004 é da loc_2 e apareceu aqui: fora do lugar.
    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000004' }, deps)
    // 000002 não apareceu e deveria: não encontrado.
    // 000003 não apareceu porque está emprestado: não é perda.

    const relatorio = await fecharInventario(BIBLIOTECARIO, inv.id, deps)

    expect(relatorio.naoEncontrados.map((i) => i.tombo)).toEqual(['000002'])
    expect(relatorio.foraDoLugar.map((i) => i.tombo)).toEqual(['000004'])
    expect(relatorio.constamEmprestados.map((i) => i.tombo)).toEqual(['000003'])
  })

  it('emprestado ausente NÃO entra em não encontrado', async () => {
    // Confundir os dois faria a coordenação caçar um livro que está
    // legitimamente na mochila de um aluno.
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)
    const relatorio = await fecharInventario(BIBLIOTECARIO, inv.id, deps)

    expect(relatorio.naoEncontrados.map((i) => i.tombo)).not.toContain('000003')
  })

  it('conferir tudo deixa as três listas vazias', async () => {
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)
    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000001' }, deps)
    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000002' }, deps)
    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000003' }, deps)

    const relatorio = await fecharInventario(BIBLIOTECARIO, inv.id, deps)

    expect(relatorio.naoEncontrados).toEqual([])
    expect(relatorio.foraDoLugar).toEqual([])
    // Emprestado que APARECEU na estante saiu do "consta emprestado":
    // ele está aqui, então a lista não tem o que cobrar.
    expect(relatorio.constamEmprestados).toEqual([])
  })

  it('conta quantos foram conferidos', async () => {
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)
    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000001' }, deps)

    const relatorio = await fecharInventario(BIBLIOTECARIO, inv.id, deps)

    expect(relatorio.conferidos).toBe(1)
    expect(relatorio.esperados).toBe(3)
  })

  it('exemplar de outra estante não infla o total esperado', async () => {
    // Se inflasse, a conferência nunca fecharia em 100% e o número
    // perderia o sentido de "terminei esta estante".
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)
    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000004' }, deps)

    const relatorio = await fecharInventario(BIBLIOTECARIO, inv.id, deps)

    expect(relatorio.esperados).toBe(3)
    expect(relatorio.foraDoLugar.map((i) => i.tombo)).toEqual(['000004'])
  })

  it('fechar duas vezes é recusado', async () => {
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)
    await fecharInventario(BIBLIOTECARIO, inv.id, deps)

    await expect(fecharInventario(BIBLIOTECARIO, inv.id, deps)).rejects.toBeInstanceOf(
      InventarioFechadoError,
    )
  })

  it('recusa sem permissão inventario:executar', async () => {
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    await expect(fecharInventario(MONITOR, inv.id, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })
})
