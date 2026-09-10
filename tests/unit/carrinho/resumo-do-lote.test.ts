import { describe, it, expect } from 'vitest'
import {
  montarResumoDoLote,
  type ItemMontado,
  type RetornoDoLote,
} from '@/app/painel/carrinho/resumo-do-lote'

function item(alunoId: string, tombo: string, alunoNome = alunoId): ItemMontado {
  return { alunoId, alunoNome, matricula: `mat-${alunoId}`, tombo, titulo: null }
}

const VAZIO: RetornoDoLote = { emprestados: [], recusados: [] }

describe('montarResumoDoLote', () => {
  it('a linha do aluno emprestado carrega a data de devolução', () => {
    const resumo = montarResumoDoLote([item('alu_1', '000001')], {
      emprestados: [{ alunoId: 'alu_1', tombo: '000001', previstaPara: '26/09/2026' }],
      recusados: [],
    })

    expect(resumo.linhas).toHaveLength(1)
    expect(resumo.linhas[0]!.situacao).toBe('EMPRESTADO')
    expect(resumo.linhas[0]!.previstaPara).toBe('26/09/2026')
    expect(resumo.linhas[0]!.motivo).toBeNull()
    expect(resumo.emprestados).toBe(1)
  })

  it('a linha do aluno recusado carrega o motivo, e não uma data', () => {
    const resumo = montarResumoDoLote([item('alu_1', '000001')], {
      emprestados: [],
      recusados: [
        { alunoId: 'alu_1', tombo: '000001', motivo: 'Leitor suspenso até 22/09/2026.' },
      ],
    })

    expect(resumo.linhas[0]!.situacao).toBe('RECUSADO')
    expect(resumo.linhas[0]!.motivo).toBe('Leitor suspenso até 22/09/2026.')
    expect(resumo.linhas[0]!.previstaPara).toBeNull()
    expect(resumo.recusados).toBe(1)
  })

  // ESTE é o ponto do recurso. Se um bloqueio derrubasse o lote, a
  // operadora voltaria a lançar um aluno por vez — que é exatamente o que
  // o Carrinho existe para evitar.
  it('a recusa de um aluno NÃO derruba os empréstimos dos outros', () => {
    const resumo = montarResumoDoLote(
      [item('alu_1', '000001'), item('alu_2', '000002'), item('alu_3', '000003')],
      {
        emprestados: [
          { alunoId: 'alu_1', tombo: '000001', previstaPara: '26/09/2026' },
          { alunoId: 'alu_3', tombo: '000003', previstaPara: '26/09/2026' },
        ],
        recusados: [{ alunoId: 'alu_2', tombo: '000002', motivo: 'Já está com 3 livros.' }],
      },
    )

    expect(resumo.emprestados).toBe(2)
    expect(resumo.recusados).toBe(1)
    expect(resumo.naoLancados).toBe(0)
    expect(resumo.linhas.map((l) => l.situacao)).toEqual([
      'EMPRESTADO',
      'RECUSADO',
      'EMPRESTADO',
    ])
  })

  it('preserva a ordem em que a operadora bipou, não a do resultado', () => {
    const resumo = montarResumoDoLote(
      [item('alu_1', '000001'), item('alu_2', '000002')],
      {
        emprestados: [
          { alunoId: 'alu_2', tombo: '000002', previstaPara: '26/09/2026' },
          { alunoId: 'alu_1', tombo: '000001', previstaPara: '26/09/2026' },
        ],
        recusados: [],
      },
    )

    expect(resumo.linhas.map((l) => l.tombo)).toEqual(['000001', '000002'])
  })

  // O lote interrompido (banco fora do ar) devolve o parcial. O que não
  // foi tentado tem de aparecer como NÃO LANÇADO: sem isso a operadora
  // relançaria o lote inteiro às cegas e emprestaria de novo o que já saiu.
  it('o que não foi tentado aparece como não lançado', () => {
    const resumo = montarResumoDoLote(
      [item('alu_1', '000001'), item('alu_2', '000002'), item('alu_3', '000003')],
      {
        emprestados: [{ alunoId: 'alu_1', tombo: '000001', previstaPara: '26/09/2026' }],
        recusados: [{ alunoId: 'alu_2', tombo: '000002', motivo: 'Leitor suspenso.' }],
      },
    )

    expect(resumo.naoLancados).toBe(1)
    expect(resumo.linhas[2]!.situacao).toBe('NAO_LANCADO')
    expect(resumo.linhas[2]!.previstaPara).toBeNull()
    expect(resumo.linhas[2]!.motivo).toBeNull()
  })

  it('nada lançado ainda deixa as três contagens coerentes', () => {
    const resumo = montarResumoDoLote([item('alu_1', '000001')], VAZIO)

    expect(resumo.emprestados).toBe(0)
    expect(resumo.recusados).toBe(0)
    expect(resumo.naoLancados).toBe(1)
  })

  // O mesmo aluno leva dois livros: o par aluno+tombo é a identidade da
  // linha. Casar só pelo aluno faria o segundo livro herdar o resultado do
  // primeiro — e a operadora entregaria um livro que o sistema recusou.
  it('casa pelo par aluno e tombo, não pelo aluno', () => {
    const resumo = montarResumoDoLote(
      [item('alu_1', '000001'), item('alu_1', '000002')],
      {
        emprestados: [{ alunoId: 'alu_1', tombo: '000001', previstaPara: '26/09/2026' }],
        recusados: [{ alunoId: 'alu_1', tombo: '000002', motivo: 'Já está com 3 livros.' }],
      },
    )

    expect(resumo.linhas[0]!.situacao).toBe('EMPRESTADO')
    expect(resumo.linhas[1]!.situacao).toBe('RECUSADO')
  })

  it('recusa que não casa com nenhum item montado é erro, não linha some da tela', () => {
    // Um resultado sem linha correspondente significa que a tela está
    // mostrando um lote diferente do que o servidor processou. Deixar
    // passar em silêncio esconderia um livro que saiu fisicamente.
    expect(() =>
      montarResumoDoLote([item('alu_1', '000001')], {
        emprestados: [{ alunoId: 'alu_9', tombo: '000009', previstaPara: '26/09/2026' }],
        recusados: [],
      }),
    ).toThrow(/não casa/i)
  })
})

describe('recusas agrupadas por motivo', () => {
  it('junta os motivos iguais e põe o mais frequente na frente', () => {
    const resumo = montarResumoDoLote(
      [
        item('alu_1', '000001'),
        item('alu_2', '000002'),
        item('alu_3', '000003'),
        item('alu_4', '000004'),
      ],
      {
        emprestados: [{ alunoId: 'alu_4', tombo: '000004', previstaPara: '26/09/2026' }],
        recusados: [
          { alunoId: 'alu_1', tombo: '000001', motivo: 'Já está com 3 livros.' },
          { alunoId: 'alu_2', tombo: '000002', motivo: 'Leitor suspenso.' },
          { alunoId: 'alu_3', tombo: '000003', motivo: 'Leitor suspenso.' },
        ],
      },
    )

    expect(resumo.recusasPorMotivo).toEqual([
      { motivo: 'Leitor suspenso.', quantos: 2 },
      { motivo: 'Já está com 3 livros.', quantos: 1 },
    ])
  })

  it('lote sem recusa nenhuma não inventa grupo', () => {
    const resumo = montarResumoDoLote([item('alu_1', '000001')], {
      emprestados: [{ alunoId: 'alu_1', tombo: '000001', previstaPara: '26/09/2026' }],
      recusados: [],
    })

    expect(resumo.recusasPorMotivo).toEqual([])
  })
})
