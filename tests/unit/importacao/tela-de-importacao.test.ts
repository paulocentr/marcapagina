import { describe, it, expect } from 'vitest'
import { planoDeAlunos } from '@/modules/importacao/plano-alunos'
import {
  EXTENSOES_ACEITAS,
  LIMITE_DE_BYTES,
  LIMITE_EM_TEXTO,
  validarArquivoEnviado,
} from '@/app/painel/importacao/arquivo'
import {
  PREFIXO_DA_COLUNA,
  mapeamentoDoFormulario,
  rotuloDaColuna,
  sugerirMapeamento,
} from '@/app/painel/importacao/mapeamento'
import {
  agruparPorMotivo,
  dataComoAEscolaEscreve,
  frasearLinhas,
  resumirMotivo,
  resumirPlano,
} from '@/app/painel/importacao/plano-na-tela'

/**
 * A lógica pura da TELA do importador.
 *
 * Tudo aqui roda sem React, sem servidor e sem banco: é o que permite
 * provar em milissegundos as três coisas que fazem a tela valer algo —
 * o plano mostrado ANTES de gravar bate com o que o serviço vai fazer,
 * a linha com problema carrega o número que a operadora vê no Excel, e
 * a coluna da planilha da secretaria é reconhecida sem ela ter de
 * explicar seis vezes qual é qual.
 */

describe('validarArquivoEnviado', () => {
  it('aceita o .xlsx que a secretaria exporta', () => {
    expect(validarArquivoEnviado('alunos.xlsx', 20_000)).toEqual({ ok: true, extensao: '.xlsx' })
  })

  it('aceita .csv, que é a outra coisa que o leitor sabe ler', () => {
    // O leitor (`src/infra/planilha/ler.ts`) lê .xlsx e .csv. Recusar o
    // csv na tela seria esconder metade do que o sistema já faz.
    expect(validarArquivoEnviado('alunos.csv', 900)).toEqual({ ok: true, extensao: '.csv' })
  })

  it('recusa extensão que o leitor não sabe ler, DIZENDO quais servem', () => {
    const resultado = validarArquivoEnviado('alunos.pdf', 900)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('deveria recusar')
    for (const extensao of EXTENSOES_ACEITAS) {
      expect(resultado.erro).toContain(extensao)
    }
  })

  it('recusa arquivo vazio em vez de mandar zero byte ao leitor', () => {
    const resultado = validarArquivoEnviado('alunos.xlsx', 0)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('deveria recusar')
    expect(resultado.erro).toMatch(/vazio/i)
  })

  it('recusa acima do limite ANTES de ler os bytes, e diz o limite', () => {
    // O limite existe para o arquivo enviado de fora não virar memória
    // do servidor. Recusar sem dizer o número faria a operadora tentar
    // de novo com o mesmo arquivo.
    const resultado = validarArquivoEnviado('alunos.xlsx', LIMITE_DE_BYTES + 1)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('deveria recusar')
    expect(resultado.erro).toContain(LIMITE_EM_TEXTO)
  })

  it('não se importa com CAIXA na extensão', () => {
    expect(validarArquivoEnviado('ALUNOS.XLSX', 10).ok).toBe(true)
  })

  it('recusa arquivo sem extensão nenhuma', () => {
    expect(validarArquivoEnviado('alunos', 10).ok).toBe(false)
  })
})

