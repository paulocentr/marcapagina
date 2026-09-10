import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { relatoriosRepository } from '@/modules/relatorios/relatorios.repository'

/**
 * As agregações do Painel do Leitor, contra o banco.
 *
 * O que só o banco prova: que a janela é meia-aberta de verdade, que o
 * `groupBy` agrupa por aluno e não por empréstimo, que "mais
 * emprestadas" soma os empréstimos de TODOS os exemplares da mesma obra,
 * e que nada disso enxerga a escola vizinha.
 */

let escolaA = ''
let turma6A = ''
let turma9A = ''
let aluno1 = ''
let aluno2 = ''
let obraCortico = ''
let obraVidasSecas = ''
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

  const seisA = await prisma.turma.create({
    data: {
      escolaId: escola.id,
      anoLetivoId: anoLetivo.id,
      nome: '6º A',
      serie: '6',
      turno: 'MANHA',
    },
  })
  const noveA = await prisma.turma.create({
    data: {
      escolaId: escola.id,
      anoLetivoId: anoLetivo.id,
      nome: '9º A',
      serie: '9',
      turno: 'MANHA',
    },
  })

  const primeiro = await prisma.aluno.create({
    data: {
      escolaId: escola.id,
      matricula: '2024001',
      nome: `Júlia de ${slug}`,
      dataNascimento: new Date('2012-03-15'),
      turmaId: seisA.id,
    },
  })
  const segundo = await prisma.aluno.create({
    data: {
      escolaId: escola.id,
      matricula: '2024002',
      nome: `Rafael de ${slug}`,
      dataNascimento: new Date('2011-06-01'),
      turmaId: noveA.id,
    },
  })

  const cortico = await criarObra(escola.id, 'O Cortiço', 'Aluísio Azevedo')
  const vidasSecas = await criarObra(escola.id, 'Vidas Secas', 'Graciliano Ramos')

  return {
    escolaId: escola.id,
    turmaSeisA: seisA.id,
    turmaNoveA: noveA.id,
    alunoPrimeiro: primeiro.id,
    alunoSegundo: segundo.id,
    obraCortico: cortico,
    obraVidasSecas: vidasSecas,
  }
}

async function criarObra(escolaId: string, titulo: string, nomeDoAutor: string | null) {
  const obra = await prisma.obra.create({
    data: { escolaId, titulo, tituloNormalizado: titulo.toLowerCase() },
  })

  if (nomeDoAutor !== null) {
    const autor = await prisma.autor.create({
      data: { escolaId, nome: nomeDoAutor, nomeNormalizado: nomeDoAutor.toLowerCase() },
    })
    await prisma.obraAutor.create({ data: { obraId: obra.id, autorId: autor.id, ordem: 0 } })
  }

  return obra.id
}

async function criarExemplar(
  escolaId: string,
  obraId: string,
  situacao: 'DISPONIVEL' | 'EMPRESTADO' | 'BAIXADO' = 'DISPONIVEL',
) {
  contadorDeTombos += 1
  return prisma.exemplar.create({
    data: {
      escolaId,
      obraId,
      tombo: String(contadorDeTombos).padStart(6, '0'),
      situacao,
    },
  })
}

async function emprestar(dados: {
  escolaId: string
  obraId: string
  alunoId: string | null
  retiradaEm: string
  previstaPara?: string
  devolvidaEm?: string
  exemplarId?: string
}) {
  const exemplarId =
    dados.exemplarId ?? (await criarExemplar(dados.escolaId, dados.obraId)).id

  return prisma.emprestimo.create({
    data: {
      escolaId: dados.escolaId,
      exemplarId,
      alunoId: dados.alunoId,
      retiradaEm: new Date(dados.retiradaEm),
      previstaPara: new Date(`${dados.previstaPara ?? '2026-09-24'}T00:00:00.000Z`),
      devolvidaEm: dados.devolvidaEm ? new Date(dados.devolvidaEm) : null,
      operadorRetiradaId: 'usr_1',
    },
  })
}

// A janela de setembro de 2026 na escola (São Paulo, UTC-3).
const INICIO = new Date('2026-09-01T03:00:00.000Z')
const FIM = new Date('2026-10-01T03:00:00.000Z')
/** Meia-noite UTC do dia 10/09/2026, como as colunas @db.Date guardam. */
const HOJE = new Date('2026-09-10T03:00:00.000Z')

