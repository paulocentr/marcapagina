import { describe, it, expect } from 'vitest'
import {
  posicoesDeEtiquetas,
  gerarPdfDeEtiquetas,
  ETIQUETAS_POR_FOLHA,
  GRADE_PADRAO,
} from '@/infra/pdf/etiquetas'

function tombos(n: number, inicio = 1): string[] {
  return Array.from({ length: n }, (_, i) => String(inicio + i).padStart(6, '0'))
}

describe('posicoesDeEtiquetas', () => {
  it('distribui na grade, preenchendo linha a linha', () => {
    const posicoes = posicoesDeEtiquetas(4)

    expect(posicoes[0]).toMatchObject({ pagina: 0, coluna: 0, linha: 0 })
    expect(posicoes[1]).toMatchObject({ pagina: 0, coluna: 1, linha: 0 })
    expect(posicoes[2]).toMatchObject({ pagina: 0, coluna: 2, linha: 0 })
    // Preenche a linha antes de descer: é a ordem em que a mão da
    // operadora percorre a folha ao destacar.
    expect(posicoes[3]).toMatchObject({ pagina: 0, coluna: 0, linha: 1 })
  })

  it('vira a página quando a folha enche', () => {
    const posicoes = posicoesDeEtiquetas(ETIQUETAS_POR_FOLHA + 1)

    expect(posicoes[ETIQUETAS_POR_FOLHA - 1]?.pagina).toBe(0)
    expect(posicoes[ETIQUETAS_POR_FOLHA]).toMatchObject({ pagina: 1, coluna: 0, linha: 0 })
  })

  it('pula etiquetas já usadas, para a folha meio gasta não ir para o lixo', () => {
    // Ninguém imprime exatamente 33 tombos. Sem o pulo, cada impressão
    // exigiria uma folha nova e a escola gastaria etiqueta à toa —
    // é o tipo de detalhe que decide se a etiquetagem gradual acontece.
    const posicoes = posicoesDeEtiquetas(2, { pular: 5 })

    expect(posicoes[0]).toMatchObject({ pagina: 0, coluna: 2, linha: 1 })
    expect(posicoes[1]).toMatchObject({ pagina: 0, coluna: 0, linha: 2 })
  })

  it('pular a folha inteira começa na página seguinte', () => {
    const posicoes = posicoesDeEtiquetas(1, { pular: ETIQUETAS_POR_FOLHA })

    expect(posicoes[0]).toMatchObject({ pagina: 1, coluna: 0, linha: 0 })
  })

  it('recusa pulo negativo em vez de calcular posição impossível', () => {
    expect(() => posicoesDeEtiquetas(1, { pular: -1 })).toThrow()
  })

  it('as coordenadas caem dentro da folha A4', () => {
    for (const posicao of posicoesDeEtiquetas(ETIQUETAS_POR_FOLHA)) {
      expect(posicao.x).toBeGreaterThanOrEqual(0)
      expect(posicao.y).toBeGreaterThanOrEqual(0)
      expect(posicao.x + GRADE_PADRAO.larguraDaEtiqueta).toBeLessThanOrEqual(GRADE_PADRAO.larguraDaFolha)
      expect(posicao.y + GRADE_PADRAO.alturaDaEtiqueta).toBeLessThanOrEqual(GRADE_PADRAO.alturaDaFolha)
    }
  })

  it('etiquetas não se sobrepõem', () => {
    const vistas = new Set<string>()
    for (const p of posicoesDeEtiquetas(ETIQUETAS_POR_FOLHA)) {
      const chave = `${p.pagina}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`
      expect(vistas.has(chave), 'duas etiquetas na mesma posição').toBe(false)
      vistas.add(chave)
    }
  })

  it('quantidade zero devolve lista vazia em vez de uma folha em branco', () => {
    expect(posicoesDeEtiquetas(0)).toEqual([])
  })
})

describe('gerarPdfDeEtiquetas', () => {
  it('produz um PDF de verdade', async () => {
    const pdf = await gerarPdfDeEtiquetas(tombos(3))

    // %PDF- é a assinatura do formato.
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
  })

  it('usa uma folha para 33 e duas para 34', async () => {
    const uma = await gerarPdfDeEtiquetas(tombos(ETIQUETAS_POR_FOLHA))
    const duas = await gerarPdfDeEtiquetas(tombos(ETIQUETAS_POR_FOLHA + 1))

    expect(await contarPaginas(uma)).toBe(1)
    expect(await contarPaginas(duas)).toBe(2)
  })

  it('o tombo aparece como TEXTO legível, não só como código de barras', async () => {
    // A operadora precisa conferir a etiqueta a olho nu; e se o leitor
    // quebrar, o acervo não pode ficar inoperante junto.
    const pdf = await gerarPdfDeEtiquetas(['000042'])

    expect(await extrairTexto(pdf)).toContain('000042')
  })

  it('recusa lista vazia em vez de gerar folha em branco', async () => {
    await expect(gerarPdfDeEtiquetas([])).rejects.toThrow()
  })
})

async function contarPaginas(pdf: Uint8Array): Promise<number> {
  const { PDFDocument } = await import('pdf-lib')
  const documento = await PDFDocument.load(pdf)
  return documento.getPageCount()
}

// pdf-lib não extrai texto, e os fluxos de conteúdo saem comprimidos em
// Flate. Descomprimir cada um e concatenar é o suficiente para provar que
// o tombo foi mesmo DESENHADO — asserção mais fraca (só "gerou um PDF")
// passaria com a etiqueta em branco.
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

    // Os delimitadores de linha em volta do fluxo não fazem parte dos
    // dados: incluí-los faz o inflate falhar em silêncio, e o teste
    // passaria a "não achar o tombo" por motivo errado.
    let inicio = marca + 'stream'.length
    while (bruto[inicio] === 0x0d || bruto[inicio] === 0x0a) inicio++
    let fim = fimDoFluxo
    while (fim > inicio && (bruto[fim - 1] === 0x0d || bruto[fim - 1] === 0x0a)) fim--

    try {
      partes.push(decodificarHex(inflateSync(bruto.subarray(inicio, fim)).toString('latin1')))
    } catch {
      // Fluxo que não é Flate (fonte embutida, por exemplo) não interessa.
    }
    cursor = fimDoFluxo + 1
  }

  return partes.join('\n')
}

// O pdf-lib escreve o texto como string hexadecimal — `<303030303432> Tj`.
// Sem decodificar, procurar "000042" no fluxo nunca acharia nada.
function decodificarHex(conteudo: string): string {
  return conteudo.replace(/<([0-9A-Fa-f]+)>/g, (inteiro, hex: string) =>
    hex.length % 2 === 0 ? Buffer.from(hex, 'hex').toString('latin1') : inteiro,
  )
}
