import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type {
  LinhaDeTurma,
  PainelDoLeitor,
} from '@/modules/relatorios/painel-do-leitor.service'
import { recortarPeriodo } from '@/modules/relatorios/periodo'

/**
 * `React` no global, e os componentes importados DEPOIS.
 *
 * O `tsconfig.json` do projeto usa `"jsx": "preserve"` porque quem
 * compila JSX é o Next. Fora do Next, o esbuild do Vitest cai no
 * transform clássico e emite `React.createElement(...)` — que num
 * componente de servidor, sem `import React`, quebra com "React is not
 * defined". Pôr o React no global e importar em seguida resolve AQUI,
 * neste arquivo, sem mexer no `vitest.config.ts` nem no `tsconfig.json`,
 * que são compartilhados com as outras frentes, e sem pôr um pragma de
 * teste dentro do componente de produção.
 */
;(globalThis as unknown as { React: unknown }).React = React

const { createElement } = React
const { AtrasadosAgora } = await import('@/app/painel/relatorios/atrasados-agora')
const { GraficoDeTurmas } = await import('@/app/painel/relatorios/grafico-de-turmas')
const { MaisEmprestados } = await import('@/app/painel/relatorios/mais-emprestados')
const { Numeros } = await import('@/app/painel/relatorios/numeros')

/**
 * O DESENHO do painel, renderizado de verdade.
 *
 * Existe por dois motivos. O primeiro é grosseiro: ninguém vai abrir
 * esta tela antes da demonstração à coordenação, e um erro de runtime no
 * JSX só apareceria lá. O segundo é o que importa: as regras de gráfico
 * do sistema de design são afirmações sobre a MARCAÇÃO — "uma cor só",
 * "sem legenda", "rótulo de valor só onde ajuda" — e nenhuma delas pode
 * ser provada olhando o módulo de escala.
 *
 * Em `createElement` e não em JSX porque `vitest.config.ts` coleta
 * `tests/unit/**\/*.test.ts` e a config não é deste módulo. Não vale
 * mudar a config compartilhada para ganhar açúcar de sintaxe.
 */

const PERIODO = recortarPeriodo('MES', new Date('2026-09-10T18:00:00.000Z'))

function turma(nome: string, emprestimos: number, alunos: number): LinhaDeTurma {
  return {
    turmaId: `t-${nome}`,
    nome,
    emprestimos,
    alunos,
    porAluno: alunos > 0 ? emprestimos / alunos : null,
  }
}

function painel(parcial: Partial<PainelDoLeitor> = {}): PainelDoLeitor {
  return {
    periodo: PERIODO,
    anterior: { rotulo: 'agosto de 2026', total: 293 },
    emprestimos: {
      total: 325,
      comparacao: { tipo: 'ALTA', anterior: 293, percentual: 11 },
      tendencia: [12, 18, 22, 19, 25, 31, 28, 34, 30, 38, 41, 47],
    },
    emMaos: { total: 96, exemplaresNoAcervo: 2133, percentualDoAcervo: 4.5 },
    atrasados: {
      total: 14,
      diasDoMaisAntigo: 23,
      leitoresSuspensos: 3,
      lista: [
        {
          emprestimoId: 'emp_1',
          exemplarId: 'exe_1',
          tombo: '000276',
          tituloDaObra: 'Grande Sertão: Veredas',
          leitorId: 'alu_1',
          nomeDoLeitor: 'Bruno Tavares Lopes',
          turma: '9º A',
          previstaPara: new Date('2026-08-18T00:00:00.000Z'),
          diasDeAtraso: 23,
        },
      ],
    },
    leitores: { ativos: 212, total: 486, percentual: 43.6 },
    turmas: [turma('6º A', 45, 30), turma('7º A', 33, 30), turma('9º A', 12, 10)],
    maisEmprestadas: [
      { obraId: 'o1', titulo: 'A Bolsa Amarela', autor: 'Lygia Bojunga', quantidade: 19 },
      { obraId: 'o2', titulo: 'Apostila de Matemática', autor: null, quantidade: 7 },
    ],
    acervoParado: {
      total: 311,
      obras: [{ obraId: 'o9', titulo: 'Iracema', autor: 'José de Alencar', exemplares: 2 }],
    },
    ...parcial,
  }
}

/** Genérico para o compilador cobrar as props certas de cada componente. */
function desenhar<P extends object>(
  componente: (props: P) => React.ReactElement | null,
  props: P,
): string {
  return renderToStaticMarkup(createElement(componente, props))
}

