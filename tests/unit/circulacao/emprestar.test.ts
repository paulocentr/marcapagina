import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  emprestar,
  BloqueiosDoLeitorError,
  JustificativaObrigatoriaError,
  ExemplarIndisponivelError,
  ExemplarReservadoParaOutroError,
  LeitorInexistenteError,
} from '@/modules/circulacao/emprestar.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import { criarFakeDeCirculacao } from '../../apoio/fakes/circulacao.fake'

const BALCAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Monitor do balcão',
  permissoes: ['emprestimo:criar'],
}

const COORDENACAO: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: ['emprestimo:criar', 'emprestimo:forcar'],
}

const SEM_NADA: Principal = {
  reino: 'STAFF',
  id: 'usr_3',
  escolaId: 'esc_1',
  nome: 'Visitante',
  permissoes: ['obra:ver'],
}

const HOJE = new Date('2026-09-10T12:00:00-03:00')

let deps: ReturnType<typeof criarFakeDeCirculacao>

beforeEach(() => {
  deps = criarFakeDeCirculacao()
})

const PEDIDO = { alunoId: 'alu_1', tombo: '000001', hoje: HOJE }

describe('emprestar', () => {
  it('empresta e devolve a data prevista calculada', async () => {
    const emprestimo = await emprestar(BALCAO, PEDIDO, deps)

    // Config da escola: 14 dias. Quinta 10/09 + 14 = quinta 24/09.
    expect(emprestimo.previstaPara.toISOString().slice(0, 10)).toBe('2026-09-24')
  })

  it('usa a configuração da SÉRIE do aluno, não a da escola', async () => {
    // É o override que faz o 2º ano levar por 7 dias e o 9º por 21.
    deps.definirSerieDoAluno('alu_1', '2')
    deps.definirOverride({ serie: '2', prazoEmDias: 7 })

    const emprestimo = await emprestar(BALCAO, PEDIDO, deps)

    expect(emprestimo.previstaPara.toISOString().slice(0, 10)).toBe('2026-09-17')
  })

  it('a data prevista pula dia não letivo', async () => {
    deps.definirDiaNaoLetivo('2026-09-24')

    const emprestimo = await emprestar(BALCAO, PEDIDO, deps)

    expect(emprestimo.previstaPara.toISOString().slice(0, 10)).toBe('2026-09-25')
  })

  it('marca o exemplar como EMPRESTADO na MESMA transação', async () => {
    // Empréstimo gravado com o exemplar ainda DISPONIVEL faz o mesmo
    // livro ser emprestado duas vezes.
    await emprestar(BALCAO, PEDIDO, deps)

    expect(deps.situacaoDoExemplar('000001')).toBe('EMPRESTADO')
    expect(deps.transacoesAbertas).toBe(1)
    // O que importa não é o estado final — é ter acontecido DENTRO da
    // transação. Marcar depois do commit deixaria uma janela em que o
    // empréstimo existe e o exemplar ainda consta disponível.
    expect(deps.marcouExemplarDentroDaTransacao()).toBe(true)
  })

  it('recusa exemplar que não está disponível', async () => {
    deps.definirSituacaoDoExemplar('000001', 'EM_MANUTENCAO')

    await expect(emprestar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(ExemplarIndisponivelError)
  })

  it('recusa tombo que não existe', async () => {
    await expect(
      emprestar(BALCAO, { ...PEDIDO, tombo: '999999' }, deps),
    ).rejects.toBeInstanceOf(ExemplarIndisponivelError)
  })

  it('recusa leitor que não existe', async () => {
    await expect(
      emprestar(BALCAO, { ...PEDIDO, alunoId: 'nao_existe' }, deps),
    ).rejects.toBeInstanceOf(LeitorInexistenteError)
  })

  it('recusa sem permissão emprestimo:criar', async () => {
    await expect(emprestar(SEM_NADA, PEDIDO, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('emprestar com bloqueio', () => {
  beforeEach(() => {
    deps.definirSuspensao('alu_1', new Date('2026-09-20T00:00:00.000Z'))
  })

  it('recusa quando há bloqueio e não veio liberação forçada', async () => {
    await expect(emprestar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(BloqueiosDoLeitorError)
  })

  it('o erro carrega TODOS os bloqueios, para a tela mostrar de uma vez', async () => {
    deps.definirAtivosDoAluno('alu_1', 3)

    const erro = await emprestar(BALCAO, PEDIDO, deps).catch((e: unknown) => e)

    expect((erro as BloqueiosDoLeitorError).bloqueios.map((b) => b.tipo).sort()).toEqual([
      'NO_LIMITE',
      'SUSPENSO',
    ])
  })

  it('nada é gravado quando o bloqueio recusa', async () => {
    await emprestar(BALCAO, PEDIDO, deps).catch(() => undefined)

    expect(deps.emprestimosGravados()).toHaveLength(0)
    expect(deps.situacaoDoExemplar('000001')).toBe('DISPONIVEL')
  })

  it('liberação forçada SEM justificativa é recusada', async () => {
    await expect(
      emprestar(COORDENACAO, { ...PEDIDO, liberacaoForcada: true, justificativa: '   ' }, deps),
    ).rejects.toBeInstanceOf(JustificativaObrigatoriaError)
  })

  it('liberação forçada exige a permissão emprestimo:forcar', async () => {
    await expect(
      emprestar(BALCAO, { ...PEDIDO, liberacaoForcada: true, justificativa: 'a diretora liberou' }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('liberação forçada com justificativa empresta', async () => {
    const emprestimo = await emprestar(
      COORDENACAO,
      { ...PEDIDO, liberacaoForcada: true, justificativa: 'trabalho de escola, liberado pela coordenação' },
      deps,
    )

    expect(emprestimo.liberacaoForcada).toBe(true)
  })

  it('liberação forçada GRAVA auditoria com a justificativa', async () => {
    // Global Constraint 18. Sem o registro, a exceção some e o relatório
    // de atrasados deixa de significar alguma coisa.
    await emprestar(
      COORDENACAO,
      { ...PEDIDO, liberacaoForcada: true, justificativa: 'trabalho de escola' },
      deps,
    )

    expect(deps.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'emprestimo.forcar',
        dadosDepois: expect.objectContaining({ justificativa: 'trabalho de escola' }),
      }),
    )
  })

  it('empréstimo SEM bloqueio não gera auditoria de liberação', async () => {
    // Auditar o caminho normal encheria o log de ruído e esconderia a
    // exceção, que é o que interessa.
    deps = criarFakeDeCirculacao()

    await emprestar(BALCAO, PEDIDO, deps)

    expect(deps.registrarAuditoria).not.toHaveBeenCalled()
  })

  it('liberação forçada SEM bloqueio nenhum não vira exceção registrada', async () => {
    deps = criarFakeDeCirculacao()

    await emprestar(
      COORDENACAO,
      { ...PEDIDO, liberacaoForcada: true, justificativa: 'por via das dúvidas' },
      deps,
    )

    expect(deps.registrarAuditoria).not.toHaveBeenCalled()
  })
})

describe('emprestar exemplar separado por reserva', () => {
  it('recusa emprestar exemplar RESERVADO para outro aluno', async () => {
    deps.definirSituacaoDoExemplar('000001', 'RESERVADO')
    deps.definirReservaSeparada('000001', 'alu_2')

    await expect(emprestar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(
      ExemplarReservadoParaOutroError,
    )
  })

  it('empresta para quem está na frente da fila e ATENDE a reserva', async () => {
    deps.definirSituacaoDoExemplar('000001', 'RESERVADO')
    deps.definirReservaSeparada('000001', 'alu_1')

    const emprestimo = await emprestar(BALCAO, PEDIDO, deps)

    expect(emprestimo.exemplarId).toBe('exe_000001')
    expect(deps.reservaAtendida()).toBe(true)
  })
})

describe('a auditoria não derruba o empréstimo', () => {
  it('falha ao auditar não desfaz a liberação forçada', async () => {
    // O livro já saiu com o aluno. Desfazer por causa do registro seria
    // pior que o registro faltando — e o serviço de auditoria já engole
    // o próprio erro por isso.
    deps.definirSuspensao('alu_1', new Date('2026-09-20T00:00:00.000Z'))
    deps.registrarAuditoria = vi.fn().mockRejectedValue(new Error('log fora do ar'))

    await expect(
      emprestar(COORDENACAO, { ...PEDIDO, liberacaoForcada: true, justificativa: 'x' }, deps),
    ).resolves.toBeDefined()
  })
})
