import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { exemplarDoBalcaoRepository } from '@/modules/circulacao/exemplar-do-balcao.repository'

let escolaA = ''
let obraA = ''
let alunoA = ''
let turmaA = ''
let localizacaoA = ''
let contadorDeTombos = 0

async function montarEscola(slug: string, tituloDaObra = 'O Cortiço') {
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
    data: {
      escolaId: escola.id,
      titulo: tituloDaObra,
      tituloNormalizado: tituloDaObra.toLowerCase(),
    },
  })
  const localizacao = await prisma.localizacao.create({
    data: {
      escolaId: escola.id,
      nome: 'Literatura brasileira',
      corredor: 'B',
      estante: '3',
      prateleira: '2',
    },
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
    alunoId: aluno.id,
    turmaId: turma.id,
    localizacaoId: localizacao.id,
  }
}

async function criarExemplar(dados: {
  escolaId: string
  obraId: string
  localizacaoId: string | null
  situacao?: 'DISPONIVEL' | 'RESERVADO' | 'EMPRESTADO'
}) {
  contadorDeTombos += 1
  return prisma.exemplar.create({
    data: {
      escolaId: dados.escolaId,
      obraId: dados.obraId,
      tombo: String(contadorDeTombos).padStart(6, '0'),
      localizacaoId: dados.localizacaoId,
      situacao: dados.situacao === undefined ? 'DISPONIVEL' : dados.situacao,
    },
  })
}

async function comAutor(escolaId: string, obraId: string, nome: string, ordem: number) {
  const autor = await prisma.autor.create({
    data: { escolaId, nome, nomeNormalizado: nome.toLowerCase() },
  })
  await prisma.obraAutor.create({ data: { obraId, autorId: autor.id, ordem } })
}

beforeEach(async () => {
  contadorDeTombos = 0
  const a = await montarEscola('escola-a')
  escolaA = a.escolaId
  obraA = a.obraId
  alunoA = a.alunoId
  turmaA = a.turmaId
  localizacaoA = a.localizacaoId
  void turmaA
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

describe('o tombo bipado, contra o banco', () => {
  it('traz título, autor e localização numa consulta só', async () => {
    await comAutor(escolaA, obraA, 'Aluísio Azevedo', 0)
    const exemplar = await criarExemplar({
      escolaId: escolaA,
      obraId: obraA,
      localizacaoId: localizacaoA,
    })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(exemplar.tombo),
    )

    expect(achado?.exemplar.id).toBe(exemplar.id)
    expect(achado?.exemplar.tituloDaObra).toBe('O Cortiço')
    expect(achado?.exemplar.autores).toEqual(['Aluísio Azevedo'])
    expect(achado?.exemplar.situacao).toBe('DISPONIVEL')
    expect(achado?.exemplar.localizacao).toEqual({
      nome: 'Literatura brasileira',
      corredor: 'B',
      estante: '3',
      prateleira: '2',
    })
  })

  it('os autores vêm na ordem em que foram catalogados', async () => {
    // Autoria não é conjunto: "Machado de Assis e outro" não é a mesma
    // ficha que "outro e Machado de Assis".
    await comAutor(escolaA, obraA, 'Segunda Autora', 1)
    await comAutor(escolaA, obraA, 'Primeiro Autor', 0)
    const exemplar = await criarExemplar({
      escolaId: escolaA,
      obraId: obraA,
      localizacaoId: localizacaoA,
    })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(exemplar.tombo),
    )

    expect(achado?.exemplar.autores).toEqual(['Primeiro Autor', 'Segunda Autora'])
  })

  it('obra sem autor cadastrado vem com lista vazia, não nula', async () => {
    const exemplar = await criarExemplar({
      escolaId: escolaA,
      obraId: obraA,
      localizacaoId: localizacaoA,
    })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(exemplar.tombo),
    )

    expect(achado?.exemplar.autores).toEqual([])
  })

  it('exemplar ainda sem localização não quebra a conferência', async () => {
    // A etiquetagem é gradual (spec §4.2): há exemplar catalogado antes
    // de a estante existir.
    const exemplar = await criarExemplar({ escolaId: escolaA, obraId: obraA, localizacaoId: null })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(exemplar.tombo),
    )

    expect(achado?.exemplar.localizacao).toBeNull()
  })

  it('tombo inexistente devolve nulo, e o erro é do serviço', async () => {
    expect(await naEscolaA(() => exemplarDoBalcaoRepository.conferirTombo('999999'))).toBeNull()
  })

  it('não acha o tombo da escola vizinha', async () => {
    const vizinha = await montarEscola('escola-b', 'Vidas Secas')
    const daVizinha = await criarExemplar({
      escolaId: vizinha.escolaId,
      obraId: vizinha.obraId,
      localizacaoId: vizinha.localizacaoId,
    })

    expect(
      await naEscolaA(() => exemplarDoBalcaoRepository.conferirTombo(daVizinha.tombo)),
    ).toBeNull()
  })
})