describe('os quatro números', () => {
  it('desenham os totais contados', () => {
    const html = desenhar(Numeros, { painel: painel() })

    expect(html).toContain('325')
    expect(html).toContain('96')
    expect(html).toContain('14')
    expect(html).toContain('de 486')
  })

  it('a comparação sai em verde na alta, e a queda NÃO usa a cor de atraso', () => {
    // O âmbar de `atencao` é reservado para atraso. Gastá-lo numa queda
    // de empréstimos — que em setembro é o mês do simulado, não um
    // problema — faria o âmbar do atraso deixar de significar algo.
    const alta = desenhar(Numeros, { painel: painel() })
    expect(alta).toContain('text-certo')

    const baixa = desenhar(Numeros, {
      painel: painel({
        emprestimos: {
          total: 200,
          comparacao: { tipo: 'BAIXA', anterior: 250, percentual: 20 },
          tendencia: [5, 4],
        },
      }),
    })
    expect(baixa).toContain('-20% sobre agosto de 2026')
    // A frase da queda sai em tinta comum. O `text-atencao` continua na
    // tela — no cartão de atrasados, que é onde ele significa algo.
    expect(baixa).toContain('font-semibold text-tinta"')
  })

  it('o cartão de atrasados traz PALAVRA e ícone, não só a cor', () => {
    // A coordenação imprime esta tela em preto e branco para a reunião.
    const html = desenhar(Numeros, { painel: painel() })

    expect(html).toContain('Atrasados')
    expect(html).toContain('<svg')
  })

  it('sem base de comparação não desenha porcentagem inventada', () => {
    const html = desenhar(Numeros, {
      painel: painel({
        emprestimos: { total: 12, comparacao: { tipo: 'SEM_BASE', anterior: 0 }, tendencia: [] },
      }),
    })

    expect(html).toContain('sem base de comparação')
    expect(html).not.toContain('%<')
  })

  it('acervo vazio não afirma "0% circulando"', () => {
    const html = desenhar(Numeros, {
      painel: painel({
        emMaos: { total: 0, exemplaresNoAcervo: 0, percentualDoAcervo: null },
      }),
    })

    expect(html).toContain('ainda não há exemplar cadastrado')
    expect(html).not.toContain('0% do acervo')
  })

  it('menos de duas semanas de tendência não desenha sparkline nenhum', () => {
    const html = desenhar(Numeros, {
      painel: painel({
        emprestimos: {
          total: 3,
          comparacao: { tipo: 'ALTA', anterior: 1, percentual: 200 },
          tendencia: [3],
        },
      }),
    })

    expect(html).not.toContain('<polyline')
  })
})

describe('o gráfico por turma', () => {
  const html = desenhar(GraficoDeTurmas, {
    turmas: painel().turmas,
    rotuloDoPeriodo: 'setembro de 2026',
  })

  it('usa UMA cor de série, o verde da marca', () => {
    const barras = html.match(/bg-marca(?![\w-])/g) ?? []
    expect(barras.length).toBe(3)
  })

  it('não tem legenda: o título nomeia a série', () => {
    expect(html).toContain('Empréstimos por turma, em setembro de 2026')
    expect(html.toLowerCase()).not.toContain('legenda')
  })

  it('as barras têm ponta arredondada ancorada na linha de base', () => {
    // `rounded-t` e não `rounded`: arredondar embaixo faria a barra
    // parecer flutuando acima do zero.
    expect(html).toContain('rounded-t-[4px]')
    expect(html).not.toContain('rounded-b-')
  })

  it('rotula só a maior e a menor barra', () => {
    // Um número em cada barra vira tabela mal formatada, e com onze
    // turmas ninguém lê nem o gráfico nem os números.
    const rotulos = html.match(/font-mono text-\[11\.5px\] font-semibold/g) ?? []
    expect(rotulos.length).toBe(2)
  })

  it('o número de cada barra fica alcançável pelo cursor', () => {
    expect(html).toContain('title="6º A: 45 empréstimo(s)"')
  })

  it('a tabela ao lado traz o POR ALUNO, que é a comparação justa', () => {
    // 45/30 = 1,5 contra 12/10 = 1,2: no absoluto o 6º A ganha, no
    // engajamento a diferença é bem menor. É isso que o card exige.
    expect(html).toContain('1,5')
    expect(html).toContain('1,2')
    expect(html).toContain('Por aluno')
  })

  it('o gráfico é escondido de quem ouve a tela, e a tabela não', () => {
    // Onze barras absolutamente posicionadas não são informação em voz
    // alta; a tabela com cabeçalho é.
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('<caption')
  })

  it('turma sem aluno ativo diz isso com palavra, não com zero', () => {
    const semAluno = desenhar(GraficoDeTurmas, {
      turmas: [{ turmaId: 't1', nome: '9º B', emprestimos: 4, alunos: 0, porAluno: null }],
      rotuloDoPeriodo: 'setembro de 2026',
    })

    expect(semAluno).toContain('sem aluno ativo')
  })

  it('sem turma nenhuma explica o vazio em vez de desenhar um gráfico oco', () => {
    const vazio = desenhar(GraficoDeTurmas, {
      turmas: [],
      rotuloDoPeriodo: 'setembro de 2026',
    })

    expect(vazio).toContain('Nenhuma turma')
    expect(vazio).not.toContain('rounded-t-[4px]')
  })
})

