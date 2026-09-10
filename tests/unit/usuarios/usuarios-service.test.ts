import { describe, it, expect, beforeEach } from 'vitest'
import { SemPermissaoError } from '@/core/errors'
import { verificarSenha } from '@/core/auth/senha'
import {
  criarUsuario,
  definirPermissoesDoPapel,
  definirSituacaoDoUsuario,
  listarPapeisDaEscola,
  listarUsuariosDaEscola,
  trocarPapelDoUsuario,
  type DependenciasDeUsuarios,
} from '@/modules/usuarios/usuarios.service'
import {
  AutoDesativacaoError,
  EmailJaEmUsoError,
  PapelNaoAtribuivelError,
  PapelNaoEncontradoError,
  PermissaoNaoConcedivelError,
  SemAdministradorError,
  SenhaFracaError,
  UsuarioNaoEncontradoError,
} from '@/modules/usuarios/usuarios'
import { criarFakeDeGestaoDeUsuarios } from '../../apoio/fakes/gestao-de-usuarios.fake'
import type { EventoDeAuditoria } from '@/core/audit/audit.service'
import type { Principal } from '@/core/auth/principal'

/**
 * O serviço de gestão de contas, contra fake.
 *
 * O que este arquivo existe para provar, antes de qualquer outra coisa: a
 * coordenação NÃO consegue se trancar fora. Os três caminhos que levam ao
 * mesmo buraco — desativar, trocar de papel, editar a permissão do papel
 * — são recusados no SERVIÇO, com erro de domínio em pt-BR. Recusar na
 * tela não serviria: a Server Action é alcançável sem passar por ela.
 */

let repo: ReturnType<typeof criarFakeDeGestaoDeUsuarios>
let auditoria: EventoDeAuditoria[]
let deps: DependenciasDeUsuarios

const PERMISSOES_DA_COORDENACAO = [
  'usuario:gerenciar',
  'papel:gerenciar',
  'obra:ver',
] as const

const coordenacao: Principal = {
  reino: 'STAFF',
  id: 'usr_coord',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: [...PERMISSOES_DA_COORDENACAO],
}

const monitora: Principal = {
  reino: 'STAFF',
  id: 'usr_monitora',
  escolaId: 'esc_1',
  nome: 'Monitora',
  permissoes: ['emprestimo:criar'],
}

beforeEach(() => {
  repo = criarFakeDeGestaoDeUsuarios()
  auditoria = []

  deps = {
    gestaoDeUsuarios: repo,
    emTransacao: (fn) => fn(),
    async registrarAuditoria(evento) {
      auditoria.push(evento)
    },
  }

  repo.semearPapel({
    id: 'pap_coord',
    nome: 'COORDENACAO',
    descricao: 'Coordenação da biblioteca.',
    deSistema: true,
    permissoes: [...PERMISSOES_DA_COORDENACAO],
    quantidadeDeUsuarios: 1,
  })

  repo.semearPapel({
    id: 'pap_bib',
    nome: 'BIBLIOTECARIO',
    descricao: 'Balcão completo.',
    deSistema: true,
    permissoes: ['obra:ver', 'emprestimo:criar', 'emprestimo:devolver'],
    quantidadeDeUsuarios: 0,
  })

  repo.semearPapel({
    id: 'pap_super',
    nome: 'SUPER_ADMIN',
    descricao: 'Dono do sistema.',
    deSistema: true,
    permissoes: ['escola:gerenciar', 'usuario:gerenciar', 'papel:gerenciar'],
    quantidadeDeUsuarios: 0,
  })

  repo.semearUsuario({
    id: 'usr_coord',
    nome: 'Coordenação',
    email: 'coord@escola.br',
    ativo: true,
    criadoEm: new Date('2026-01-10T12:00:00Z'),
    papeis: [
      { id: 'pap_coord', nome: 'COORDENACAO', permissoes: [...PERMISSOES_DA_COORDENACAO] },
    ],
  })
})

