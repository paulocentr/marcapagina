import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { dependenciasDeRenovacao } from '@/modules/circulacao/circulacao.deps'
import {
  renovar,
  EmprestimoInexistenteError,
  EmprestimoJaDevolvidoError,
  MaximoDeRenovacoesError,
  ObraComFilaError,
} from '@/modules/circulacao/renovar.service'
import { BloqueiosDoLeitorError } from '@/modules/circulacao/emprestar.service'
import type { Principal } from '@/core/auth/principal'

let escolaA = ''
let escolaB = ''
let alunoA = ''
let obraA = ''
let exemplarA = ''
let emprestimoA = ''

const HOJE = new Date('2026-09-10T12:00:00-03:00')
const VENCE_EM_24 = new Date(Date.UTC(2026, 8, 24))

const BALCAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: '',
  nome: 'Monitor',
  permissoes: ['emprestimo:renovar'],
}

const deps = dependenciasDeRenovacao()

beforeEach(async () => {
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
    data: { escolaId: escolaA, obraId: obraA, tombo: '000001', situacao: 'EMPRESTADO' },
  })
  exemplarA = exemplar.id

  const emprestimo = await prisma.emprestimo.create({
    data: {
      escolaId: escolaA,
      exemplarId: exemplarA,
      alunoId: alunoA,
      previstaPara: VENCE_EM_24,
      operadorRetiradaId: 'usr_1',
    },
  })
  emprestimoA = emprestimo.id
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

describe('renovar contra banco', () => {
  it('empurra a data e conta a renovação', async () => {
    const renovado = await naEscolaA(() =>
      renovar(BALCAO, { emprestimoId: emprestimoA, hoje: HOJE }, deps),
    )

    expect(renovado.previstaPara.toISOString().slice(0, 10)).toBe('2026-10-08')

    const gravado = await prisma.emprestimo.findUniqueOrThrow({ where: { id: emprestimoA } })
    expect(gravado.previstaPara.toISOString().slice(0, 10)).toBe('2026-10-08')
    expect(gravado.renovacoes).toBe(1)
  })

  it('usa a configuração da SÉRIE da turma do aluno', async () => {
    await prisma.configuracaoDeCirculacao.create({
      data: { escolaId: escolaA, prazoEmDias: 14, limiteSimultaneo: 3, maximoDeRenovacoes: 2 },
    })
    await prisma.configuracaoPorSerie.create({
      data: { escolaId: escolaA, serie: '2', prazoEmDias: 7 },
    })

    const renovado = await naEscolaA(() =>
      renovar(BALCAO, { emprestimoId: emprestimoA, hoje: HOJE }, deps),
    )

    // 24/09 + 7 = 01/10, quinta.
    expect(renovado.previstaPara.toISOString().slice(0, 10)).toBe('2026-10-01')
  })

  it('recusa quando há alguém na fila da obra', async () => {
    const outro = await prisma.aluno.create({
      data: {
        escolaId: escolaA,
        matricula: '2024002',
        nome: 'Bruno Lima',
        dataNascimento: new Date('2012-07-01'),
      },
    })
    await prisma.reserva.create({
      data: { escolaId: escolaA, obraId: obraA, alunoId: outro.id, posicao: 1 },
    })

    await expect(
      naEscolaA(() => renovar(BALCAO, { emprestimoId: emprestimoA, hoje: HOJE }, deps)),
    ).rejects.toBeInstanceOf(ObraComFilaError)

    const intacto = await prisma.emprestimo.findUniqueOrThrow({ where: { id: emprestimoA } })
    expect(intacto.previstaPara).toEqual(VENCE_EM_24)
    expect(intacto.renovacoes).toBe(0)
  })

  it('a fila da escola vizinha NÃO impede renovar aqui', async () => {
    const obraDaB = await prisma.obra.create({
      data: { escolaId: escolaB, titulo: 'Dom Casmurro', tituloNormalizado: 'dom casmurro' },
    })
    const alunoDaB = await prisma.aluno.create({
      data: {
        escolaId: escolaB,
        matricula: '2024001',
        nome: 'Carla',
        dataNascimento: new Date('2012-01-01'),
      },
    })
    await prisma.reserva.create({
      data: { escolaId: escolaB, obraId: obraDaB.id, alunoId: alunoDaB.id, posicao: 1 },
    })

    await expect(
      naEscolaA(() => renovar(BALCAO, { emprestimoId: emprestimoA, hoje: HOJE }, deps)),
    ).resolves.toBeDefined()
  })

  it('recusa quando o máximo de renovações foi atingido', async () => {
    await prisma.configuracaoDeCirculacao.create({
      data: { escolaId: escolaA, prazoEmDias: 14, limiteSimultaneo: 3, maximoDeRenovacoes: 1 },
    })

    await naEscolaA(() => renovar(BALCAO, { emprestimoId: emprestimoA, hoje: HOJE }, deps))

    await expect(
      naEscolaA(() => renovar(BALCAO, { emprestimoId: emprestimoA, hoje: HOJE }, deps)),
    ).rejects.toBeInstanceOf(MaximoDeRenovacoesError)

    expect(
      (await prisma.emprestimo.findUniqueOrThrow({ where: { id: emprestimoA } })).renovacoes,
    ).toBe(1)
  })

  it('recusa renovar empréstimo já devolvido', async () => {
    await prisma.emprestimo.update({
      where: { id: emprestimoA },
      data: { devolvidaEm: new Date('2026-09-09T14:00:00Z') },
    })

    await expect(
      naEscolaA(() => renovar(BALCAO, { emprestimoId: emprestimoA, hoje: HOJE }, deps)),
    ).rejects.toBeInstanceOf(EmprestimoJaDevolvidoError)
  })

  it('recusa quando o leitor está suspenso, e o banco é quem informa', async () => {
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
      naEscolaA(() => renovar(BALCAO, { emprestimoId: emprestimoA, hoje: HOJE }, deps)),
    ).rejects.toBeInstanceOf(BloqueiosDoLeitorError)
  })

  it('não renova empréstimo da escola vizinha', async () => {
    const obraDaB = await prisma.obra.create({
      data: { escolaId: escolaB, titulo: 'Outro', tituloNormalizado: 'outro' },
    })
    const exemplarDaB = await prisma.exemplar.create({
      data: { escolaId: escolaB, obraId: obraDaB.id, tombo: '000009' },
    })
    const daB = await prisma.emprestimo.create({
      data: {
        escolaId: escolaB,
        exemplarId: exemplarDaB.id,
        previstaPara: VENCE_EM_24,
        operadorRetiradaId: 'usr_9',
      },
    })

    await expect(
      naEscolaA(() => renovar(BALCAO, { emprestimoId: daB.id, hoje: HOJE }, deps)),
    ).rejects.toBeInstanceOf(EmprestimoInexistenteError)

    expect(
      (await prisma.emprestimo.findUniqueOrThrow({ where: { id: daB.id } })).previstaPara,
    ).toEqual(VENCE_EM_24)
  })
})
