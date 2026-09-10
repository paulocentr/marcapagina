import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type {
  LinhaDeTurma,
  PainelDoLeitor,
} from '@/modules/relatorios/painel-do-leitor.service'
import type { DiaDaEscola, Periodo } from '@/modules/relatorios/periodo'

/**
 * A exportação do Painel do Leitor: CSV para a coordenação continuar a
 * conta na planilha, PDF para a reunião pedagógica em que ninguém abre
 * o notebook.
 *
 * Os dois saem do MESMO objeto que a tela desenha. É o que garante que o
 * arquivo levado para a reunião diga o mesmo que a tela dizia quando o
 * botão foi clicado — duas montagens separadas divergiriam, e a divergência
 * apareceria justamente na frente da direção.
 */

export type FormatoDeExportacao = 'csv' | 'pdf'

/**
 * O BOM de UTF-8.
 *
 * Sem ele o Excel em português abre o arquivo em Windows-1252 e
 * "Aluísio" chega como "AluÃ­sio" na planilha — o tipo de detalhe que
 * faz a coordenação concluir que "o sistema exporta errado".
 */
export const BOM_DO_EXCEL = '﻿'

/**
 * Ponto e vírgula, não vírgula.
 *
 * O Excel pt-BR usa a vírgula como separador DECIMAL, então um CSV
 * separado por vírgula cai todo numa célula só. Este é o formato que
 * abre com dois cliques na máquina da secretaria.
 */
const SEPARADOR = ';'

/** CRLF: é o fim de linha que o Excel entende em qualquer versão. */
const FIM_DE_LINHA = '\r\n'