describe('autorização', () => {
  it('quem não gerencia usuários não lista', async () => {
    await expect(listarUsuariosDaEscola(monitora, deps)).rejects.toThrow(SemPermissaoError)
  })

  it('quem não gerencia usuários não cria', async () => {
    await expect(
      criarUsuario(
        monitora,
        { nome: 'Bibliotecária', email: 'bib@escola.br', senha: 'SenhaLonga#1', papelId: 'pap_bib' },
        deps,
      ),
    ).rejects.toThrow(SemPermissaoError)
  })

  it('editar permissões de papel exige papel:gerenciar, não usuario:gerenciar', async () => {
    const soContas: Principal = { ...coordenacao, permissoes: ['usuario:gerenciar'] }

    await expect(
      definirPermissoesDoPapel(soContas, { papelId: 'pap_bib', permissoes: ['obra:ver'] }, deps),
    ).rejects.toThrow(SemPermissaoError)
  })

  it('quem gerencia papéis lê o catálogo mesmo sem gerenciar contas', async () => {
    // A tela de papéis precisa da lista; exigir usuario:gerenciar para LER
    // o catálogo recusaria quem tem exatamente a permissão de editá-lo.
    const soPapeis: Principal = { ...coordenacao, permissoes: ['papel:gerenciar'] }

    await expect(listarPapeisDaEscola(soPapeis, deps)).resolves.toHaveLength(3)
  })
})

describe('criar conta de equipe', () => {
  it('cria com o papel escolhido e devolve a conta pronta', async () => {
    const criado = await criarUsuario(
      coordenacao,
      {
        nome: 'Bibliotecária',
        email: 'bib@escola.br',
        senha: 'SenhaLonga#1',
        papelId: 'pap_bib',
      },
      deps,
    )

    expect(criado.nome).toBe('Bibliotecária')
    expect(criado.ativo).toBe(true)
    expect(criado.papeis.map((p) => p.nome)).toEqual(['BIBLIOTECARIO'])
    expect(criado.permissoes).toContain('emprestimo:criar')
  })

  it('grava a senha por Argon2, nunca em claro', async () => {
    const criado = await criarUsuario(
      coordenacao,
      { nome: 'Bibliotecária', email: 'bib@escola.br', senha: 'SenhaLonga#1', papelId: 'pap_bib' },
      deps,
    )

    const hash = repo.hashDe(criado.id)
    expect(hash).toBeDefined()
    expect(hash).not.toBe('SenhaLonga#1')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(await verificarSenha('SenhaLonga#1', hash!)).toBe(true)
  })

  it('NUNCA devolve senhaHash para a tela', async () => {
    // O backup exclui esse campo de propósito. A gestão de contas é o
    // único lugar do sistema que o escreve, e é daqui que ele escaparia.
    const criado = await criarUsuario(
      coordenacao,
      { nome: 'Bibliotecária', email: 'bib@escola.br', senha: 'SenhaLonga#1', papelId: 'pap_bib' },
      deps,
    )

    expect(Object.keys(criado)).not.toContain('senhaHash')
    for (const usuario of await listarUsuariosDaEscola(coordenacao, deps)) {
      expect(Object.keys(usuario)).not.toContain('senhaHash')
    }
  })

  it('normaliza o e-mail: espaço em volta e caixa alta não criam conta gêmea', async () => {
    await criarUsuario(
      coordenacao,
      { nome: 'Bibliotecária', email: '  BIB@Escola.BR ', senha: 'SenhaLonga#1', papelId: 'pap_bib' },
      deps,
    )

    const lista = await listarUsuariosDaEscola(coordenacao, deps)
    expect(lista.map((u) => u.email)).toContain('bib@escola.br')
  })

  it('recusa e-mail já em uso na escola', async () => {
    await expect(
      criarUsuario(
        coordenacao,
        { nome: 'Outra', email: 'COORD@escola.br', senha: 'SenhaLonga#1', papelId: 'pap_bib' },
        deps,
      ),
    ).rejects.toThrow(EmailJaEmUsoError)
  })

  it('recusa senha curta', async () => {
    await expect(
      criarUsuario(
        coordenacao,
        { nome: 'Bibliotecária', email: 'bib@escola.br', senha: 'curta', papelId: 'pap_bib' },
        deps,
      ),
    ).rejects.toThrow(SenhaFracaError)
  })

  it('recusa nome vazio', async () => {
    await expect(
      criarUsuario(
        coordenacao,
        { nome: '   ', email: 'bib@escola.br', senha: 'SenhaLonga#1', papelId: 'pap_bib' },
        deps,
      ),
    ).rejects.toThrow(/nome/i)
  })

  it('recusa papel inexistente', async () => {
    await expect(
      criarUsuario(
        coordenacao,
        { nome: 'X', email: 'x@escola.br', senha: 'SenhaLonga#1', papelId: 'pap_nada' },
        deps,
      ),
    ).rejects.toThrow(PapelNaoEncontradoError)
  })

  it('NÃO cria SUPER_ADMIN a partir de uma tela de escola', async () => {
    // SUPER_ADMIN não pertence a escola nenhuma e carrega escola:gerenciar.
    // Criá-lo aqui atravessaria o isolamento entre escolas.
    await expect(
      criarUsuario(
        coordenacao,
        { nome: 'Dono', email: 'dono@escola.br', senha: 'SenhaLonga#1', papelId: 'pap_super' },
        deps,
      ),
    ).rejects.toThrow(PapelNaoAtribuivelError)
  })

  it('audita quem criou quem, sem a senha', async () => {
    const criado = await criarUsuario(
      coordenacao,
      { nome: 'Bibliotecária', email: 'bib@escola.br', senha: 'SenhaLonga#1', papelId: 'pap_bib' },
      deps,
    )

    expect(auditoria).toHaveLength(1)
    const evento = auditoria[0]!
    expect(evento.acao).toBe('usuario.criar')
    expect(evento.entidade).toBe('Usuario')
    expect(evento.entidadeId).toBe(criado.id)
    expect(evento.autor).toBe(coordenacao)

    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain('SenhaLonga#1')
    expect(serializado).not.toContain('senhaHash')
    expect(serializado).not.toContain('argon2')
  })
})

