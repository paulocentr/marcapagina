import { describe, it, expect, beforeEach } from 'vitest'
import {
  renovar,
  EmprestimoInexistenteError,
  EmprestimoJaDevolvidoError,
  MaximoDeRenovacoesError,
  ObraComFilaError,
} from '@/modules/circulacao/renovar.service'
import { BloqueiosDoLeitorError } from '@/modules/circulacao/emprestar.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import { criarFakeDeRenovacao } from '../../apoio/fakes/reservas.fake'

const BALCAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Monitor do balcão',
  permissoes: ['emprestimo:renovar'],
}

const SEM_NADA: Principal = {
  reino: 'STAFF',
  id: 'usr_3',
  escolaId: 'esc_1',
  nome: 'Visitante',
  permissoes: ['obra:ver'],
}

// Quinta-feira.
const HOJE = new Date('2026-09-10T12:00:00-03:00')
// Coluna @db.Date: meia-noite UTC, como o Prisma devolve.
const VENCE_EM_24 = new Date(Date.UTC(2026, 8, 24))

let deps: ReturnType<typeof criarFakeDeRenovacao>

beforeEach(() => {
  deps = criarFakeDeRenovacao()
  deps.inserirEmprestimo({
    id: 'emp_1',
    alunoId: 'alu_1',
    exemplarId: 'exe_1',
    obraId: 'obr_1',
    previstaPara: VENCE_EM_24,
  })
})

const PEDIDO = { emprestimoId: 'emp_1', hoje: HOJE }

