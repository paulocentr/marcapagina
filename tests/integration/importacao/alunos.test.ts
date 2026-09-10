import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { executarEmTransacao } from '@/core/db/tenant-extension'
import { alunosImportacaoRepository } from '@/modules/importacao/alunos-importacao.repository'
import { planoDeAlunos } from '@/modules/importacao/plano-alunos'
import { importar, previsualizar, ImportacaoComErrosError } from '@/modules/importacao/importacao.service'
import type { Principal } from '@/core/auth/principal'

let escolaA = ''
let escolaB = ''

const CABECALHO = ['matricula', 'nome', 'nascimento']
const MAPEAMENTO = { matricula: 0, nome: 1, dataNascimento: 2 }

const deps = {
  alunosParaImportacao: alunosImportacaoRepository,
  emTransacao: executarEmTransacao,
}

const principalDe = (escolaId: string): Principal => ({
  reino: 'STAFF',
  id: 'usr_1',
  escolaId,
  nome: 'Coordenação',
  permissoes: ['aluno:importar', 'aluno:criar'],
})

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id
})

function importarNaEscolaA(linhas: string[][], depsExtra = {}) {
  return executarComTenant(escolaA, () =>
    importar(
      principalDe(escolaA),
      { plano: planoDeAlunos, cabecalho: CABECALHO, linhas, mapeamento: MAPEAMENTO },
      { ...deps, ...depsExtra },
    ),
  )
}

describe('importação de alunos contra banco', () => {
  it('grava os alunos da planilha', async () => {
    const resultado = await importarNaEscolaA([
      ['2024001', 'Ana Souza', '2012-03-15'],
      ['2024002', 'Bruno Lima', '15/07/2011'],
    ])

    expect(resultado.importados).toBe(2)
    expect(await prisma.aluno.count()).toBe(2)
  })

  it('a data de nascimento não desloca por causa de fuso', async () => {
    // A coluna é @db.Date e o servidor está em São Paulo. Um dia a menos
    // aqui faz o aluno não conseguir entrar no portal com a data que sabe
    // de cor — que é a senha dele (spec §2.3).
    await importarNaEscolaA([['2024001', 'Ana Souza', '2012-03-15']])

    const aluno = await prisma.aluno.findFirstOrThrow()
    expect(aluno.dataNascimento.toISOString().slice(0, 10)).toBe('2012-03-15')
  })

  it('NENHUM aluno entra se a gravação falhar no meio', async () => {
    // Importação parcial é o pior resultado: a operadora não sabe de onde
    // recomeçar e reenviar duplicaria o que já entrou.
    const gravacaoQueFalha = {
      ...alunosImportacaoRepository,
      gravarMuitos: vi.fn(async (alunos: Parameters<typeof alunosImportacaoRepository.gravarMuitos>[0]) => {
        await alunosImportacaoRepository.gravarMuitos(alunos)
        throw new Error('banco caiu depois de gravar')
      }),
    }

    await expect(
      importarNaEscolaA(
        [
          ['2024001', 'Ana Souza', '2012-03-15'],
          ['2024002', 'Bruno Lima', '2011-07-20'],
        ],
        { alunosParaImportacao: gravacaoQueFalha },
      ),
    ).rejects.toThrow('banco caiu depois de gravar')

    expect(await prisma.aluno.count()).toBe(0)
  })

  it('linha inválida impede a importação inteira, sem gravar nada', async () => {
    await expect(
      importarNaEscolaA([
        ['2024001', 'Ana Souza', '2012-03-15'],
        ['2024002', 'Bruno', '31/02/2011'],
      ]),
    ).rejects.toBeInstanceOf(ImportacaoComErrosError)

    expect(await prisma.aluno.count()).toBe(0)
  })

  it('reimportar a mesma planilha com um aluno novo grava só o novo', async () => {
    await importarNaEscolaA([['2024001', 'Ana Souza', '2012-03-15']])

    const segunda = await importarNaEscolaA([
      ['2024001', 'Ana Souza', '2012-03-15'],
      ['2024002', 'Bruno Lima', '2011-07-20'],
    ])

    expect(segunda.importados).toBe(1)
    expect(segunda.ignorados).toBe(1)
    expect(await prisma.aluno.count()).toBe(2)
  })

  it('a matrícula da escola vizinha não bloqueia esta escola', async () => {
    // Matrícula é única POR ESCOLA. Se a checagem vazasse, a escola A
    // ficaria impedida de cadastrar um aluno por causa da B.
    await prisma.aluno.create({
      data: {
        escolaId: escolaB,
        matricula: '2024001',
        nome: 'Homônimo da vizinha',
        dataNascimento: new Date('2012-03-15'),
      },
    })

    const resultado = await importarNaEscolaA([['2024001', 'Ana Souza', '2012-03-15']])

    expect(resultado.importados).toBe(1)
    expect(await prisma.aluno.count({ where: { escolaId: escolaA } })).toBe(1)
  })

  it('a prévia não grava nada', async () => {
    await executarComTenant(escolaA, () =>
      previsualizar(
        principalDe(escolaA),
        {
          plano: planoDeAlunos,
          cabecalho: CABECALHO,
          linhas: [['2024001', 'Ana Souza', '2012-03-15']],
          mapeamento: MAPEAMENTO,
        },
        deps,
      ),
    )

    expect(await prisma.aluno.count()).toBe(0)
  })
})
