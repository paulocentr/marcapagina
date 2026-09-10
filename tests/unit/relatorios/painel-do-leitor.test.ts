import { describe, it, expect } from 'vitest'
import {
  LIMITE_DE_ATRASADOS_NA_TELA,
  SEMANAS_DA_TENDENCIA,
  montarPainelDoLeitor,
  ordemDaSerie,
  type DependenciasDeRelatorios,
  type ObraContada,
  type ObraParada,
  type RepositorioDeRelatorios,
} from '@/modules/relatorios/painel-do-leitor.service'
import { SemPermissaoError, NaoAutenticadoError } from '@/core/errors'
import type { EmprestimoAtrasado } from '@/modules/circulacao/emprestimos.service'
import type { Principal } from '@/core/auth/principal'

const COORDENACAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: ['relatorio:ver', 'relatorio:exportar'],
}

const MONITORA: Principal = { ...COORDENACAO, permissoes: ['emprestimo:criar'] }

/** 10/09/2026, 15h na escola. */
const AGORA = new Date('2026-09-10T18:00:00.000Z')

function atrasado(parcial: Partial<EmprestimoAtrasado> & { diasDeAtraso: number }): EmprestimoAtrasado {
  return {
    emprestimoId: parcial.emprestimoId ?? 'emp_1',
    exemplarId: parcial.exemplarId ?? 'exe_1',
    tombo: parcial.tombo ?? '000276',
    tituloDaObra: parcial.tituloDaObra ?? 'Grande Sertão: Veredas',
    leitorId: parcial.leitorId ?? 'alu_1',
    nomeDoLeitor: parcial.nomeDoLeitor ?? 'Bruno Tavares Lopes',
    turma: parcial.turma === undefined ? '9º A' : parcial.turma,
    previstaPara: parcial.previstaPara ?? new Date('2026-08-18T00:00:00.000Z'),
    diasDeAtraso: parcial.diasDeAtraso,
  }
}

/**
 * Fake do repositório de relatórios.
 *
 * Guarda as janelas consultadas: "o total do mês sai da janela do mês, e
 * a comparação da janela do mês anterior" é uma promessa do serviço que
 * só se prova olhando o que ele PEDIU, não o que devolveu.
 */
function criarFake() {
  const janelas: { metodo: string; inicio: Date; fim: Date }[] = []

  const estado = {
    totalAnterior: 0,
    porLeitor: [] as { alunoId: string | null; quantidade: number }[],
    turmasDeLeitores: [] as { alunoId: string; turmaId: string | null }[],
    turmas: [] as { id: string; nome: string; serie: string }[],
    alunosPorTurma: [] as { turmaId: string | null; quantidade: number }[],
    diasDeRetirada: [] as Date[],
    emMaos: 0,
    exemplares: 0,
    suspensos: 0,
    maisEmprestadas: [] as ObraContada[],
    paradas: { total: 0, obras: [] as ObraParada[] },
    atrasados: [] as EmprestimoAtrasado[],
    idsPedidos: [] as readonly string[],
    limitesPedidos: [] as number[],
    hojePedido: [] as Date[],
  }

  const relatorios: RepositorioDeRelatorios = {
    async contarEmprestimosEntre(inicio, fim) {
      janelas.push({ metodo: 'contarEmprestimosEntre', inicio, fim })
      return estado.totalAnterior
    },
    async emprestimosPorLeitorEntre(inicio, fim) {
      janelas.push({ metodo: 'emprestimosPorLeitorEntre', inicio, fim })
      return estado.porLeitor
    },
    async turmasDeLeitores(alunoIds) {
      estado.idsPedidos = alunoIds
      return estado.turmasDeLeitores
    },
    async listarTurmas() {
      return estado.turmas
    },
    async alunosAtivosPorTurma() {
      return estado.alunosPorTurma
    },
    async diasDeRetiradaEntre(inicio, fim) {
      janelas.push({ metodo: 'diasDeRetiradaEntre', inicio, fim })
      return estado.diasDeRetirada
    },
    async contarEmprestimosEmMaos() {
      return estado.emMaos
    },
    async contarExemplaresNoAcervo() {
      return estado.exemplares
    },
    async contarLeitoresSuspensos(hoje) {
      estado.hojePedido.push(hoje)
      return estado.suspensos
    },
    async maisEmprestadasEntre(inicio, fim, limite) {
      janelas.push({ metodo: 'maisEmprestadasEntre', inicio, fim })
      estado.limitesPedidos.push(limite)
      return estado.maisEmprestadas
    },
    async obrasNuncaEmprestadas(limite) {
      estado.limitesPedidos.push(limite)
      return estado.paradas
    },
  }

  const deps: DependenciasDeRelatorios = {
    relatorios,
    emprestimos: {
      async listarAtrasados(hoje) {
        estado.hojePedido.push(hoje)
        return estado.atrasados
      },
      async contarAtrasadosDoAluno() {
        return 0
      },
      async contarAtivosDoAluno() {
        return 0
      },
    },
  }

  return { estado, deps, janelas }
}

