import { describe, it, expect } from 'vitest'
import { NOMES_DE_ICONE } from '@/components/ui/icone-nomes'
import {
  abrirInventario,
  conferirTombo,
  fecharInventario,
  type InventarioRegistrado,
  type ItemDeInventario,
  type RepositorioDeInventario,
} from '@/modules/acervo/inventario.service'
import type { ExemplarRegistrado, SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'
import type { Principal } from '@/core/auth/principal'
import {
  SITUACOES_DA_CONFERENCIA,
  bipadosJaConferidos,
  fraseDaSituacaoNaAbertura,
  fraseDeExemplares,
  fraseDeForaDoEscopo,
  progressoDaConferencia,
  registrarBipagem,
  tombosDoEscopo,
  type TomboBipado,
} from '@/app/painel/inventario/conferencia'

/**
 * A conferência de acervo, provada sem React, sem servidor e sem banco.
 *
 * A tela de inventário é a única do painel que se usa de pé, no meio da
 * estante, com um leitor de código de barras numa mão e o livro na outra.
 * Tudo que ela AFIRMA — quantos já foram bipados, quantos ainda faltam,
 * se este tombo já passou, o que o exemplar constava ser na abertura —
 * sai daqui. É o que permite provar em milissegundos as duas coisas que
 * ela não pode errar:
 *
 *  1. o contador da tela e o relatório de fechamento contam a MESMA
 *     coisa (senão a operadora fecha em "87 de 87" e o relatório diz que
 *     faltam três);
 *  2. nenhum grupo do relatório é dito só pela cor.
 */

const BIBLIOTECARIO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Bibliotecária',
  permissoes: ['inventario:executar'],
}

function item(
  tombo: string,
  campos: Partial<Omit<ItemDeInventario, 'tombo'>> = {},
): ItemDeInventario {
  return {
    exemplarId: `exe_${tombo}`,
    tombo,
    situacaoNaAbertura: 'DISPONIVEL',
    localizacaoEsperadaId: 'loc_1',
    conferido: false,
    localizacaoEncontradaId: null,
    ...campos,
  }
}

describe('registrarBipagem: o que fica na tela depois de cada tombo', () => {
  it('o tombo novo entra na frente, porque é o livro que está na mão', () => {
    const antes: TomboBipado[] = [{ tombo: '000001', foraDoLugar: false, vezes: 1 }]

    const { bipados, resultado } = registrarBipagem(antes, {
      tombo: '000002',
      foraDoLugar: false,
    })

    expect(bipados.map((b) => b.tombo)).toEqual(['000002', '000001'])
    expect(resultado).toBe('CONFERIDO')
  })

  it('marca fora do lugar quando o exemplar pertence a outra estante', () => {
    const { bipados, resultado } = registrarBipagem([], { tombo: '000004', foraDoLugar: true })

    expect(resultado).toBe('FORA_DO_LUGAR')
    expect(bipados.at(0)?.foraDoLugar).toBe(true)
  })

  it('bipar duas vezes o mesmo tombo NÃO duplica a linha', () => {
    // A operadora bipa em sequência e repete sem perceber. Duas linhas
    // iguais na tela fariam o contador dizer 88 numa estante de 87.
    const uma = registrarBipagem([], { tombo: '000001', foraDoLugar: false })
    const outra = registrarBipagem(uma.bipados, { tombo: '000001', foraDoLugar: false })

    expect(outra.bipados).toHaveLength(1)
    expect(outra.bipados.at(0)?.vezes).toBe(2)
    expect(outra.resultado).toBe('REPETIDO')
  })

  it('o repetido volta para a frente da lista, que é onde está a última leitura', () => {
    const uma = registrarBipagem([], { tombo: '000001', foraDoLugar: false })
    const dois = registrarBipagem(uma.bipados, { tombo: '000002', foraDoLugar: false })
    const repetido = registrarBipagem(dois.bipados, { tombo: '000001', foraDoLugar: false })

    expect(repetido.bipados.map((b) => b.tombo)).toEqual(['000001', '000002'])
  })

  it('espaço em volta do tombo não cria um segundo tombo', () => {
    const uma = registrarBipagem([], { tombo: '000001', foraDoLugar: false })
    const outra = registrarBipagem(uma.bipados, { tombo: ' 000001 ', foraDoLugar: false })

    expect(outra.bipados).toHaveLength(1)
    expect(outra.resultado).toBe('REPETIDO')
  })

  it('recusa tombo vazio', () => {
    // Uma linha em branco na lista é uma linha sobre a qual a operadora
    // não tem o que fazer — e ainda infla o contador.
    expect(() => registrarBipagem([], { tombo: '   ', foraDoLugar: false })).toThrow()
  })

  it('não altera a lista que recebeu', () => {
    const antes: TomboBipado[] = [{ tombo: '000001', foraDoLugar: false, vezes: 1 }]

    registrarBipagem(antes, { tombo: '000001', foraDoLugar: false })

    expect(antes).toEqual([{ tombo: '000001', foraDoLugar: false, vezes: 1 }])
  })
})