function celula(valor: string | number | null): string {
  if (valor === null) return ''

  const texto = String(valor)
  // Só embrulha quando precisa: aspas em toda célula deixam o arquivo
  // ilegível para quem o abre num editor de texto para conferir.
  if (!/[";\r\n]/.test(texto)) return texto

  return `"${texto.replace(/"/g, '""')}"`
}

function linha(campos: (string | number | null)[]): string {
  return campos.map(celula).join(SEPARADOR)
}

/**
 * Número com vírgula decimal e no máximo duas casas.
 *
 * `null` sai como célula VAZIA e nunca como zero: "0,0 livro por aluno"
 * afirma que a turma não lê, quando a verdade é que não há aluno ativo
 * para dividir.
 */
function decimal(valor: number | null): string | null {
  if (valor === null) return null
  // Duas casas e sem zero à direita: "1,5" e não "1,50" — a coordenação
  // lê livros por aluno, não moeda.
  return String(Number(valor.toFixed(2))).replace('.', ',')
}

function inteiro(valor: number | null): string | null {
  return valor === null ? null : String(Math.round(valor))
}

function dataCurta(dia: Date): string {
  return `${String(dia.getUTCDate()).padStart(2, '0')}/${String(dia.getUTCMonth() + 1).padStart(2, '0')}/${dia.getUTCFullYear()}`
}

function diaIso(dia: DiaDaEscola): string {
  return `${dia.ano}-${String(dia.mes).padStart(2, '0')}-${String(dia.dia).padStart(2, '0')}`
}

/**
 * O nome do arquivo carrega o período.
 *
 * Dois downloads seguidos — setembro e o bimestre — cairiam na pasta de
 * downloads com o mesmo nome, e o segundo viraria "(1)". Na reunião,
 * ninguém sabe qual é qual.
 */
export function nomeDoArquivo(periodo: Periodo, formato: FormatoDeExportacao): string {
  return `painel-do-leitor-${diaIso(periodo.primeiroDia)}-a-${diaIso(periodo.ultimoDia)}.${formato}`
}

/** A frase da comparação, igual em CSV e PDF. */
function fraseDaComparacao(painel: PainelDoLeitor): string {
  const c = painel.emprestimos.comparacao

  switch (c.tipo) {
    case 'SEM_BASE':
      return `sem base de comparação (${painel.anterior.rotulo} não teve empréstimo)`
    case 'IGUAL':
      return `igual a ${painel.anterior.rotulo} (${c.anterior})`
    default:
      return `${c.tipo === 'ALTA' ? '+' : '-'}${c.percentual}% sobre ${painel.anterior.rotulo} (${c.anterior})`
  }
}

const SEM_TURMA_NO_CSV = 'sem aluno ativo'

/**
 * O painel inteiro em CSV.
 *
 * Cinco blocos separados por linha em branco, e não uma tabela só: os
 * cinco têm formatos diferentes (um número por linha, uma linha por
 * turma, um ranking, uma lista de obras, uma lista de atrasos), e
 * forçá-los na mesma grade produziria um arquivo com quinze colunas
 * vazias em quase toda linha. A alternativa — cinco arquivos — não cabe
 * num download só, que é como a coordenação usa o botão.
 */
export function montarCsvDoPainel(painel: PainelDoLeitor): string {
  const blocos: string[][] = []

  blocos.push([
    linha(['Marca-Página — Painel do Leitor']),
    linha(['Período', painel.periodo.rotulo]),
    linha([
      'Recorte',
      `${diaIso(painel.periodo.primeiroDia)} a ${diaIso(painel.periodo.ultimoDia)}`,
    ]),
    '',
    linha(['Empréstimos no período', painel.emprestimos.total]),
    linha(['Comparação', fraseDaComparacao(painel)]),
    linha(['Livros em mãos agora', painel.emMaos.total]),
    linha(['Exemplares no acervo', painel.emMaos.exemplaresNoAcervo]),
    linha(['% do acervo circulando', decimal(painel.emMaos.percentualDoAcervo)]),
    linha(['Atrasados agora', painel.atrasados.total]),
    linha(['Dias do atraso mais antigo', inteiro(painel.atrasados.diasDoMaisAntigo)]),
    linha(['Leitores suspensos', painel.atrasados.leitoresSuspensos]),
    linha(['Leitores ativos', painel.leitores.ativos]),
    linha(['Alunos ativos no total', painel.leitores.total]),
    linha(['% dos alunos que pegaram ao menos um livro', decimal(painel.leitores.percentual)]),
  ])

  blocos.push([
    linha([`Empréstimos por turma — ${painel.periodo.rotulo}`]),
    // As duas medidas na mesma linha, nunca no mesmo eixo: no absoluto a
    // turma maior ganha sempre, e é "por aluno" que responde quem lê mais.
    linha(['Turma', 'Empréstimos', 'Alunos ativos', 'Por aluno']),
    ...(painel.turmas.length === 0
      ? [linha(['nenhuma turma com aluno ativo ou empréstimo no período'])]
      : painel.turmas.map((turma) =>
          linha([turma.nome, turma.emprestimos, turma.alunos, decimal(turma.porAluno)]),
        )),
  ])

  blocos.push([
    linha([`Mais emprestados — ${painel.periodo.rotulo}`]),
    linha(['Posição', 'Título', 'Autor', 'Empréstimos']),
    ...(painel.maisEmprestadas.length === 0
      ? [linha(['nenhum empréstimo no período'])]
      : painel.maisEmprestadas.map((obra, indice) =>
          linha([indice + 1, obra.titulo, obra.autor, obra.quantidade]),
        )),
  ])

  blocos.push([
    linha([
      `Obras nunca emprestadas — ${painel.acervoParado.obras.length} de ${painel.acervoParado.total}`,
    ]),
    linha(['Título', 'Autor', 'Exemplares parados']),
    ...(painel.acervoParado.obras.length === 0
      ? [linha(['nenhuma obra parada'])]
      : painel.acervoParado.obras.map((obra) =>
          linha([obra.titulo, obra.autor, obra.exemplares]),
        )),
  ])

  blocos.push([
    // "1 de 14" e não só "1": sem isso a coordenação leva o arquivo para
    // a reunião achando que ali estão TODOS os atrasados da escola.
    linha([`Atrasados agora — ${painel.atrasados.lista.length} de ${painel.atrasados.total}`]),
    linha(['Aluno', 'Turma', 'Livro', 'Tombo', 'Venceu em', 'Dias de atraso']),
    ...(painel.atrasados.lista.length === 0
      ? [linha(['nenhum atraso'])]
      : painel.atrasados.lista.map((item) =>
          linha([
            item.nomeDoLeitor,
            item.turma,
            item.tituloDaObra,
            item.tombo,
            dataCurta(item.previstaPara),
            item.diasDeAtraso,
          ]),
        )),
  ])

  return BOM_DO_EXCEL + blocos.map((bloco) => bloco.join(FIM_DE_LINHA)).join(FIM_DE_LINHA.repeat(2))
}

/**
 * Substituições para o que a fonte padrão do PDF não desenha.
 *
 * `pdf-lib` com fonte padrão LANÇA em caractere fora do WinAnsi. Um
 * relatório que quebra porque um título tem ideograma é pior que um
 * relatório com um "?" no lugar dele — e embutir uma fonte Unicode
 * completa custaria centenas de kB em cada download.
 */
const TROCAS: [RegExp, string][] = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/…/g, '...'],
  [/[–—―]/g, '-'],
  [/[  -​]/g, ' '],
  [/[\r\n\t]/g, ' '],
]

