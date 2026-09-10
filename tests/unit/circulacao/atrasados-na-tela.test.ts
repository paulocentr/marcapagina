import { describe, it, expect } from 'vitest'
import {
  classificarAtraso,
  descreverAtraso,
  formatarDataDaEscola,
  montarFolha,
} from '@/app/painel/atrasados/atrasados-na-tela'
import type { EmprestimoAtrasado } from '@/modules/circulacao/emprestimos.service'

const HOJE = dia('2026-09-10')

function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Um atrasado como `listarAtrasados` o devolve.
 *
 * `diasDeAtraso` sai das DATAS, igual ao serviço — o teste que quer provar
 * a divergência informa o número na mão, de propósito.
 */
function atrasado(parcial: {
  id: string
  previstaPara: string
  turma?: string | null
  leitorId?: string
  nomeDoLeitor?: string
  tituloDaObra?: string
  diasDeAtraso?: number
}): EmprestimoAtrasado {
  const previstaPara = dia(parcial.previstaPara)
  const derivado = Math.round((HOJE.getTime() - previstaPara.getTime()) / MILISSEGUNDOS_POR_DIA)

  return {
    emprestimoId: parcial.id,
    exemplarId: `exe_${parcial.id}`,
    tombo: `00${parcial.id}`,
    tituloDaObra: parcial.tituloDaObra ?? 'O Cortiço',
    leitorId: parcial.leitorId ?? `alu_${parcial.id}`,
    nomeDoLeitor: parcial.nomeDoLeitor ?? 'Lucas Andrade Prado',
    turma: parcial.turma === undefined ? '7º B' : parcial.turma,
    previstaPara,
    diasDeAtraso: parcial.diasDeAtraso ?? derivado,
  }
}

describe('descreverAtraso', () => {
  it('escreve o singular e o plural', () => {
    expect(descreverAtraso(1)).toBe('1 dia')
    expect(descreverAtraso(2)).toBe('2 dias')
    expect(descreverAtraso(23)).toBe('23 dias')
  })

  it('recusa zero: a folha de cobrança não pode dizer "0 dias de atraso"', () => {
    expect(() => descreverAtraso(0)).toThrow(/atraso/i)
  })

  it('recusa dia quebrado e número negativo', () => {
    expect(() => descreverAtraso(-1)).toThrow()
    expect(() => descreverAtraso(1.5)).toThrow()
    expect(() => descreverAtraso(Number.NaN)).toThrow()
  })
})

describe('formatarDataDaEscola', () => {
  it('escreve dd/mm/aaaa, como a escola escreve', () => {
    expect(formatarDataDaEscola(dia('2026-08-18'))).toBe('18/08/2026')
    expect(formatarDataDaEscola(dia('2026-01-05'))).toBe('05/01/2026')
  })

  it('lê o dia em UTC, não no fuso do processo', () => {
    // `previstaPara` guarda um DIA em meia-noite UTC. Formatar pelo fuso
    // do processo imprimiria o dia anterior em toda máquina a oeste de
    // Greenwich — que é a máquina da secretaria.
    expect(formatarDataDaEscola(new Date('2026-09-01T00:00:00.000Z'))).toBe('01/09/2026')
  })
})

describe('classificarAtraso', () => {
  it('até uma semana é atraso recente', () => {
    expect(classificarAtraso(1)).toBe('RECENTE')
    expect(classificarAtraso(7)).toBe('RECENTE')
  })

  it('passada a semana vira persistente', () => {
    expect(classificarAtraso(8)).toBe('PERSISTENTE')
    expect(classificarAtraso(29)).toBe('PERSISTENTE')
  })

  it('passado o mês vira prolongado', () => {
    expect(classificarAtraso(30)).toBe('PROLONGADO')
    expect(classificarAtraso(210)).toBe('PROLONGADO')
  })

  it('recusa o que não é atraso', () => {
    expect(() => classificarAtraso(0)).toThrow()
  })
})