describe('tombosDoEscopo: o que esta conferência espera achar', () => {
  it('na estante, só os que pertencem a ela', () => {
    const itens = [
      item('000001'),
      item('000002'),
      item('000004', { localizacaoEsperadaId: 'loc_2' }),
    ]

    expect(tombosDoEscopo(itens, 'loc_1')).toEqual(['000001', '000002'])
  })

  it('no acervo inteiro, todos', () => {
    const itens = [item('000001'), item('000004', { localizacaoEsperadaId: 'loc_2' })]

    expect(tombosDoEscopo(itens, null)).toEqual(['000001', '000004'])
  })
})

describe('bipadosJaConferidos: retomar a conferência de ontem', () => {
  it('traz só os que já foram conferidos', () => {
    const itens = [
      item('000001', { conferido: true, localizacaoEncontradaId: 'loc_1' }),
      item('000002'),
    ]

    expect(bipadosJaConferidos(itens, 'loc_1').map((b) => b.tombo)).toEqual(['000001'])
  })

  it('marca fora do lugar quem foi achado numa estante que não é a dele', () => {
    const itens = [
      item('000004', {
        localizacaoEsperadaId: 'loc_2',
        conferido: true,
        localizacaoEncontradaId: 'loc_1',
      }),
    ]

    expect(bipadosJaConferidos(itens, 'loc_1').at(0)?.foraDoLugar).toBe(true)
  })

  it('no acervo inteiro ninguém está fora do lugar', () => {
    // Sem escopo de estante não existe "lugar errado": a conferência
    // cobre o acervo todo, e a localização não foi comparada com nada.
    const itens = [
      item('000004', {
        localizacaoEsperadaId: 'loc_2',
        conferido: true,
        localizacaoEncontradaId: null,
      }),
    ]

    expect(bipadosJaConferidos(itens, null).at(0)?.foraDoLugar).toBe(false)
  })
})

describe('progressoDaConferencia: o número que diz onde a pessoa parou', () => {
  it('conta os do escopo, separa os de outra estante e diz quantos faltam', () => {
    const bipados: TomboBipado[] = [
      { tombo: '000001', foraDoLugar: false, vezes: 1 },
      { tombo: '000004', foraDoLugar: true, vezes: 1 },
    ]

    const progresso = progressoDaConferencia(bipados, ['000001', '000002', '000003'])

    expect(progresso).toEqual({ conferidos: 1, esperados: 3, faltam: 2, foraDoEscopo: 1 })
  })

  it('conferir tudo zera o que falta', () => {
    const bipados: TomboBipado[] = [
      { tombo: '000001', foraDoLugar: false, vezes: 1 },
      { tombo: '000002', foraDoLugar: false, vezes: 1 },
    ]

    expect(progressoDaConferencia(bipados, ['000001', '000002']).faltam).toBe(0)
  })

  it('recusa lista de bipados com tombo repetido', () => {
    // `registrarBipagem` não produz isso. Se aconteceu, o contador da
    // tela passou a somar o mesmo livro duas vezes — e "87 de 87" numa
    // estante com um livro faltando é a pior saída possível.
    const bipados: TomboBipado[] = [
      { tombo: '000001', foraDoLugar: false, vezes: 1 },
      { tombo: '000001', foraDoLugar: false, vezes: 1 },
    ]

    expect(() => progressoDaConferencia(bipados, ['000001'])).toThrow()
  })

  it('recusa escopo com tombo repetido', () => {
    expect(() => progressoDaConferencia([], ['000001', '000001'])).toThrow()
  })

  it('recusa vezes impossível', () => {
    expect(() =>
      progressoDaConferencia([{ tombo: '000001', foraDoLugar: false, vezes: 0 }], ['000001']),
    ).toThrow()
  })
})

