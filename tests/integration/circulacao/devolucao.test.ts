import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { executarEmTransacao } from '@/core/db/tenant-extension'
import { devolucaoRepository } from '@/modules/circulacao/devolucao.repository'
import { penalidadesRepository } from '@/modules/circulacao/penalidades.repository'
import { reservasRepository } from '@/modules/circulacao/reservas.repository'
import { devolver, SemEmprestimoAtivoError } from '@/modules/circulacao/devolver.service'
import type { Principal } from '@/core/auth/principal'

let escolaA = ''
let escolaB = ''
let alunoA = ''
let alunoB = ''
let obraA = ''
let exemplarA = ''
let emprestimoA = ''

// Quinta-feira, o dia do vencimento do empréstimo montado abaixo.
const HOJE = new Date('2026-09-24T12:00:00-03:00')

const registrarAuditoria = vi.fn().mockResolvedValue(undefined)

const deps = {
  devolucao: devolucaoRepository,
  reservas: reservasRepository,
  penalidades: penalidadesRepository,
  emTransacao: executarEmTransacao,
  registrarAuditoria,
}

const BALCAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: '',
  nome: 'Monitor do balcão',
  permissoes: ['emprestimo:devolver'],
}

const ENTREGA = { tombo: '000001', hoje: HOJE, estado: 'BOM' as const }

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

  const ana = await prisma.aluno.create({
    data: {
      escolaId: escolaA,
      matricula: '2024001',
      nome: 'Ana Souza',
      dataNascimento: new Date('2012-03-15'),
      turmaId: turma.id,
    },
  })
  alunoA = ana.id

  const bruno = await prisma.aluno.create({
    data: {
      escolaId: escolaA,
      matricula: '2024002',
      nome: 'Bruno Lima',
      dataNascimento: new Date('2012-05-20'),
      turmaId: turma.id,
    },
  })
  alunoB = bruno.id

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
      previstaPara: new Date('2026-09-24'),
      operadorRetiradaId: 'usr_1',
    },
  })
  emprestimoA = emprestimo.id
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

async function porNaFila(alunoId: string, posicao: number): Promise<string> {
  const reserva = await prisma.reserva.create({
    data: { escolaId: escolaA, obraId: obraA, alunoId, posicao },
  })
  return reserva.id
}

describe('devolução contra banco', () => {
  it('grava a devolução e devolve o exemplar para a estante', async () => {
    const resultado = await naEscolaA(() =>
      devolver(BALCAO, { ...ENTREGA, estado: 'DESGASTADO', observacao: 'capa gasta' }, deps),
    )

    const gravado = await prisma.emprestimo.findUniqueOrThrow({ where: { id: emprestimoA } })
    expect(gravado.devolvidaEm).not.toBeNull()
    expect(gravado.operadorDevolucaoId).toBe('usr_1')
    expect(gravado.estadoNaDevolucao).toBe('DESGASTADO')
    expect(gravado.observacao).toBe('capa gasta')

    const exemplar = await prisma.exemplar.findUniqueOrThrow({ where: { id: exemplarA } })
    expect(exemplar.situacao).toBe('DISPONIVEL')
    // O estado observado no balcão chega ao acervo; guardado só no
    // empréstimo, o inventário continuaria vendo um livro BOM.
    expect(exemplar.estado).toBe('DESGASTADO')

    expect(resultado.diasDeAtraso).toBe(0)
    expect(resultado.nomeDoLeitor).toBe('Ana Souza')
    expect(resultado.tituloDaObra).toBe('Dom Casmurro')
  })

  it('devolver duas vezes o mesmo empréstimo é recusado', async () => {
    await naEscolaA(() => devolver(BALCAO, ENTREGA, deps))

    await expect(naEscolaA(() => devolver(BALCAO, ENTREGA, deps))).rejects.toBeInstanceOf(
      SemEmprestimoAtivoError,
    )

    expect(await prisma.penalidade.count()).toBe(0)
  })

  it('duas devoluções simultâneas do mesmo tombo: só uma passa', async () => {
    // Duplo clique no balcão, ou duas operadoras no mesmo livro. As duas
    // leem o empréstimo ainda em aberto; é a escrita condicionada a
    // `devolvidaEm IS NULL` que decide, e sem ela o mesmo atraso geraria
    // DUAS suspensões para o mesmo aluno.
    await prisma.emprestimo.update({
      where: { id: emprestimoA },
      data: { previstaPara: new Date('2026-09-21') },
    })

    const resultados = await Promise.allSettled([
      naEscolaA(() => devolver(BALCAO, ENTREGA, deps)),
      naEscolaA(() => devolver(BALCAO, ENTREGA, deps)),
    ])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.penalidade.count()).toBe(1)
  })

  it('não devolve tombo de outra escola', async () => {
    const obraB = await prisma.obra.create({
      data: { escolaId: escolaB, titulo: 'Outro', tituloNormalizado: 'outro' },
    })
    const exemplarB = await prisma.exemplar.create({
      data: { escolaId: escolaB, obraId: obraB.id, tombo: '000009', situacao: 'EMPRESTADO' },
    })
    await prisma.emprestimo.create({
      data: {
        escolaId: escolaB,
        exemplarId: exemplarB.id,
        previstaPara: new Date('2026-09-24'),
        operadorRetiradaId: 'usr_9',
      },
    })

    await expect(
      naEscolaA(() => devolver(BALCAO, { ...ENTREGA, tombo: '000009' }, deps)),
    ).rejects.toBeInstanceOf(SemEmprestimoAtivoError)

    const intacto = await prisma.exemplar.findUniqueOrThrow({ where: { id: exemplarB.id } })
    expect(intacto.situacao).toBe('EMPRESTADO')
  })
})