beforeEach(async () => {
  contadorDeTombos = 0
  const a = await montarEscola('escola-a')
  escolaA = a.escolaId
  turma6A = a.turmaSeisA
  turma9A = a.turmaNoveA
  aluno1 = a.alunoPrimeiro
  aluno2 = a.alunoSegundo
  obraCortico = a.obraCortico
  obraVidasSecas = a.obraVidasSecas
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

describe('contarEmprestimosEntre', () => {
  it('conta o que saiu dentro da janela', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2026-09-10T15:00:00.000Z',
    })

    expect(await naEscolaA(() => relatoriosRepository.contarEmprestimosEntre(INICIO, FIM))).toBe(1)
  })

  it('o começo é inclusivo e o fim é EXCLUSIVO', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: INICIO.toISOString(),
    })
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno2,
      retiradaEm: FIM.toISOString(),
    })

    // O primeiro instante de outubro é de outubro: contá-lo aqui somaria
    // o mesmo empréstimo em dois meses do relatório.
    expect(await naEscolaA(() => relatoriosRepository.contarEmprestimosEntre(INICIO, FIM))).toBe(1)
  })

  it('conta pela RETIRADA, e a devolução não tira o empréstimo do mês', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2026-09-05T15:00:00.000Z',
      devolvidaEm: '2026-09-20T15:00:00.000Z',
    })

    expect(await naEscolaA(() => relatoriosRepository.contarEmprestimosEntre(INICIO, FIM))).toBe(1)
  })

  it('não conta o empréstimo da escola vizinha', async () => {
    const vizinha = await montarEscola('escola-b')
    await emprestar({
      escolaId: vizinha.escolaId,
      obraId: vizinha.obraCortico,
      alunoId: vizinha.alunoPrimeiro,
      retiradaEm: '2026-09-10T15:00:00.000Z',
    })

    expect(await naEscolaA(() => relatoriosRepository.contarEmprestimosEntre(INICIO, FIM))).toBe(0)
  })
})

describe('emprestimosPorLeitorEntre', () => {
  it('devolve UMA linha por leitor, com a contagem dele', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2026-09-02T15:00:00.000Z',
    })
    await emprestar({
      escolaId: escolaA,
      obraId: obraVidasSecas,
      alunoId: aluno1,
      retiradaEm: '2026-09-09T15:00:00.000Z',
    })
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno2,
      retiradaEm: '2026-09-10T15:00:00.000Z',
    })

    const linhas = await naEscolaA(() =>
      relatoriosRepository.emprestimosPorLeitorEntre(INICIO, FIM),
    )
    const porAluno = new Map(linhas.map((l) => [l.alunoId, l.quantidade]))

    expect(linhas).toHaveLength(2)
    expect(porAluno.get(aluno1)).toBe(2)
    expect(porAluno.get(aluno2)).toBe(1)
  })

  it('o empréstimo da equipe vem numa linha de alunoId nulo', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: null,
      retiradaEm: '2026-09-10T15:00:00.000Z',
    })

    const linhas = await naEscolaA(() =>
      relatoriosRepository.emprestimosPorLeitorEntre(INICIO, FIM),
    )

    expect(linhas).toEqual([{ alunoId: null, quantidade: 1 }])
  })

  it('não enxerga a escola vizinha', async () => {
    const vizinha = await montarEscola('escola-c')
    await emprestar({
      escolaId: vizinha.escolaId,
      obraId: vizinha.obraCortico,
      alunoId: vizinha.alunoPrimeiro,
      retiradaEm: '2026-09-10T15:00:00.000Z',
    })

    expect(
      await naEscolaA(() => relatoriosRepository.emprestimosPorLeitorEntre(INICIO, FIM)),
    ).toEqual([])
  })
})

describe('turmasDeLeitores', () => {
  it('diz a turma de cada leitor pedido', async () => {
    const linhas = await naEscolaA(() =>
      relatoriosRepository.turmasDeLeitores([aluno1, aluno2]),
    )
    const porAluno = new Map(linhas.map((l) => [l.alunoId, l.turmaId]))

    expect(porAluno.get(aluno1)).toBe(turma6A)
    expect(porAluno.get(aluno2)).toBe(turma9A)
  })

  it('o aluno sem turma vem com turma nula, e não desaparece', async () => {
    const solto = await prisma.aluno.create({
      data: {
        escolaId: escolaA,
        matricula: '2024099',
        nome: 'Novato Sem Turma',
        dataNascimento: new Date('2013-01-01'),
      },
    })

    const linhas = await naEscolaA(() => relatoriosRepository.turmasDeLeitores([solto.id]))

    expect(linhas).toEqual([{ alunoId: solto.id, turmaId: null }])
  })

  it('lista vazia não vira consulta de tudo', async () => {
    expect(await naEscolaA(() => relatoriosRepository.turmasDeLeitores([]))).toEqual([])
  })

  it('o aluno da escola vizinha não é encontrado nem pedindo o id dele', async () => {
    const vizinha = await montarEscola('escola-d')

    expect(
      await naEscolaA(() => relatoriosRepository.turmasDeLeitores([vizinha.alunoPrimeiro])),
    ).toEqual([])
  })
})