describe('desativar e reativar', () => {
  beforeEach(() => {
    repo.semearUsuario({
      id: 'usr_bib',
      nome: 'Bibliotecária',
      email: 'bib@escola.br',
      ativo: true,
      criadoEm: new Date('2026-02-01T12:00:00Z'),
      papeis: [{ id: 'pap_bib', nome: 'BIBLIOTECARIO', permissoes: ['emprestimo:criar'] }],
    })
  })

  it('desativa e a lista passa a dizer inativo', async () => {
    await definirSituacaoDoUsuario(coordenacao, { usuarioId: 'usr_bib', ativo: false }, deps)

    const lista = await listarUsuariosDaEscola(coordenacao, deps)
    expect(lista.find((u) => u.id === 'usr_bib')?.ativo).toBe(false)
  })

  it('reativa', async () => {
    await definirSituacaoDoUsuario(coordenacao, { usuarioId: 'usr_bib', ativo: false }, deps)
    await definirSituacaoDoUsuario(coordenacao, { usuarioId: 'usr_bib', ativo: true }, deps)

    const lista = await listarUsuariosDaEscola(coordenacao, deps)
    expect(lista.find((u) => u.id === 'usr_bib')?.ativo).toBe(true)
  })

  it('recusa usuário inexistente', async () => {
    await expect(
      definirSituacaoDoUsuario(coordenacao, { usuarioId: 'usr_nada', ativo: false }, deps),
    ).rejects.toThrow(UsuarioNaoEncontradoError)
  })

  it('audita desativação e reativação com ações distintas', async () => {
    await definirSituacaoDoUsuario(coordenacao, { usuarioId: 'usr_bib', ativo: false }, deps)
    await definirSituacaoDoUsuario(coordenacao, { usuarioId: 'usr_bib', ativo: true }, deps)

    expect(auditoria.map((e) => e.acao)).toEqual(['usuario.desativar', 'usuario.reativar'])
    expect(auditoria[0]!.entidadeId).toBe('usr_bib')
  })

  it('NÃO desativa a própria conta', async () => {
    // Mesmo com outro administrador ativo: desativar-se derruba o próprio
    // acesso no meio do trabalho, e quem consertaria é justamente quem
    // acabou de perder a entrada.
    repo.semearUsuario({
      id: 'usr_coord2',
      nome: 'Coordenação 2',
      email: 'coord2@escola.br',
      ativo: true,
      criadoEm: new Date('2026-02-01T12:00:00Z'),
      papeis: [
        { id: 'pap_coord', nome: 'COORDENACAO', permissoes: [...PERMISSOES_DA_COORDENACAO] },
      ],
    })

    await expect(
      definirSituacaoDoUsuario(coordenacao, { usuarioId: 'usr_coord', ativo: false }, deps),
    ).rejects.toThrow(AutoDesativacaoError)

    const lista = await listarUsuariosDaEscola(coordenacao, deps)
    expect(lista.find((u) => u.id === 'usr_coord')?.ativo).toBe(true)
  })

  it('NÃO desativa o último administrador, mesmo sendo outra pessoa', async () => {
    // A coordenação tem duas contas e usa a segunda para desativar a
    // primeira; a segunda não administra nada. Sem esta trava, a escola
    // ficaria sem quem crie conta e sem caminho de volta pela tela.
    const outra: Principal = {
      reino: 'STAFF',
      id: 'usr_bib',
      escolaId: 'esc_1',
      nome: 'Bibliotecária',
      permissoes: ['usuario:gerenciar'],
    }

    await expect(
      definirSituacaoDoUsuario(outra, { usuarioId: 'usr_coord', ativo: false }, deps),
    ).rejects.toThrow(SemAdministradorError)

    const lista = await listarUsuariosDaEscola(coordenacao, deps)
    expect(lista.find((u) => u.id === 'usr_coord')?.ativo).toBe(true)
  })

  it('com DOIS administradores ativos, desativar um é permitido', async () => {
    repo.semearUsuario({
      id: 'usr_coord2',
      nome: 'Coordenação 2',
      email: 'coord2@escola.br',
      ativo: true,
      criadoEm: new Date('2026-02-01T12:00:00Z'),
      papeis: [
        { id: 'pap_coord', nome: 'COORDENACAO', permissoes: [...PERMISSOES_DA_COORDENACAO] },
      ],
    })

    await definirSituacaoDoUsuario(coordenacao, { usuarioId: 'usr_coord2', ativo: false }, deps)

    const lista = await listarUsuariosDaEscola(coordenacao, deps)
    expect(lista.find((u) => u.id === 'usr_coord2')?.ativo).toBe(false)
  })
})

