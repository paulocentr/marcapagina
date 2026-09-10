import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { painelDoBalcaoRepository } from '@/modules/circulacao/painel-do-balcao.repository'

let escolaA = ''
let obraA = ''
let alunoA = ''
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
    data: { escolaId: escola.id, nome: 'Estante 3', estante: '3' },
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
    localizacaoId: localizacao.id,
  }
}

async function criarExemplar(escolaId: string, obraId: string, localizacaoId: string | null) {
  contadorDeTombos += 1
  return prisma.exemplar.create({
    data: {
      escolaId,
      obraId,
      tombo: String(contadorDeTombos).padStart(6, '0'),
      localizacaoId,
      situacao: 'DISPONIVEL',
    },
  })
}

async function separar(dados: {
  escolaId: string
  obraId: string
  alunoId: string
  localizacaoId: string | null
  retirarAte: string
  status?: 'AGUARDANDO' | 'DISPONIVEL' | 'ATENDIDA' | 'EXPIRADA'
}) {
  const exemplar = await criarExemplar(dados.escolaId, dados.obraId, dados.localizacaoId)
  const status = dados.status === undefined ? 'DISPONIVEL' : dados.status
  const reserva = await prisma.reserva.create({
    data: {
      escolaId: dados.escolaId,
      obraId: dados.obraId,
      alunoId: dados.alunoId,
      posicao: 1,
      status,
      // A reserva que não está separada não tem exemplar nem prazo: é
      // exatamente assim que `separarExemplar` grava os três juntos.
      exemplarSeparadoId: status === 'DISPONIVEL' ? exemplar.id : null,
      retirarAte:
        status === 'DISPONIVEL' ? new Date(`${dados.retirarAte}T00:00:00.000Z`) : null,
    },
  })
  return { reserva, exemplar }
}

async function emprestimo(dados: {
  escolaId: string
  obraId: string
  alunoId: string | null
  retiradaEm: string
  previstaPara: string
  devolvidaEm?: string
}) {
  const exemplar = await criarExemplar(dados.escolaId, dados.obraId, null)
  return prisma.emprestimo.create({
    data: {
      escolaId: dados.escolaId,
      exemplarId: exemplar.id,
      alunoId: dados.alunoId,
      retiradaEm: new Date(dados.retiradaEm),
      previstaPara: new Date(`${dados.previstaPara}T00:00:00.000Z`),
      devolvidaEm: dados.devolvidaEm ? new Date(dados.devolvidaEm) : null,
      operadorRetiradaId: 'usr_1',
    },
  })
}

// A janela do dia 10/09/2026 na escola (São Paulo, UTC-3).
const INICIO = new Date('2026-09-10T03:00:00.000Z')
const FIM = new Date('2026-09-11T03:00:00.000Z')