describe('devolução com atraso', () => {
  beforeEach(async () => {
    // Vencia segunda 21/09 e chega quinta 24/09: três dias de atraso.
    await prisma.emprestimo.update({
      where: { id: emprestimoA },
      data: { previstaPara: new Date('2026-09-21') },
    })
  })

  it('grava a suspensão ligada ao empréstimo que a causou', async () => {
    await prisma.configuracaoDeCirculacao.create({
      data: {
        escolaId: escolaA,
        prazoEmDias: 14,
        limiteSimultaneo: 3,
        maximoDeRenovacoes: 2,
        diasDeSuspensaoPorDiaDeAtraso: 2,
      },
    })

    const resultado = await naEscolaA(() => devolver(BALCAO, ENTREGA, deps))

    const penalidade = await prisma.penalidade.findFirstOrThrow()
    expect(penalidade.alunoId).toBe(alunoA)
    expect(penalidade.tipo).toBe('SUSPENSAO')
    expect(penalidade.emprestimoOrigemId).toBe(emprestimoA)
    expect(penalidade.inicio.toISOString().slice(0, 10)).toBe('2026-09-24')
    // 3 dias de atraso × 2 = 6 dias, terminando no sexto — 29/09.
    expect(penalidade.fim.toISOString().slice(0, 10)).toBe('2026-09-29')
    expect(penalidade.motivo).toContain('3 dia(s) de atraso')
    expect(resultado.suspensaoAplicada?.dias).toBe(6)
    expect(registrarAuditoria).toHaveBeenCalledOnce()
  })

  it('usa o fator da SÉRIE da turma do aluno', async () => {
    await prisma.configuracaoDeCirculacao.create({
      data: {
        escolaId: escolaA,
        prazoEmDias: 14,
        limiteSimultaneo: 3,
        maximoDeRenovacoes: 2,
        diasDeSuspensaoPorDiaDeAtraso: 1,
      },
    })
    await prisma.configuracaoPorSerie.create({
      data: { escolaId: escolaA, serie: '2', diasDeSuspensaoPorDiaDeAtraso: 3 },
    })

    const resultado = await naEscolaA(() => devolver(BALCAO, ENTREGA, deps))

    expect(resultado.suspensaoAplicada?.dias).toBe(9)
  })

  it('devolver DANIFICADO não cria penalidade por dano', async () => {
    // Dano vira observação e decisão humana. Aqui não há atraso, então
    // não há suspensão nenhuma — só o registro do estado.
    await prisma.emprestimo.update({
      where: { id: emprestimoA },
      data: { previstaPara: new Date('2026-09-24') },
    })

    await naEscolaA(() =>
      devolver(
        BALCAO,
        { ...ENTREGA, estado: 'DANIFICADO', observacao: 'páginas rasgadas' },
        deps,
      ),
    )

    expect(await prisma.penalidade.count()).toBe(0)
    const gravado = await prisma.emprestimo.findUniqueOrThrow({ where: { id: emprestimoA } })
    expect(gravado.estadoNaDevolucao).toBe('DANIFICADO')
    expect(gravado.observacao).toBe('páginas rasgadas')
  })
})

