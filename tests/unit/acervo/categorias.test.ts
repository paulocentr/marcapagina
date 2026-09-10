import { describe, it, expect, beforeEach } from 'vitest'
import {
  criarCategoria,
  excluirCategoria,
  listarCategoriasEmArvore,
  CategoriaMaeInexistenteError,
  CategoriaEmUsoError,
  type RepositorioDeCategorias,
  type CategoriaRegistrada,
} from '@/modules/acervo/categorias.service'
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

function criarFakeDeCategorias(iniciais: CategoriaRegistrada[] = []) {
  const porId = new Map(iniciais.map((c) => [c.id, c]))
  let proximo = 1
  const obrasPorCategoria = new Map<string, number>()

  return {
    definirContagemDeObras(id: string, n: number) {
      obrasPorCategoria.set(id, n)
    },
    todas: () => [...porId.values()],
    async listar() {
      return [...porId.values()]
    },
    async obter(id: string) {
      return porId.get(id) ?? null
    },
    async criar(dados: { nome: string; cor?: string; parentId?: string }) {
      const nova: CategoriaRegistrada = {
        id: `cat_${proximo++}`,
        nome: dados.nome,
        cor: dados.cor ?? null,
        parentId: dados.parentId ?? null,
      }
      porId.set(nova.id, nova)
      return nova
    },
    async contarObras(id: string) {
      return obrasPorCategoria.get(id) ?? 0
    },
    async excluir(id: string) {
      porId.delete(id)
    },
  } satisfies RepositorioDeCategorias & Record<string, unknown>
}

let deps: { categorias: ReturnType<typeof criarFakeDeCategorias> }

beforeEach(() => {
  deps = { categorias: criarFakeDeCategorias() }
})

describe('criarCategoria', () => {
  it('cria uma categoria raiz', async () => {
    const criada = await criarCategoria(COORDENACAO, { nome: 'Literatura' }, deps)
    expect(criada.parentId).toBeNull()
  })

  it('recusa nome vazio ou só espaço', async () => {
    await expect(criarCategoria(COORDENACAO, { nome: '   ' }, deps)).rejects.toThrow()
  })

  it('recusa categoria-mãe inexistente com mensagem própria', async () => {
    // Deixar a FK reclamar entregaria um erro em inglês, do Postgres,
    // para uma coordenadora pedagógica.
    await expect(
      criarCategoria(COORDENACAO, { nome: 'Infantil', parentId: 'nao_existe' }, deps),
    ).rejects.toBeInstanceOf(CategoriaMaeInexistenteError)
  })

  it('recusa sem permissão config:editar', async () => {
    await expect(criarCategoria(MONITOR, { nome: 'Literatura' }, deps)).rejects.toBeInstanceOf(
      SemPermissaoError,
    )
  })
})

describe('excluirCategoria', () => {
  it('recusa quando há obra usando, e diz quantas', async () => {
    const cat = await criarCategoria(COORDENACAO, { nome: 'Literatura' }, deps)
    deps.categorias.definirContagemDeObras(cat.id, 7)

    const erro = await excluirCategoria(COORDENACAO, cat.id, deps).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(CategoriaEmUsoError)
    expect((erro as CategoriaEmUsoError).message).toContain('7')
  })

  it('exclui quando não há obra nenhuma', async () => {
    const cat = await criarCategoria(COORDENACAO, { nome: 'Literatura' }, deps)
    await excluirCategoria(COORDENACAO, cat.id, deps)

    expect(deps.categorias.todas()).toHaveLength(0)
  })
})

describe('listarCategoriasEmArvore', () => {
  it('aninha a filha dentro da mãe', async () => {
    const mae = await criarCategoria(COORDENACAO, { nome: 'Literatura' }, deps)
    await criarCategoria(COORDENACAO, { nome: 'Infantojuvenil', parentId: mae.id }, deps)

    const arvore = await listarCategoriasEmArvore(deps)

    expect(arvore).toHaveLength(1)
    expect(arvore[0]?.filhas.map((f) => f.nome)).toEqual(['Infantojuvenil'])
  })

  it('categoria cuja mãe sumiu vira raiz em vez de desaparecer', async () => {
    // Some-se ela e a operadora concluiria que perdeu a classificação.
    deps = {
      categorias: criarFakeDeCategorias([
        { id: 'cat_orfa', nome: 'Órfã', cor: null, parentId: 'mae_que_sumiu' },
      ]),
    }

    const arvore = await listarCategoriasEmArvore(deps)

    expect(arvore.map((c) => c.nome)).toEqual(['Órfã'])
  })

  it('não entra em laço com hierarquia funda', async () => {
    const a = await criarCategoria(COORDENACAO, { nome: 'A' }, deps)
    const b = await criarCategoria(COORDENACAO, { nome: 'B', parentId: a.id }, deps)
    await criarCategoria(COORDENACAO, { nome: 'C', parentId: b.id }, deps)

    const arvore = await listarCategoriasEmArvore(deps)

    expect(arvore[0]?.filhas[0]?.filhas[0]?.nome).toBe('C')
  })
})
