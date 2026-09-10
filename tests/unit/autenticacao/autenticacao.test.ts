import { describe, it, expect, vi, beforeEach } from 'vitest'
import { autenticarStaff, autenticarAluno } from '@/modules/autenticacao/autenticacao.service'
import { gerarHash } from '@/core/auth/senha'
import { CredenciaisInvalidasError } from '@/core/errors'
import { criarFakeDeUsuarios, criarFakeDeAlunos } from '../../apoio/fakes/usuarios.fake'

const ESCOLA = 'esc_1'
const IP = '10.0.0.1'

let deps: Parameters<typeof autenticarStaff>[1]
let usuarios: ReturnType<typeof criarFakeDeUsuarios>
let alunos: ReturnType<typeof criarFakeDeAlunos>

beforeEach(async () => {
  usuarios = criarFakeDeUsuarios()
  alunos = criarFakeDeAlunos()

  usuarios.semear({
    id: 'usr_1',
    escolaId: ESCOLA,
    nome: 'Coordenação',
    email: 'coord@escola.br',
    senhaHash: await gerarHash('SenhaForte#2026'),
    ativo: true,
    permissoes: ['obra:ver', 'emprestimo:criar'],
  })

  alunos.semear({
    id: 'alu_1',
    escolaId: ESCOLA,
    nome: 'Ana Souza',
    matricula: '2024001',
    dataNascimento: new Date('2012-03-15'),
    ativo: true,
  })

  deps = {
    usuarios,
    alunos,
    verificarBloqueio: vi.fn().mockResolvedValue(undefined),
    registrarTentativa: vi.fn().mockResolvedValue(undefined),
  }
})

describe('autenticarStaff', () => {
  it('devolve o principal com as permissões dos papéis', async () => {
    const principal = await autenticarStaff(
      { email: 'coord@escola.br', senha: 'SenhaForte#2026', escolaId: ESCOLA, ip: IP },
      deps,
    )

    expect(principal).toEqual({
      reino: 'STAFF',
      id: 'usr_1',
      escolaId: ESCOLA,
      nome: 'Coordenação',
      permissoes: ['obra:ver', 'emprestimo:criar'],
    })
  })

  it('normaliza o e-mail: maiúsculas e espaços não impedem entrar', async () => {
    const principal = await autenticarStaff(
      { email: '  COORD@Escola.BR ', senha: 'SenhaForte#2026', escolaId: ESCOLA, ip: IP },
      deps,
    )
    expect(principal.id).toBe('usr_1')
  })

  it('rejeita senha errada', async () => {
    await expect(
      autenticarStaff({ email: 'coord@escola.br', senha: 'errada', escolaId: ESCOLA, ip: IP }, deps),
    ).rejects.toBeInstanceOf(CredenciaisInvalidasError)
  })

  it('dá o mesmo erro para usuário inexistente e senha errada', async () => {
    const inexistente = await pegarErro(() =>
      autenticarStaff({ email: 'ninguem@escola.br', senha: 'x', escolaId: ESCOLA, ip: IP }, deps),
    )
    const senhaErrada = await pegarErro(() =>
      autenticarStaff({ email: 'coord@escola.br', senha: 'x', escolaId: ESCOLA, ip: IP }, deps),
    )

    // Mensagens distintas revelariam quais e-mails existem.
    expect(inexistente.message).toBe(senhaErrada.message)
  })

  it('rejeita usuário desativado', async () => {
    usuarios.desativar('usr_1')

    await expect(
      autenticarStaff({ email: 'coord@escola.br', senha: 'SenhaForte#2026', escolaId: ESCOLA, ip: IP }, deps),
    ).rejects.toBeInstanceOf(CredenciaisInvalidasError)
  })

  it('checa o bloqueio ANTES de verificar a senha', async () => {
    const ordem: string[] = []
    deps.verificarBloqueio = vi.fn(async () => {
      ordem.push('bloqueio')
    })
    usuarios.aoBuscar(() => ordem.push('busca'))

    await autenticarStaff({ email: 'coord@escola.br', senha: 'SenhaForte#2026', escolaId: ESCOLA, ip: IP }, deps)

    expect(ordem).toEqual(['bloqueio', 'busca'])
  })

  it('registra a tentativa falha', async () => {
    await pegarErro(() =>
      autenticarStaff({ email: 'coord@escola.br', senha: 'errada', escolaId: ESCOLA, ip: IP }, deps),
    )

    expect(deps.registrarTentativa).toHaveBeenCalledWith(
      expect.objectContaining({ identificador: 'coord@escola.br', reino: 'STAFF', sucesso: false }),
    )
  })
})

describe('autenticarAluno', () => {
  it('devolve o principal quando matrícula e nascimento batem', async () => {
    const principal = await autenticarAluno(
      { matricula: '2024001', dataNascimento: '2012-03-15', escolaId: ESCOLA, ip: IP },
      deps,
    )

    expect(principal).toEqual({
      reino: 'ALUNO',
      id: 'alu_1',
      escolaId: ESCOLA,
      nome: 'Ana Souza',
      matricula: '2024001',
    })
  })

  it('rejeita data de nascimento errada', async () => {
    await expect(
      autenticarAluno({ matricula: '2024001', dataNascimento: '2012-03-16', escolaId: ESCOLA, ip: IP }, deps),
    ).rejects.toBeInstanceOf(CredenciaisInvalidasError)
  })

  it('rejeita aluno desativado', async () => {
    alunos.desativar('alu_1')

    await expect(
      autenticarAluno({ matricula: '2024001', dataNascimento: '2012-03-15', escolaId: ESCOLA, ip: IP }, deps),
    ).rejects.toBeInstanceOf(CredenciaisInvalidasError)
  })

  it('o principal do aluno NÃO carrega permissões de staff', async () => {
    const principal = await autenticarAluno(
      { matricula: '2024001', dataNascimento: '2012-03-15', escolaId: ESCOLA, ip: IP },
      deps,
    )

    expect(principal).not.toHaveProperty('permissoes')
  })
})

async function pegarErro(fn: () => Promise<unknown>): Promise<Error> {
  try {
    await fn()
    throw new Error('deveria ter lançado')
  } catch (erro) {
    return erro as Error
  }
}
