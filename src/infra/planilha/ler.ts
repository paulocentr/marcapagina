export interface PlanilhaLida {
  cabecalho: string[]
  linhas: string[][]
}

/**
 * Lê planilha enviada pela escola. `.xlsx` pela exceljs; `.csv` por um
 * analisador próprio.
 *
 * Sobre a biblioteca: o plano previa `xlsx` (SheetJS), mas a última
 * versão publicada no npm (0.18.5) carrega duas vulnerabilidades ALTAS —
 * prototype pollution e ReDoS — corrigidas só a partir da 0.20.2, que a
 * SheetJS não publica mais no npm. Este código processa arquivo enviado
 * de fora, num sistema que guarda dados de menores: é exatamente o
 * caminho onde um analisador vulnerável importa. A exceljs 4.4.0 não tem
 * advisory e faz o mesmo trabalho.
 */
export async function lerPlanilha(bytes: Buffer, nomeDoArquivo: string): Promise<PlanilhaLida> {
  const extensao = nomeDoArquivo.slice(nomeDoArquivo.lastIndexOf('.')).toLowerCase()

  if (extensao === '.csv' || extensao === '.txt') {
    return lerCsv(bytes.toString('utf8'))
  }

  if (extensao === '.xlsx') return lerXlsx(bytes)

  throw new Error(
    `Não sei ler arquivos "${extensao}". Envie a planilha em .xlsx ou .csv.`,
  )
}

async function lerXlsx(bytes: Buffer): Promise<PlanilhaLida> {
  const { default: ExcelJS } = await import('exceljs')
  const livro = new ExcelJS.Workbook()
  // A exceljs traz a própria cópia de @types/node, e o `Buffer` dela não
  // é estruturalmente igual ao nosso — a diferença é só de versão de
  // tipagem, não de valor em runtime. O cast fica confinado a esta linha.
  await livro.xlsx.load(bytes as unknown as Parameters<typeof livro.xlsx.load>[0])

  const aba = livro.worksheets[0]
  if (!aba) throw new Error('A planilha não tem nenhuma aba.')

  const linhasBrutas: string[][] = []
  aba.eachRow({ includeEmpty: false }, (linha) => {
    const valores: string[] = []
    // `eachCell` pula célula vazia no meio da linha, o que desalinharia
    // as colunas. O laço por índice preserva as posições.
    for (let coluna = 1; coluna <= aba.columnCount; coluna++) {
      valores.push(paraTexto(linha.getCell(coluna).value))
    }
    linhasBrutas.push(valores)
  })

  return montar(linhasBrutas)
}

/**
 * Converte o valor de uma célula em texto.
 *
 * Número vira string sem notação científica: uma matrícula longa lida
 * como número viraria "2,024e+9" e nenhuma matrícula casaria.
 */
function paraTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'string') return valor.trim()
  if (typeof valor === 'number') return String(valor)
  if (typeof valor === 'boolean') return valor ? 'true' : 'false'
  if (valor instanceof Date) {
    // Data em ISO curta: é o formato que os validadores de domínio
    // esperam, e evita depender do fuso do servidor.
    return valor.toISOString().slice(0, 10)
  }
  if (typeof valor === 'object') {
    const objeto = valor as { text?: unknown; result?: unknown; richText?: { text: string }[] }
    if (typeof objeto.text === 'string') return objeto.text.trim()
    if (Array.isArray(objeto.richText)) return objeto.richText.map((p) => p.text).join('').trim()
    if (objeto.result !== undefined) return paraTexto(objeto.result)
  }
  return String(valor).trim()
}

/**
 * Analisador de CSV no espírito do RFC 4180, com duas concessões ao
 * mundo real brasileiro: aceita `;` como separador (é o que o Excel
 * pt-BR exporta) e remove o BOM que o Excel grava no início.
 */
export function lerCsv(conteudo: string): PlanilhaLida {
  const texto = conteudo.replace(/^﻿/, '')
  if (texto.trim().length === 0) {
    throw new Error('O arquivo está vazio.')
  }

  const separador = detectarSeparador(texto)
  const linhas: string[][] = []
  let campos: string[] = []
  let campo = ''
  let dentroDeAspas = false

  for (let i = 0; i < texto.length; i++) {
    const caractere = texto[i]!

    if (dentroDeAspas) {
      if (caractere === '"') {
        // Aspas duplicadas dentro de aspas são uma aspa literal.
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          dentroDeAspas = false
        }
      } else {
        campo += caractere
      }
      continue
    }

    if (caractere === '"') {
      dentroDeAspas = true
    } else if (caractere === separador) {
      campos.push(campo.trim())
      campo = ''
    } else if (caractere === '\n') {
      campos.push(campo.trim())
      linhas.push(campos)
      campos = []
      campo = ''
    } else if (caractere !== '\r') {
      campo += caractere
    }
  }

  if (campo.length > 0 || campos.length > 0) {
    campos.push(campo.trim())
    linhas.push(campos)
  }

  return montar(linhas)
}

function detectarSeparador(texto: string): string {
  const primeiraLinha = texto.split('\n')[0] ?? ''
  const virgulas = (primeiraLinha.match(/,/g) ?? []).length
  const pontosEVirgula = (primeiraLinha.match(/;/g) ?? []).length
  return pontosEVirgula > virgulas ? ';' : ','
}

function montar(linhas: string[][]): PlanilhaLida {
  // Planilha exportada costuma vir com linhas em branco no fim; elas
  // virariam "linha 57 inválida" e assustariam a operadora à toa.
  const uteis = linhas.filter((linha) => linha.some((celula) => celula.trim().length > 0))

  const cabecalho = uteis[0]
  if (!cabecalho) throw new Error('O arquivo não tem nenhuma linha preenchida.')

  return {
    cabecalho: cabecalho.map((c) => c.trim()),
    linhas: uteis.slice(1),
  }
}