describe('mais emprestados e acervo parado', () => {
  it('lista o ranking com a contagem', () => {
    const html = desenhar(MaisEmprestados, { painel: painel() })

    expect(html).toContain('A Bolsa Amarela')
    expect(html).toContain('Lygia Bojunga')
    expect(html).toContain('19')
  })

  it('obra sem autoria não sai com um branco inexplicável', () => {
    const html = desenhar(MaisEmprestados, { painel: painel() })

    expect(html).toContain('sem autoria catalogada')
  })

  it('mostra a lista do carrinho na própria tela, sem link para tela que não existe', () => {
    // Um atalho que leva a 404 ensina a operadora a desconfiar do menu
    // inteiro, e depois disso ela para de explorar o sistema.
    const html = desenhar(MaisEmprestados, { painel: painel() })

    expect(html).toContain('Iracema')
    expect(html).toContain('311')
    expect(html).not.toContain('<a ')
  })

  it('diz que o resto da lista está no CSV', () => {
    const html = desenhar(MaisEmprestados, { painel: painel() })

    expect(html).toContain('e mais 310')
  })
})

describe('atrasados agora', () => {
  const html = desenhar(AtrasadosAgora, { painel: painel() })

  it('diz que o número é calculado na hora', () => {
    // É a promessa do sistema: não existe campo "atrasado" para ler.
    expect(html).toContain('calculado na hora')
  })

  it('o atraso sai em chip com palavra E ícone', () => {
    expect(html).toContain('Atrasado')
    expect(html).toContain('há 23 dias')
    expect(html).toContain('<svg')
  })

  it('o tombo sai em mono, para conferir dígito a dígito contra a etiqueta', () => {
    expect(html).toContain('font-mono')
    expect(html).toContain('000276')
    expect(html).toContain('tombo 000276')
  })

  it('diz quantas linhas de quantas está mostrando', () => {
    expect(html).toContain('mostrando 1 de 14')
  })

  it('um dia de atraso não sai no plural', () => {
    const umDia = desenhar(AtrasadosAgora, {
      painel: painel({
        atrasados: {
          total: 1,
          diasDoMaisAntigo: 1,
          leitoresSuspensos: 0,
          lista: [
            {
              emprestimoId: 'emp_2',
              exemplarId: 'exe_2',
              tombo: '000412',
              tituloDaObra: 'O Cortiço',
              leitorId: 'alu_2',
              nomeDoLeitor: 'Lucas Andrade Prado',
              turma: '7º B',
              previstaPara: new Date('2026-09-09T00:00:00.000Z'),
              diasDeAtraso: 1,
            },
          ],
        },
      }),
    })

    expect(umDia).toContain('há 1 dia')
    expect(umDia).not.toContain('há 1 dias')
  })

  it('sem atraso nenhum não desenha tabela vazia', () => {
    const limpo = desenhar(AtrasadosAgora, {
      painel: painel({
        atrasados: { total: 0, diasDoMaisAntigo: null, leitoresSuspensos: 0, lista: [] },
      }),
    })

    expect(limpo).toContain('Nenhum livro em atraso')
    expect(limpo).not.toContain('<table')
  })

  it('o aluno sem turma não deixa a célula em branco', () => {
    const semTurma = desenhar(AtrasadosAgora, {
      painel: painel({
        atrasados: {
          total: 1,
          diasDoMaisAntigo: 4,
          leitoresSuspensos: 0,
          lista: [
            {
              emprestimoId: 'emp_3',
              exemplarId: 'exe_3',
              tombo: '000500',
              tituloDaObra: 'Vidas Secas',
              leitorId: 'alu_3',
              nomeDoLeitor: 'Leitor da equipe',
              turma: null,
              previstaPara: new Date('2026-09-06T00:00:00.000Z'),
              diasDeAtraso: 4,
            },
          ],
        },
      }),
    })

    expect(semTurma).toContain('—')
  })
})