describe('sugerirMapeamento', () => {
  it('reconhece o cabeçalho escrito como o rótulo do campo', () => {
    const { mapeamento, obrigatoriosSemColuna } = sugerirMapeamento(
      ['Matrícula', 'Nome', 'Data de nascimento'],
      planoDeAlunos.campos,
    )

    expect(mapeamento).toMatchObject({ matricula: 0, nome: 1, dataNascimento: 2 })
    expect(obrigatoriosSemColuna).toEqual([])
  })

  it('reconhece os apelidos que a secretaria realmente usa', () => {
    // "RA" e "nascimento" são o que aparece na planilha de verdade.
    const { mapeamento } = sugerirMapeamento(['RA', 'nome do aluno', 'nascimento'], planoDeAlunos.campos)
    expect(mapeamento).toMatchObject({ matricula: 0, nome: 1, dataNascimento: 2 })
  })

  it('NÃO confunde o nome do responsável com o nome do aluno', () => {
    // O erro mais caro do importador: o nome da mãe entrar no lugar do
    // nome do aluno. A planilha sai válida, ninguém vê, e a chamada da
    // biblioteca passa a ter trinta responsáveis emprestando livro.
    const { mapeamento } = sugerirMapeamento(
      ['matricula', 'nome do responsavel', 'nascimento', 'nome'],
      planoDeAlunos.campos,
    )

    expect(mapeamento.nome).toBe(3)
    expect(mapeamento.responsavelNome).toBe(1)
  })

  it('nunca aponta a mesma coluna para dois campos', () => {
    const { mapeamento } = sugerirMapeamento(
      ['nome', 'nome', 'matricula', 'nascimento'],
      planoDeAlunos.campos,
    )

    const colunas = Object.values(mapeamento)
    expect(new Set(colunas).size).toBe(colunas.length)
  })

  it('diz QUAIS campos obrigatórios ficaram sem coluna', () => {
    const { mapeamento, obrigatoriosSemColuna } = sugerirMapeamento(
      ['matricula', 'nome'],
      planoDeAlunos.campos,
    )

    expect(mapeamento.dataNascimento).toBeUndefined()
    expect(obrigatoriosSemColuna).toEqual(['Data de nascimento'])
  })

  it('ignora acento, caixa e pontuação do cabeçalho', () => {
    const { obrigatoriosSemColuna } = sugerirMapeamento(
      ['MATRÍCULA:', 'nome_completo', 'DATA DE NASCIMENTO'],
      planoDeAlunos.campos,
    )
    expect(obrigatoriosSemColuna).toEqual([])
  })

  it('coluna sem título não vira mapeamento', () => {
    const { mapeamento } = sugerirMapeamento(['', 'matricula'], planoDeAlunos.campos)
    expect(mapeamento.matricula).toBe(1)
  })
})

describe('rotuloDaColuna', () => {
  it('nomeia a coluna como o Excel nomeia', () => {
    expect(rotuloDaColuna(0, 'matricula')).toBe('A · matricula')
    expect(rotuloDaColuna(26, 'x')).toBe('AA · x')
  })

  it('coluna sem título aparece como sem título, não em branco', () => {
    expect(rotuloDaColuna(1, '')).toBe('B · (sem título)')
  })
})

