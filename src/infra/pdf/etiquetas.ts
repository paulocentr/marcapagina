import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const MILIMETRO_EM_PONTOS = 72 / 25.4

const mm = (valor: number) => valor * MILIMETRO_EM_PONTOS

/**
 * Grade de etiquetas em folha A4: 3 colunas × 11 linhas = 33 por folha,
 * no formato de etiqueta adesiva comum no Brasil (63,5 × 25,4 mm). É o
 * que a escola compra em papelaria, e escolher um formato exótico
 * transformaria "imprimir etiquetas" numa compra especial.
 */
export const GRADE_PADRAO = {
  larguraDaFolha: mm(210),
  alturaDaFolha: mm(297),
  colunas: 3,
  linhas: 11,
  larguraDaEtiqueta: mm(63.5),
  alturaDaEtiqueta: mm(25.4),
  margemEsquerda: mm(7),
  margemSuperior: mm(10),
  espacoEntreColunas: mm(2.5),
} as const

export const ETIQUETAS_POR_FOLHA = GRADE_PADRAO.colunas * GRADE_PADRAO.linhas

export interface PosicaoDaEtiqueta {
  pagina: number
  coluna: number
  linha: number
  /** Canto inferior esquerdo, no sistema de coordenadas do PDF. */
  x: number
  y: number
}

export interface OpcoesDeEtiquetas {
  /**
   * Quantas posições pular antes da primeira etiqueta.
   *
   * Ninguém imprime exatamente 33 tombos. Sem isso, cada impressão
   * exigiria folha nova e a escola gastaria etiqueta à toa — é o tipo de
   * detalhe que decide se a etiquetagem gradual (spec §2.2) acontece ou
   * fica para depois para sempre.
   */
  pular?: number
}

export function posicoesDeEtiquetas(
  quantidade: number,
  opcoes: OpcoesDeEtiquetas = {},
): PosicaoDaEtiqueta[] {
  const pular = opcoes.pular ?? 0
  if (!Number.isInteger(pular) || pular < 0) {
    throw new Error('O número de etiquetas a pular precisa ser inteiro e não negativo.')
  }
  if (quantidade <= 0) return []

  const g = GRADE_PADRAO

  return Array.from({ length: quantidade }, (_, i) => {
    const indice = pular + i
    const pagina = Math.floor(indice / ETIQUETAS_POR_FOLHA)
    const naFolha = indice % ETIQUETAS_POR_FOLHA
    // Linha a linha, não coluna a coluna: é a ordem em que a mão da
    // operadora percorre a folha ao destacar as etiquetas.
    const linha = Math.floor(naFolha / g.colunas)
    const coluna = naFolha % g.colunas

    const x = g.margemEsquerda + coluna * (g.larguraDaEtiqueta + g.espacoEntreColunas)
    // O PDF conta o Y de baixo para cima; a folha se lê de cima para
    // baixo. A subtração é o que reconcilia os dois.
    const y =
      g.alturaDaFolha - g.margemSuperior - (linha + 1) * g.alturaDaEtiqueta

    return { pagina, coluna, linha, x, y }
  })
}

/**
 * Folha A4 de etiquetas de tombo, pronta para imprimir.
 *
 * O tombo sai como TEXTO legível: a operadora confere a olho nu, e se o
 * leitor de código de barras quebrar o acervo não pode ficar inoperante
 * junto.
 */
export async function gerarPdfDeEtiquetas(
  tombos: string[],
  opcoes: OpcoesDeEtiquetas & { nomeDaEscola?: string } = {},
): Promise<Uint8Array> {
  if (tombos.length === 0) {
    throw new Error('Informe ao menos um tombo para gerar etiquetas.')
  }

  const documento = await PDFDocument.create()
  const fonte = await documento.embedFont(StandardFonts.Helvetica)
  const fonteDoTombo = await documento.embedFont(StandardFonts.HelveticaBold)

  const posicoes = posicoesDeEtiquetas(tombos.length, opcoes)
  const totalDePaginas = (posicoes[posicoes.length - 1]?.pagina ?? 0) + 1

  const paginas = Array.from({ length: totalDePaginas }, () =>
    documento.addPage([GRADE_PADRAO.larguraDaFolha, GRADE_PADRAO.alturaDaFolha]),
  )

  posicoes.forEach((posicao, indice) => {
    const pagina = paginas[posicao.pagina]!
    const tombo = tombos[indice]!

    if (opcoes.nomeDaEscola) {
      pagina.drawText(recortar(opcoes.nomeDaEscola, 28), {
        x: posicao.x + mm(3),
        y: posicao.y + GRADE_PADRAO.alturaDaEtiqueta - mm(6),
        size: 7,
        font: fonte,
        color: rgb(0.35, 0.35, 0.35),
      })
    }

    pagina.drawText(tombo, {
      x: posicao.x + mm(3),
      y: posicao.y + mm(8),
      size: 16,
      font: fonteDoTombo,
      color: rgb(0, 0, 0),
    })
  })

  // Sem fluxos de objeto: o PDF fica um pouco maior e, em troca, o texto
  // permanece inspecionável — o que permite ao teste provar que o tombo
  // foi mesmo desenhado, em vez de confiar que foi.
  return documento.save({ useObjectStreams: false })
}

function recortar(texto: string, limite: number): string {
  return texto.length <= limite ? texto : `${texto.slice(0, limite - 1)}…`
}
