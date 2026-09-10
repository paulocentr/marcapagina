import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { emprestimosRepository } from '@/modules/circulacao/emprestimos.repository'

let escolaA = ''
let escolaB = ''
let alunoA = ''
let alunoB = ''

const HOJE = new Date('2026-09-10T00:00:00.000Z')

async function montarEscola(slug: string) {
  const escola = await prisma.escola.create({ data: { slug, nome: slug } })
  const obra = await prisma.obra.create({
    data: { escolaId: escola.id, titulo: 'Obra', tituloNormalizado: 'obra' },
  })
  const aluno = await prisma.aluno.create({
    data: {
      escolaId: escola.id,
      matricula: '2024001',
      nome: `Aluno de ${slug}`,
      dataNascimento: new Date('2012-03-15'),
    },
  })
  return { escolaId: escola.id, obraId: obra.id, alunoId: aluno.id }
}

let obraA = ''
let contadorDeTombos = 0

async function emprestimo(dados: {
  escolaId: string
  obraId: string
  alunoId: string
  previstaPara: string
  devolvidaEm?: string
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
      operadorRetiradaId: 'usr_1',
    },
  })
}

beforeEach(async () => {
  contadorDeTombos = 0
  const a = await montarEscola('escola-a')
  const b = await montarEscola('escola-b')
  escolaA = a.escolaId
  obraA = a.obraId
  alunoA = a.alunoId
  escolaB = b.escolaId
  alunoB = b.alunoId
  void alunoB
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

describe('atraso é calculado, nunca armazenado', () => {
  it('atrasado é quem passou da data prevista e não devolveu', async () => {
    await emprestimo({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-05' })

    const atrasados = await naEscolaA(() => emprestimosRepository.listarAtrasados(HOJE))

    expect(atrasados).toHaveLength(1)
  })

  it('devolvido COM atraso não aparece como atrasado hoje', async () => {
    // Ele foi devolvido; a penalidade já é outro assunto. Contá-lo aqui
    // faria a lista do dia nunca esvaziar.
    await emprestimo({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      previstaPara: '2026-09-05',
      devolvidaEm: '2026-09-08',
    })

    expect(await naEscolaA(() => emprestimosRepository.listarAtrasados(HOJE))).toEqual([])
  })

  it('vence HOJE ainda não está atrasado', async () => {
    // Marcar como atrasado no próprio dia do vencimento é o erro de
    // fronteira que faz a operadora perder a confiança no relatório — e
    // suspende quem cumpriu o prazo.
    await emprestimo({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-10' })

    expect(await naEscolaA(() => emprestimosRepository.listarAtrasados(HOJE))).toEqual([])
  })

  it('venceu ontem já está atrasado', async () => {
    await emprestimo({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-09' })

    expect(await naEscolaA(() => emprestimosRepository.listarAtrasados(HOJE))).toHaveLength(1)
  })

  it('vence amanhã não está atrasado', async () => {
    await emprestimo({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-11' })

    expect(await naEscolaA(() => emprestimosRepository.listarAtrasados(HOJE))).toEqual([])
  })

  it('a lista de atrasados não enxerga a escola vizinha', async () => {
    const daVizinha = await montarEscola('escola-c')
    await emprestimo({
      escolaId: daVizinha.escolaId,
      obraId: daVizinha.obraId,
      alunoId: daVizinha.alunoId,
      previstaPara: '2026-09-01',
    })

    expect(await naEscolaA(() => emprestimosRepository.listarAtrasados(HOJE))).toEqual([])
    void escolaB
  })

  it('a lista traz o que a operadora precisa para cobrar', async () => {
    // Tombo, título e nome do leitor: sem eles a lista é um punhado de
    // ids que ninguém consegue usar para ir atrás do livro.
    await emprestimo({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-01' })

    const [atrasado] = await naEscolaA(() => emprestimosRepository.listarAtrasados(HOJE))

    expect(atrasado?.tombo).toBe('000001')
    expect(atrasado?.tituloDaObra).toBe('Obra')
    expect(atrasado?.nomeDoLeitor).toBe('Aluno de escola-a')
    expect(atrasado?.diasDeAtraso).toBe(9)
  })

  it('conta os atrasos de UM leitor', async () => {
    await emprestimo({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-01' })
    await emprestimo({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-02' })
    await emprestimo({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-30' })

    expect(await naEscolaA(() => emprestimosRepository.contarAtrasadosDoAluno(alunoA, HOJE))).toBe(2)
  })

  it('conta os empréstimos ativos de UM leitor', async () => {
    await emprestimo({ escolaId: escolaA, obraId: obraA, alunoId: alunoA, previstaPara: '2026-09-30' })
    await emprestimo({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      previstaPara: '2026-09-30',
      devolvidaEm: '2026-09-05',
    })

    expect(await naEscolaA(() => emprestimosRepository.contarAtivosDoAluno(alunoA))).toBe(1)
  })

  it('nenhuma dessas contagens enxerga o leitor da escola vizinha', async () => {
    const daVizinha = await montarEscola('escola-d')
    await emprestimo({
      escolaId: daVizinha.escolaId,
      obraId: daVizinha.obraId,
      alunoId: daVizinha.alunoId,
      previstaPara: '2026-09-01',
    })

    expect(
      await naEscolaA(() => emprestimosRepository.contarAtrasadosDoAluno(daVizinha.alunoId, HOJE)),
    ).toBe(0)
  })
})