describe('as frases que a tela escreve', () => {
  it('escreve o plural de exemplares', () => {
    expect(fraseDeExemplares(1)).toBe('1 exemplar')
    expect(fraseDeExemplares(3)).toBe('3 exemplares')
  })

  it('cala sobre exemplares de outra estante quando não houve nenhum', () => {
    expect(fraseDeForaDoEscopo(0)).toBeNull()
  })

  it('confessa os de outra estante quando houve', () => {
    expect(fraseDeForaDoEscopo(1)).toBe('1 de outra estante')
    expect(fraseDeForaDoEscopo(2)).toBe('2 de outra estante')
  })

  it('tem frase para TODA situação de abertura, inclusive as que nenhuma prancha desenhou', () => {
    // A situação na abertura é o que explica a ausência: um exemplar que
    // constava "no carrinho" não está na estante e não é perda. Faltando
    // a frase, a linha do relatório apareceria sem motivo nenhum.
    const todas: SituacaoDoExemplar[] = [
      'DISPONIVEL',
      'EMPRESTADO',
      'RESERVADO',
      'EM_CARRINHO',
      'EM_MANUTENCAO',
      'EXTRAVIADO',
      'BAIXADO',
    ]

    for (const situacao of todas) {
      expect(fraseDaSituacaoNaAbertura(situacao).length).toBeGreaterThan(0)
    }

    expect(new Set(todas.map(fraseDaSituacaoNaAbertura)).size).toBe(todas.length)
  })
})

describe('nenhum grupo da conferência é dito só pela cor', () => {
  it('todo grupo tem palavra E ícone do inventário do kit', () => {
    const chaves = Object.keys(SITUACOES_DA_CONFERENCIA)
    expect(chaves.length).toBeGreaterThan(0)

    for (const chave of chaves) {
      const aparencia = SITUACOES_DA_CONFERENCIA[chave as keyof typeof SITUACOES_DA_CONFERENCIA]
      expect(aparencia.palavra.trim().length, `${chave} sem palavra`).toBeGreaterThan(0)
      expect(NOMES_DE_ICONE, `${chave} com ícone que não existe`).toContain(aparencia.icone)
    }
  })
})

/**
 * O contador da tela e o relatório de fechamento contam a mesma coisa.
 *
 * A tela precisa dizer "12 de 87" ENQUANTO a conferência corre, e o
 * serviço só devolve `esperados` no fechamento, dias depois. Então a
 * regra de escopo aparece duas vezes no projeto: em `fecharInventario`,
 * que é a autoridade, e em `tombosDoEscopo`, que é o espelho. Este
 * describe amarra os dois — se alguém mudar um lado só, fica vermelho
 * aqui, em vez de a operadora fechar a estante em 100% com um livro
 * faltando.
 */