describe('listarTurmas', () => {
  it('traz nome e série de cada turma', async () => {
    const turmas = await naEscolaA(() => relatoriosRepository.listarTurmas())
    const porNome = new Map(turmas.map((t) => [t.nome, t.serie]))

    expect(turmas).toHaveLength(2)
    expect(porNome.get('6º A')).toBe('6')
    expect(porNome.get('9º A')).toBe('9')
  })

  it('não traz turma da escola vizinha', async () => {
    await montarEscola('escola-e')

    expect(await naEscolaA(() => relatoriosRepository.listarTurmas())).toHaveLength(2)
  })
})

describe('alunosAtivosPorTurma', () => {
  it('conta os alunos de cada turma', async () => {
    const linhas = await naEscolaA(() => relatoriosRepository.alunosAtivosPorTurma())
    const porTurma = new Map(linhas.map((l) => [l.turmaId, l.quantidade]))

    expect(porTurma.get(turma6A)).toBe(1)
    expect(porTurma.get(turma9A)).toBe(1)
  })

  it('o aluno DESATIVADO não conta', async () => {
    // Contá-lo faria "44% dos alunos pegaram um livro" cair todo ano sem
    // nada ter mudado na leitura — só porque o cadastro antigo continua lá.
    await prisma.aluno.update({ where: { id: aluno1 }, data: { ativo: false } })

    const linhas = await naEscolaA(() => relatoriosRepository.alunosAtivosPorTurma())
    const porTurma = new Map(linhas.map((l) => [l.turmaId, l.quantidade]))

    expect(porTurma.get(turma6A)).toBeUndefined()
    expect(porTurma.get(turma9A)).toBe(1)
  })

  it('o aluno sem turma vem agrupado em turma nula', async () => {
    await prisma.aluno.create({
      data: {
        escolaId: escolaA,
        matricula: '2024098',
        nome: 'Sem Turma',
        dataNascimento: new Date('2013-01-01'),
      },
    })

    const linhas = await naEscolaA(() => relatoriosRepository.alunosAtivosPorTurma())
    const porTurma = new Map(linhas.map((l) => [l.turmaId, l.quantidade]))

    expect(porTurma.get(null)).toBe(1)
  })
})

describe('diasDeRetiradaEntre', () => {
  it('traz o instante de cada retirada da janela', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2026-09-10T15:00:00.000Z',
    })
    await emprestar({
      escolaId: escolaA,
      obraId: obraVidasSecas,
      alunoId: aluno2,
      retiradaEm: '2026-08-10T15:00:00.000Z',
    })

    const dias = await naEscolaA(() => relatoriosRepository.diasDeRetiradaEntre(INICIO, FIM))

    expect(dias).toEqual([new Date('2026-09-10T15:00:00.000Z')])
  })
})

describe('contarEmprestimosEmMaos', () => {
  it('conta só o que não voltou', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2026-09-10T15:00:00.000Z',
    })
    await emprestar({
      escolaId: escolaA,
      obraId: obraVidasSecas,
      alunoId: aluno2,
      retiradaEm: '2026-09-01T15:00:00.000Z',
      devolvidaEm: '2026-09-08T15:00:00.000Z',
    })

    expect(await naEscolaA(() => relatoriosRepository.contarEmprestimosEmMaos())).toBe(1)
  })

  it('não tem janela: o livro emprestado no ano passado ainda está em mãos', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2025-03-10T15:00:00.000Z',
    })

    expect(await naEscolaA(() => relatoriosRepository.contarEmprestimosEmMaos())).toBe(1)
  })
})

describe('contarExemplaresNoAcervo', () => {
  it('conta os exemplares vivos', async () => {
    await criarExemplar(escolaA, obraCortico)
    await criarExemplar(escolaA, obraCortico, 'EMPRESTADO')

    expect(await naEscolaA(() => relatoriosRepository.contarExemplaresNoAcervo())).toBe(2)
  })

  it('o exemplar BAIXADO sai da conta', async () => {
    // Baixado não circula mais. Contá-lo faria "4,5% do acervo
    // circulando" cair a cada baixa, como se a leitura tivesse diminuído.
    await criarExemplar(escolaA, obraCortico)
    await criarExemplar(escolaA, obraCortico, 'BAIXADO')

    expect(await naEscolaA(() => relatoriosRepository.contarExemplaresNoAcervo())).toBe(1)
  })
})