beforeEach(async () => {
  contadorDeTombos = 0
  const a = await montarEscola('escola-a')
  escolaA = a.escolaId
  obraA = a.obraId
  alunoA = a.alunoId
  localizacaoA = a.localizacaoId
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

describe('a prateleira de separados, contra o banco', () => {
  it('traz nome, turma, título, tombo, estante e prazo numa consulta só', async () => {
    await separar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      localizacaoId: localizacaoA,
      retirarAte: '2026-09-13',
    })

    const prateleira = await naEscolaA(() => painelDoBalcaoRepository.exemplaresSeparados())

    expect(prateleira).toHaveLength(1)
    expect(prateleira[0]?.nomeDoLeitor).toBe('Júlia de escola-a')
    expect(prateleira[0]?.turma).toBe('7º A')
    expect(prateleira[0]?.tituloDaObra).toBe('O Cortiço')
    expect(prateleira[0]?.tombo).toBe('000001')
    expect(prateleira[0]?.localizacao).toBe('Estante 3')
    expect(prateleira[0]?.retirarAte).toEqual(new Date('2026-09-13T00:00:00.000Z'))
  })

  it('quem ainda está na FILA não está na prateleira', async () => {
    // AGUARDANDO é quem espera; não há livro guardado para ele. Mostrá-lo
    // faria a operadora procurar na prateleira um exemplar que não existe.
    await separar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      localizacaoId: localizacaoA,
      retirarAte: '2026-09-13',
      status: 'AGUARDANDO',
    })

    expect(await naEscolaA(() => painelDoBalcaoRepository.exemplaresSeparados())).toEqual([])
  })

  it('quem já retirou saiu da prateleira', async () => {
    await separar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      localizacaoId: localizacaoA,
      retirarAte: '2026-09-13',
      status: 'ATENDIDA',
    })

    expect(await naEscolaA(() => painelDoBalcaoRepository.exemplaresSeparados())).toEqual([])
  })

  it('o prazo que já venceu CONTINUA na prateleira até o cron passar', async () => {
    // O livro está fisicamente lá. Sumir com ele da tela antes de o cron
    // devolvê-lo à estante deixaria a operadora com um exemplar na mão e
    // nenhuma explicação para ele.
    await separar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      localizacaoId: localizacaoA,
      retirarAte: '2026-09-01',
    })

    expect(await naEscolaA(() => painelDoBalcaoRepository.exemplaresSeparados())).toHaveLength(1)
  })

  it('vem do prazo mais curto para o mais longo', async () => {
    // Dois leitores diferentes: o índice único parcial proíbe duas
    // reservas vivas do mesmo aluno na mesma obra, e é o que se quer.
    const colega = await prisma.aluno.create({
      data: {
        escolaId: escolaA,
        matricula: '2024002',
        nome: 'Rafael Menezes',
        dataNascimento: new Date('2012-06-01'),
      },
    })

    await separar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      localizacaoId: localizacaoA,
      retirarAte: '2026-09-15',
    })
    await separar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: colega.id,
      localizacaoId: localizacaoA,
      retirarAte: '2026-09-11',
    })

    const prateleira = await naEscolaA(() => painelDoBalcaoRepository.exemplaresSeparados())

    expect(prateleira.map((i) => i.retirarAte.toISOString().slice(0, 10))).toEqual([
      '2026-09-11',
      '2026-09-15',
    ])
  })

  it('o exemplar sem localização cadastrada não quebra a prateleira', async () => {
    await separar({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      localizacaoId: null,
      retirarAte: '2026-09-13',
    })

    const [item] = await naEscolaA(() => painelDoBalcaoRepository.exemplaresSeparados())

    expect(item?.localizacao).toBeNull()
  })

  it('não enxerga a prateleira da escola vizinha', async () => {
    const vizinha = await montarEscola('escola-b', 'Vidas Secas')
    await separar({
      escolaId: vizinha.escolaId,
      obraId: vizinha.obraId,
      alunoId: vizinha.alunoId,
      localizacaoId: vizinha.localizacaoId,
      retirarAte: '2026-09-13',
    })

    expect(await naEscolaA(() => painelDoBalcaoRepository.exemplaresSeparados())).toEqual([])
  })
})