describe('autorização', () => {
  it('quem não tem relatorio:ver não monta o painel', async () => {
    const { deps } = criarFake()

    await expect(
      montarPainelDoLeitor(MONITORA, { chave: 'MES', agora: AGORA }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('sem sessão é NaoAutenticado, não SemPermissao', async () => {
    const { deps } = criarFake()

    await expect(
      montarPainelDoLeitor(null, { chave: 'MES', agora: AGORA }, deps),
    ).rejects.toBeInstanceOf(NaoAutenticadoError)
  })
})

describe('as janelas consultadas', () => {
  it('o total do período sai do período, e a comparação do anterior', async () => {
    const { deps, janelas } = criarFake()

    await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    const doPeriodo = janelas.find((j) => j.metodo === 'emprestimosPorLeitorEntre')
    const daComparacao = janelas.find((j) => j.metodo === 'contarEmprestimosEntre')

    expect(doPeriodo?.inicio.toISOString()).toBe('2026-09-01T03:00:00.000Z')
    expect(doPeriodo?.fim.toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(daComparacao?.inicio.toISOString()).toBe('2026-08-01T03:00:00.000Z')
    expect(daComparacao?.fim.toISOString()).toBe('2026-09-01T03:00:00.000Z')
  })

  it('a tendência olha 12 semanas, e não só o período', async () => {
    const { deps, janelas } = criarFake()

    await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    const tendencia = janelas.find((j) => j.metodo === 'diasDeRetiradaEntre')

    expect(SEMANAS_DA_TENDENCIA).toBe(12)
    expect(tendencia?.inicio.toISOString()).toBe('2026-07-09T03:00:00.000Z')
    expect(tendencia?.fim.toISOString()).toBe('2026-10-01T03:00:00.000Z')
  })
})

describe('empréstimos no período', () => {
  it('o total é a SOMA do que veio por leitor, não um número à parte', async () => {
    // Número na tela é sempre contado. Se o total viesse de uma consulta
    // separada, ele e o gráfico por turma poderiam discordar na mesma
    // tela — e a coordenação levaria os dois para a reunião.
    const { estado, deps } = criarFake()
    estado.porLeitor = [
      { alunoId: 'alu_1', quantidade: 3 },
      { alunoId: 'alu_2', quantidade: 2 },
      { alunoId: null, quantidade: 1 },
    ]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.emprestimos.total).toBe(6)
  })

  it('compara com o período anterior', async () => {
    const { estado, deps } = criarFake()
    estado.porLeitor = [{ alunoId: 'alu_1', quantidade: 325 }]
    estado.totalAnterior = 293

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.emprestimos.comparacao).toEqual({
      tipo: 'ALTA',
      anterior: 293,
      percentual: 11,
    })
    expect(painel.anterior.rotulo).toBe('agosto de 2026')
  })

  it('a tendência vem com um número por semana', async () => {
    const { estado, deps } = criarFake()
    estado.diasDeRetirada = [
      new Date('2026-09-28T15:00:00.000Z'),
      new Date('2026-09-29T15:00:00.000Z'),
      new Date('2026-07-10T15:00:00.000Z'),
    ]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.emprestimos.tendencia).toHaveLength(12)
    expect(painel.emprestimos.tendencia[11]).toBe(2)
    expect(painel.emprestimos.tendencia[0]).toBe(1)
  })
})

describe('livros em mãos e o acervo', () => {
  it('diz quanto do acervo está circulando', async () => {
    const { estado, deps } = criarFake()
    estado.emMaos = 96
    estado.exemplares = 2133

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.emMaos.total).toBe(96)
    expect(painel.emMaos.exemplaresNoAcervo).toBe(2133)
    expect(painel.emMaos.percentualDoAcervo).toBeCloseTo(4.5, 1)
  })

  it('acervo vazio NÃO vira divisão por zero', async () => {
    const { estado, deps } = criarFake()
    estado.emMaos = 0
    estado.exemplares = 0

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    // `null` e não 0: "0% do acervo circulando" afirma que existe acervo.
    expect(painel.emMaos.percentualDoAcervo).toBeNull()
  })
})

describe('atrasados', () => {
  it('o total é a lista inteira, e a tela recebe só o começo dela', async () => {
    const { estado, deps } = criarFake()
    estado.atrasados = Array.from({ length: 14 }, (_, i) =>
      atrasado({ emprestimoId: `emp_${i}`, diasDeAtraso: 14 - i }),
    )

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.atrasados.total).toBe(14)
    expect(painel.atrasados.lista).toHaveLength(LIMITE_DE_ATRASADOS_NA_TELA)
  })

  it('o mais antigo sai da própria lista, que já vem ordenada', async () => {
    const { estado, deps } = criarFake()
    estado.atrasados = [atrasado({ diasDeAtraso: 23 }), atrasado({ diasDeAtraso: 8 })]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.atrasados.diasDoMaisAntigo).toBe(23)
  })

  it('sem atraso nenhum não existe "o mais antigo"', async () => {
    const { deps } = criarFake()

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.atrasados.total).toBe(0)
    expect(painel.atrasados.diasDoMaisAntigo).toBeNull()
  })

  it('as consultas de atraso recebem a meia-noite do dia da ESCOLA', async () => {
    // Elas comparam contra colunas `@db.Date` e derivam o dia do
    // instante recebido. Passar `new Date()` cru faria o atraso virar às
    // 21h em São Paulo — a coordenação veria, no fim da tarde, um aluno
    // atrasado que ainda tem o dia de amanhã para devolver.
    const { estado, deps } = criarFake()
    const fimDoExpediente = new Date('2026-09-11T01:00:00.000Z') // 22h do dia 10

    await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: fimDoExpediente }, deps)

    expect(estado.hojePedido).toHaveLength(2)
    for (const hoje of estado.hojePedido) {
      expect(hoje.toISOString()).toBe('2026-09-10T03:00:00.000Z')
    }
  })

  it('conta os leitores suspensos junto', async () => {
    const { estado, deps } = criarFake()
    estado.suspensos = 3

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.atrasados.leitoresSuspensos).toBe(3)
  })
})

