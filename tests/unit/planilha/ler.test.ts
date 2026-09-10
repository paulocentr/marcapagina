import { describe, it, expect } from 'vitest'
import { lerPlanilha, lerCsv } from '@/infra/planilha/ler'

describe('lerCsv', () => {
  it('lê cabeçalho e linhas', () => {
    const { cabecalho, linhas } = lerCsv('matricula,nome\n2024001,Ana\n2024002,Bruno\n')

    expect(cabecalho).toEqual(['matricula', 'nome'])
    expect(linhas).toEqual([
      ['2024001', 'Ana'],
      ['2024002', 'Bruno'],
    ])
  })

  it('respeita campo entre aspas com vírgula dentro', () => {
    // "Souza, Ana Maria" é UM nome. Quebrar aqui embaralharia a planilha
    // inteira a partir da primeira vírgula em nome composto.
    const { linhas } = lerCsv('matricula,nome\n1,"Souza, Ana Maria"\n')

    expect(linhas[0]).toEqual(['1', 'Souza, Ana Maria'])
  })

  it('respeita aspas escapadas', () => {
    const { linhas } = lerCsv('titulo\n"O ""Menino"" Maluquinho"\n')

    expect(linhas[0]).toEqual(['O "Menino" Maluquinho'])
  })

  it('respeita quebra de linha dentro de aspas', () => {
    const { linhas } = lerCsv('obs\n"linha um\nlinha dois"\n')

    expect(linhas[0]).toEqual(['linha um\nlinha dois'])
  })

  it('aceita ponto e vírgula, que é o padrão do Excel em português', () => {
    // Excel pt-BR exporta com ; — recusar isso reprovaria a planilha que
    // a secretaria da escola realmente produz.
    const { cabecalho, linhas } = lerCsv('matricula;nome\n1;Ana\n')

    expect(cabecalho).toEqual(['matricula', 'nome'])
    expect(linhas[0]).toEqual(['1', 'Ana'])
  })

  it('aceita CRLF', () => {
    const { linhas } = lerCsv('a,b\r\n1,2\r\n')
    expect(linhas).toEqual([['1', '2']])
  })

  it('ignora linhas totalmente vazias', () => {
    // Planilha exportada costuma vir com linhas em branco no fim; elas
    // virariam "linha 57 inválida" e assustariam a operadora à toa.
    const { linhas } = lerCsv('a,b\n1,2\n\n\n')
    expect(linhas).toEqual([['1', '2']])
  })

  it('remove BOM do início', () => {
    // Excel grava UTF-8 com BOM, e sem removê-lo a primeira coluna nunca
    // casa com o nome esperado.
    const { cabecalho } = lerCsv('﻿matricula,nome\n1,Ana\n')
    expect(cabecalho[0]).toBe('matricula')
  })

  it('recusa arquivo sem nenhuma linha', () => {
    expect(() => lerCsv('')).toThrow()
    expect(() => lerCsv('   ')).toThrow()
  })
})

describe('lerPlanilha', () => {
  it('lê um .xlsx de verdade', async () => {
    const { default: ExcelJS } = await import('exceljs')
    const livro = new ExcelJS.Workbook()
    const aba = livro.addWorksheet('Alunos')
    aba.addRow(['matricula', 'nome', 'nascimento'])
    aba.addRow(['2024001', 'Ana Souza', '2012-03-15'])
    const bytes = Buffer.from(await livro.xlsx.writeBuffer())

    const { cabecalho, linhas } = await lerPlanilha(bytes, 'alunos.xlsx')

    expect(cabecalho).toEqual(['matricula', 'nome', 'nascimento'])
    expect(linhas[0]).toEqual(['2024001', 'Ana Souza', '2012-03-15'])
  })

  it('número vira texto sem notação científica', async () => {
    // Matrícula longa lida como número viraria "2,024e+9" e nenhuma
    // matrícula casaria.
    const { default: ExcelJS } = await import('exceljs')
    const livro = new ExcelJS.Workbook()
    const aba = livro.addWorksheet('Alunos')
    aba.addRow(['matricula'])
    aba.addRow([2024001001])
    const bytes = Buffer.from(await livro.xlsx.writeBuffer())

    const { linhas } = await lerPlanilha(bytes, 'alunos.xlsx')

    expect(linhas[0]?.[0]).toBe('2024001001')
  })

  it('encaminha .csv para o leitor de CSV', async () => {
    const { cabecalho } = await lerPlanilha(Buffer.from('a,b\n1,2\n'), 'alunos.csv')
    expect(cabecalho).toEqual(['a', 'b'])
  })

  it('recusa extensão que não sabe ler', async () => {
    await expect(lerPlanilha(Buffer.from('x'), 'alunos.pdf')).rejects.toThrow()
  })
})
