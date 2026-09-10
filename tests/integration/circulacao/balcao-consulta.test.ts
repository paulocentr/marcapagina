import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { consultaDoBalcaoRepository } from '@/modules/circulacao/balcao-consulta.repository'

let escolaA = ''
let obraA = ''
let alunoA = ''
let outroAlunoA = ''
let contadorDeTombos = 0

async function montarEscola(slug: string, tituloDaObra = 'O Cortiço') {
  const escola = await prisma.escola.create({ data: { slug, nome: slug } })
  const obra = await prisma.obra.create({
    data: {
      escolaId: escola.id,
      titulo: tituloDaObra,
      tituloNormalizado: tituloDaObra.toLowerCase(),
    },
  })
  const anoLetivo = await prisma.anoLetivo.create({
    data: {
      escolaId: escola.id,
      ano: 2026,
      dataInicio: new Date('2026-02-01'),
      dataFim: new Date('2026-12-15'),
      ativo: true,
    },
  })
  const turma = await prisma.turma.create({
    data: {
      escolaId: escola.id,
      anoLetivoId: anoLetivo.id,
      nome: '6º B',
      serie: '6',
      turno: 'MANHA',
    },
  })
  const aluno = await prisma.aluno.create({
    data: {
      escolaId: escola.id,
      matricula: '2024001',
      nome: `Aluno de ${slug}`,
      dataNascimento: new Date('2012-03-15'),
      turmaId: turma.id,
    },
  })
  return { escolaId: escola.id, obraId: obra.id, alunoId: aluno.id }
}

async function emprestar(dados: {
  escolaId: string
  obraId: string
  alunoId: string
  previstaPara: string
  devolvidaEm?: string
  renovacoes?: number
}) {
  contadorDeTombos += 1
  const exemplar = await prisma.exemplar.create({
    data: {
      escolaId: dados.escolaId,
      obraId: dados.obraId,
      tombo: String(contadorDeTombos).padStart(6, '0'),
      situacao: 'EMPRESTADO',
    },
  })

  return prisma.emprestimo.create({
    data: {
      escolaId: dados.escolaId,
      exemplarId: exemplar.id,
      alunoId: dados.alunoId,
      previstaPara: new Date(`${dados.previstaPara}T00:00:00.000Z`),
      devolvidaEm: dados.devolvidaEm ? new Date(`${dados.devolvidaEm}T00:00:00.000Z`) : null,
      renovacoes: dados.renovacoes === undefined ? 0 : dados.renovacoes,
      operadorRetiradaId: 'usr_1',
    },
  })
}

beforeEach(async () => {
  contadorDeTombos = 0
  const a = await montarEscola('escola-a')
  escolaA = a.escolaId
  obraA = a.obraId
  alunoA = a.alunoId

  const outro = await prisma.aluno.create({
    data: {
      escolaId: escolaA,
      matricula: '2024002',
      nome: 'Colega de classe',
      dataNascimento: new Date('2012-05-01'),
    },
  })
  outroAlunoA = outro.id
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

describe('os livros em mãos do leitor', () => {
  it('traz tombo, título e data prevista numa consulta só', async () => {
    await emprestar({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-19' })

    const emMaos = await naEscolaA(() => consultaDoBalcaoRepository.livrosEmMaos(alunoA))

    expect(emMaos).toHaveLength(1)
    expect(emMaos[0]?.tombo).toBe('000001')
    expect(emMaos[0]?.tituloDaObra).toBe('O Cortiço')
    expect(emMaos[0]?.previstaPara).toEqual(new Date('2026-09-19T00:00:00.000Z'))
    expect(emMaos[0]?.renovacoes).toBe(0)
  })

  it('o livro devolvido NÃO está mais em mãos', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      previstaPara: '2026-09-05',
      devolvidaEm: '2026-09-08',
    })

    expect(await naEscolaA(() => consultaDoBalcaoRepository.livrosEmMaos(alunoA))).toEqual([])
  })

  it('o repositório NÃO devolve nenhum campo dizendo "atrasado"', async () => {
    // A ausência é a garantia: quem decide atraso é o serviço, sobre a
    // data. Um campo aqui viraria, no primeiro refactor, um campo lido do
    // banco — e mentiria todo dia em que o cron falhasse.
    await emprestar({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-08-01' })

    const [livro] = await naEscolaA(() => consultaDoBalcaoRepository.livrosEmMaos(alunoA))

    expect(Object.keys(livro ?? {}).sort()).toEqual([
      'emprestimoId',
      'exemplarId',
      'previstaPara',
      'renovacoes',
      'tituloDaObra',
      'tombo',
    ])
  })

  it('vem do vencimento mais próximo para o mais distante', async () => {
    // A operadora lê a trilha de cima para baixo: o que está para vencer
    // (ou já venceu) tem de estar em cima, senão ela precisa varrer a
    // lista com o aluno esperando.
    await emprestar({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-30' })
    await emprestar({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-02' })
    await emprestar({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-15' })

    const emMaos = await naEscolaA(() => consultaDoBalcaoRepository.livrosEmMaos(alunoA))

    expect(emMaos.map((l) => l.previstaPara.toISOString().slice(0, 10))).toEqual([
      '2026-09-02',
      '2026-09-15',
      '2026-09-30',
    ])
  })

  it('não traz o livro do colega', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: outroAlunoA,
      previstaPara: '2026-09-19',
    })

    expect(await naEscolaA(() => consultaDoBalcaoRepository.livrosEmMaos(alunoA))).toEqual([])
  })

  it('não enxerga a escola vizinha', async () => {
    const vizinha = await montarEscola('escola-b', 'Vidas Secas')
    await emprestar({
      escolaId: vizinha.escolaId,
      obraId: vizinha.obraId,
      alunoId: vizinha.alunoId,
      previstaPara: '2026-09-19',
    })

    expect(
      await naEscolaA(() => consultaDoBalcaoRepository.livrosEmMaos(vizinha.alunoId)),
    ).toEqual([])
  })

  it('conta as renovações já usadas', async () => {
    // A tela precisa saber se ainda pode renovar antes de prometer.
    await emprestar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      previstaPara: '2026-09-19',
      renovacoes: 2,
    })

    const [livro] = await naEscolaA(() => consultaDoBalcaoRepository.livrosEmMaos(alunoA))
    expect(livro?.renovacoes).toBe(2)
  })
})

describe('o calendário na ficha do leitor', () => {
  it('o repositório da ficha lê os dias não letivos da própria escola', async () => {
    // A ficha calcula a data prevista ANTES de confirmar, e o cálculo
    // precisa do mesmo calendário que o empréstimo usa.
    await prisma.diaNaoLetivo.create({
      data: { escolaId: escolaA, data: new Date('2026-09-24T00:00:00.000Z'), motivo: 'Recesso' },
    })
    const vizinha = await montarEscola('escola-c', 'Iracema')
    await prisma.diaNaoLetivo.create({
      data: {
        escolaId: vizinha.escolaId,
        data: new Date('2026-09-25T00:00:00.000Z'),
        motivo: 'Festa da vizinha',
      },
    })

    const dias = await naEscolaA(() => consultaDoBalcaoRepository.diasNaoLetivos())

    expect([...dias]).toEqual(['2026-09-24'])
  })
})

describe('a ficha do leitor pela matrícula', () => {
  it('traz turma e série, que resolvem o override', async () => {
    const leitor = await naEscolaA(() =>
      consultaDoBalcaoRepository.obterPorMatricula('2024001'),
    )

    expect(leitor?.turma).toBe('6º B')
    expect(leitor?.serie).toBe('6')
  })
})