describe('trocar papel', () => {
  it('troca o papel e as permissões do usuário mudam com ele', async () => {
    repo.semearUsuario({
      id: 'usr_bib',
      nome: 'Bibliotecária',
      email: 'bib@escola.br',
      ativo: true,
      criadoEm: new Date('2026-02-01T12:00:00Z'),
      papeis: [{ id: 'pap_bib', nome: 'BIBLIOTECARIO', permissoes: ['emprestimo:criar'] }],
    })

    await trocarPapelDoUsuario(coordenacao, { usuarioId: 'usr_bib', papelId: 'pap_coord' }, deps)

    const lista = await listarUsuariosDaEscola(coordenacao, deps)
    const alvo = lista.find((u) => u.id === 'usr_bib')!
    expect(alvo.papeis.map((p) => p.nome)).toEqual(['COORDENACAO'])
    expect(alvo.permissoes).toContain('usuario:gerenciar')
  })

  it('NÃO deixa o último administrador se rebaixar', async () => {
    // O caminho mais fácil de se trancar fora: a coordenação se dá o papel
    // de MONITOR "para testar a tela do balcão".
    await expect(
      trocarPapelDoUsuario(coordenacao, { usuarioId: 'usr_coord', papelId: 'pap_bib' }, deps),
    ).rejects.toThrow(SemAdministradorError)

    const lista = await listarUsuariosDaEscola(coordenacao, deps)
    expect(lista.find((u) => u.id === 'usr_coord')?.papeis.map((p) => p.nome)).toEqual([
      'COORDENACAO',
    ])
  })

  it('NÃO atribui SUPER_ADMIN', async () => {
    repo.semearUsuario({
      id: 'usr_bib',
      nome: 'Bibliotecária',
      email: 'bib@escola.br',
      ativo: true,
      criadoEm: new Date('2026-02-01T12:00:00Z'),
      papeis: [{ id: 'pap_bib', nome: 'BIBLIOTECARIO', permissoes: ['emprestimo:criar'] }],
    })

    await expect(
      trocarPapelDoUsuario(coordenacao, { usuarioId: 'usr_bib', papelId: 'pap_super' }, deps),
    ).rejects.toThrow(PapelNaoAtribuivelError)
  })

  it('audita a troca dizendo de onde para onde', async () => {
    repo.semearUsuario({
      id: 'usr_bib',
      nome: 'Bibliotecária',
      email: 'bib@escola.br',
      ativo: true,
      criadoEm: new Date('2026-02-01T12:00:00Z'),
      papeis: [{ id: 'pap_bib', nome: 'BIBLIOTECARIO', permissoes: ['emprestimo:criar'] }],
    })

    await trocarPapelDoUsuario(coordenacao, { usuarioId: 'usr_bib', papelId: 'pap_coord' }, deps)

    expect(auditoria).toHaveLength(1)
    expect(auditoria[0]!.acao).toBe('usuario.trocar-papel')
    expect(auditoria[0]!.dadosAntes).toEqual({ papeis: ['BIBLIOTECARIO'] })
    expect(auditoria[0]!.dadosDepois).toEqual({ papeis: ['COORDENACAO'] })
  })
})