describe('contarLeitoresSuspensos', () => {
  async function suspender(alunoId: string, inicio: string, fim: string) {
    return prisma.penalidade.create({
      data: {
        escolaId: escolaA,
        alunoId,
        tipo: 'SUSPENSAO',
        inicio: new Date(`${inicio}T00:00:00.000Z`),
        fim: new Date(`${fim}T00:00:00.000Z`),
        motivo: 'Atraso na devolução',
      },
    })
  }

  it('conta o leitor com suspensão vigente', async () => {
    await suspender(aluno1, '2026-09-05', '2026-09-15')

    expect(await naEscolaA(() => relatoriosRepository.contarLeitoresSuspensos(HOJE))).toBe(1)
  })

  it('a suspensão vale o DIA INTEIRO em que termina', async () => {
    // Mesma fronteira de `avaliarBloqueios`: liberar na manhã do último
    // dia encurta a penalidade e faz o relatório discordar do balcão.
    await suspender(aluno1, '2026-09-01', '2026-09-10')

    expect(await naEscolaA(() => relatoriosRepository.contarLeitoresSuspensos(HOJE))).toBe(1)
  })

  it('a suspensão que terminou ontem não conta', async () => {
    await suspender(aluno1, '2026-09-01', '2026-09-09')

    expect(await naEscolaA(() => relatoriosRepository.contarLeitoresSuspensos(HOJE))).toBe(0)
  })

  it('a suspensão que ainda não começou não conta', async () => {
    await suspender(aluno1, '2026-09-20', '2026-09-30')

    expect(await naEscolaA(() => relatoriosRepository.contarLeitoresSuspensos(HOJE))).toBe(0)
  })

  it('conta LEITORES, não penalidades: duas suspensões do mesmo aluno são um leitor', async () => {
    await suspender(aluno1, '2026-09-01', '2026-09-15')
    await suspender(aluno1, '2026-09-05', '2026-09-20')

    expect(await naEscolaA(() => relatoriosRepository.contarLeitoresSuspensos(HOJE))).toBe(1)
  })
})

describe('maisEmprestadasEntre', () => {
  it('soma os empréstimos de TODOS os exemplares da mesma obra', async () => {
    // Duas cópias do mesmo livro são o mesmo livro no relatório. Contar
    // por exemplar dividiria "A Bolsa Amarela" em três linhas e nenhuma
    // delas chegaria ao topo.
    const primeira = await criarExemplar(escolaA, obraCortico)
    const segunda = await criarExemplar(escolaA, obraCortico)

    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2026-09-02T15:00:00.000Z',
      exemplarId: primeira.id,
    })
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno2,
      retiradaEm: '2026-09-03T15:00:00.000Z',
      exemplarId: segunda.id,
    })
    await emprestar({
      escolaId: escolaA,
      obraId: obraVidasSecas,
      alunoId: aluno1,
      retiradaEm: '2026-09-04T15:00:00.000Z',
    })

    const top = await naEscolaA(() => relatoriosRepository.maisEmprestadasEntre(INICIO, FIM, 5))

    expect(top[0]).toEqual({
      obraId: obraCortico,
      titulo: 'O Cortiço',
      autor: 'Aluísio Azevedo',
      quantidade: 2,
    })
    expect(top[1]?.titulo).toBe('Vidas Secas')
  })

  it('respeita o limite pedido', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2026-09-02T15:00:00.000Z',
    })
    await emprestar({
      escolaId: escolaA,
      obraId: obraVidasSecas,
      alunoId: aluno2,
      retiradaEm: '2026-09-03T15:00:00.000Z',
    })

    expect(
      await naEscolaA(() => relatoriosRepository.maisEmprestadasEntre(INICIO, FIM, 1)),
    ).toHaveLength(1)
  })

  it('só conta o que saiu DENTRO do período', async () => {
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2026-08-02T15:00:00.000Z',
    })

    expect(await naEscolaA(() => relatoriosRepository.maisEmprestadasEntre(INICIO, FIM, 5))).toEqual(
      [],
    )
  })

  it('obra catalogada sem autor não fica de fora do ranking', async () => {
    const semAutor = await criarObra(escolaA, 'Apostila de Matemática', null)
    await emprestar({
      escolaId: escolaA,
      obraId: semAutor,
      alunoId: aluno1,
      retiradaEm: '2026-09-02T15:00:00.000Z',
    })

    const top = await naEscolaA(() => relatoriosRepository.maisEmprestadasEntre(INICIO, FIM, 5))

    expect(top[0]?.titulo).toBe('Apostila de Matemática')
    expect(top[0]?.autor).toBeNull()
  })

  it('não conta o empréstimo da escola vizinha', async () => {
    const vizinha = await montarEscola('escola-f')
    await emprestar({
      escolaId: vizinha.escolaId,
      obraId: vizinha.obraCortico,
      alunoId: vizinha.alunoPrimeiro,
      retiradaEm: '2026-09-10T15:00:00.000Z',
    })

    expect(await naEscolaA(() => relatoriosRepository.maisEmprestadasEntre(INICIO, FIM, 5))).toEqual(
      [],
    )
  })
})

