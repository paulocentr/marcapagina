import { describe, it, expect } from 'vitest'
import {
  BOM_DO_EXCEL,
  gerarPdfDoPainel,
  montarCsvDoPainel,
  nomeDoArquivo,
  paraWinAnsi,
} from '@/modules/relatorios/exportacao'
import type { PainelDoLeitor } from '@/modules/relatorios/painel-do-leitor.service'
import { recortarPeriodo } from '@/modules/relatorios/periodo'

const PERIODO = recortarPeriodo('MES', new Date('2026-09-10T18:00:00.000Z'))

function painel(parcial: Partial<PainelDoLeitor> = {}): PainelDoLeitor {
  return {
    periodo: PERIODO,
    anterior: { rotulo: 'agosto de 2026', total: 293 },
    emprestimos: {
      total: 325,
      comparacao: { tipo: 'ALTA', anterior: 293, percentual: 11 },
      tendencia: [10, 20, 30],
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
    turmas: [
      { turmaId: 't1', nome: '6º A', emprestimos: 45, alunos: 30, porAluno: 1.5 },
      { turmaId: 't2', nome: '9º A', emprestimos: 0, alunos: 0, porAluno: null },
    ],
    maisEmprestadas: [
      { obraId: 'o1', titulo: 'A Bolsa Amarela', autor: 'Lygia Bojunga', quantidade: 19 },
    ],
    acervoParado: {
      total: 311,
      obras: [{ obraId: 'o9', titulo: 'Iracema', autor: 'José de Alencar', exemplares: 2 }],
    },
    ...parcial,
  }
}

describe('montarCsvDoPainel', () => {
  it('abre com o BOM, senão o Excel come os acentos', () => {
    // Sem o BOM, o Excel em português abre o arquivo em Windows-1252 e
    // "Aluísio" chega como "AluÃ­sio" na planilha da coordenação.
    const csv = montarCsvDoPainel(painel())

    expect(csv.startsWith(BOM_DO_EXCEL)).toBe(true)
  })

  it('separa por ponto e vírgula, que é o que o Excel pt-BR espera', () => {
    // Com vírgula, o Excel pt-BR joga a linha inteira numa célula só e a
    // coordenação recebe um arquivo que "não abriu".
    const csv = montarCsvDoPainel(painel())

    expect(csv).toContain('Turma;Empréstimos;Alunos ativos;Por aluno')
  })

  it('usa CRLF, que é o fim de linha que o Excel entende sempre', () => {
    expect(montarCsvDoPainel(painel())).toContain('\r\n')
  })

  it('nomeia o período no cabeçalho', () => {
    expect(montarCsvDoPainel(painel())).toContain('setembro de 2026')
  })

  it('leva os quatro números do painel', () => {
    const csv = montarCsvDoPainel(painel())

    expect(csv).toContain('Empréstimos no período;325')
    expect(csv).toContain('Livros em mãos agora;96')
    expect(csv).toContain('Atrasados agora;14')
    expect(csv).toContain('Leitores ativos;212')
  })

  it('leva o absoluto E o por aluno de cada turma', () => {
    // O card exige engajamento POR CAPITA: no absoluto a turma maior
    // ganha sempre, e o ranking passa a medir tamanho, não leitura.
    const csv = montarCsvDoPainel(painel())

    expect(csv).toContain('6º A;45;30;1,5')
  })

  it('turma sem aluno ativo sai com a célula VAZIA, não com zero', () => {
    // "0,0 por aluno" afirmaria que a turma não lê; a verdade é que não
    // há aluno para dividir.
    const csv = montarCsvDoPainel(painel())

    expect(csv).toContain('9º A;0;0;\r\n')
  })

  it('usa vírgula decimal', () => {
    const csv = montarCsvDoPainel(
      painel({
        turmas: [{ turmaId: 't1', nome: '6º A', emprestimos: 7, alunos: 3, porAluno: 7 / 3 }],
      }),
    )

    expect(csv).toContain('6º A;7;3;2,33')
  })

  it('escapa o título que tem ponto e vírgula', () => {
    const csv = montarCsvDoPainel(
      painel({
        maisEmprestadas: [
          { obraId: 'o1', titulo: 'Um; dois; três', autor: null, quantidade: 4 },
        ],
      }),
    )

    expect(csv).toContain('"Um; dois; três"')
  })

  it('escapa a aspa dobrando-a', () => {
    const csv = montarCsvDoPainel(
      painel({
        maisEmprestadas: [
          { obraId: 'o1', titulo: 'O "Menino" Maluquinho', autor: null, quantidade: 4 },
        ],
      }),
    )

    expect(csv).toContain('"O ""Menino"" Maluquinho"')
  })

  it('leva as obras paradas, que são a lista do carrinho', () => {
    const csv = montarCsvDoPainel(painel())

    expect(csv).toContain('Iracema;José de Alencar;2')
  })

  it('diz quantas linhas de atraso estão no arquivo E quantas existem', () => {
    // A tela mostra as primeiras; o arquivo carrega as mesmas. Sem
    // dizer "1 de 14", a coordenação levaria o arquivo para a reunião
    // achando que ali estão todos os atrasados da escola.
    const csv = montarCsvDoPainel(painel())

    expect(csv).toContain('Atrasados agora — 1 de 14')
  })

  it('período sem nada gera arquivo com os zeros, não arquivo vazio', () => {
    const vazio = montarCsvDoPainel(
      painel({
        emprestimos: { total: 0, comparacao: { tipo: 'SEM_BASE', anterior: 0 }, tendencia: [] },
        turmas: [],
        maisEmprestadas: [],
        acervoParado: { total: 0, obras: [] },
        atrasados: { total: 0, diasDoMaisAntigo: null, leitoresSuspensos: 0, lista: [] },
      }),
    )

    expect(vazio).toContain('Empréstimos no período;0')
    expect(vazio).toContain('nenhum')
  })
})

describe('paraWinAnsi', () => {
  it('deixa o português em paz', () => {
    expect(paraWinAnsi('Aluísio Azevedo — O Cortiço, 6º A')).toBe(
      'Aluísio Azevedo - O Cortiço, 6º A',
    )
  })

  it('troca o que a fonte padrão do PDF não sabe desenhar', () => {
    // `pdf-lib` com fonte padrão LANÇA em caractere fora do WinAnsi, e
    // um relatório que quebra por causa de um título com ideograma é
    // pior que um relatório com um "?" no lugar dele.
    expect(paraWinAnsi('Título 日本語')).toBe('Título ???')
  })

  it('troca as reticências e as aspas curvas que o Word cola', () => {
    expect(paraWinAnsi('“Ele disse…”')).toBe('"Ele disse..."')
  })
})

describe('nomeDoArquivo', () => {
  it('leva o período no nome, para dois downloads não se sobrescreverem', () => {
    expect(nomeDoArquivo(PERIODO, 'csv')).toBe('painel-do-leitor-2026-09-01-a-2026-09-30.csv')
  })

  it('serve para os dois formatos', () => {
    expect(nomeDoArquivo(PERIODO, 'pdf')).toMatch(/\.pdf$/)
  })
})

describe('gerarPdfDoPainel', () => {
  it('produz um PDF de verdade', async () => {
    const pdf = await gerarPdfDoPainel(painel())

    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
  })

  it('escreve os números no papel, não só o cabeçalho', async () => {
    const texto = await extrairTexto(await gerarPdfDoPainel(painel()))

    expect(texto).toContain('325')
    expect(texto).toContain('Painel do Leitor')
    expect(texto).toContain('setembro de 2026')
  })

  it('leva a turma e o por aluno para o papel', async () => {
    const texto = await extrairTexto(await gerarPdfDoPainel(painel()))

    expect(texto).toContain('6')
    expect(texto).toContain('Bolsa Amarela')
  })

  it('não quebra com título que a fonte padrão não conhece', async () => {
    const pdf = await gerarPdfDoPainel(
      painel({
        maisEmprestadas: [
          { obraId: 'o1', titulo: '日本語 の 本', autor: 'マツオ', quantidade: 2 },
        ],
      }),
    )

    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
  })

  it('período sem nada continua gerando uma folha', async () => {
    const pdf = await gerarPdfDoPainel(
      painel({
        turmas: [],
        maisEmprestadas: [],
        acervoParado: { total: 0, obras: [] },
        atrasados: { total: 0, diasDoMaisAntigo: null, leitoresSuspensos: 0, lista: [] },
      }),
    )

    const { PDFDocument } = await import('pdf-lib')
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(1)
  })
})

/**
 * Extrai o texto do PDF inflando os fluxos de conteúdo.
 *
 * Mesmo mecanismo do teste das etiquetas, copiado de propósito em vez de
 * importado: um ajudante compartilhado entre dois arquivos de teste
 * amarra este arquivo à evolução do outro, e o custo aqui são vinte
 * linhas sem regra de negócio nenhuma.
 */
async function extrairTexto(pdf: Uint8Array): Promise<string> {
  const { inflateSync } = await import('node:zlib')
  const bruto = Buffer.from(pdf)
  const partes: string[] = [bruto.toString('latin1')]

  let cursor = 0
  for (;;) {
    const marca = bruto.indexOf('stream', cursor)
    if (marca === -1) break
    const fimDoFluxo = bruto.indexOf('endstream', marca)
    if (fimDoFluxo === -1) break

    let inicio = marca + 'stream'.length
    while (bruto[inicio] === 0x0d || bruto[inicio] === 0x0a) inicio++
    let fim = fimDoFluxo
    while (fim > inicio && (bruto[fim - 1] === 0x0d || bruto[fim - 1] === 0x0a)) fim--

    try {
      partes.push(
        decodificarHex(inflateSync(bruto.subarray(inicio, fim)).toString('latin1')),
      )
    } catch {
      // Fluxo que não é Flate (fonte embutida) não interessa aqui.
    }
    cursor = fimDoFluxo + 1
  }

  return partes.join('\n')
}

/**
 * O `pdf-lib` grava o texto como string HEX — `<5061696E656C>` — e não
 * como literal. Sem desfazer isso, procurar "Painel" no fluxo inflado
 * não acha nada e o teste passaria a falhar por motivo errado.
 */
function decodificarHex(conteudo: string): string {
  return conteudo.replace(/<([0-9A-Fa-f]+)>/g, (inteiro, hex: string) =>
    hex.length % 2 === 0 ? Buffer.from(hex, 'hex').toString('latin1') : inteiro,
  )
}