describe('montarFolha', () => {
  it('agrupa por turma, porque é a turma que recebe a folha', () => {
    const folha = montarFolha(
      [
        atrasado({ id: '1', turma: '7º B', previstaPara: '2026-09-02' }),
        atrasado({ id: '2', turma: '9º A', previstaPara: '2026-08-18' }),
        atrasado({ id: '3', turma: '7º B', previstaPara: '2026-09-05' }),
      ],
      HOJE,
    )

    expect(folha.grupos.map((g) => g.rotulo)).toEqual(['9º A', '7º B'])
    expect(folha.grupos.map((g) => g.linhas.length)).toEqual([1, 2])
  })

  it('dentro da turma, o mais antigo em cima', () => {
    const folha = montarFolha(
      [
        atrasado({ id: '1', previstaPara: '2026-09-05' }),
        atrasado({ id: '2', previstaPara: '2026-08-18' }),
        atrasado({ id: '3', previstaPara: '2026-09-02' }),
      ],
      HOJE,
    )

    expect(folha.grupos[0]?.linhas.map((l) => l.atraso.emprestimoId)).toEqual(['2', '3', '1'])
    expect(folha.grupos[0]?.linhas.map((l) => l.atrasoEmPalavras)).toEqual([
      '23 dias',
      '8 dias',
      '5 dias',
    ])
  })

  it('a turma com o atraso mais antigo vem primeiro', () => {
    const folha = montarFolha(
      [
        atrasado({ id: '1', turma: '1º EM', previstaPara: '2026-09-05' }),
        atrasado({ id: '2', turma: '8º A', previstaPara: '2026-09-09' }),
        atrasado({ id: '3', turma: '9º A', previstaPara: '2026-08-18' }),
      ],
      HOJE,
    )

    expect(folha.grupos.map((g) => g.rotulo)).toEqual(['9º A', '1º EM', '8º A'])
    expect(folha.grupos.map((g) => g.maiorAtrasoEmDias)).toEqual([23, 5, 1])
  })

  it('sem turma e empréstimo da equipe entram como grupos próprios, no fim', () => {
    // Ninguém é entregue a uma professora, então não competem com as
    // folhas que são. Mas continuam na lista: um livro fora da estante
    // que não aparece em folha nenhuma nunca é cobrado.
    const folha = montarFolha(
      [
        atrasado({ id: '1', turma: null, previstaPara: '2026-08-01' }),
        atrasado({ id: '2', turma: '7º B', previstaPara: '2026-09-08' }),
        atrasado({
          id: '3',
          turma: null,
          leitorId: '',
          nomeDoLeitor: 'Leitor da equipe',
          previstaPara: '2026-07-01',
        }),
      ],
      HOJE,
    )

    expect(folha.grupos.map((g) => g.tipo)).toEqual(['TURMA', 'SEM_TURMA', 'EQUIPE'])
    expect(folha.grupos.map((g) => g.rotulo)).toEqual([
      '7º B',
      'Sem turma',
      'Empréstimos da equipe',
    ])
  })

  it('ninguém desaparece no agrupamento', () => {
    const entrada = [
      atrasado({ id: '1', turma: '7º B', previstaPara: '2026-09-01' }),
      atrasado({ id: '2', turma: null, previstaPara: '2026-09-02' }),
      atrasado({ id: '3', turma: '9º A', previstaPara: '2026-09-03' }),
      atrasado({ id: '4', turma: null, leitorId: '', previstaPara: '2026-09-04' }),
    ]

    const folha = montarFolha(entrada, HOJE)

    expect(folha.total).toBe(4)
    expect(folha.grupos.reduce((soma, g) => soma + g.linhas.length, 0)).toBe(4)
  })

  it('conta quantos livros o MESMO aluno está devendo', () => {
    const folha = montarFolha(
      [
        atrasado({ id: '1', leitorId: 'alu_9', previstaPara: '2026-09-01' }),
        atrasado({ id: '2', leitorId: 'alu_9', previstaPara: '2026-09-02' }),
        atrasado({ id: '3', leitorId: 'alu_7', previstaPara: '2026-09-03' }),
      ],
      HOJE,
    )

    const porEmprestimo = new Map(
      folha.grupos.flatMap((g) => g.linhas).map((l) => [l.atraso.emprestimoId, l.livrosDoLeitor]),
    )

    expect(porEmprestimo.get('1')).toBe(2)
    expect(porEmprestimo.get('2')).toBe(2)
    expect(porEmprestimo.get('3')).toBe(1)
  })

  it('conta os livros do aluno mesmo quando as turmas na lista divergem', () => {
    // Duas linhas do mesmo aluno têm de somar 2 nas duas, e não 1 em cada
    // grupo — senão a folha diz que ele deve um livro em cada sala.
    const folha = montarFolha(
      [
        atrasado({ id: '1', leitorId: 'alu_9', turma: '7º B', previstaPara: '2026-09-01' }),
        atrasado({ id: '2', leitorId: 'alu_9', turma: '9º A', previstaPara: '2026-09-02' }),
      ],
      HOJE,
    )

    expect(folha.grupos.flatMap((g) => g.linhas).map((l) => l.livrosDoLeitor)).toEqual([2, 2])
  })

  it('o maior atraso da folha é o da lista inteira', () => {
    const folha = montarFolha(
      [
        atrasado({ id: '1', turma: '7º B', previstaPara: '2026-09-08' }),
        atrasado({ id: '2', turma: '9º A', previstaPara: '2026-08-18' }),
      ],
      HOJE,
    )

    expect(folha.maiorAtrasoEmDias).toBe(23)
  })

  it('lista vazia é folha vazia, não erro', () => {
    const folha = montarFolha([], HOJE)

    expect(folha.grupos).toEqual([])
    expect(folha.total).toBe(0)
    expect(folha.maiorAtrasoEmDias).toBe(0)
  })

  it('recusa dias de atraso que não batem com as datas', () => {
    // É o sintoma de um campo materializado: o número diz uma coisa e
    // `previstaPara` contra hoje diz outra. Desenhar o número recebido
    // faria a tela cobrar 3 dias de quem está com o livro há 23.
    expect(() =>
      montarFolha([atrasado({ id: '1', previstaPara: '2026-08-18', diasDeAtraso: 3 })], HOJE),
    ).toThrow(/atraso/i)
  })

  it('recusa linha que não está atrasada', () => {
    // Quem vence HOJE tem o dia inteiro. Uma linha assim na lista de
    // atrasados é a fronteira do serviço tendo escorregado.
    expect(() => montarFolha([atrasado({ id: '1', previstaPara: '2026-09-10' })], HOJE)).toThrow()
    expect(() => montarFolha([atrasado({ id: '1', previstaPara: '2026-09-11' })], HOJE)).toThrow()
  })

  it('recusa empréstimo sem leitor identificado que veio com turma', () => {
    // Turma é de aluno. Sem aluno não há turma, e aceitar a contradição
    // faria a folha de uma sala listar um livro que não é de aluno nenhum.
    expect(() =>
      montarFolha(
        [atrasado({ id: '1', leitorId: '', turma: '7º B', previstaPara: '2026-09-01' })],
        HOJE,
      ),
    ).toThrow(/turma/i)
  })
})
