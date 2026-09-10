import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { executarEmTransacao } from '@/core/db/tenant-extension'
import { balcaoRepository } from '@/modules/circulacao/balcao.repository'
import {
  emprestar,
  BloqueiosDoLeitorError,
  ExemplarIndisponivelError,
} from '@/modules/circulacao/emprestar.service'
import type { Principal } from '@/core/auth/principal'

let escolaA = ''
let escolaB = ''
let alunoA = ''
let obraA = ''
let exemplarA = ''

const HOJE = new Date('2026-09-10T12:00:00-03:00')

const registrarAuditoria = vi.fn().mockResolvedValue(undefined)

const deps = {
  balcao: balcaoRepository,
  emTransacao: executarEmTransacao,
  registrarAuditoria,
}

const COORDENACAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: '',
  nome: 'Coordenação',
  permissoes: ['emprestimo:criar', 'emprestimo:forcar'],
}

beforeEach(async () => {
  registrarAuditoria.mockClear()

  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id

  const anoLetivo = await prisma.anoLetivo.create({
    data: {
      escolaId: escolaA,
      ano: 2026,
      dataInicio: new Date('2026-02-01'),
      dataFim: new Date('2026-12-15'),
      ativo: true,
    },
  })
  const turma = await prisma.turma.create({
    data: {
      escolaId: escolaA,
      anoLetivoId: anoLetivo.id,
      nome: '2º A',
      serie: '2',
      turno: 'MANHA',
    },
  })

  const aluno = await prisma.aluno.create({
    data: {
      escolaId: escolaA,
      matricula: '2024001',
      nome: 'Ana Souza',
      dataNascimento: new Date('2012-03-15'),
      turmaId: turma.id,
    },
  })
  alunoA = aluno.id

  const obra = await prisma.obra.create({
    data: { escolaId: escolaA, titulo: 'Dom Casmurro', tituloNormalizado: 'dom casmurro' },
  })
  obraA = obra.id

  const exemplar = await prisma.exemplar.create({
    data: { escolaId: escolaA, obraId: obraA, tombo: '000001' },
  })
  exemplarA = exemplar.id
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

const pedido = { alunoId: '', tombo: '000001', hoje: HOJE }

describe('empréstimo contra banco', () => {
  it('empresta, grava e marca o exemplar', async () => {
    const emprestimo = await naEscolaA(() =>
      emprestar(COORDENACAO, { ...pedido, alunoId: alunoA }, deps),
    )

    expect(await prisma.emprestimo.count()).toBe(1)
    const exemplar = await prisma.exemplar.findUniqueOrThrow({ where: { id: exemplarA } })
    expect(exemplar.situacao).toBe('EMPRESTADO')
    // Sem configuração cadastrada, vale o padrão de 14 dias.
    expect(emprestimo.previstaPara.toISOString().slice(0, 10)).toBe('2026-09-24')
  })

  it('usa a configuração da SÉRIE da turma do aluno', async () => {
    await prisma.configuracaoDeCirculacao.create({
      data: { escolaId: escolaA, prazoEmDias: 14, limiteSimultaneo: 3, maximoDeRenovacoes: 2 },
    })
    await prisma.configuracaoPorSerie.create({
      data: { escolaId: escolaA, serie: '2', prazoEmDias: 7 },
    })

    const emprestimo = await naEscolaA(() =>
      emprestar(COORDENACAO, { ...pedido, alunoId: alunoA }, deps),
    )

    expect(emprestimo.previstaPara.toISOString().slice(0, 10)).toBe('2026-09-17')
  })

  it('pula o dia não letivo cadastrado', async () => {
    await prisma.diaNaoLetivo.create({
      data: { escolaId: escolaA, data: new Date('2026-09-24'), motivo: 'Recesso' },
    })

    const emprestimo = await naEscolaA(() =>
      emprestar(COORDENACAO, { ...pedido, alunoId: alunoA }, deps),
    )

    expect(emprestimo.previstaPara.toISOString().slice(0, 10)).toBe('2026-09-25')
  })

  it('o feriado da escola vizinha NÃO afeta esta escola', async () => {
    await prisma.diaNaoLetivo.create({
      data: { escolaId: escolaB, data: new Date('2026-09-24'), motivo: 'Feriado municipal' },
    })

    const emprestimo = await naEscolaA(() =>
      emprestar(COORDENACAO, { ...pedido, alunoId: alunoA }, deps),
    )

    expect(emprestimo.previstaPara.toISOString().slice(0, 10)).toBe('2026-09-24')
  })

  it('a suspensão vigente bloqueia, e o banco é quem a informa', async () => {
    await prisma.penalidade.create({
      data: {
        escolaId: escolaA,
        alunoId: alunoA,
        inicio: new Date('2026-09-01'),
        fim: new Date('2099-01-01'),
        motivo: 'Atraso',
      },
    })

    await expect(
      naEscolaA(() => emprestar(COORDENACAO, { ...pedido, alunoId: alunoA }, deps)),
    ).rejects.toBeInstanceOf(BloqueiosDoLeitorError)

    expect(await prisma.emprestimo.count()).toBe(0)
  })

  it('a suspensão VENCIDA não bloqueia', async () => {
    await prisma.penalidade.create({
      data: {
        escolaId: escolaA,
        alunoId: alunoA,
        inicio: new Date('2020-01-01'),
        fim: new Date('2020-01-10'),
        motivo: 'Atraso antigo',
      },
    })

    await expect(
      naEscolaA(() => emprestar(COORDENACAO, { ...pedido, alunoId: alunoA }, deps)),
    ).resolves.toBeDefined()
  })

  it('o índice do banco impede o mesmo exemplar sair duas vezes', async () => {
    // Cinturão e suspensório: a regra recusa e, se ela falhasse, o índice
    // único parcial ainda recusaria.
    await naEscolaA(() => emprestar(COORDENACAO, { ...pedido, alunoId: alunoA }, deps))

    await expect(
      naEscolaA(() => emprestar(COORDENACAO, { ...pedido, alunoId: alunoA }, deps)),
    ).rejects.toBeInstanceOf(ExemplarIndisponivelError)

    expect(await prisma.emprestimo.count()).toBe(1)
  })

  it('nada fica pela metade quando a regra recusa', async () => {
    await prisma.exemplar.update({
      where: { id: exemplarA },
      data: { situacao: 'EM_MANUTENCAO' },
    })

    await expect(
      naEscolaA(() => emprestar(COORDENACAO, { ...pedido, alunoId: alunoA }, deps)),
    ).rejects.toBeInstanceOf(ExemplarIndisponivelError)

    expect(await prisma.emprestimo.count()).toBe(0)
  })

  it('não empresta exemplar da escola vizinha', async () => {
    const obraB = await prisma.obra.create({
      data: { escolaId: escolaB, titulo: 'Outro', tituloNormalizado: 'outro' },
    })
    await prisma.exemplar.create({
      data: { escolaId: escolaB, obraId: obraB.id, tombo: '000009' },
    })

    await expect(
      naEscolaA(() => emprestar(COORDENACAO, { ...pedido, alunoId: alunoA, tombo: '000009' }, deps)),
    ).rejects.toBeInstanceOf(ExemplarIndisponivelError)
  })

  it('a liberação forçada grava a justificativa NO empréstimo', async () => {
    await prisma.penalidade.create({
      data: {
        escolaId: escolaA,
        alunoId: alunoA,
        inicio: new Date('2026-09-01'),
        fim: new Date('2099-01-01'),
        motivo: 'Atraso',
      },
    })

    await naEscolaA(() =>
      emprestar(
        COORDENACAO,
        {
          ...pedido,
          alunoId: alunoA,
          liberacaoForcada: true,
          justificativa: 'trabalho de escola, autorizado pela direção',
        },
        deps,
      ),
    )

    const gravado = await prisma.emprestimo.findFirstOrThrow()
    expect(gravado.liberacaoForcada).toBe(true)
    expect(gravado.justificativaDaLiberacao).toContain('autorizado pela direção')
    expect(registrarAuditoria).toHaveBeenCalledOnce()
  })
})