export function paraWinAnsi(texto: string): string {
  let saida = texto
  for (const [de, para] of TROCAS) saida = saida.replace(de, para)

  // O que sobrou fora do Latin-1 imprimível vira "?". Perde-se o
  // caractere, não o relatório.
  return saida.replace(/[^\x20-\x7E -ÿ]/g, '?')
}

const A4 = { largura: 595.28, altura: 841.89 }
const MARGEM = 48
const TINTA = rgb(0.149, 0.133, 0.11)
const TINTA_2 = rgb(0.42, 0.394, 0.349)
const MARCA = rgb(0.122, 0.373, 0.322)
const LINHA = rgb(0.898, 0.874, 0.835)

/**
 * O painel numa folha A4.
 *
 * Sem gráfico: uma barra desenhada em PDF exigiria repetir aqui a
 * geometria de `escala.ts` e conferi-la a olho na impressora. A tabela
 * por turma diz o mesmo, sobrevive à fotocópia em preto e branco e é o
 * que se lê em volta da mesa.
 */
export async function gerarPdfDoPainel(painel: PainelDoLeitor): Promise<Uint8Array> {
  const documento = await PDFDocument.create()
  const regular = await documento.embedFont(StandardFonts.Helvetica)
  const negrito = await documento.embedFont(StandardFonts.HelveticaBold)

  let pagina = documento.addPage([A4.largura, A4.altura])
  let y = A4.altura - MARGEM

  function novaPaginaSePreciso(espaco: number): void {
    if (y - espaco >= MARGEM) return
    pagina = documento.addPage([A4.largura, A4.altura])
    y = A4.altura - MARGEM
  }

  function escrever(
    texto: string,
    opcoes: { tamanho?: number; forte?: boolean; cor?: typeof TINTA; x?: number } = {},
  ): void {
    const tamanho = opcoes.tamanho ?? 10
    novaPaginaSePreciso(tamanho + 4)
    pagina.drawText(paraWinAnsi(texto), {
      x: opcoes.x ?? MARGEM,
      y: y - tamanho,
      size: tamanho,
      font: opcoes.forte ? negrito : regular,
      color: opcoes.cor ?? TINTA,
    })
    y -= tamanho + 5
  }

  function colunas(campos: { texto: string; x: number }[], forte = false): void {
    novaPaginaSePreciso(15)
    for (const campo of campos) {
      pagina.drawText(paraWinAnsi(campo.texto), {
        x: campo.x,
        y: y - 10,
        size: 9.5,
        font: forte ? negrito : regular,
        color: forte ? TINTA_2 : TINTA,
      })
    }
    y -= 15
  }

  function regua(): void {
    novaPaginaSePreciso(10)
    pagina.drawLine({
      start: { x: MARGEM, y },
      end: { x: A4.largura - MARGEM, y },
      thickness: 0.6,
      color: LINHA,
    })
    y -= 10
  }

  function titulo(texto: string): void {
    y -= 8
    escrever(texto, { tamanho: 12, forte: true, cor: MARCA })
    regua()
  }

  escrever('Painel do Leitor', { tamanho: 20, forte: true })
  escrever(`Marca-Página · ${painel.periodo.rotulo}`, { tamanho: 10.5, cor: TINTA_2 })
  regua()

  escrever(`Empréstimos no período: ${painel.emprestimos.total}`, { tamanho: 11, forte: true })
  escrever(fraseDaComparacao(painel), { cor: TINTA_2 })
  escrever(
    `Livros em mãos agora: ${painel.emMaos.total} de ${painel.emMaos.exemplaresNoAcervo} exemplares` +
      (painel.emMaos.percentualDoAcervo === null
        ? ''
        : ` (${decimal(painel.emMaos.percentualDoAcervo)}% do acervo)`),
  )
  escrever(
    `Atrasados agora: ${painel.atrasados.total}` +
      (painel.atrasados.diasDoMaisAntigo === null
        ? ''
        : ` · o mais antigo há ${painel.atrasados.diasDoMaisAntigo} dias`) +
      ` · ${painel.atrasados.leitoresSuspensos} leitor(es) suspenso(s)`,
  )
  escrever(
    `Leitores ativos: ${painel.leitores.ativos} de ${painel.leitores.total} alunos` +
      (painel.leitores.percentual === null
        ? ''
        : ` (${decimal(painel.leitores.percentual)}%)`),
  )
  escrever('Todos os números são contados na hora da geração.', {
    tamanho: 8.5,
    cor: TINTA_2,
  })

  titulo(`Empréstimos por turma — ${painel.periodo.rotulo}`)
  const X_TURMA = [MARGEM, 220, 330, 430]
  colunas(
    [
      { texto: 'TURMA', x: X_TURMA[0]! },
      { texto: 'EMPRÉSTIMOS', x: X_TURMA[1]! },
      { texto: 'ALUNOS', x: X_TURMA[2]! },
      { texto: 'POR ALUNO', x: X_TURMA[3]! },
    ],
    true,
  )
  if (painel.turmas.length === 0) {
    escrever('Nenhuma turma com aluno ativo ou empréstimo no período.', { cor: TINTA_2 })
  } else {
    for (const turma of painel.turmas) colunas(camposDaTurma(turma, X_TURMA))
  }

  titulo(`Mais emprestados — ${painel.periodo.rotulo}`)
  if (painel.maisEmprestadas.length === 0) {
    escrever('Nenhum empréstimo no período.', { cor: TINTA_2 })
  } else {
    painel.maisEmprestadas.forEach((obra, indice) => {
      colunas([
        { texto: `${indice + 1}.`, x: MARGEM },
        { texto: obra.titulo, x: MARGEM + 18 },
        { texto: obra.autor ?? 'sem autoria', x: 330 },
        { texto: String(obra.quantidade), x: 500 },
      ])
    })
  }

  titulo('Acervo parado')
  escrever(
    `${painel.acervoParado.total} obra(s) nunca emprestada(s) — é a lista que alimenta o Carrinho da Leitura.`,
  )
  for (const obra of painel.acervoParado.obras.slice(0, 15)) {
    colunas([
      { texto: obra.titulo, x: MARGEM },
      { texto: obra.autor ?? 'sem autoria', x: 330 },
      { texto: `${obra.exemplares} exemplar(es)`, x: 470 },
    ])
  }

  titulo(`Atrasados agora — ${painel.atrasados.lista.length} de ${painel.atrasados.total}`)
  if (painel.atrasados.lista.length === 0) {
    escrever('Nenhum atraso.', { cor: TINTA_2 })
  } else {
    for (const item of painel.atrasados.lista) {
      colunas([
        { texto: item.nomeDoLeitor, x: MARGEM },
        { texto: item.turma ?? '—', x: 200 },
        { texto: item.tituloDaObra, x: 250 },
        { texto: item.tombo, x: 420 },
        { texto: `${item.diasDeAtraso} dia(s)`, x: 490 },
      ])
    }
  }

  return documento.save()
}

function camposDaTurma(turma: LinhaDeTurma, x: number[]): { texto: string; x: number }[] {
  const porAluno = decimal(turma.porAluno)
  return [
    { texto: turma.nome, x: x[0]! },
    { texto: String(turma.emprestimos), x: x[1]! },
    { texto: String(turma.alunos), x: x[2]! },
    // Célula vazia seria um branco inexplicável no papel; aqui a
    // ausência é dita com palavra.
    { texto: porAluno === null ? SEM_TURMA_NO_CSV : porAluno, x: x[3]! },
  ]
}
