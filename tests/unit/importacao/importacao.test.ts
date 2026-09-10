import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  previsualizar,
  importar,
  MapeamentoIncompletoError,
  ImportacaoComErrosError,
  type PlanoDeImportacao,
} from '@/modules/importacao/importacao.service'
import { planoDeAlunos } from '@/modules/importacao/plano-alunos'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

const COORDENACAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: ['aluno:importar', 'aluno:criar'],
}

const MONITOR: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['aluno:ver'],
}

const CABECALHO = ['matricula', 'nome', 'nascimento']

// A "transação" dos testes de unidade é só executar: a garantia real de
// atomicidade é do banco e está coberta em teste de integração.
function executarDireto<T>(fn: () => Promise<T>): Promise<T> {
  return fn()
}

function criarFakeDeAlunos(existentes: string[] = []) {
  const gravados: unknown[] = []
  return {
    gravados,
    chamadasDeGravacao: 0,
    async matriculasExistentes(matriculas: string[]) {
      return new Set(matriculas.filter((m) => existentes.includes(m)))
    },
    async gravarMuitos(itens: unknown[]) {
      this.chamadasDeGravacao += 1
      gravados.push(...itens)
    },
  }
}

let deps: {
  alunosParaImportacao: ReturnType<typeof criarFakeDeAlunos>
  emTransacao: <T>(fn: () => Promise<T>) => Promise<T>
}

beforeEach(() => {
  deps = {
    alunosParaImportacao: criarFakeDeAlunos(),
    emTransacao: executarDireto,
  }
})

const MAPEAMENTO = { matricula: 0, nome: 1, dataNascimento: 2 }

