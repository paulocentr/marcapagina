import { describe, it, expect } from 'vitest'
import {
  PERMISSOES_DE_ADMINISTRACAO,
  PERMISSOES_ATRIBUIVEIS_NA_ESCOLA,
  PAPEIS_NAO_ATRIBUIVEIS_NA_ESCOLA,
  administracaoSemDono,
  ehPapelAtribuivelNaEscola,
  validarSenhaNova,
  permissoesDoUsuario,
} from '@/modules/usuarios/usuarios'
import { SenhaFracaError } from '@/modules/usuarios/usuarios'
import { FORCA_MINIMA_SENHA } from '@/core/auth/senha'
import type { UsuarioParaLotacao } from '@/modules/usuarios/usuarios'

/**
 * As regras puras da gestão de usuários.
 *
 * Elas moram fora do serviço de propósito: a garantia que mais importa
 * aqui — a escola nunca fica sem quem administre usuários — é uma
 * pergunta sobre a LISTA de usuários, não sobre o banco. Provada em
 * milissegundos, ela cobre todos os caminhos que levam ao mesmo buraco
 * (desativar, trocar papel, editar permissão do papel) com a mesma
 * função.
 */

const admin = (id: string, ativo = true): UsuarioParaLotacao => ({
  id,
  ativo,
  permissoes: ['usuario:gerenciar', 'papel:gerenciar'],
})

const monitor = (id: string, ativo = true): UsuarioParaLotacao => ({
  id,
  ativo,
  permissoes: ['emprestimo:criar'],
})

describe('administracaoSemDono', () => {
  it('nada órfão quando existe um administrador ativo', () => {
    expect(administracaoSemDono([admin('a'), monitor('b')])).toEqual([])
  })

  it('acusa as duas permissões quando a lista está vazia', () => {
    expect(administracaoSemDono([])).toEqual([...PERMISSOES_DE_ADMINISTRACAO])
  })

  it('administrador DESATIVADO não conta como dono', () => {
    // É o ponto todo: desativar o último administrador deixa a permissão
    // registrada num usuário que não consegue mais entrar. O banco fica
    // consistente e a escola fica trancada fora.
    expect(administracaoSemDono([admin('a', false), monitor('b')])).toEqual([
      ...PERMISSOES_DE_ADMINISTRACAO,
    ])
  })

  it('acusa só a permissão que ficou sem dono', () => {
    const meioAdmin: UsuarioParaLotacao = {
      id: 'a',
      ativo: true,
      permissoes: ['usuario:gerenciar'],
    }
    expect(administracaoSemDono([meioAdmin])).toEqual(['papel:gerenciar'])
  })

  it('dois administradores ativos: desativar um não deixa nada órfão', () => {
    expect(administracaoSemDono([admin('a', false), admin('b')])).toEqual([])
  })

  it('papel:gerenciar entra na conta junto com usuario:gerenciar', () => {
    // Sem papel:gerenciar em ninguém, o catálogo de papéis congela: não há
    // como devolver a permissão a papel nenhum, porque devolvê-la exige
    // justamente papel:gerenciar. É beco sem saída pela interface.
    expect(PERMISSOES_DE_ADMINISTRACAO).toContain('usuario:gerenciar')
    expect(PERMISSOES_DE_ADMINISTRACAO).toContain('papel:gerenciar')
  })
})

describe('permissoesDoUsuario', () => {
  it('une as permissões de todos os papéis, sem repetir', () => {
    const permissoes = permissoesDoUsuario([
      { id: 'p1', nome: 'A', permissoes: ['obra:ver', 'emprestimo:criar'] },
      { id: 'p2', nome: 'B', permissoes: ['obra:ver', 'aluno:ver'] },
    ])

    expect([...permissoes].sort()).toEqual(['aluno:ver', 'emprestimo:criar', 'obra:ver'])
  })

  it('usuário sem papel nenhum não tem permissão nenhuma', () => {
    expect(permissoesDoUsuario([])).toEqual([])
  })
})

describe('papéis atribuíveis dentro de uma escola', () => {
  it('SUPER_ADMIN não é atribuível', () => {
    // SUPER_ADMIN não pertence a escola nenhuma e carrega escola:gerenciar.
    // Uma tela de escola que o atribuísse atravessaria o isolamento entre
    // escolas pela porta da frente.
    expect(ehPapelAtribuivelNaEscola('SUPER_ADMIN')).toBe(false)
    expect(PAPEIS_NAO_ATRIBUIVEIS_NA_ESCOLA).toContain('SUPER_ADMIN')
  })

  it('ALUNO não é atribuível a conta de equipe', () => {
    // O papel ALUNO existe para o portal do leitor e tem zero permissões.
    // Atribuí-lo a uma conta de staff cria um login que funciona e não faz
    // nada — que se lê como conta quebrada, não como conta deliberada.
    expect(ehPapelAtribuivelNaEscola('ALUNO')).toBe(false)
  })

  it('os papéis de trabalho da escola são atribuíveis', () => {
    for (const nome of ['COORDENACAO', 'DIRECAO', 'BIBLIOTECARIO', 'MONITOR', 'PROFESSOR']) {
      expect(ehPapelAtribuivelNaEscola(nome), nome).toBe(true)
    }
  })

  it('papel criado pela escola é atribuível', () => {
    expect(ehPapelAtribuivelNaEscola('Auxiliar do turno da tarde')).toBe(true)
  })
})

describe('permissões que uma escola pode conceder', () => {
  it('nenhuma permissão de escola: entra na lista', () => {
    const deEscola = PERMISSOES_ATRIBUIVEIS_NA_ESCOLA.filter((p) => p.startsWith('escola:'))
    expect(deEscola).toEqual([])
  })

  it('as permissões de administração da escola entram', () => {
    for (const permissao of PERMISSOES_DE_ADMINISTRACAO) {
      expect(PERMISSOES_ATRIBUIVEIS_NA_ESCOLA, permissao).toContain(permissao)
    }
  })
})

describe('validarSenhaNova', () => {
  it('aceita senha do tamanho mínimo', () => {
    expect(() => validarSenhaNova('a'.repeat(FORCA_MINIMA_SENHA))).not.toThrow()
  })

  it('recusa senha curta, com a mensagem em pt-BR', () => {
    expect(() => validarSenhaNova('a'.repeat(FORCA_MINIMA_SENHA - 1))).toThrow(SenhaFracaError)
    expect(() => validarSenhaNova('curta')).toThrow(/10 caracteres/)
  })

  it('não conta espaço em volta como força', () => {
    // "         a" tem 10 caracteres e uma letra. Aceitá-la seria contar
    // espaço como segredo.
    expect(() => validarSenhaNova('         a')).toThrow(SenhaFracaError)
  })
})
