import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'

let escolaA = ''
let escolaB = ''
let obraA = ''
let exemplarA = ''
let alunoA = ''

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id

  const obra = await prisma.obra.create({
    data: { escolaId: escolaA, titulo: 'Dom Casmurro', tituloNormalizado: 'dom casmurro' },
  })
  obraA = obra.id

  const exemplar = await prisma.exemplar.create({
    data: { escolaId: escolaA, obraId: obraA, tombo: '000001' },
  })
  exemplarA = exemplar.id

  const aluno = await prisma.aluno.create({
    data: {
      escolaId: escolaA,
      matricula: '2024001',
      nome: 'Ana Souza',
      dataNascimento: new Date('2012-03-15'),
    },
  })
  alunoA = aluno.id
})

function emprestimo(dados: Partial<{ exemplarId: string; devolvidaEm: Date | null }> = {}) {
  return prisma.emprestimo.create({
    data: {
      escolaId: escolaA,
      exemplarId: dados.exemplarId ?? exemplarA,
      alunoId: alunoA,
      previstaPara: new Date('2026-09-20'),
      devolvidaEm: dados.devolvidaEm ?? null,
      operadorRetiradaId: 'usr_1',
    },
  })
}

describe('schema da circulação', () => {
  it('o mesmo exemplar não pode ter dois empréstimos ATIVOS', async () => {
    // Sem isso, um duplo clique no balcão empresta o mesmo livro duas
    // vezes e o acervo passa a ter uma cópia fantasma emprestada para
    // sempre. Dois cliques simultâneos passam pelos dois `if` da
    // aplicação antes de qualquer um gravar: o banco é o único que sabe
    // dizer não de verdade.
    await emprestimo()

    await expect(emprestimo()).rejects.toThrow()
  })

  it('depois de devolvido, o exemplar pode ser emprestado de novo', async () => {
    // A trava é sobre empréstimo ATIVO. Se pegasse os devolvidos, o livro
    // só poderia circular uma vez na vida.
    await emprestimo({ devolvidaEm: new Date('2026-09-18') })

    const segundo = await emprestimo()
    expect(segundo.devolvidaEm).toBeNull()
  })

  it('dois devolvidos do mesmo exemplar convivem', async () => {
    await emprestimo({ devolvidaEm: new Date('2026-09-18') })
    await emprestimo({ devolvidaEm: new Date('2026-10-18') })

    expect(await prisma.emprestimo.count()).toBe(2)
  })

  it('excluir exemplar com empréstimo é recusado pelo banco', async () => {
    await emprestimo()

    await expect(prisma.exemplar.delete({ where: { id: exemplarA } })).rejects.toThrow()
  })

  it('o mesmo aluno não entra duas vezes na fila da mesma obra', async () => {
    await prisma.reserva.create({
      data: { escolaId: escolaA, obraId: obraA, alunoId: alunoA, posicao: 1 },
    })

    await expect(
      prisma.reserva.create({
        data: { escolaId: escolaA, obraId: obraA, alunoId: alunoA, posicao: 2 },
      }),
    ).rejects.toThrow()
  })

  it('reserva já atendida não impede entrar na fila de novo', async () => {
    // O aluno pode querer o mesmo livro outra vez meses depois.
    await prisma.reserva.create({
      data: {
        escolaId: escolaA,
        obraId: obraA,
        alunoId: alunoA,
        posicao: 1,
        status: 'ATENDIDA',
      },
    })

    const nova = await prisma.reserva.create({
      data: { escolaId: escolaA, obraId: obraA, alunoId: alunoA, posicao: 1 },
    })

    expect(nova.status).toBe('AGUARDANDO')
  })

  it('dia não letivo é único por escola e data', async () => {
    await prisma.diaNaoLetivo.create({
      data: { escolaId: escolaA, data: new Date('2026-09-07'), motivo: 'Independência' },
    })

    await expect(
      prisma.diaNaoLetivo.create({
        data: { escolaId: escolaA, data: new Date('2026-09-07'), motivo: 'Duplicado' },
      }),
    ).rejects.toThrow()
  })

  it('a mesma data é não letiva numa escola e letiva na outra', async () => {
    // Feriado municipal não é o mesmo em toda cidade.
    await prisma.diaNaoLetivo.create({
      data: { escolaId: escolaA, data: new Date('2026-09-07'), motivo: 'Independência' },
    })

    const naVizinha = await prisma.diaNaoLetivo.create({
      data: { escolaId: escolaB, data: new Date('2026-09-07'), motivo: 'Independência' },
    })

    expect(naVizinha.escolaId).toBe(escolaB)
  })

  it('a configuração de circulação é uma por escola', async () => {
    await prisma.configuracaoDeCirculacao.create({
      data: { escolaId: escolaA, prazoEmDias: 14, limiteSimultaneo: 3, maximoDeRenovacoes: 2 },
    })

    await expect(
      prisma.configuracaoDeCirculacao.create({
        data: { escolaId: escolaA, prazoEmDias: 7, limiteSimultaneo: 1, maximoDeRenovacoes: 0 },
      }),
    ).rejects.toThrow()
  })

  it('o override é único por escola e série', async () => {
    await prisma.configuracaoPorSerie.create({
      data: { escolaId: escolaA, serie: '2', prazoEmDias: 7 },
    })

    await expect(
      prisma.configuracaoPorSerie.create({
        data: { escolaId: escolaA, serie: '2', prazoEmDias: 10 },
      }),
    ).rejects.toThrow()
  })

  it('penalidade guarda o empréstimo que a originou', async () => {
    // Sem a origem, a suspensão vira um castigo sem história e ninguém
    // consegue explicar ao responsável de onde ela veio.
    const emp = await emprestimo({ devolvidaEm: new Date('2026-09-25') })

    const penalidade = await prisma.penalidade.create({
      data: {
        escolaId: escolaA,
        alunoId: alunoA,
        inicio: new Date('2026-09-25'),
        fim: new Date('2026-10-05'),
        motivo: 'Devolução com 5 dias de atraso',
        emprestimoOrigemId: emp.id,
      },
    })

    expect(penalidade.emprestimoOrigemId).toBe(emp.id)
  })
})