describe('editar permissões de um papel', () => {
  it('grava as permissões novas', async () => {
    await definirPermissoesDoPapel(
      coordenacao,
      { papelId: 'pap_bib', permissoes: ['obra:ver', 'inventario:executar'] },
      deps,
    )

    const papeis = await listarPapeisDaEscola(coordenacao, deps)
    expect(papeis.find((p) => p.id === 'pap_bib')?.permissoes).toEqual([
      'obra:ver',
      'inventario:executar',
    ])
  })

  it('recusa permissão que não existe no catálogo', async () => {
    await expect(
      definirPermissoesDoPapel(
        coordenacao,
        { papelId: 'pap_bib', permissoes: ['obra:ver', 'inventar:coisa'] },
        deps,
      ),
    ).rejects.toThrow(PermissaoNaoConcedivelError)
  })

  it('recusa conceder escola:gerenciar', async () => {
    await expect(
      definirPermissoesDoPapel(
        coordenacao,
        { papelId: 'pap_bib', permissoes: ['escola:gerenciar'] },
        deps,
      ),
    ).rejects.toThrow(PermissaoNaoConcedivelError)
  })

  it('NÃO edita o papel SUPER_ADMIN', async () => {
    await expect(
      definirPermissoesDoPapel(
        coordenacao,
        { papelId: 'pap_super', permissoes: ['obra:ver'] },
        deps,
      ),
    ).rejects.toThrow(PapelNaoAtribuivelError)
  })

  it('recusa papel inexistente', async () => {
    await expect(
      definirPermissoesDoPapel(coordenacao, { papelId: 'pap_nada', permissoes: [] }, deps),
    ).rejects.toThrow(PapelNaoEncontradoError)
  })

  it('NÃO tira usuario:gerenciar do papel do último administrador', async () => {
    // O terceiro caminho para o mesmo buraco, e o menos óbvio: ninguém é
    // desativado nem rebaixado — o PAPEL perde a permissão, e todo mundo
    // que o carrega a perde junto.
    await expect(
      definirPermissoesDoPapel(
        coordenacao,
        { papelId: 'pap_coord', permissoes: ['obra:ver', 'papel:gerenciar'] },
        deps,
      ),
    ).rejects.toThrow(SemAdministradorError)

    const papeis = await listarPapeisDaEscola(coordenacao, deps)
    expect(papeis.find((p) => p.id === 'pap_coord')?.permissoes).toContain('usuario:gerenciar')
  })

  it('NÃO tira papel:gerenciar do papel do último administrador', async () => {
    await expect(
      definirPermissoesDoPapel(
        coordenacao,
        { papelId: 'pap_coord', permissoes: ['obra:ver', 'usuario:gerenciar'] },
        deps,
      ),
    ).rejects.toThrow(SemAdministradorError)
  })

  it('editar papel que ninguém administrativo carrega é livre', async () => {
    await definirPermissoesDoPapel(coordenacao, { papelId: 'pap_bib', permissoes: [] }, deps)

    const papeis = await listarPapeisDaEscola(coordenacao, deps)
    expect(papeis.find((p) => p.id === 'pap_bib')?.permissoes).toEqual([])
  })

  it('com outro administrador ativo, tirar a permissão de um papel é permitido', async () => {
    repo.semearUsuario({
      id: 'usr_bib',
      nome: 'Bibliotecária',
      email: 'bib@escola.br',
      ativo: true,
      criadoEm: new Date('2026-02-01T12:00:00Z'),
      papeis: [
        { id: 'pap_bib', nome: 'BIBLIOTECARIO', permissoes: ['usuario:gerenciar', 'papel:gerenciar'] },
      ],
    })

    await definirPermissoesDoPapel(coordenacao, { papelId: 'pap_coord', permissoes: [] }, deps)

    const papeis = await listarPapeisDaEscola(coordenacao, deps)
    expect(papeis.find((p) => p.id === 'pap_coord')?.permissoes).toEqual([])
  })

  it('audita a edição dizendo o antes e o depois', async () => {
    await definirPermissoesDoPapel(
      coordenacao,
      { papelId: 'pap_bib', permissoes: ['obra:ver'] },
      deps,
    )

    expect(auditoria).toHaveLength(1)
    expect(auditoria[0]!.acao).toBe('papel.editar-permissoes')
    expect(auditoria[0]!.entidade).toBe('Papel')
    expect(auditoria[0]!.dadosAntes).toEqual({
      permissoes: ['obra:ver', 'emprestimo:criar', 'emprestimo:devolver'],
    })
    expect(auditoria[0]!.dadosDepois).toEqual({ permissoes: ['obra:ver'] })
  })
})