describe('leitores ativos', () => {
  it('conta LEITORES distintos, não empréstimos', async () => {
    const { estado, deps } = criarFake()
    estado.porLeitor = [
      { alunoId: 'alu_1', quantidade: 5 },
      { alunoId: 'alu_2', quantidade: 1 },
    ]
    estado.alunosPorTurma = [{ turmaId: 't1', quantidade: 486 }]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.leitores.ativos).toBe(2)
    expect(painel.leitores.total).toBe(486)
  })

  it('o empréstimo da EQUIPE não conta como aluno ativo', async () => {
    // `alunoId` nulo é staff pegando livro. Contá-lo inflaria "44% dos
    // alunos pegaram um livro" com quem não é aluno.
    const { estado, deps } = criarFake()
    estado.porLeitor = [
      { alunoId: null, quantidade: 4 },
      { alunoId: 'alu_1', quantidade: 1 },
    ]
    estado.alunosPorTurma = [{ turmaId: 't1', quantidade: 10 }]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.leitores.ativos).toBe(1)
    expect(painel.leitores.percentual).toBeCloseTo(10, 5)
  })

  it('escola sem aluno cadastrado não vira divisão por zero', async () => {
    const { deps } = criarFake()

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.leitores.total).toBe(0)
    expect(painel.leitores.percentual).toBeNull()
  })

  it('só pede as turmas dos leitores que apareceram no período', async () => {
    const { estado, deps } = criarFake()
    estado.porLeitor = [
      { alunoId: 'alu_9', quantidade: 1 },
      { alunoId: null, quantidade: 1 },
    ]

    await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    // Nulo não é id de aluno; mandá-lo no `IN` faria a consulta procurar
    // um aluno chamado "null".
    expect(estado.idsPedidos).toEqual(['alu_9'])
  })
})

