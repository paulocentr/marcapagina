import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { dependenciasDeReserva } from '@/modules/circulacao/circulacao.deps'
import {
  reservar,
  cancelarReserva,
  expirarReservasVencidas,
  filaDaObra,
  LeitorJaEstaComAObraError,
} from '@/modules/circulacao/reservas.service'
import { JaEstaNaFilaError } from '@/modules/circulacao/reservas.tipos'
import { ObraInexistenteError } from '@/modules/acervo/obras.service'
import type { Principal } from '@/core/auth/principal'

let escolaA = ''
let escolaB = ''
let alunoA1 = ''
let alunoA2 = ''
let obraA = ''
let obraA2 = ''
let exemplarA1 = ''
let exemplarA2 = ''

const HOJE = new Date('2026-09-10T12:00:00-03:00')
const ONTEM = new Date(Date.UTC(2026, 8, 9))

const COORDENACAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: '',
  nome: 'Coordenação',
  permissoes: ['reserva:criar', 'reserva:gerenciar'],
}

const deps = dependenciasDeReserva()

async function criarEscola(slug: string) {
  const escola = await prisma.escola.create({ data: { slug, nome: slug } })
  const obra = await prisma.obra.create({
    data: { escolaId: escola.id, titulo: 'Dom Casmurro', tituloNormalizado: 'dom casmurro' },
  })
  const aluno = await prisma.aluno.create({
    data: {
      escolaId: escola.id,
      matricula: '2024001',
      nome: 'Ana Souza',
      dataNascimento: new Date('2012-03-15'),
    },
  })
  return { escola, obra, aluno }
}

beforeEach(async () => {
  const a = await criarEscola('escola-a')
  const b = await criarEscola('escola-b')
  escolaA = a.escola.id
  escolaB = b.escola.id
  obraA = a.obra.id
  alunoA1 = a.aluno.id

  const outra = await prisma.obra.create({
    data: { escolaId: escolaA, titulo: 'Memórias Póstumas', tituloNormalizado: 'memorias postumas' },
  })
  obraA2 = outra.id

  const segundo = await prisma.aluno.create({
    data: {
      escolaId: escolaA,
      matricula: '2024002',
      nome: 'Bruno Lima',
      dataNascimento: new Date('2012-07-01'),
    },
  })
  alunoA2 = segundo.id

  const e1 = await prisma.exemplar.create({
    data: { escolaId: escolaA, obraId: obraA, tombo: '000001' },
  })
  const e2 = await prisma.exemplar.create({
    data: { escolaId: escolaA, obraId: obraA, tombo: '000002' },
  })
  exemplarA1 = e1.id
  exemplarA2 = e2.id
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

function naEscolaB<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaB, fn)
}