describe('a lista diz o que a tela precisa avisar antes do clique', () => {
  it('marca quem é o último administrador', async () => {
    repo.semearUsuario({
      id: 'usr_bib',
      nome: 'Bibliotecária',
      email: 'bib@escola.br',
      ativo: true,
      criadoEm: new Date('2026-02-01T12:00:00Z'),
      papeis: [{ id: 'pap_bib', nome: 'BIBLIOTECARIO', permissoes: ['emprestimo:criar'] }],
    })

    const lista = await listarUsuariosDaEscola(coordenacao, deps)

    // Derivado da MESMA função pura que o serviço usa para recusar: assim
    // o aviso da tela e a recusa do serviço não podem discordar.
    expect(lista.find((u) => u.id === 'usr_coord')?.unicoAdministrador).toBe(true)
    expect(lista.find((u) => u.id === 'usr_bib')?.unicoAdministrador).toBe(false)
  })

  it('com dois administradores, ninguém é o último', async () => {
    repo.semearUsuario({
      id: 'usr_coord2',
      nome: 'Coordenação 2',
      email: 'coord2@escola.br',
      ativo: true,
      criadoEm: new Date('2026-02-01T12:00:00Z'),
      papeis: [
        { id: 'pap_coord', nome: 'COORDENACAO', permissoes: [...PERMISSOES_DA_COORDENACAO] },
      ],
    })

    const lista = await listarUsuariosDaEscola(coordenacao, deps)
    expect(lista.every((u) => !u.unicoAdministrador)).toBe(true)
  })

  it('usuário já inativo não é marcado como último administrador', async () => {
    await repo.definirAtivo('usr_coord', false)

    const lista = await listarUsuariosDaEscola(coordenacao, deps)
    expect(lista.find((u) => u.id === 'usr_coord')?.unicoAdministrador).toBe(false)
  })

  it('o catálogo de papéis não oferece SUPER_ADMIN para atribuir', async () => {
    const papeis = await listarPapeisDaEscola(coordenacao, deps)
    const superAdmin = papeis.find((p) => p.nome === 'SUPER_ADMIN')

    expect(superAdmin?.atribuivel).toBe(false)
    expect(papeis.find((p) => p.nome === 'BIBLIOTECARIO')?.atribuivel).toBe(true)
  })
})