describe('empréstimos por turma', () => {
  function comTurmas() {
    const fake = criarFake()
    fake.estado.turmas = [
      { id: 't6a', nome: '6º A', serie: '6' },
      { id: 't9a', nome: '9º A', serie: '9' },
      { id: 't1em', nome: '1º EM', serie: '1EM' },
    ]
    fake.estado.alunosPorTurma = [
      { turmaId: 't6a', quantidade: 30 },
      { turmaId: 't9a', quantidade: 10 },
      { turmaId: 't1em', quantidade: 20 },
    ]
    return fake
  }

  it('soma os empréstimos dos alunos de cada turma', async () => {
    const { estado, deps } = comTurmas()
    estado.porLeitor = [
      { alunoId: 'a1', quantidade: 3 },
      { alunoId: 'a2', quantidade: 2 },
      { alunoId: 'a3', quantidade: 7 },
    ]
    estado.turmasDeLeitores = [
      { alunoId: 'a1', turmaId: 't6a' },
      { alunoId: 'a2', turmaId: 't6a' },
      { alunoId: 'a3', turmaId: 't9a' },
    ]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)
    const porNome = new Map(painel.turmas.map((t) => [t.nome, t]))

    expect(porNome.get('6º A')?.emprestimos).toBe(5)
    expect(porNome.get('9º A')?.emprestimos).toBe(7)
  })

  it('a turma que não emprestou nada aparece com ZERO', async () => {
    // Sumir com ela seria esconder exatamente a informação que muda
    // decisão pedagógica: a turma que não vai à biblioteca.
    const { estado, deps } = comTurmas()
    estado.porLeitor = [{ alunoId: 'a1', quantidade: 3 }]
    estado.turmasDeLeitores = [{ alunoId: 'a1', turmaId: 't6a' }]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)
    const em = painel.turmas.find((t) => t.nome === '1º EM')

    expect(em?.emprestimos).toBe(0)
    expect(em?.porAluno).toBe(0)
  })

  it('mede engajamento POR ALUNO, porque a turma maior ganharia sempre no absoluto', async () => {
    const { estado, deps } = comTurmas()
    // 6º A: 30 empréstimos em 30 alunos = 1,0 por aluno.
    // 9º A: 20 empréstimos em 10 alunos = 2,0 por aluno — engaja mais,
    // apesar de ter menos empréstimos no absoluto.
    estado.porLeitor = [
      { alunoId: 'a1', quantidade: 30 },
      { alunoId: 'a3', quantidade: 20 },
    ]
    estado.turmasDeLeitores = [
      { alunoId: 'a1', turmaId: 't6a' },
      { alunoId: 'a3', turmaId: 't9a' },
    ]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)
    const porNome = new Map(painel.turmas.map((t) => [t.nome, t]))

    expect(porNome.get('6º A')?.porAluno).toBeCloseTo(1, 5)
    expect(porNome.get('9º A')?.porAluno).toBeCloseTo(2, 5)
  })

  it('turma sem aluno ativo não tem "por aluno"', async () => {
    const { estado, deps } = comTurmas()
    estado.alunosPorTurma = []
    estado.porLeitor = [{ alunoId: 'a1', quantidade: 3 }]
    estado.turmasDeLeitores = [{ alunoId: 'a1', turmaId: 't6a' }]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)
    const seisA = painel.turmas.find((t) => t.nome === '6º A')

    expect(seisA?.emprestimos).toBe(3)
    expect(seisA?.alunos).toBe(0)
    expect(seisA?.porAluno).toBeNull()
  })

  it('a turma vazia de ANO PASSADO não entulha o gráfico', async () => {
    // `listarTurmas` traz TODAS as turmas da escola de propósito: se
    // trouxesse só as do ano letivo ativo, o empréstimo de um aluno de
    // turma antiga cairia num id sem linha e desapareceria do gráfico em
    // silêncio — a soma das barras passaria a discordar do número grande
    // ao lado. O que tira a turma velha da tela é ela não ter nem aluno
    // ativo nem empréstimo no período.
    const { estado, deps } = comTurmas()
    estado.turmas = [...estado.turmas, { id: 't2025', nome: '9º B (2025)', serie: '9' }]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.turmas.some((t) => t.nome === '9º B (2025)')).toBe(false)
  })

  it('mas a turma velha que teve empréstimo no período CONTINUA no gráfico', async () => {
    const { estado, deps } = comTurmas()
    estado.turmas = [...estado.turmas, { id: 't2025', nome: '9º B (2025)', serie: '9' }]
    estado.porLeitor = [{ alunoId: 'a7', quantidade: 2 }]
    estado.turmasDeLeitores = [{ alunoId: 'a7', turmaId: 't2025' }]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)
    const velha = painel.turmas.find((t) => t.nome === '9º B (2025)')

    expect(velha?.emprestimos).toBe(2)
    // Sem aluno ativo, "por aluno" não existe — 2 dividido por zero
    // seria infinito e `?? 0` diria que a turma não lê.
    expect(velha?.porAluno).toBeNull()
    expect(painel.turmas.reduce((soma, t) => soma + t.emprestimos, 0)).toBe(2)
  })

  it('vem em ordem de série, do fundamental para o médio', async () => {
    const { deps } = comTurmas()

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.turmas.map((t) => t.nome)).toEqual(['6º A', '9º A', '1º EM'])
  })

  it('o aluno SEM turma entra numa linha própria, por último', async () => {
    const { estado, deps } = comTurmas()
    estado.porLeitor = [{ alunoId: 'a9', quantidade: 4 }]
    estado.turmasDeLeitores = [{ alunoId: 'a9', turmaId: null }]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)
    const ultima = painel.turmas[painel.turmas.length - 1]

    expect(ultima?.turmaId).toBeNull()
    expect(ultima?.emprestimos).toBe(4)
  })

  it('sem aluno fora de turma, a linha "sem turma" não existe', async () => {
    const { deps } = comTurmas()

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.turmas.some((t) => t.turmaId === null)).toBe(false)
  })

  it('o empréstimo da equipe NÃO entra em turma nenhuma', async () => {
    const { estado, deps } = comTurmas()
    estado.porLeitor = [{ alunoId: null, quantidade: 9 }]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.turmas.reduce((soma, t) => soma + t.emprestimos, 0)).toBe(0)
  })

  it('o leitor que o banco não devolveu não some do total do gráfico', async () => {
    // Se um aluno for excluído entre as duas consultas, ele não vem em
    // `turmasDeLeitores`. Perder os empréstimos dele faria a soma do
    // gráfico discordar do número grande na mesma tela.
    const { estado, deps } = comTurmas()
    estado.porLeitor = [
      { alunoId: 'a1', quantidade: 3 },
      { alunoId: 'fantasma', quantidade: 5 },
    ]
    estado.turmasDeLeitores = [{ alunoId: 'a1', turmaId: 't6a' }]

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.emprestimos.total).toBe(8)
    expect(painel.turmas.reduce((soma, t) => soma + t.emprestimos, 0)).toBe(8)
    expect(painel.turmas[painel.turmas.length - 1]?.turmaId).toBeNull()
  })
})