describe('mapeamentoDoFormulario', () => {
  const entradas = (pares: [string, string][]): [string, string][] =>
    pares.map(([chave, valor]) => [`${PREFIXO_DA_COLUNA}${chave}`, valor])

  it('lê o mapeamento que a operadora escolheu à mão', () => {
    const resultado = mapeamentoDoFormulario(
      entradas([
        ['matricula', '2'],
        ['nome', '0'],
        ['dataNascimento', '1'],
      ]),
      planoDeAlunos.campos,
      3,
    )

    expect(resultado).toEqual({ ok: true, mapeamento: { matricula: 2, nome: 0, dataNascimento: 1 } })
  })

  it('campo deixado em branco fica FORA do mapeamento', () => {
    const resultado = mapeamentoDoFormulario(
      entradas([
        ['matricula', '0'],
        ['responsavelEmail', ''],
      ]),
      planoDeAlunos.campos,
      1,
    )

    expect(resultado).toEqual({ ok: true, mapeamento: { matricula: 0 } })
  })

  it('recusa coluna que não é número inteiro', () => {
    // O mapeamento chega do cliente. `Number()` sobre entrada não
    // validada é proibido no projeto, e aqui seria a porta: "1e3" viraria
    // coluna 1000 e a planilha inteira sairia vazia sem erro nenhum.
    const resultado = mapeamentoDoFormulario(entradas([['matricula', '1e3']]), planoDeAlunos.campos, 3)
    expect(resultado.ok).toBe(false)
  })

  it('recusa coluna fora da planilha', () => {
    const resultado = mapeamentoDoFormulario(entradas([['matricula', '9']]), planoDeAlunos.campos, 3)
    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('deveria recusar')
    expect(resultado.erro).toMatch(/coluna/i)
  })

  it('recusa campo que não existe no plano', () => {
    const resultado = mapeamentoDoFormulario(entradas([['sobrenome', '0']]), planoDeAlunos.campos, 3)
    expect(resultado.ok).toBe(false)
  })

  it('recusa a MESMA coluna apontada para dois campos', () => {
    // Sem isso o nome do aluno e o do responsável sairiam iguais em
    // trezentos cadastros, e a tela teria dito que estava tudo certo.
    const resultado = mapeamentoDoFormulario(
      entradas([
        ['nome', '1'],
        ['responsavelNome', '1'],
      ]),
      planoDeAlunos.campos,
      3,
    )

    expect(resultado.ok).toBe(false)
    if (resultado.ok) throw new Error('deveria recusar')
    expect(resultado.erro).toMatch(/duas vezes|dois campos/i)
  })

  it('ignora campos do formulário que não são de coluna', () => {
    const resultado = mapeamentoDoFormulario(
      [['arquivo', 'alunos.xlsx'], ...entradas([['matricula', '0']])],
      planoDeAlunos.campos,
      1,
    )
    expect(resultado).toEqual({ ok: true, mapeamento: { matricula: 0 } })
  })
})

describe('resumirMotivo', () => {
  it('mantém intacto o motivo que não tem parte variável', () => {
    expect(resumirMotivo('Informe a matrícula.')).toBe('Informe a matrícula.')
  })

  it('junta o mesmo motivo quando só o valor entre aspas muda', () => {
    // Sem isso, quarenta matrículas repetidas viram quarenta "motivos"
    // diferentes e o resumo deixa de resumir.
    const a = resumirMotivo('Chave "2024001" repetida — já aparece na linha 3.')
    const b = resumirMotivo('Chave "2024099" repetida — já aparece na linha 41.')
    expect(a).toBe(b)
  })

  it('não devolve motivo vazio quando a mensagem é só número', () => {
    expect(resumirMotivo('123')).toBe('123')
  })

  it('preserva o formato de data que a mensagem ensina', () => {
    // A mensagem do plano de alunos ENSINA o formato aceito. Apagá-la
    // deixaria a operadora sem saber o que digitar na planilha.
    expect(resumirMotivo('Data de nascimento inválida. Use aaaa-mm-dd ou dd/mm/aaaa.')).toContain(
      'aaaa-mm-dd',
    )
  })
})

describe('agruparPorMotivo', () => {
  it('agrupa e guarda o NÚMERO da linha de cada caso', () => {
    // A operadora vai abrir o arquivo no Excel: sem o número da linha o
    // resumo não serve para consertar nada.
    const grupos = agruparPorMotivo([
      { linha: 3, mensagem: 'Informe a matrícula.' },
      { linha: 5, mensagem: 'Data de nascimento inválida. Use aaaa-mm-dd ou dd/mm/aaaa.' },
      { linha: 9, mensagem: 'Informe a matrícula.' },
    ])

    expect(grupos[0]).toEqual({ motivo: 'Informe a matrícula.', linhas: [3, 9] })
    expect(grupos).toHaveLength(2)
  })

  it('põe o motivo mais frequente na frente', () => {
    const grupos = agruparPorMotivo([
      { linha: 2, mensagem: 'Informe o nome do aluno.' },
      { linha: 3, mensagem: 'Informe a matrícula.' },
      { linha: 4, mensagem: 'Informe a matrícula.' },
    ])

    expect(grupos.map((g) => g.linhas.length)).toEqual([2, 1])
  })

  it('as linhas saem em ordem crescente, como no arquivo', () => {
    const grupos = agruparPorMotivo([
      { linha: 40, mensagem: 'Informe a matrícula.' },
      { linha: 7, mensagem: 'Informe a matrícula.' },
    ])
    expect(grupos[0]?.linhas).toEqual([7, 40])
  })

  it('sem problema nenhum, nenhum grupo', () => {
    expect(agruparPorMotivo([])).toEqual([])
  })
})