describe('renovar', () => {
  it('empurra a data pela configuração da série', async () => {
    deps.definirSerieDoAluno('alu_1', '2')
    deps.definirOverride({ serie: '2', prazoEmDias: 7 })

    const renovado = await renovar(BALCAO, PEDIDO, deps)

    // 24/09 + 7 = 01/10, quinta.
    expect(renovado.previstaPara.toISOString().slice(0, 10)).toBe('2026-10-01')
  })

  it('renovar antes do vencimento SOMA sobre a data prevista', async () => {
    // Contar a partir de hoje puniria quem se organiza: renovar com duas
    // semanas de antecedência devolveria as mesmas duas semanas que já
    // estavam garantidas, e o leitor perderia o tempo que tinha.
    const renovado = await renovar(BALCAO, PEDIDO, deps)

    // Config padrão: 14 dias sobre 24/09 = 08/10, quinta.
    expect(renovado.previstaPara.toISOString().slice(0, 10)).toBe('2026-10-08')
  })

  it('renovar depois do vencimento conta a partir de HOJE', async () => {
    // Somar sobre uma data que já passou daria um prazo novo já vencido
    // — o empréstimo continuaria atrasado depois de renovado.
    deps.inserirEmprestimo({ id: 'emp_1', previstaPara: new Date(Date.UTC(2026, 8, 1)) })

    const renovado = await renovar(BALCAO, PEDIDO, deps)

    expect(renovado.previstaPara.toISOString().slice(0, 10)).toBe('2026-09-24')
  })

  it('a nova data pula dia não letivo', async () => {
    deps.definirDiaNaoLetivo('2026-10-08')

    const renovado = await renovar(BALCAO, PEDIDO, deps)

    expect(renovado.previstaPara.toISOString().slice(0, 10)).toBe('2026-10-09')
  })

  it('recusa quando há fila de reserva na obra', async () => {
    // Renovar com gente na fila é dar a vez de quem esperou a quem já leu.
    deps.inserirReserva({ obraId: 'obr_1', alunoId: 'alu_2', posicao: 1 })

    await expect(renovar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(ObraComFilaError)
    expect(deps.emprestimo('emp_1')?.previstaPara).toEqual(VENCE_EM_24)
    expect(deps.emprestimo('emp_1')?.renovacoes).toBe(0)
  })

  it('fila de OUTRA obra não impede renovar esta', async () => {
    deps.inserirReserva({ obraId: 'obr_2', alunoId: 'alu_2', posicao: 1 })

    await expect(renovar(BALCAO, PEDIDO, deps)).resolves.toBeDefined()
  })

  it('recusa quando o máximo de renovações foi atingido', async () => {
    deps.definirConfiguracao({ maximoDeRenovacoes: 2 })
    deps.inserirEmprestimo({ id: 'emp_1', previstaPara: VENCE_EM_24, renovacoes: 2 })

    await expect(renovar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(MaximoDeRenovacoesError)
  })

  it('conta a renovação, para o máximo valer', async () => {
    deps.definirConfiguracao({ maximoDeRenovacoes: 1 })

    const renovado = await renovar(BALCAO, PEDIDO, deps)
    expect(renovado.renovacoes).toBe(1)
    expect(deps.emprestimo('emp_1')?.renovacoes).toBe(1)

    await expect(renovar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(MaximoDeRenovacoesError)
  })

  it('máximo zero significa que a série não renova', async () => {
    // Zero é decisão legítima da coordenação, não campo por preencher.
    deps.definirSerieDoAluno('alu_1', '1')
    deps.definirOverride({ serie: '1', maximoDeRenovacoes: 0 })

    await expect(renovar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(MaximoDeRenovacoesError)
  })

  it('recusa renovar empréstimo já devolvido', async () => {
    deps.inserirEmprestimo({
      id: 'emp_1',
      previstaPara: VENCE_EM_24,
      devolvidaEm: new Date('2026-09-09T14:00:00Z'),
    })

    await expect(renovar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(EmprestimoJaDevolvidoError)
  })

  it('recusa renovar quando o leitor está suspenso', async () => {
    deps.definirSuspensao('alu_1', new Date(Date.UTC(2026, 8, 20)))

    await expect(renovar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(BloqueiosDoLeitorError)
    expect(deps.emprestimo('emp_1')?.renovacoes).toBe(0)
  })

  it('a suspensão VENCIDA não impede renovar', async () => {
    deps.definirSuspensao('alu_1', new Date(Date.UTC(2026, 8, 1)))

    await expect(renovar(BALCAO, PEDIDO, deps)).resolves.toBeDefined()
  })

  it('recusa renovar para leitor desativado', async () => {
    deps.desativarLeitor('alu_1')

    await expect(renovar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(BloqueiosDoLeitorError)
  })

  it('estar no limite de livros NÃO impede renovar o que já está em mãos', async () => {
    // O limite existe para não deixar o aluno LEVAR mais um. Renovar não
    // leva mais nada; recusar por isso obrigaria a devolver e pegar de
    // novo o mesmo livro no mesmo balcão.
    deps.definirConfiguracao({ limiteSimultaneo: 1 })

    await expect(renovar(BALCAO, PEDIDO, deps)).resolves.toBeDefined()
  })

  it('empréstimo da equipe, sem aluno, renova pela configuração da escola', async () => {
    deps.inserirEmprestimo({ id: 'emp_1', alunoId: null, previstaPara: VENCE_EM_24 })

    const renovado = await renovar(BALCAO, PEDIDO, deps)

    expect(renovado.previstaPara.toISOString().slice(0, 10)).toBe('2026-10-08')
  })

  it('recusa empréstimo que não existe', async () => {
    await expect(
      renovar(BALCAO, { ...PEDIDO, emprestimoId: 'emp_999' }, deps),
    ).rejects.toBeInstanceOf(EmprestimoInexistenteError)
  })

  it('recusa sem a permissão emprestimo:renovar', async () => {
    await expect(renovar(SEM_NADA, PEDIDO, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('devolução no meio do caminho derruba a renovação', async () => {
    // O balcão recebe o livro enquanto o aluno renova pelo portal. A
    // escrita só acerta empréstimo em aberto; zero linhas significa que
    // ele voltou para a estante, e renovar assim o deixaria emprestado
    // para sempre.
    deps.inserirEmprestimo({ id: 'emp_1', previstaPara: VENCE_EM_24 })
    const original = deps.emprestimosEmCurso.obter
    deps.emprestimosEmCurso.obter = async (id: string) => {
      const emprestimo = await original(id)
      // Devolvido DEPOIS da leitura que o serviço acabou de fazer.
      deps.inserirEmprestimo({
        id: 'emp_1',
        previstaPara: VENCE_EM_24,
        devolvidaEm: new Date('2026-09-10T10:00:00Z'),
      })
      return emprestimo
    }

    await expect(renovar(BALCAO, PEDIDO, deps)).rejects.toBeInstanceOf(EmprestimoJaDevolvidoError)
  })
})