describe('previsualizar', () => {
  it('aceita linhas válidas', async () => {
    const previa = await previsualizar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [['2024001', 'Ana Souza', '2012-03-15']],
        mapeamento: MAPEAMENTO,
      },
      deps,
    )

    expect(previa.validas).toHaveLength(1)
    expect(previa.problemas).toEqual([])
  })

  it('o erro NOMEIA a linha da planilha', async () => {
    // "Data inválida" sem número de linha manda a operadora reler 400
    // linhas à procura de qual. A numeração conta o cabeçalho, porque é
    // o que ela vê no Excel.
    const previa = await previsualizar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [
          ['2024001', 'Ana Souza', '2012-03-15'],
          ['2024002', 'Bruno', 'nao-e-data'],
        ],
        mapeamento: MAPEAMENTO,
      },
      deps,
    )

    expect(previa.problemas).toHaveLength(1)
    expect(previa.problemas[0]?.linha).toBe(3)
    expect(previa.problemas[0]?.mensagem).toMatch(/nascimento/i)
  })

  it('aponta matrícula repetida DENTRO do arquivo', async () => {
    const previa = await previsualizar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [
          ['2024001', 'Ana', '2012-03-15'],
          ['2024001', 'Ana de novo', '2012-03-15'],
        ],
        mapeamento: MAPEAMENTO,
      },
      deps,
    )

    expect(previa.problemas[0]?.linha).toBe(3)
    expect(previa.problemas[0]?.mensagem).toMatch(/repetida/i)
  })

  it('aponta matrícula que já existe no banco', async () => {
    deps.alunosParaImportacao = criarFakeDeAlunos(['2024001'])

    const previa = await previsualizar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [['2024001', 'Ana', '2012-03-15']],
        mapeamento: MAPEAMENTO,
      },
      deps,
    )

    expect(previa.jaExistentes).toHaveLength(1)
    expect(previa.validas).toHaveLength(0)
  })

  it('recusa mapeamento sem campo obrigatório', async () => {
    await expect(
      previsualizar(
        COORDENACAO,
        {
          plano: planoDeAlunos,
          cabecalho: CABECALHO,
          linhas: [['2024001', 'Ana', '2012-03-15']],
          mapeamento: { matricula: 0 },
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(MapeamentoIncompletoError)
  })

  it('previsualizar NÃO grava nada', async () => {
    await previsualizar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [['2024001', 'Ana', '2012-03-15']],
        mapeamento: MAPEAMENTO,
      },
      deps,
    )

    expect(deps.alunosParaImportacao.gravados).toHaveLength(0)
  })

  it('recusa sem permissão aluno:importar', async () => {
    await expect(
      previsualizar(
        MONITOR,
        { plano: planoDeAlunos, cabecalho: CABECALHO, linhas: [], mapeamento: MAPEAMENTO },
        deps,
      ),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('importar', () => {
  it('grava as linhas válidas de uma vez', async () => {
    const resultado = await importar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [
          ['2024001', 'Ana Souza', '2012-03-15'],
          ['2024002', 'Bruno Lima', '2011-07-20'],
        ],
        mapeamento: MAPEAMENTO,
      },
      deps,
    )

    expect(resultado.importados).toBe(2)
    expect(deps.alunosParaImportacao.gravados).toHaveLength(2)
    // Uma escrita, não uma por linha: 400 alunos não podem virar 400 idas.
    expect(deps.alunosParaImportacao.chamadasDeGravacao).toBe(1)
  })

  it('NENHUMA linha entra se alguma falhar', async () => {
    // Importação parcial é o pior resultado possível: a operadora não
    // sabe de onde recomeçar e reimportar duplicaria o que já entrou.
    await expect(
      importar(
        COORDENACAO,
        {
          plano: planoDeAlunos,
          cabecalho: CABECALHO,
          linhas: [
            ['2024001', 'Ana Souza', '2012-03-15'],
            ['2024002', 'Bruno', 'nao-e-data'],
          ],
          mapeamento: MAPEAMENTO,
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ImportacaoComErrosError)

    expect(deps.alunosParaImportacao.gravados).toHaveLength(0)
  })

  it('o erro de importação carrega TODOS os problemas, não só o primeiro', async () => {
    // Corrigir de um em um, reenviando o arquivo a cada vez, é o que faz
    // a operadora desistir na terceira tentativa.
    const erro = await importar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [
          ['', 'Sem matrícula', '2012-03-15'],
          ['2024002', '', '2011-07-20'],
          ['2024003', 'Certo', 'nao-e-data'],
        ],
        mapeamento: MAPEAMENTO,
      },
      deps,
    ).catch((e: unknown) => e as ImportacaoComErrosError)

    expect((erro as ImportacaoComErrosError).problemas).toHaveLength(3)
  })

  it('pula quem já existe em vez de falhar a importação inteira', async () => {
    // Reimportar a planilha da secretaria com dois alunos novos é o caso
    // NORMAL; falhar por causa dos antigos tornaria o importador inútil.
    deps.alunosParaImportacao = criarFakeDeAlunos(['2024001'])

    const resultado = await importar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [
          ['2024001', 'Ana Souza', '2012-03-15'],
          ['2024002', 'Bruno Lima', '2011-07-20'],
        ],
        mapeamento: MAPEAMENTO,
      },
      deps,
    )

    expect(resultado.importados).toBe(1)
    expect(resultado.ignorados).toBe(1)
  })

  it('arquivo sem nenhuma linha válida não abre transação à toa', async () => {
    const emTransacao = vi.fn(executarDireto)
    deps.emTransacao = emTransacao as typeof deps.emTransacao
    deps.alunosParaImportacao = criarFakeDeAlunos(['2024001'])

    await importar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [['2024001', 'Ana', '2012-03-15']],
        mapeamento: MAPEAMENTO,
      },
      deps,
    )

    expect(emTransacao).not.toHaveBeenCalled()
  })

  it('recusa sem permissão aluno:importar', async () => {
    await expect(
      importar(
        MONITOR,
        { plano: planoDeAlunos, cabecalho: CABECALHO, linhas: [], mapeamento: MAPEAMENTO },
        deps,
      ),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('planoDeAlunos', () => {
  it('declara os campos para a tela montar o mapeamento', () => {
    const obrigatorios = planoDeAlunos.campos.filter((c) => c.obrigatorio).map((c) => c.chave)
    expect(obrigatorios).toEqual(['matricula', 'nome', 'dataNascimento'])
  })

  it('aceita data em dd/mm/aaaa, que é o que o Excel pt-BR produz', async () => {
    const previa = await previsualizar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [['2024001', 'Ana', '15/03/2012']],
        mapeamento: MAPEAMENTO,
      },
      deps,
    )

    expect(previa.problemas).toEqual([])
    expect(previa.validas[0]).toMatchObject({ dataNascimento: '2012-03-15' })
  })

  it('recusa data impossível em vez de deslocar o dia', async () => {
    // 31/02 vira 03/03 num Date() ingênuo, e o aluno passa a não conseguir
    // entrar no portal com a data que ele sabe de cor.
    const previa = await previsualizar(
      COORDENACAO,
      {
        plano: planoDeAlunos,
        cabecalho: CABECALHO,
        linhas: [['2024001', 'Ana', '31/02/2012']],
        mapeamento: MAPEAMENTO,
      },
      deps,
    )

    expect(previa.problemas).toHaveLength(1)
  })
})

// Um plano mínimo prova que a máquina é genérica, e não um importador de
// alunos com nome pomposo.
const planoDeBrinquedo: PlanoDeImportacao<{ codigo: string }> = {
  nome: 'brinquedo',
  permissao: 'aluno:importar',
  campos: [{ chave: 'codigo', rotulo: 'Código', obrigatorio: true }],
  validarLinha: (obter) => {
    const codigo = obter('codigo')
    if (!codigo) return { erro: 'Informe o código.' }
    return { valor: { codigo } }
  },
  chaveDeDeduplicacao: (item) => item.codigo,
  async jaExistentes() {
    return new Set<string>()
  },
  async gravar() {
    /* nada */
  },
}

describe('a máquina é genérica', () => {
  it('roda com outro plano sem alterar o serviço', async () => {
    const previa = await previsualizar(
      COORDENACAO,
      {
        plano: planoDeBrinquedo,
        cabecalho: ['codigo'],
        linhas: [['abc']],
        mapeamento: { codigo: 0 },
      },
      deps,
    )

    expect(previa.validas).toEqual([{ codigo: 'abc' }])
  })
})
