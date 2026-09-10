import { describe, it, expect, beforeEach } from 'vitest'
import { SemPermissaoError } from '@/core/errors'
import { idadeTipicaDaSerie } from '@/modules/carrinho/faixa-etaria'
import { SerieInvalidaError } from '@/modules/leitores/serie'
import {
  NomeDeTurmaObrigatorioError,
  TurmaInexistenteError,
  TurmaJaExisteError,
  TurnoInvalidoError,
  criarTurma,
  editarTurma,
  listarTurmas,
  obterTurma,
} from '@/modules/leitores/turmas.service'
import {
  AnoLetivoInexistenteError,
  AnoLetivoJaExisteError,
  PeriodoInvalidoError,
  criarAnoLetivo,
  definirAnoLetivoAtivo,
  listarAnosLetivos,
} from '@/modules/leitores/anos-letivos.service'
import type { Principal } from '@/core/auth/principal'
import {
  criarFakeDeAnosLetivos,
  criarFakeDeTransacao,
  criarFakeDeTurmas,
} from '../../apoio/fakes/leitores.fake'

const COORDENACAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: ['aluno:ver', 'aluno:criar', 'aluno:editar', 'turma:gerenciar'],
}

const MONITOR: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Monitor',
  // Tem `aluno:ver` e NÃO tem `turma:gerenciar` — é o caso que separa
  // "consultar a turma no balcão" de "mexer no cadastro dela".
  permissoes: ['aluno:ver'],
}

let deps: {
  turmas: ReturnType<typeof criarFakeDeTurmas>
  anosLetivos: ReturnType<typeof criarFakeDeAnosLetivos>
  emTransacao: <T>(fn: () => Promise<T>) => Promise<T>
}
let transacao: ReturnType<typeof criarFakeDeTransacao>

beforeEach(() => {
  const anosLetivos = criarFakeDeAnosLetivos([
    {
      id: 'anl_2026',
      ano: 2026,
      dataInicio: new Date('2026-02-01T00:00:00.000Z'),
      dataFim: new Date('2026-12-15T00:00:00.000Z'),
      ativo: true,
    },
  ])
  transacao = criarFakeDeTransacao()
  deps = {
    turmas: criarFakeDeTurmas(anosLetivos),
    anosLetivos,
    emTransacao: transacao.emTransacao,
  }
})

const TURMA_5A = { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: 'anl_2026' }