describe('ordemDaSerie', () => {
  it('põe o fundamental antes do médio', () => {
    expect(ordemDaSerie('5')).toBeLessThan(ordemDaSerie('1EM'))
    expect(ordemDaSerie('9')).toBeLessThan(ordemDaSerie('1EM'))
    expect(ordemDaSerie('1EM')).toBeLessThan(ordemDaSerie('3EM'))
  })

  it('série que o sistema não reconhece vai para o fim, sem quebrar', () => {
    expect(ordemDaSerie('EJA')).toBeGreaterThan(ordemDaSerie('3EM'))
  })
})

describe('mais emprestadas e acervo parado', () => {
  it('entrega o que o repositório já ordenou e limitou', async () => {
    const { estado, deps } = criarFake()
    estado.maisEmprestadas = [
      { obraId: 'o1', titulo: 'A Bolsa Amarela', autor: 'Lygia Bojunga', quantidade: 19 },
      { obraId: 'o2', titulo: 'Capitães da Areia', autor: 'Jorge Amado', quantidade: 17 },
    ]
    estado.paradas = {
      total: 311,
      obras: [{ obraId: 'o9', titulo: 'Iracema', autor: 'José de Alencar', exemplares: 2 }],
    }

    const painel = await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(painel.maisEmprestadas[0]?.titulo).toBe('A Bolsa Amarela')
    expect(painel.acervoParado.total).toBe(311)
    expect(painel.acervoParado.obras[0]?.titulo).toBe('Iracema')
  })

  it('pede limite explícito nas duas consultas — nenhuma lista é aberta', async () => {
    // Consulta sem `take` num relatório é o caminho mais curto para a
    // tela travar na reunião com o acervo inteiro na memória.
    const { estado, deps } = criarFake()

    await montarPainelDoLeitor(COORDENACAO, { chave: 'MES', agora: AGORA }, deps)

    expect(estado.limitesPedidos).toHaveLength(2)
    for (const limite of estado.limitesPedidos) {
      expect(limite).toBeGreaterThan(0)
      expect(Number.isInteger(limite)).toBe(true)
    }
  })
})