describe('os movimentos do dia, contra o banco', () => {
  it('a retirada de hoje aparece com hora, leitor e obra', async () => {
    await emprestimo({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      retiradaEm: '2026-09-10T17:51:00.000Z',
      previstaPara: '2026-09-24',
    })

    const retiradas = await naEscolaA(() =>
      painelDoBalcaoRepository.retiradasEntre(INICIO, FIM),
    )

    expect(retiradas).toHaveLength(1)
    expect(retiradas[0]?.quando).toEqual(new Date('2026-09-10T17:51:00.000Z'))
    expect(retiradas[0]?.nomeDoLeitor).toBe('Júlia de escola-a')
    expect(retiradas[0]?.turma).toBe('7º A')
    expect(retiradas[0]?.tituloDaObra).toBe('O Cortiço')
    expect(retiradas[0]?.tombo).toBe('000001')
    expect(retiradas[0]?.previstaPara).toEqual(new Date('2026-09-24T00:00:00.000Z'))
  })

  it('a retirada de ontem NÃO entra no dia de hoje', async () => {
    // 02:00Z do dia 10 é 23:00 do dia 9 na escola: ontem.
    await emprestimo({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      retiradaEm: '2026-09-10T02:00:00.000Z',
      previstaPara: '2026-09-24',
    })

    expect(await naEscolaA(() => painelDoBalcaoRepository.retiradasEntre(INICIO, FIM))).toEqual(
      [],
    )
  })

  it('o fim da janela é EXCLUSIVO: o primeiro instante de amanhã é de amanhã', async () => {
    await emprestimo({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      retiradaEm: FIM.toISOString(),
      previstaPara: '2026-09-24',
    })

    expect(await naEscolaA(() => painelDoBalcaoRepository.retiradasEntre(INICIO, FIM))).toEqual(
      [],
    )
  })

  it('o começo da janela é INCLUSIVO', async () => {
    await emprestimo({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      retiradaEm: INICIO.toISOString(),
      previstaPara: '2026-09-24',
    })

    expect(
      await naEscolaA(() => painelDoBalcaoRepository.retiradasEntre(INICIO, FIM)),
    ).toHaveLength(1)
  })

  it('a devolução entra pela hora em que VOLTOU, não pela retirada', async () => {
    // Emprestado semanas antes, devolvido hoje. Filtrar por retiradaEm
    // faria a devolução do dia desaparecer do painel.
    await emprestimo({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      retiradaEm: '2026-08-20T13:00:00.000Z',
      previstaPara: '2026-09-03',
      devolvidaEm: '2026-09-10T18:04:00.000Z',
    })

    const devolucoes = await naEscolaA(() =>
      painelDoBalcaoRepository.devolucoesEntre(INICIO, FIM),
    )

    expect(devolucoes).toHaveLength(1)
    expect(devolucoes[0]?.quando).toEqual(new Date('2026-09-10T18:04:00.000Z'))
    expect(devolucoes[0]?.previstaPara).toEqual(new Date('2026-09-03T00:00:00.000Z'))
  })

  it('o empréstimo em aberto não conta como devolução', async () => {
    await emprestimo({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      retiradaEm: '2026-09-10T17:51:00.000Z',
      previstaPara: '2026-09-24',
    })

    expect(await naEscolaA(() => painelDoBalcaoRepository.devolucoesEntre(INICIO, FIM))).toEqual(
      [],
    )
  })

  it('o livro que saiu e voltou hoje aparece nas DUAS listas', async () => {
    await emprestimo({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: alunoA,
      retiradaEm: '2026-09-10T12:00:00.000Z',
      previstaPara: '2026-09-24',
      devolvidaEm: '2026-09-10T18:00:00.000Z',
    })

    expect(
      await naEscolaA(() => painelDoBalcaoRepository.retiradasEntre(INICIO, FIM)),
    ).toHaveLength(1)
    expect(
      await naEscolaA(() => painelDoBalcaoRepository.devolucoesEntre(INICIO, FIM)),
    ).toHaveLength(1)
  })

  it('o empréstimo da equipe não fica sem nome de leitor', async () => {
    // Staff também pega livro, e `alunoId` é nulo nesse caso. Uma linha
    // sem nome na tira do balcão parece um bug de gravação.
    await emprestimo({
      escolaId: escolaA,
      obraId: obraA,
      alunoId: null,
      retiradaEm: '2026-09-10T17:00:00.000Z',
      previstaPara: '2026-09-24',
    })

    const [linha] = await naEscolaA(() =>
      painelDoBalcaoRepository.retiradasEntre(INICIO, FIM),
    )

    expect(linha?.nomeDoLeitor).toBe('Leitor da equipe')
    expect(linha?.turma).toBeNull()
  })

  it('não enxerga o movimento da escola vizinha', async () => {
    const vizinha = await montarEscola('escola-c', 'Iracema')
    await emprestimo({
      escolaId: vizinha.escolaId,
      obraId: vizinha.obraId,
      alunoId: vizinha.alunoId,
      retiradaEm: '2026-09-10T17:51:00.000Z',
      previstaPara: '2026-09-24',
      devolvidaEm: '2026-09-10T18:51:00.000Z',
    })

    expect(await naEscolaA(() => painelDoBalcaoRepository.retiradasEntre(INICIO, FIM))).toEqual(
      [],
    )
    expect(await naEscolaA(() => painelDoBalcaoRepository.devolucoesEntre(INICIO, FIM))).toEqual(
      [],
    )
  })
})