describe('espelho do serviço', () => {
  function criarFake(exemplares: ExemplarRegistrado[]) {
    const inventarios = new Map<string, InventarioRegistrado>()
    const itens = new Map<string, ItemDeInventario[]>()

    const repo: RepositorioDeInventario = {
      async buscarAbertoPorEscopo(localizacaoId) {
        for (const inv of inventarios.values()) {
          if (inv.status === 'ABERTO' && inv.localizacaoId === localizacaoId) return inv
        }
        return null
      },
      async listarExemplaresDoEscopo(localizacaoId) {
        return localizacaoId === null
          ? exemplares
          : exemplares.filter((e) => e.localizacaoId === localizacaoId)
      },
      async abrir(dados, doEscopo) {
        const inv: InventarioRegistrado = { ...dados, id: 'inv_1', status: 'ABERTO' }
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
      async obter(id) {
        return inventarios.get(id) ?? null
      },
      async listarItens(id) {
        return itens.get(id) ?? []
      },
      async buscarExemplarPorTombo(tombo) {
        return exemplares.find((e) => e.tombo === tombo) ?? null
      },
      async marcarConferido(inventarioId, exemplarId, localizacaoEncontradaId) {
        const lista = itens.get(inventarioId) ?? []
        const existente = lista.find((i) => i.exemplarId === exemplarId)
        if (existente) {
          existente.conferido = true
          existente.localizacaoEncontradaId = localizacaoEncontradaId
          return
        }
        const achado = exemplares.find((e) => e.id === exemplarId)
        if (!achado) throw new Error(`exemplar ${exemplarId} não existe no fake`)
        lista.push({
          exemplarId: achado.id,
          tombo: achado.tombo,
          situacaoNaAbertura: achado.situacao,
          localizacaoEsperadaId: achado.localizacaoId,
          conferido: true,
          localizacaoEncontradaId,
        })
        itens.set(inventarioId, lista)
      },
      async fechar(id) {
        const inv = inventarios.get(id)
        if (inv) inventarios.set(id, { ...inv, status: 'FECHADO' })
      },
    }

    return { inventario: repo }
  }

  function exemplar(
    tombo: string,
    situacao: SituacaoDoExemplar,
    localizacaoId: string | null,
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

  const ACERVO = [
    exemplar('000001', 'DISPONIVEL', 'loc_1'),
    exemplar('000002', 'DISPONIVEL', 'loc_1'),
    exemplar('000003', 'EMPRESTADO', 'loc_1'),
    exemplar('000004', 'DISPONIVEL', 'loc_2'),
  ]

  it('tombosDoEscopo conta exatamente o que o relatório chama de esperados', async () => {
    const deps = criarFake(ACERVO.map((e) => ({ ...e })))
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    // O de outra estante aparece aqui e NÃO pode inflar o esperado.
    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000004' }, deps)

    const itens = await deps.inventario.listarItens(inv.id)
    const relatorio = await fecharInventario(BIBLIOTECARIO, inv.id, deps)

    expect(tombosDoEscopo(itens, inv.localizacaoId)).toHaveLength(relatorio.esperados)
  })

  it('bipadosJaConferidos concorda com a lista de fora do lugar do relatório', async () => {
    const deps = criarFake(ACERVO.map((e) => ({ ...e })))
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000001' }, deps)
    await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo: '000004' }, deps)

    const itens = await deps.inventario.listarItens(inv.id)
    const retomada = bipadosJaConferidos(itens, inv.localizacaoId)
    const relatorio = await fecharInventario(BIBLIOTECARIO, inv.id, deps)

    expect(retomada.filter((b) => b.foraDoLugar).map((b) => b.tombo)).toEqual(
      relatorio.foraDoLugar.map((i) => i.tombo),
    )
  })

  it('o progresso da tela concorda com os conferidos do relatório', async () => {
    const deps = criarFake(ACERVO.map((e) => ({ ...e })))
    const inv = await abrirInventario(BIBLIOTECARIO, { localizacaoId: 'loc_1' }, deps)

    // Uma bipagem do escopo, uma de fora e uma repetida: as três coisas
    // que fazem o contador da tela divergir do relatório.
    let bipados: TomboBipado[] = []
    for (const tombo of ['000001', '000004', '000001']) {
      const leitura = await conferirTombo(BIBLIOTECARIO, { inventarioId: inv.id, tombo }, deps)
      bipados = registrarBipagem(bipados, leitura).bipados
    }

    const itens = await deps.inventario.listarItens(inv.id)
    const progresso = progressoDaConferencia(bipados, tombosDoEscopo(itens, inv.localizacaoId))
    const relatorio = await fecharInventario(BIBLIOTECARIO, inv.id, deps)

    expect(progresso.conferidos).toBe(relatorio.conferidos)
    expect(progresso.esperados).toBe(relatorio.esperados)
    expect(progresso.faltam).toBe(
      relatorio.naoEncontrados.length + relatorio.constamEmprestados.length,
    )
  })
})
