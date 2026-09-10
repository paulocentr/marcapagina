import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/core/db/client'
import { GET, POST } from '@/app/api/cron/[job]/route'

const SEGREDO = process.env.CRON_SECRET ?? ''
// Bem no passado de propósito: o `hoje` deste job é o relógio do
// servidor, e uma data colada em "ontem" faria o teste depender do dia em
// que ele roda.
const PRAZO_JA_VENCIDO = new Date(Date.UTC(2024, 0, 10))

let reservaDaA = ''
let reservaDaB = ''
let exemplarDaA = ''
let exemplarDaB = ''

/**
 * Uma escola com um exemplar separado para uma reserva cujo prazo de
 * retirada já venceu, e ninguém atrás na fila.
 */
async function escolaComReservaVencida(slug: string) {
  const escola = await prisma.escola.create({ data: { slug, nome: slug } })
  const obra = await prisma.obra.create({
    data: { escolaId: escola.id, titulo: 'Dom Casmurro', tituloNormalizado: 'dom casmurro' },
  })
  const exemplar = await prisma.exemplar.create({
    data: { escolaId: escola.id, obraId: obra.id, tombo: '000001', situacao: 'RESERVADO' },
  })
  const aluno = await prisma.aluno.create({
    data: {
      escolaId: escola.id,
      matricula: '2024001',
      nome: 'Ana Souza',
      dataNascimento: new Date('2012-03-15'),
    },
  })
  const reserva = await prisma.reserva.create({
    data: {
      escolaId: escola.id,
      obraId: obra.id,
      alunoId: aluno.id,
      posicao: 1,
      status: 'DISPONIVEL',
      exemplarSeparadoId: exemplar.id,
      retirarAte: PRAZO_JA_VENCIDO,
    },
  })

  return { escola, exemplar, reserva }
}

function acionar(job: string, autorizacao?: string) {
  const requisicao = new NextRequest(`http://localhost/api/cron/${job}`, {
    headers: autorizacao ? { authorization: autorizacao } : {},
  })
  return { requisicao, contexto: { params: Promise.resolve({ job }) } }
}

beforeEach(async () => {
  const a = await escolaComReservaVencida('escola-a')
  const b = await escolaComReservaVencida('escola-b')
  reservaDaA = a.reserva.id
  reservaDaB = b.reserva.id
  exemplarDaA = a.exemplar.id
  exemplarDaB = b.exemplar.id
})

async function statusDaReserva(id: string) {
  return (await prisma.reserva.findUniqueOrThrow({ where: { id } })).status
}

describe('cron expirar-reservas', () => {
  it('o segredo está configurado no ambiente de teste', () => {
    // Guarda contra falso verde: sem CRON_SECRET, o teste do caminho
    // autorizado bateria em 500 e o 401 passaria por acidente.
    expect(SEGREDO).not.toBe('')
  })

  it('sem o segredo devolve 401 e NADA é expirado', async () => {
    const { requisicao, contexto } = acionar('expirar-reservas')

    const resposta = await GET(requisicao, contexto)

    expect(resposta.status).toBe(401)
    expect(await statusDaReserva(reservaDaA)).toBe('DISPONIVEL')
    expect(
      (await prisma.exemplar.findUniqueOrThrow({ where: { id: exemplarDaA } })).situacao,
    ).toBe('RESERVADO')
  })

  it('com segredo errado devolve 401 e NADA é expirado', async () => {
    const { requisicao, contexto } = acionar('expirar-reservas', 'Bearer chute-errado')

    const resposta = await GET(requisicao, contexto)

    expect(resposta.status).toBe(401)
    expect(await statusDaReserva(reservaDaA)).toBe('DISPONIVEL')
  })

  it('com o segredo, expira em TODAS as escolas e devolve a contagem', async () => {
    const { requisicao, contexto } = acionar('expirar-reservas', `Bearer ${SEGREDO}`)

    const resposta = await GET(requisicao, contexto)
    const corpo = await resposta.json()

    expect(resposta.status).toBe(200)
    expect(corpo).toMatchObject({
      job: 'expirar-reservas',
      escolasProcessadas: 2,
      expiradas: 2,
      exemplaresLiberados: 2,
      falhas: [],
    })

    expect(await statusDaReserva(reservaDaA)).toBe('EXPIRADA')
    expect(await statusDaReserva(reservaDaB)).toBe('EXPIRADA')
    for (const id of [exemplarDaA, exemplarDaB]) {
      expect((await prisma.exemplar.findUniqueOrThrow({ where: { id } })).situacao).toBe(
        'DISPONIVEL',
      )
    }
  })

  it('a escola INATIVA fica de fora', async () => {
    await prisma.escola.updateMany({ where: { slug: 'escola-b' }, data: { ativa: false } })

    const { requisicao, contexto } = acionar('expirar-reservas', `Bearer ${SEGREDO}`)
    const corpo = await (await GET(requisicao, contexto)).json()

    expect(corpo.escolasProcessadas).toBe(1)
    expect(await statusDaReserva(reservaDaB)).toBe('DISPONIVEL')
  })

  it('POST aciona igual ao GET — o agendador externo usa POST', async () => {
    const { requisicao, contexto } = acionar('expirar-reservas', `Bearer ${SEGREDO}`)

    const resposta = await POST(requisicao, contexto)

    expect(resposta.status).toBe(200)
    expect(await statusDaReserva(reservaDaA)).toBe('EXPIRADA')
  })

  it('job desconhecido continua 404, mesmo com o segredo certo', async () => {
    const { requisicao, contexto } = acionar('inventar-job', `Bearer ${SEGREDO}`)

    const resposta = await GET(requisicao, contexto)

    expect(resposta.status).toBe(404)
    expect(await statusDaReserva(reservaDaA)).toBe('DISPONIVEL')
  })

  it('o job que ainda não tem implementação continua respondendo o contrato', async () => {
    const { requisicao, contexto } = acionar('backup-semanal', `Bearer ${SEGREDO}`)

    const resposta = await GET(requisicao, contexto)

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toMatchObject({ job: 'backup-semanal' })
  })
})
