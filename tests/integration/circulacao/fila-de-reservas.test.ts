import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { filaDeReservasRepository } from '@/modules/circulacao/fila-de-reservas.repository'

let escolaA = ''
let escolaB = ''
let obraA = ''
let obraOutraA = ''
let obraB = ''
let alunoA = ''
let alunoB = ''
let contadorDeTombos = 0

async function montarEscola(slug: string) {
  const escola = await prisma.escola.create({ data: { slug, nome: slug } })
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
      nome: '7º A',
      serie: '7',
      turno: 'MANHA',
    },
  })
  const obra = await prisma.obra.create({
    data: { escolaId: escola.id, titulo: 'O Cortiço', tituloNormalizado: 'o cortico' },
  })
  const outraObra = await prisma.obra.create({
    data: { escolaId: escola.id, titulo: 'O Ateneu', tituloNormalizado: 'o ateneu' },
  })
  const aluno = await prisma.aluno.create({
    data: {
      escolaId: escola.id,
      matricula: '2024001',
      nome: `Júlia de ${slug}`,
      dataNascimento: new Date('2012-03-15'),
      turmaId: turma.id,
    },
  })

  return {
    escolaId: escola.id,
    obraId: obra.id,
    outraObraId: outraObra.id,
    alunoId: aluno.id,
  }
}

async function criarAluno(escolaId: string, matricula: string, nome: string) {
  const aluno = await prisma.aluno.create({
    data: {
      escolaId,
      matricula,
      nome,
      dataNascimento: new Date('2012-06-01'),
    },
  })
  return aluno.id
}

async function criarExemplar(escolaId: string, obraId: string) {
  contadorDeTombos += 1
  return prisma.exemplar.create({
    data: {
      escolaId,
      obraId,
      tombo: String(contadorDeTombos).padStart(6, '0'),
      situacao: 'DISPONIVEL',
    },
  })
}

async function reservar(dados: {
  escolaId: string
  obraId: string
  alunoId: string
  posicao: number
  status: 'AGUARDANDO' | 'DISPONIVEL' | 'ATENDIDA' | 'EXPIRADA' | 'CANCELADA'
  retirarAte?: string
}) {
  const separada = dados.status === 'DISPONIVEL'
  const exemplar = separada ? await criarExemplar(dados.escolaId, dados.obraId) : null

  return prisma.reserva.create({
    data: {
      escolaId: dados.escolaId,
      obraId: dados.obraId,
      alunoId: dados.alunoId,
      posicao: dados.posicao,
      status: dados.status,
      exemplarSeparadoId: exemplar === null ? null : exemplar.id,
      retirarAte:
        dados.retirarAte === undefined ? null : new Date(`${dados.retirarAte}T00:00:00.000Z`),
    },
  })
}