describe('criarTurma', () => {
  it('cria a turma com a série canônica', async () => {
    const turma = await criarTurma(COORDENACAO, TURMA_5A, deps)

    expect(turma.nome).toBe('5º A')
    expect(turma.serie).toBe('5')
    expect(turma.turno).toBe('MANHA')
  })

  it('grava a série num formato que o Carrinho sabe ler', async () => {
    // Esta é a razão de existir da validação. A operadora digita "1º EM"
    // porque é assim que a escola escreve; se isso fosse gravado cru, o
    // filtro de faixa etária pararia de entender a série da turma e
    // passaria a sugerir livro de qualquer idade para ela.
    const turma = await criarTurma(
      COORDENACAO,
      { ...TURMA_5A, nome: '1º EM A', serie: '1º EM' },
      deps,
    )

    expect(turma.serie).toBe('1EM')
    expect(idadeTipicaDaSerie(turma.serie)).toBe(15)
  })

  it('recusa série que os consumidores não sabem ler', async () => {
    await expect(
      criarTurma(COORDENACAO, { ...TURMA_5A, serie: 'Maternal' }, deps),
    ).rejects.toBeInstanceOf(SerieInvalidaError)
  })

  it('recusa a série que parece certa mas não é', async () => {
    // "5º A" é o NOME da turma, não a série. Aceitá-lo como série é o
    // engano mais provável do formulário, e o mais silencioso.
    await expect(
      criarTurma(COORDENACAO, { ...TURMA_5A, serie: '5º A' }, deps),
    ).rejects.toBeInstanceOf(SerieInvalidaError)
  })

  it('normaliza o turno, com ou sem acento', async () => {
    // A coluna é texto livre e o relatório por turno agrupa por ela:
    // "Manhã", "manha" e "MANHA" viram três turnos num relatório que
    // deveria ter uma linha.
    const manha = await criarTurma(COORDENACAO, { ...TURMA_5A, turno: 'Manhã' }, deps)
    expect(manha.turno).toBe('MANHA')

    const tarde = await criarTurma(
      COORDENACAO,
      { ...TURMA_5A, nome: '5º B', turno: ' tarde ' },
      deps,
    )
    expect(tarde.turno).toBe('TARDE')
  })

  it('recusa turno inventado', async () => {
    await expect(
      criarTurma(COORDENACAO, { ...TURMA_5A, turno: 'VESPERTINO' }, deps),
    ).rejects.toBeInstanceOf(TurnoInvalidoError)
  })

  it('recusa nome vazio', async () => {
    await expect(
      criarTurma(COORDENACAO, { ...TURMA_5A, nome: '   ' }, deps),
    ).rejects.toBeInstanceOf(NomeDeTurmaObrigatorioError)
  })

  it('colapsa espaço do meio do nome', async () => {
    const turma = await criarTurma(COORDENACAO, { ...TURMA_5A, nome: '5º   A' }, deps)
    expect(turma.nome).toBe('5º A')
  })

  it('recusa turma homônima no mesmo ano letivo', async () => {
    await criarTurma(COORDENACAO, TURMA_5A, deps)

    const repetida = criarTurma(COORDENACAO, TURMA_5A, deps)
    await expect(repetida).rejects.toBeInstanceOf(TurmaJaExisteError)
    await expect(repetida).rejects.toThrow('5º A')
  })

  it('aceita o mesmo nome em ANO LETIVO diferente', async () => {
    // "5º A" existe todo ano. O índice único é por (escola, ano letivo,
    // nome) justamente por isso — travar por nome só impediria a escola
    // de abrir o ano seguinte.
    await criarTurma(COORDENACAO, TURMA_5A, deps)
    const novoAno = await criarAnoLetivo(
      COORDENACAO,
      { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' },
      deps,
    )

    const turma = await criarTurma(COORDENACAO, { ...TURMA_5A, anoLetivoId: novoAno.id }, deps)

    expect(turma.nome).toBe('5º A')
  })

  it('recusa ano letivo que não existe nesta escola', async () => {
    await expect(
      criarTurma(COORDENACAO, { ...TURMA_5A, anoLetivoId: 'anl_da_vizinha' }, deps),
    ).rejects.toBeInstanceOf(AnoLetivoInexistenteError)
  })

  it('recusa quem não tem turma:gerenciar', async () => {
    await expect(criarTurma(MONITOR, TURMA_5A, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('editarTurma', () => {
  it('muda a série sem tocar no resto', async () => {
    const turma = await criarTurma(COORDENACAO, TURMA_5A, deps)

    const editada = await editarTurma(COORDENACAO, turma.id, { serie: '6' }, deps)

    expect(editada.serie).toBe('6')
    expect(editada.nome).toBe('5º A')
    expect(editada.turno).toBe('MANHA')
  })

  it('valida a série na edição também', async () => {
    // A validação na criação não protege nada se a edição aceitar
    // qualquer coisa depois.
    const turma = await criarTurma(COORDENACAO, TURMA_5A, deps)

    await expect(
      editarTurma(COORDENACAO, turma.id, { serie: 'EJA' }, deps),
    ).rejects.toBeInstanceOf(SerieInvalidaError)
  })

  it('aceita salvar a turma sem mudar o nome', async () => {
    // A tela manda o formulário inteiro. Sem excluir a própria turma da
    // checagem de homônimo, toda edição seria recusada.
    const turma = await criarTurma(COORDENACAO, TURMA_5A, deps)

    const editada = await editarTurma(
      COORDENACAO,
      turma.id,
      { nome: '5º A', serie: '5', turno: 'TARDE', anoLetivoId: 'anl_2026' },
      deps,
    )

    expect(editada.turno).toBe('TARDE')
  })

  it('recusa renomear para o nome de outra turma do mesmo ano', async () => {
    await criarTurma(COORDENACAO, TURMA_5A, deps)
    const b = await criarTurma(COORDENACAO, { ...TURMA_5A, nome: '5º B' }, deps)

    await expect(
      editarTurma(COORDENACAO, b.id, { nome: '5º A' }, deps),
    ).rejects.toBeInstanceOf(TurmaJaExisteError)
  })

  it('recusa mover para um ano letivo onde o nome já está tomado', async () => {
    // A colisão pode nascer da mudança de ANO, não do nome. Conferir
    // apenas quando o nome mudou deixaria esta passar — e o índice único
    // do banco recusaria depois, em inglês.
    const a2026 = await criarTurma(COORDENACAO, TURMA_5A, deps)
    const novoAno = await criarAnoLetivo(
      COORDENACAO,
      { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' },
      deps,
    )
    await criarTurma(COORDENACAO, { ...TURMA_5A, anoLetivoId: novoAno.id }, deps)

    await expect(
      editarTurma(COORDENACAO, a2026.id, { anoLetivoId: novoAno.id }, deps),
    ).rejects.toBeInstanceOf(TurmaJaExisteError)
  })

  it('recusa turma que não existe', async () => {
    await expect(
      editarTurma(COORDENACAO, 'tur_inexistente', { serie: '6' }, deps),
    ).rejects.toBeInstanceOf(TurmaInexistenteError)
  })

  it('recusa quem não tem turma:gerenciar', async () => {
    const turma = await criarTurma(COORDENACAO, TURMA_5A, deps)
    await expect(
      editarTurma(MONITOR, turma.id, { serie: '6' }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('listarTurmas', () => {
  it('traz o ano e a contagem de alunos ao lado de cada turma', async () => {
    const turma = await criarTurma(COORDENACAO, TURMA_5A, deps)
    deps.turmas.definirAlunos(turma.id, 27)

    const lista = await listarTurmas(COORDENACAO, {}, deps)

    expect(lista).toHaveLength(1)
    expect(lista[0]!.ano).toBe(2026)
    expect(lista[0]!.anoLetivoAtivo).toBe(true)
    // Contado, nunca digitado — é o mesmo princípio do estoque do acervo.
    expect(lista[0]!.alunos).toBe(27)
  })

  it('filtra por ano letivo', async () => {
    await criarTurma(COORDENACAO, TURMA_5A, deps)
    const novoAno = await criarAnoLetivo(
      COORDENACAO,
      { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' },
      deps,
    )
    await criarTurma(COORDENACAO, { ...TURMA_5A, nome: '6º A', anoLetivoId: novoAno.id }, deps)

    const lista = await listarTurmas(COORDENACAO, { anoLetivoId: novoAno.id }, deps)

    expect(lista.map((t) => t.nome)).toEqual(['6º A'])
  })

  it('o monitor com aluno:ver PODE listar', async () => {
    // A lista de turmas alimenta o formulário de aluno e o filtro da
    // lista. Exigir `turma:gerenciar` aqui deixaria o formulário sem
    // turma nenhuma para escolher.
    await criarTurma(COORDENACAO, TURMA_5A, deps)
    await expect(listarTurmas(MONITOR, {}, deps)).resolves.toHaveLength(1)
  })

  it('recusa quem não tem nem aluno:ver', async () => {
    const semNada: Principal = { ...MONITOR, permissoes: [] }
    await expect(listarTurmas(semNada, {}, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('obterTurma', () => {
  it('recusa turma que não existe', async () => {
    await expect(obterTurma(COORDENACAO, 'tur_x', deps)).rejects.toBeInstanceOf(
      TurmaInexistenteError,
    )
  })
})

describe('criarAnoLetivo', () => {
  it('cria o ano com o período informado', async () => {
    const ano = await criarAnoLetivo(
      COORDENACAO,
      { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' },
      deps,
    )

    expect(ano.ano).toBe(2027)
    expect(ano.dataInicio.toISOString().slice(0, 10)).toBe('2027-02-01')
    expect(ano.dataFim.toISOString().slice(0, 10)).toBe('2027-12-15')
    // Não ativo por omissão: criar o ano que vem em outubro não pode
    // trocar o ano corrente debaixo do balcão.
    expect(ano.ativo).toBe(false)
  })

  it('a data não desloca por causa de fuso', async () => {
    // `new Date('2027-02-01')` lido em São Paulo já nasce como 31 de
    // janeiro em horário local, e o início do ano letivo apareceria um
    // dia antes na tela da secretaria.
    const ano = await criarAnoLetivo(
      COORDENACAO,
      { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' },
      deps,
    )

    expect(ano.dataInicio.getUTCDate()).toBe(1)
    expect(ano.dataInicio.getUTCMonth()).toBe(1)
  })

  it('recusa ano letivo repetido dizendo qual', async () => {
    const repetido = criarAnoLetivo(
      COORDENACAO,
      { ano: 2026, dataInicio: '2026-02-01', dataFim: '2026-12-15' },
      deps,
    )

    await expect(repetido).rejects.toBeInstanceOf(AnoLetivoJaExisteError)
    await expect(repetido).rejects.toThrow('2026')
  })

  it('recusa término antes do início', async () => {
    await expect(
      criarAnoLetivo(
        COORDENACAO,
        { ano: 2027, dataInicio: '2027-12-15', dataFim: '2027-02-01' },
        deps,
      ),
    ).rejects.toBeInstanceOf(PeriodoInvalidoError)
  })

  it('recusa data que não existe no calendário', async () => {
    // `new Date('2027-02-31')` não estoura: devolve 3 de março. O ano
    // letivo passaria a começar num dia que ninguém digitou.
    await expect(
      criarAnoLetivo(
        COORDENACAO,
        { ano: 2027, dataInicio: '2027-02-31', dataFim: '2027-12-15' },
        deps,
      ),
    ).rejects.toBeInstanceOf(PeriodoInvalidoError)
  })

  it('recusa ano com um dígito sobrando', async () => {
    await expect(
      criarAnoLetivo(
        COORDENACAO,
        { ano: 20267, dataInicio: '2027-02-01', dataFim: '2027-12-15' },
        deps,
      ),
    ).rejects.toBeInstanceOf(PeriodoInvalidoError)
  })

  it('criar já ativo tira o ativo dos outros, na MESMA transação', async () => {
    const novo = await criarAnoLetivo(
      COORDENACAO,
      { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15', ativo: true },
      deps,
    )

    expect(novo.ativo).toBe(true)
    const ativos = deps.anosLetivos.todos().filter((a) => a.ativo)
    expect(ativos.map((a) => a.ano)).toEqual([2027])
    // Sem a transação, uma falha depois do `desativarTodos` deixaria a
    // escola SEM ano ativo nenhum — e a tela não teria ano para abrir.
    expect(transacao.estado.aberturas).toBe(1)
  })

  it('recusa quem não tem turma:gerenciar', async () => {
    await expect(
      criarAnoLetivo(
        MONITOR,
        { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' },
        deps,
      ),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('definirAnoLetivoAtivo', () => {
  it('deixa exatamente UM ano ativo', async () => {
    const novo = await criarAnoLetivo(
      COORDENACAO,
      { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' },
      deps,
    )

    await definirAnoLetivoAtivo(COORDENACAO, novo.id, deps)

    const ativos = deps.anosLetivos.todos().filter((a) => a.ativo)
    expect(ativos.map((a) => a.ano)).toEqual([2027])
  })

  it('troca o ativo dentro de UMA transação', async () => {
    // Duas escritas separadas têm um instante sem ano ativo e outro com
    // dois. A tela que abre nesse instante escolhe o ano errado, e nada
    // indica que escolheu.
    const novo = await criarAnoLetivo(
      COORDENACAO,
      { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' },
      deps,
    )
    const antes = transacao.estado.aberturas

    await definirAnoLetivoAtivo(COORDENACAO, novo.id, deps)

    expect(transacao.estado.aberturas).toBe(antes + 1)
  })

  it('ano inexistente NÃO apaga o ativo que já havia', async () => {
    // A checagem mora DENTRO da transação. Fora dela, um id torto faria
    // o `desativarTodos` rodar e a escola ficaria sem ano ativo por causa
    // de um clique que falhou.
    await expect(
      definirAnoLetivoAtivo(COORDENACAO, 'anl_inexistente', deps),
    ).rejects.toBeInstanceOf(AnoLetivoInexistenteError)

    const ativos = deps.anosLetivos.todos().filter((a) => a.ativo)
    expect(ativos.map((a) => a.ano)).toEqual([2026])
  })

  it('recusa quem não tem turma:gerenciar', async () => {
    await expect(
      definirAnoLetivoAtivo(MONITOR, 'anl_2026', deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('listarAnosLetivos', () => {
  it('lista do mais recente para o mais antigo', async () => {
    await criarAnoLetivo(
      COORDENACAO,
      { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' },
      deps,
    )

    const lista = await listarAnosLetivos(COORDENACAO, deps)

    expect(lista.map((a) => a.ano)).toEqual([2027, 2026])
  })

  it('o monitor com aluno:ver PODE listar', async () => {
    await expect(listarAnosLetivos(MONITOR, deps)).resolves.toHaveLength(1)
  })
})
