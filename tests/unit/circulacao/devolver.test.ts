import { describe, it, expect, beforeEach } from 'vitest'
import { devolver, SemEmprestimoAtivoError } from '@/modules/circulacao/devolver.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import { criarFakeDeDevolucao } from '../../apoio/fakes/devolucao.fake'

const BALCAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Monitor do balcão',
  permissoes: ['emprestimo:devolver'],
}

const SEM_NADA: Principal = {
  reino: 'STAFF',
  id: 'usr_3',
  escolaId: 'esc_1',
  nome: 'Visitante',
  permissoes: ['obra:ver'],
}

// Quinta-feira. O empréstimo do fake vence hoje, então o caso base é uma
// devolução em dia.
const HOJE = new Date('2026-09-24T12:00:00-03:00')

let deps: ReturnType<typeof criarFakeDeDevolucao>

beforeEach(() => {
  deps = criarFakeDeDevolucao()
})

const ENTREGA = { tombo: '000001', hoje: HOJE, estado: 'BOM' as const }

describe('devolver', () => {
  it('registra o estado de conservação informado', async () => {
    await devolver(BALCAO, { ...ENTREGA, estado: 'DESGASTADO' }, deps)

    expect(deps.devolucoesGravadas()[0]).toMatchObject({
      emprestimoId: 'emp_1',
      estado: 'DESGASTADO',
      operadorDevolucaoId: 'usr_1',
    })
    // O estado observado também vale para o exemplar: guardado só no
    // empréstimo, o acervo continuaria dizendo BOM para sempre e o
    // inventário nunca veria o desgaste.
    expect(deps.exemplar('exe_000001')?.estado).toBe('DESGASTADO')
  })

  it('registra a observação da operadora', async () => {
    await devolver(BALCAO, { ...ENTREGA, observacao: '  capa solta  ' }, deps)

    expect(deps.devolucoesGravadas()[0]?.observacao).toBe('capa solta')
  })

  it('sem observação, grava null em vez de string vazia', async () => {
    await devolver(BALCAO, ENTREGA, deps)

    expect(deps.devolucoesGravadas()[0]?.observacao).toBeNull()
  })

  it('sem fila, o exemplar volta para DISPONIVEL', async () => {
    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(deps.exemplar('exe_000001')?.situacao).toBe('DISPONIVEL')
    expect(resultado.situacaoDoExemplar).toBe('DISPONIVEL')
    expect(resultado.reservaSeparada).toBeNull()
  })

  it('devolver no dia previsto não é atraso e não suspende', async () => {
    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(resultado.diasDeAtraso).toBe(0)
    expect(resultado.suspensaoAplicada).toBeNull()
    expect(deps.suspensoesGravadas()).toHaveLength(0)
  })

  it('recusa sem a permissão emprestimo:devolver', async () => {
    await expect(devolver(SEM_NADA, ENTREGA, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('recusa tombo que não está emprestado', async () => {
    await expect(
      devolver(BALCAO, { ...ENTREGA, tombo: '999999' }, deps),
    ).rejects.toBeInstanceOf(SemEmprestimoAtivoError)
  })

  it('devolver duas vezes o mesmo empréstimo é recusado', async () => {
    await devolver(BALCAO, ENTREGA, deps)

    await expect(devolver(BALCAO, ENTREGA, deps)).rejects.toBeInstanceOf(SemEmprestimoAtivoError)
    expect(deps.devolucoesGravadas()).toHaveLength(1)
  })
})

describe('devolver com atraso', () => {
  beforeEach(() => {
    // Vencia segunda 21/09, chega quinta 24/09: três dias.
    deps.definirPrevistaPara('2026-09-21')
  })

  it('aplica suspensão quando houve atraso', async () => {
    deps.definirConfiguracao({ diasDeSuspensaoPorDiaDeAtraso: 2 })

    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(resultado.diasDeAtraso).toBe(3)
    expect(resultado.suspensaoAplicada?.dias).toBe(6)
    expect(deps.suspensoesGravadas()[0]).toMatchObject({
      alunoId: 'alu_1',
      emprestimoOrigemId: 'emp_1',
    })
  })

  it('a suspensão termina no ÚLTIMO dia dela, inclusive', async () => {
    // Três dias de suspensão a partir de hoje são 24, 25 e 26 — não 27.
    // Errar aqui é dar um dia a mais de castigo do que a regra prometeu.
    deps.definirConfiguracao({ diasDeSuspensaoPorDiaDeAtraso: 1 })

    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(resultado.suspensaoAplicada?.ate.toISOString().slice(0, 10)).toBe('2026-09-26')
    expect(deps.suspensoesGravadas()[0]?.inicio.toISOString().slice(0, 10)).toBe('2026-09-24')
  })

  it('usa o fator da SÉRIE do leitor, não o da escola', async () => {
    deps.definirConfiguracao({ diasDeSuspensaoPorDiaDeAtraso: 1 })
    deps.definirSerieDoLeitor('2')
    deps.definirOverride({ serie: '2', diasDeSuspensaoPorDiaDeAtraso: 3 })

    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(resultado.suspensaoAplicada?.dias).toBe(9)
  })

  it('fator zero registra o atraso e não suspende', async () => {
    // É como a escola desliga a penalidade sem desligar o controle.
    deps.definirConfiguracao({ diasDeSuspensaoPorDiaDeAtraso: 0 })

    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(resultado.diasDeAtraso).toBe(3)
    expect(deps.suspensoesGravadas()).toHaveLength(0)
  })

  it('empréstimo da equipe não gera suspensão', async () => {
    // Penalidade é de aluno: não há a quem prender a suspensão de um
    // empréstimo do staff, e inventar um dono seria pior que não punir.
    deps.definirLeitorDaEquipe()

    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(resultado.diasDeAtraso).toBe(3)
    expect(deps.suspensoesGravadas()).toHaveLength(0)
  })

  it('a suspensão vai para a auditoria com quem a aplicou', async () => {
    // A tabela Penalidade não guarda operador. Sem a auditoria, ninguém
    // consegue dizer meses depois quem suspendeu o aluno.
    await devolver(BALCAO, ENTREGA, deps)

    expect(deps.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'penalidade.aplicar',
        entidade: 'Penalidade',
        dadosDepois: expect.objectContaining({ diasDeAtraso: 3 }),
      }),
    )
  })

  it('devolução em dia não gera auditoria', async () => {
    // Auditar o caminho normal encheria o log e esconderia a exceção.
    deps = criarFakeDeDevolucao()

    await devolver(BALCAO, ENTREGA, deps)

    expect(deps.registrarAuditoria).not.toHaveBeenCalled()
  })

  it('falha ao auditar não desfaz a devolução', async () => {
    // O livro já está de volta na estante. Recusar a devolução por causa
    // do registro dela seria pior que o registro faltando.
    deps.registrarAuditoria.mockRejectedValue(new Error('log fora do ar'))

    await expect(devolver(BALCAO, ENTREGA, deps)).resolves.toBeDefined()
  })
})

describe('devolver DANIFICADO', () => {
  it('não aplica penalidade automática', async () => {
    // Dano vira observação e decisão humana. Automatizar transformaria a
    // devolução num tribunal, e a operadora deixaria de registrar o
    // estado real para evitar o constrangimento — perdendo o dado.
    const resultado = await devolver(
      BALCAO,
      { ...ENTREGA, estado: 'DANIFICADO', observacao: 'páginas rasgadas' },
      deps,
    )

    expect(resultado.suspensaoAplicada).toBeNull()
    expect(deps.suspensoesGravadas()).toHaveLength(0)
    expect(deps.devolucoesGravadas()[0]?.observacao).toBe('páginas rasgadas')
  })

  it('DANIFICADO com atraso ainda gera a suspensão DO ATRASO', async () => {
    // A suspensão é pelo tempo em que o livro ficou fora da estante. O
    // dano não a cria nem a cancela.
    deps.definirPrevistaPara('2026-09-21')

    const resultado = await devolver(BALCAO, { ...ENTREGA, estado: 'DANIFICADO' }, deps)

    expect(resultado.suspensaoAplicada?.dias).toBe(3)
  })
})

describe('devolver com fila de reserva', () => {
  beforeEach(() => {
    deps.definirFila('obr_1', ['alu_2', 'alu_3'])
  })

  it('separa o exemplar para o PRÓXIMO da fila e marca RESERVADO', async () => {
    // É este passo que faz a fila de reserva funcionar de verdade
    // (spec §5.2): sem ele o livro volta para a estante e é levado por
    // quem passar na frente, enquanto quem esperou continua esperando.
    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(deps.separacoesGravadas()[0]).toMatchObject({
      reservaId: 'res_1',
      exemplarId: 'exe_000001',
    })
    expect(resultado.reservaSeparada?.alunoId).toBe('alu_2')
  })

  it('com fila, o exemplar NÃO volta para DISPONIVEL', async () => {
    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(deps.exemplar('exe_000001')?.situacao).toBe('RESERVADO')
    expect(resultado.situacaoDoExemplar).toBe('RESERVADO')
  })

  it('o prazo de retirada vem da configuração e pula dia fechado', async () => {
    // Prazo de 2 dias a partir de quinta 24/09 cairia no sábado 26. Um
    // prazo que vence com a escola fechada tira a vez de quem não tinha
    // como vir buscar.
    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(resultado.reservaSeparada?.retirarAte.toISOString().slice(0, 10)).toBe('2026-09-28')
  })

  it('o prazo de retirada respeita o dia não letivo da escola', async () => {
    deps.definirConfiguracao({ prazoDeRetiradaEmDias: 1 })
    deps.definirDiaNaoLetivo('2026-09-25')

    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(resultado.reservaSeparada?.retirarAte.toISOString().slice(0, 10)).toBe('2026-09-28')
  })

  it('a fila de OUTRA obra não separa este exemplar', async () => {
    deps = criarFakeDeDevolucao()
    deps.definirFila('obr_9', ['alu_2'])

    const resultado = await devolver(BALCAO, ENTREGA, deps)

    expect(resultado.reservaSeparada).toBeNull()
    expect(deps.exemplar('exe_000001')?.situacao).toBe('DISPONIVEL')
  })
})

describe('tudo numa transação', () => {
  it('devolução, exemplar, separação e penalidade acontecem DENTRO dela', async () => {
    // Penalidade gravada sem devolução registrada deixa um aluno suspenso
    // por um empréstimo que consta em aberto — e ninguém consegue
    // desfazer isso sem entender o que aconteceu.
    deps.definirPrevistaPara('2026-09-21')
    deps.definirFila('obr_1', ['alu_2'])

    await devolver(BALCAO, ENTREGA, deps)

    expect(deps.transacoesAbertas).toBe(1)
    expect(deps.devolucoesGravadas()[0]?.dentroDaTransacao).toBe(true)
    expect(deps.exemplarAtualizadoDentroDaTransacao()).toBe(true)
    expect(deps.separacoesGravadas()[0]?.dentroDaTransacao).toBe(true)
    expect(deps.suspensoesGravadas()[0]?.dentroDaTransacao).toBe(true)
  })

  it('a permissão é checada ANTES de abrir transação', async () => {
    await devolver(SEM_NADA, ENTREGA, deps).catch(() => undefined)

    expect(deps.transacoesAbertas).toBe(0)
  })
})