describe('a cabeça da fila da obra bipada', () => {
  it('sem fila não há cabeça', async () => {
    const exemplar = await criarExemplar({
      escolaId: escolaA,
      obraId: obraA,
      localizacaoId: localizacaoA,
    })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(exemplar.tombo),
    )

    expect(achado?.cabecaDaFila).toBeNull()
  })

  it('traz nome e turma de quem espera', async () => {
    const exemplar = await criarExemplar({
      escolaId: escolaA,
      obraId: obraA,
      localizacaoId: localizacaoA,
    })
    await prisma.reserva.create({
      data: {
        escolaId: escolaA,
        obraId: obraA,
        alunoId: alunoA,
        posicao: 1,
        status: 'AGUARDANDO',
      },
    })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(exemplar.tombo),
    )

    expect(achado?.cabecaDaFila?.nomeDoLeitor).toBe('Júlia de escola-a')
    expect(achado?.cabecaDaFila?.turma).toBe('7º A')
    expect(achado?.cabecaDaFila?.posicao).toBe(1)
    expect(achado?.cabecaDaFila?.status).toBe('AGUARDANDO')
  })

  it('a cabeça é a de MENOR posição, não a primeira que o banco devolver', async () => {
    const exemplar = await criarExemplar({
      escolaId: escolaA,
      obraId: obraA,
      localizacaoId: localizacaoA,
    })
    const segundo = await prisma.aluno.create({
      data: {
        escolaId: escolaA,
        matricula: '2024002',
        nome: 'Chegou depois',
        dataNascimento: new Date('2012-06-01'),
      },
    })
    await prisma.reserva.create({
      data: { escolaId: escolaA, obraId: obraA, alunoId: segundo.id, posicao: 2 },
    })
    await prisma.reserva.create({
      data: { escolaId: escolaA, obraId: obraA, alunoId: alunoA, posicao: 1 },
    })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(exemplar.tombo),
    )

    expect(achado?.cabecaDaFila?.nomeDoLeitor).toBe('Júlia de escola-a')
  })

  it('a reserva já separada NESTE exemplar aparece com o exemplar', async () => {
    const exemplar = await criarExemplar({
      escolaId: escolaA,
      obraId: obraA,
      localizacaoId: localizacaoA,
      situacao: 'RESERVADO',
    })
    await prisma.reserva.create({
      data: {
        escolaId: escolaA,
        obraId: obraA,
        alunoId: alunoA,
        posicao: 1,
        status: 'DISPONIVEL',
        exemplarSeparadoId: exemplar.id,
        retirarAte: new Date('2026-09-13T00:00:00.000Z'),
      },
    })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(exemplar.tombo),
    )

    expect(achado?.cabecaDaFila?.status).toBe('DISPONIVEL')
    expect(achado?.cabecaDaFila?.exemplarSeparadoId).toBe(exemplar.id)
  })

  it('quem já retirou ou expirou saiu da fila', async () => {
    // ATENDIDA levou o livro; EXPIRADA perdeu a vez. Contar as duas faria
    // a faixa mandar separar exemplar para quem não está mais esperando.
    const exemplar = await criarExemplar({
      escolaId: escolaA,
      obraId: obraA,
      localizacaoId: localizacaoA,
    })
    const outro = await prisma.aluno.create({
      data: {
        escolaId: escolaA,
        matricula: '2024003',
        nome: 'Expirado',
        dataNascimento: new Date('2012-06-01'),
      },
    })
    await prisma.reserva.create({
      data: {
        escolaId: escolaA,
        obraId: obraA,
        alunoId: alunoA,
        posicao: 1,
        status: 'ATENDIDA',
      },
    })
    await prisma.reserva.create({
      data: {
        escolaId: escolaA,
        obraId: obraA,
        alunoId: outro.id,
        posicao: 2,
        status: 'EXPIRADA',
      },
    })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(exemplar.tombo),
    )

    expect(achado?.cabecaDaFila).toBeNull()
  })

  it('a fila é da OBRA, não do exemplar: qualquer cópia serve', async () => {
    // Reservar exemplar específico faria a fila parar porque justamente
    // aquela cópia está com alguém. A reserva não aponta exemplar
    // nenhum, e bipar a SEGUNDA cópia tem de mostrar a mesma fila.
    await criarExemplar({ escolaId: escolaA, obraId: obraA, localizacaoId: localizacaoA })
    const segundaCopia = await criarExemplar({
      escolaId: escolaA,
      obraId: obraA,
      localizacaoId: localizacaoA,
    })
    await prisma.reserva.create({
      data: { escolaId: escolaA, obraId: obraA, alunoId: alunoA, posicao: 1 },
    })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(segundaCopia.tombo),
    )

    expect(achado?.cabecaDaFila?.nomeDoLeitor).toBe('Júlia de escola-a')
  })

  it('não enxerga a fila da escola vizinha', async () => {
    const vizinha = await montarEscola('escola-c', 'Iracema')
    await prisma.reserva.create({
      data: {
        escolaId: vizinha.escolaId,
        obraId: vizinha.obraId,
        alunoId: vizinha.alunoId,
        posicao: 1,
      },
    })
    const exemplar = await criarExemplar({
      escolaId: escolaA,
      obraId: obraA,
      localizacaoId: localizacaoA,
    })

    const achado = await naEscolaA(() =>
      exemplarDoBalcaoRepository.conferirTombo(exemplar.tombo),
    )

    expect(achado?.cabecaDaFila).toBeNull()
  })
})