beforeEach(async () => {
  contadorDeTombos = 0
  const a = await montarEscola('escola-a')
  const b = await montarEscola('escola-b')
  escolaA = a.escolaId
  obraA = a.obraId
  obraOutraA = a.outraObraId
  alunoA = a.alunoId
  escolaB = b.escolaId
  obraB = b.obraId
  alunoB = b.alunoId
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

describe('as reservas vivas, contra o banco', () => {
  it('traz nome, matrícula, turma, título e posição numa consulta só', async () => {
    await reservar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      posicao: 1,
      status: 'AGUARDANDO',
    })

    const vivas = await naEscolaA(() => filaDeReservasRepository.reservasVivas())

    expect(vivas).toHaveLength(1)
    expect(vivas[0]?.nomeDoLeitor).toBe('Júlia de escola-a')
    expect(vivas[0]?.matricula).toBe('2024001')
    expect(vivas[0]?.turma).toBe('7º A')
    expect(vivas[0]?.tituloDaObra).toBe('O Cortiço')
    expect(vivas[0]?.obraId).toBe(obraA)
    expect(vivas[0]?.posicao).toBe(1)
    expect(vivas[0]?.status).toBe('AGUARDANDO')
    // Quem espera não tem livro guardado: dizer um tombo aqui mandaria a
    // operadora procurar na prateleira um exemplar que não está lá.
    expect(vivas[0]?.tomboSeparado).toBeNull()
    expect(vivas[0]?.retirarAte).toBeNull()
  })

  it('a reserva já separada vem com tombo e prazo de retirada', async () => {
    await reservar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      posicao: 1,
      status: 'DISPONIVEL',
      retirarAte: '2026-09-13',
    })

    const vivas = await naEscolaA(() => filaDeReservasRepository.reservasVivas())

    expect(vivas[0]?.status).toBe('DISPONIVEL')
    expect(vivas[0]?.tomboSeparado).toBe('000001')
    expect(vivas[0]?.retirarAte).toEqual(new Date('2026-09-13T00:00:00.000Z'))
  })

  it('atendida, expirada e cancelada NÃO estão na fila', async () => {
    // A fila é de quem espera. Contar quem já levou, quem perdeu a vez e
    // quem desistiu faria a tela dizer "cinco na fila" para uma obra que
    // ninguém está esperando — e a coordenação compraria cópia por nada.
    const colega = await criarAluno(escolaA, '2024002', 'Rafael Menezes')
    const outro = await criarAluno(escolaA, '2024003', 'Sofia Alves')

    await reservar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      posicao: 1,
      status: 'ATENDIDA',
    })
    await reservar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: colega,
      posicao: 2,
      status: 'EXPIRADA',
    })
    await reservar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: outro,
      posicao: 3,
      status: 'CANCELADA',
    })

    expect(await naEscolaA(() => filaDeReservasRepository.reservasVivas())).toEqual([])
  })

  it('o prazo VENCIDO continua na fila até o cron passar', async () => {
    // O livro está fisicamente na prateleira. Sumir com a reserva antes de
    // o cron passar a vez deixaria a operadora com um exemplar na mão e
    // nenhuma explicação para ele.
    await reservar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      posicao: 1,
      status: 'DISPONIVEL',
      retirarAte: '2026-09-01',
    })

    const vivas = await naEscolaA(() => filaDeReservasRepository.reservasVivas())
    expect(vivas).toHaveLength(1)
    expect(vivas[0]?.retirarAte).toEqual(new Date('2026-09-01T00:00:00.000Z'))
  })

  it('vem em ordem de chegada, obra por obra', async () => {
    const colega = await criarAluno(escolaA, '2024002', 'Rafael Menezes')

    await reservar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: colega,
      posicao: 2,
      status: 'AGUARDANDO',
    })
    await reservar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      posicao: 1,
      status: 'AGUARDANDO',
    })
    await reservar({
      escolaId: escolaA,
      obraId: obraOutraA,
      alunoId: alunoA,
      posicao: 1,
      status: 'AGUARDANDO',
    })

    const vivas = await naEscolaA(() => filaDeReservasRepository.reservasVivas())

    const doCortico = vivas.filter((v) => v.obraId === obraA)
    expect(doCortico.map((v) => v.posicao)).toEqual([1, 2])
    expect(vivas).toHaveLength(3)
  })

  it('a fila da escola vizinha não aparece', async () => {
    // A extensão de tenant carimba o escolaId. Sem ela, a operadora leria
    // o nome e a matrícula de um aluno de outra escola.
    await reservar({
      escolaId: escolaB,
      obraId: obraB,
      alunoId: alunoB,
      posicao: 1,
      status: 'AGUARDANDO',
    })

    expect(await naEscolaA(() => filaDeReservasRepository.reservasVivas())).toEqual([])
  })

  it('aluno sem turma vem com turma nula, não com texto inventado', async () => {
    const semTurma = await criarAluno(escolaA, '2024009', 'Lucas Prado')

    await reservar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: semTurma,
      posicao: 1,
      status: 'AGUARDANDO',
    })

    const vivas = await naEscolaA(() => filaDeReservasRepository.reservasVivas())
    expect(vivas[0]?.turma).toBeNull()
  })
})