describe('obrasNuncaEmprestadas', () => {
  it('conta e lista a obra que tem exemplar e nunca saiu', async () => {
    await criarExemplar(escolaA, obraCortico)
    await criarExemplar(escolaA, obraCortico)

    const parado = await naEscolaA(() => relatoriosRepository.obrasNuncaEmprestadas(50))

    expect(parado.total).toBe(1)
    expect(parado.obras).toEqual([
      {
        obraId: obraCortico,
        titulo: 'O Cortiço',
        autor: 'Aluísio Azevedo',
        exemplares: 2,
      },
    ])
  })

  it('a obra que JÁ saiu e voltou não está parada', async () => {
    // "Nunca emprestada" é história do acervo, não estado de agora. Uma
    // obra devolvida ontem já provou que circula.
    const exemplar = await criarExemplar(escolaA, obraCortico)
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2026-03-02T15:00:00.000Z',
      devolvidaEm: '2026-03-10T15:00:00.000Z',
      exemplarId: exemplar.id,
    })

    const parado = await naEscolaA(() => relatoriosRepository.obrasNuncaEmprestadas(50))

    expect(parado.obras.map((o) => o.obraId)).not.toContain(obraCortico)
  })

  it('basta UM exemplar já emprestado para a obra sair da lista', async () => {
    const emprestado = await criarExemplar(escolaA, obraCortico)
    await criarExemplar(escolaA, obraCortico)
    await emprestar({
      escolaId: escolaA,
      obraId: obraCortico,
      alunoId: aluno1,
      retiradaEm: '2026-03-02T15:00:00.000Z',
      exemplarId: emprestado.id,
    })

    const parado = await naEscolaA(() => relatoriosRepository.obrasNuncaEmprestadas(50))

    expect(parado.obras.map((o) => o.obraId)).not.toContain(obraCortico)
  })

  it('a obra SEM exemplar não entra: não há livro para pôr no carrinho', async () => {
    // Ficha catalogada e ainda sem cópia física é trabalho de
    // catalogação pela metade, não acervo parado. Misturar as duas faria
    // a operadora procurar na estante um livro que a escola não tem.
    const parado = await naEscolaA(() => relatoriosRepository.obrasNuncaEmprestadas(50))

    expect(parado.total).toBe(0)
    expect(parado.obras).toEqual([])
  })

  it('a obra com só exemplar BAIXADO também não entra', async () => {
    await criarExemplar(escolaA, obraCortico, 'BAIXADO')

    const parado = await naEscolaA(() => relatoriosRepository.obrasNuncaEmprestadas(50))

    expect(parado.obras.map((o) => o.obraId)).not.toContain(obraCortico)
  })

  it('o limite corta a LISTA, nunca o total', async () => {
    // O número grande da tela tem de ser o número verdadeiro. Cortar o
    // total junto com a lista diria "10 obras paradas" num acervo com
    // trezentas.
    await criarExemplar(escolaA, obraCortico)
    await criarExemplar(escolaA, obraVidasSecas)

    const parado = await naEscolaA(() => relatoriosRepository.obrasNuncaEmprestadas(1))

    expect(parado.total).toBe(2)
    expect(parado.obras).toHaveLength(1)
  })

  it('não enxerga a obra parada da escola vizinha', async () => {
    const vizinha = await montarEscola('escola-g')
    await criarExemplar(vizinha.escolaId, vizinha.obraCortico)

    const parado = await naEscolaA(() => relatoriosRepository.obrasNuncaEmprestadas(50))

    expect(parado.total).toBe(0)
  })
})