describe('devolução com fila de reserva', () => {
  let reservaDoBruno = ''

  beforeEach(async () => {
    reservaDoBruno = await porNaFila(alunoB, 1)
  })

  it('separa o exemplar para o próximo da fila e NÃO o devolve à estante', async () => {
    const resultado = await naEscolaA(() => devolver(BALCAO, ENTREGA, deps))

    const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id: reservaDoBruno } })
    expect(reserva.status).toBe('DISPONIVEL')
    expect(reserva.exemplarSeparadoId).toBe(exemplarA)
    // Prazo padrão de 2 dias a partir de quinta 24/09 cairia no sábado;
    // vale a segunda 28/09.
    expect(reserva.retirarAte?.toISOString().slice(0, 10)).toBe('2026-09-28')

    const exemplar = await prisma.exemplar.findUniqueOrThrow({ where: { id: exemplarA } })
    expect(exemplar.situacao).toBe('RESERVADO')
    expect(resultado.reservaSeparada?.alunoId).toBe(alunoB)
  })

  it('a vez é de quem chegou primeiro', async () => {
    // Bruno é o 1; Ana entra depois na 2 e não pode passar na frente.
    await porNaFila(alunoA, 2)

    const resultado = await naEscolaA(() => devolver(BALCAO, ENTREGA, deps))

    expect(resultado.reservaSeparada?.reservaId).toBe(reservaDoBruno)
  })

  it('reserva já cancelada não segura o exemplar', async () => {
    await prisma.reserva.update({
      where: { id: reservaDoBruno },
      data: { status: 'CANCELADA' },
    })

    const resultado = await naEscolaA(() => devolver(BALCAO, ENTREGA, deps))

    expect(resultado.reservaSeparada).toBeNull()
    const exemplar = await prisma.exemplar.findUniqueOrThrow({ where: { id: exemplarA } })
    expect(exemplar.situacao).toBe('DISPONIVEL')
  })
})

describe('a devolução inteira é uma transação só', () => {
  it('penalidade que falha não deixa devolução, exemplar nem fila mexidos', async () => {
    // Penalidade gravada sem devolução registrada — ou o contrário —
    // deixaria um aluno suspenso por um livro que consta em aberto.
    await prisma.emprestimo.update({
      where: { id: emprestimoA },
      data: { previstaPara: new Date('2026-09-21') },
    })
    const reservaDoBruno = await porNaFila(alunoB, 1)

    const penalidadesQueFalham = {
      registrarSuspensao: () => Promise.reject(new Error('banco fora do ar')),
    }

    await expect(
      naEscolaA(() =>
        devolver(BALCAO, ENTREGA, { ...deps, penalidades: penalidadesQueFalham }),
      ),
    ).rejects.toThrow('banco fora do ar')

    const emprestimo = await prisma.emprestimo.findUniqueOrThrow({ where: { id: emprestimoA } })
    expect(emprestimo.devolvidaEm).toBeNull()

    const exemplar = await prisma.exemplar.findUniqueOrThrow({ where: { id: exemplarA } })
    expect(exemplar.situacao).toBe('EMPRESTADO')

    const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id: reservaDoBruno } })
    expect(reserva.status).toBe('AGUARDANDO')
    expect(reserva.exemplarSeparadoId).toBeNull()

    expect(await prisma.penalidade.count()).toBe(0)
  })
})