describe('dataComoAEscolaEscreve', () => {
  it('mostra a ISO do plano no formato da escola', () => {
    expect(dataComoAEscolaEscreve('2012-03-15')).toBe('15/03/2012')
  })

  it('não desloca o dia — a data de nascimento é a senha do aluno', () => {
    // Um `new Date('2012-01-01')` lido em local time volta como 31/12 em
    // São Paulo. Aqui é recorte de string, e por isso o resultado é o
    // mesmo em qualquer fuso.
    expect(dataComoAEscolaEscreve('2012-01-01')).toBe('01/01/2012')
  })

  it('formato inesperado volta como veio, sem inventar data', () => {
    expect(dataComoAEscolaEscreve('15/03/2012')).toBe('15/03/2012')
  })
})

describe('frasearLinhas', () => {
  it('escreve a lista como se lê em voz alta para quem está no Excel', () => {
    expect(frasearLinhas([7])).toBe('linha 7')
    expect(frasearLinhas([7, 12, 40])).toBe('linhas 7, 12 e 40')
  })
})

describe('resumirPlano', () => {
  it('conta o que entra, o que é ignorado e o que está com problema', () => {
    const resumo = resumirPlano({
      entram: 2,
      jaCadastrados: [{ linha: 4, mensagem: '"2024001" já está cadastrado — esta linha será ignorada.' }],
      problemas: [{ linha: 7, mensagem: 'Informe a matrícula.' }],
    })

    expect(resumo.entram).toBe(2)
    expect(resumo.jaCadastrados).toBe(1)
    expect(resumo.comProblema).toBe(1)
    expect(resumo.linhasLidas).toBe(4)
  })

  it('com QUALQUER problema não há o que confirmar', () => {
    // A importação é tudo-ou-nada (`ImportacaoComErrosError`): o serviço
    // recusa a planilha inteira. Deixar o botão de confirmar aceso seria
    // desenhar um botão que só sabe dar erro.
    const resumo = resumirPlano({
      entram: 300,
      jaCadastrados: [],
      problemas: [{ linha: 7, mensagem: 'Informe a matrícula.' }],
    })

    expect(resumo.podeGravar).toBe(false)
  })

  it('sem nenhuma linha nova não há o que confirmar', () => {
    // Reimportar a planilha inteira da secretaria é o caso NORMAL. Quando
    // todos já estão cadastrados, o serviço não abre nem transação — um
    // botão aceso aqui prometeria uma gravação que não acontece.
    const resumo = resumirPlano({
      entram: 0,
      jaCadastrados: [{ linha: 2, mensagem: 'já está cadastrado' }],
      problemas: [],
    })

    expect(resumo.podeGravar).toBe(false)
  })

  it('planilha limpa com linha nova pode ser confirmada', () => {
    const resumo = resumirPlano({ entram: 5, jaCadastrados: [], problemas: [] })
    expect(resumo.podeGravar).toBe(true)
  })

  it('carrega os motivos agrupados, para o resumo não ser só um número', () => {
    const resumo = resumirPlano({
      entram: 0,
      jaCadastrados: [],
      problemas: [
        { linha: 3, mensagem: 'Informe a matrícula.' },
        { linha: 8, mensagem: 'Informe a matrícula.' },
      ],
    })

    expect(resumo.motivosDosProblemas).toEqual([
      { motivo: 'Informe a matrícula.', linhas: [3, 8] },
    ])
  })
})