describe('reservar contra banco', () => {
  it('a fila entra em ordem de chegada', async () => {
    await naEscolaA(() => reservar(COORDENACAO, { alunoId: alunoA1, obraId: obraA }, deps))
    await naEscolaA(() => reservar(COORDENACAO, { alunoId: alunoA2, obraId: obraA }, deps))

    const fila = await naEscolaA(() => filaDaObra(COORDENACAO, obraA, deps))

    expect(fila.map((r) => r.posicao)).toEqual([1, 2])
    expect(fila.map((r) => r.alunoId)).toEqual([alunoA1, alunoA2])
  })

  it('o mesmo aluno não entra duas vezes na fila viva', async () => {
    await naEscolaA(() => reservar(COORDENACAO, { alunoId: alunoA1, obraId: obraA }, deps))

    await expect(
      naEscolaA(() => reservar(COORDENACAO, { alunoId: alunoA1, obraId: obraA }, deps)),
    ).rejects.toBeInstanceOf(JaEstaNaFilaError)

    expect(await prisma.reserva.count()).toBe(1)
  })

  it('recusa quem está com a obra em mãos, ainda que por outro exemplar', async () => {
    // A reserva é da OBRA: ele já está com uma cópia, e reservar poria o
    // leitor na frente dele mesmo.
    await prisma.emprestimo.create({
      data: {
        escolaId: escolaA,
        exemplarId: exemplarA2,
        alunoId: alunoA1,
        previstaPara: new Date(Date.UTC(2026, 8, 20)),
        operadorRetiradaId: 'usr_1',
      },
    })

    await expect(
      naEscolaA(() => reservar(COORDENACAO, { alunoId: alunoA1, obraId: obraA }, deps)),
    ).rejects.toBeInstanceOf(LeitorJaEstaComAObraError)
  })

  it('estar com OUTRA obra em mãos não impede reservar esta', async () => {
    const deOutraObra = await prisma.exemplar.create({
      data: { escolaId: escolaA, obraId: obraA2, tombo: '000003' },
    })
    await prisma.emprestimo.create({
      data: {
        escolaId: escolaA,
        exemplarId: deOutraObra.id,
        alunoId: alunoA1,
        previstaPara: new Date(Date.UTC(2026, 8, 20)),
        operadorRetiradaId: 'usr_1',
      },
    })

    await expect(
      naEscolaA(() => reservar(COORDENACAO, { alunoId: alunoA1, obraId: obraA }, deps)),
    ).resolves.toBeDefined()
  })

  it('empréstimo JÁ DEVOLVIDO não impede reservar de novo', async () => {
    await prisma.emprestimo.create({
      data: {
        escolaId: escolaA,
        exemplarId: exemplarA1,
        alunoId: alunoA1,
        previstaPara: new Date(Date.UTC(2026, 7, 20)),
        devolvidaEm: new Date('2026-08-19T12:00:00Z'),
        operadorRetiradaId: 'usr_1',
      },
    })

    await expect(
      naEscolaA(() => reservar(COORDENACAO, { alunoId: alunoA1, obraId: obraA }, deps)),
    ).resolves.toBeDefined()
  })

  it('a fila da escola vizinha não aparece nem atrapalha', async () => {
    await naEscolaA(() => reservar(COORDENACAO, { alunoId: alunoA1, obraId: obraA }, deps))

    const obraDaB = await prisma.obra.findFirstOrThrow({ where: { escolaId: escolaB } })
    const filaDaB = await naEscolaB(() => filaDaObra(COORDENACAO, obraDaB.id, deps))

    expect(filaDaB).toEqual([])
  })

  it('não reserva obra da escola vizinha', async () => {
    // A FK aponta só para Obra(id), sem o tenant: sem a checagem
    // explícita, esta reserva era GRAVADA na escola A apontando para a
    // obra da B. Ela não apareceria em fila nenhuma — nem aqui, porque a
    // obra não é daqui, nem lá, porque a reserva não é de lá — e o aluno
    // esperaria para sempre.
    const obraDaB = await prisma.obra.findFirstOrThrow({ where: { escolaId: escolaB } })

    await expect(
      naEscolaA(() => reservar(COORDENACAO, { alunoId: alunoA1, obraId: obraDaB.id }, deps)),
    ).rejects.toBeInstanceOf(ObraInexistenteError)

    expect(await prisma.reserva.count()).toBe(0)
  })
})

describe('expirarReservasVencidas contra banco', () => {
  async function separadaVencida(alunoId: string, exemplarId: string, posicao: number) {
    await prisma.exemplar.update({ where: { id: exemplarId }, data: { situacao: 'RESERVADO' } })
    return prisma.reserva.create({
      data: {
        escolaId: escolaA,
        obraId: obraA,
        alunoId,
        posicao,
        status: 'DISPONIVEL',
        exemplarSeparadoId: exemplarId,
        retirarAte: ONTEM,
      },
    })
  }

  it('passa a vez ao próximo e o exemplar segue separado', async () => {
    const vencida = await separadaVencida(alunoA1, exemplarA1, 1)
    const proxima = await prisma.reserva.create({
      data: { escolaId: escolaA, obraId: obraA, alunoId: alunoA2, posicao: 2 },
    })

    const resultado = await naEscolaA(() => expirarReservasVencidas('SISTEMA', HOJE, deps))

    expect(resultado).toMatchObject({ expiradas: 1, passadasAdiante: 1, falhas: [] })

    const depois = await prisma.reserva.findUniqueOrThrow({ where: { id: proxima.id } })
    expect(depois.status).toBe('DISPONIVEL')
    expect(depois.exemplarSeparadoId).toBe(exemplarA1)
    expect(depois.retirarAte?.toISOString().slice(0, 10)).toBe('2026-09-14')

    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: vencida.id } })).status).toBe(
      'EXPIRADA',
    )
    expect(
      (await prisma.exemplar.findUniqueOrThrow({ where: { id: exemplarA1 } })).situacao,
    ).toBe('RESERVADO')
  })

  it('sem próximo na fila, o exemplar volta para DISPONIVEL', async () => {
    await separadaVencida(alunoA1, exemplarA1, 1)

    const resultado = await naEscolaA(() => expirarReservasVencidas('SISTEMA', HOJE, deps))

    expect(resultado).toMatchObject({ expiradas: 1, exemplaresLiberados: 1 })
    expect(
      (await prisma.exemplar.findUniqueOrThrow({ where: { id: exemplarA1 } })).situacao,
    ).toBe('DISPONIVEL')
  })

  it('não expira quem vence HOJE', async () => {
    const emDia = await prisma.reserva.create({
      data: {
        escolaId: escolaA,
        obraId: obraA,
        alunoId: alunoA1,
        posicao: 1,
        status: 'DISPONIVEL',
        exemplarSeparadoId: exemplarA1,
        retirarAte: new Date(Date.UTC(2026, 8, 10)),
      },
    })

    const resultado = await naEscolaA(() => expirarReservasVencidas('SISTEMA', HOJE, deps))

    expect(resultado.expiradas).toBe(0)
    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: emDia.id } })).status).toBe(
      'DISPONIVEL',
    )
  })

  it('expirar numa escola não toca a reserva vencida da vizinha', async () => {
    await separadaVencida(alunoA1, exemplarA1, 1)

    const obraDaB = await prisma.obra.findFirstOrThrow({ where: { escolaId: escolaB } })
    const alunoDaB = await prisma.aluno.findFirstOrThrow({ where: { escolaId: escolaB } })
    const daB = await prisma.reserva.create({
      data: {
        escolaId: escolaB,
        obraId: obraDaB.id,
        alunoId: alunoDaB.id,
        posicao: 1,
        status: 'DISPONIVEL',
        retirarAte: ONTEM,
      },
    })

    await naEscolaA(() => expirarReservasVencidas('SISTEMA', HOJE, deps))

    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: daB.id } })).status).toBe(
      'DISPONIVEL',
    )
  })

  it('o prazo de retirada do próximo respeita o calendário da escola', async () => {
    await prisma.diaNaoLetivo.create({
      data: { escolaId: escolaA, data: new Date(Date.UTC(2026, 8, 14)), motivo: 'Recesso' },
    })
    await separadaVencida(alunoA1, exemplarA1, 1)
    const proxima = await prisma.reserva.create({
      data: { escolaId: escolaA, obraId: obraA, alunoId: alunoA2, posicao: 2 },
    })

    await naEscolaA(() => expirarReservasVencidas('SISTEMA', HOJE, deps))

    // 10/09 é quinta: +2 cai no sábado, que o fim de semana já empurra
    // para segunda 14/09. Com a segunda marcada como recesso, o prazo
    // segue para terça — vencer com a escola fechada tiraria a vez de
    // quem não tinha como vir buscar.
    const depois = await prisma.reserva.findUniqueOrThrow({ where: { id: proxima.id } })
    expect(depois.retirarAte?.toISOString().slice(0, 10)).toBe('2026-09-15')
  })
})

describe('cancelarReserva contra banco', () => {
  it('cancelar com exemplar separado passa a vez ao próximo', async () => {
    await prisma.exemplar.update({ where: { id: exemplarA1 }, data: { situacao: 'RESERVADO' } })
    const primeira = await prisma.reserva.create({
      data: {
        escolaId: escolaA,
        obraId: obraA,
        alunoId: alunoA1,
        posicao: 1,
        status: 'DISPONIVEL',
        exemplarSeparadoId: exemplarA1,
        retirarAte: new Date(Date.UTC(2026, 8, 14)),
      },
    })
    const segunda = await prisma.reserva.create({
      data: { escolaId: escolaA, obraId: obraA, alunoId: alunoA2, posicao: 2 },
    })

    await naEscolaA(() => cancelarReserva(COORDENACAO, { reservaId: primeira.id, hoje: HOJE }, deps))

    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: primeira.id } })).status).toBe(
      'CANCELADA',
    )
    const depois = await prisma.reserva.findUniqueOrThrow({ where: { id: segunda.id } })
    expect(depois.status).toBe('DISPONIVEL')
    expect(depois.exemplarSeparadoId).toBe(exemplarA1)
  })

  it('cancelar libera o exemplar quando não há mais ninguém', async () => {
    await prisma.exemplar.update({ where: { id: exemplarA2 }, data: { situacao: 'RESERVADO' } })
    const unica = await prisma.reserva.create({
      data: {
        escolaId: escolaA,
        obraId: obraA,
        alunoId: alunoA1,
        posicao: 1,
        status: 'DISPONIVEL',
        exemplarSeparadoId: exemplarA2,
        retirarAte: new Date(Date.UTC(2026, 8, 14)),
      },
    })

    await naEscolaA(() => cancelarReserva(COORDENACAO, { reservaId: unica.id, hoje: HOJE }, deps))

    expect(
      (await prisma.exemplar.findUniqueOrThrow({ where: { id: exemplarA2 } })).situacao,
    ).toBe('DISPONIVEL')
  })

  it('não cancela reserva da escola vizinha', async () => {
    const obraDaB = await prisma.obra.findFirstOrThrow({ where: { escolaId: escolaB } })
    const alunoDaB = await prisma.aluno.findFirstOrThrow({ where: { escolaId: escolaB } })
    const daB = await prisma.reserva.create({
      data: { escolaId: escolaB, obraId: obraDaB.id, alunoId: alunoDaB.id, posicao: 1 },
    })

    await expect(
      naEscolaA(() => cancelarReserva(COORDENACAO, { reservaId: daB.id, hoje: HOJE }, deps)),
    ).rejects.toThrow()

    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: daB.id } })).status).toBe(
      'AGUARDANDO',
    )
  })
})
