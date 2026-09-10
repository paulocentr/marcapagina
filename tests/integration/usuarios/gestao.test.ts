import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { verificarSenha } from '@/core/auth/senha'
import { PAPEIS_DE_FABRICA } from '@/core/rbac/papeis'
import { dependenciasDeUsuarios } from '@/modules/usuarios/usuarios.deps'
import { gestaoDeUsuariosRepository } from '@/modules/usuarios/gestao-de-usuarios.repository'
import { usuariosRepository } from '@/modules/usuarios/usuarios.repository'
import {
  criarUsuario,
  definirPermissoesDoPapel,
  definirSituacaoDoUsuario,
  listarPapeisDaEscola,
  listarUsuariosDaEscola,
  trocarPapelDoUsuario,
} from '@/modules/usuarios/usuarios.service'
import {
  PapelNaoEncontradoError,
  SemAdministradorError,
  UsuarioNaoEncontradoError,
} from '@/modules/usuarios/usuarios'
import type { Principal } from '@/core/auth/principal'

/**
 * A gestão de contas contra banco.
 *
 * Aqui se prova o que o fake não pode: que as queries são escopadas por
 * tenant, que o índice único `[escolaId, email]` recusa a conta gêmea,
 * que trocar de papel SUBSTITUI o vínculo em vez de acumular, e que a
 * conta criada por esta tela consegue de fato entrar pelo login.
 */

let escolaA = ''
let escolaB = ''
let papeisDaA: Record<string, string> = {}
let papeisDaB: Record<string, string> = {}
let coordenacaoDaA = ''

const deps = dependenciasDeUsuarios()

function principalDe(escolaId: string, id: string): Principal {
  return {
    reino: 'STAFF',
    id,
    escolaId,
    nome: 'Coordenação',
    permissoes: ['usuario:gerenciar', 'papel:gerenciar', 'obra:ver'],
  }
}

async function semearEscola(slug: string): Promise<{ id: string; papeis: Record<string, string> }> {
  const escola = await prisma.escola.create({ data: { slug, nome: slug } })

  const papeis: Record<string, string> = {}
  for (const [nome, definicao] of Object.entries(PAPEIS_DE_FABRICA)) {
    const papel = await prisma.papel.create({
      data: {
        escolaId: escola.id,
        nome,
        descricao: definicao.descricao,
        permissoes: [...definicao.permissoes],
        deSistema: true,
      },
    })
    papeis[nome] = papel.id
  }

  return { id: escola.id, papeis }
}

beforeEach(async () => {
  const a = await semearEscola('escola-a')
  const b = await semearEscola('escola-b')
  escolaA = a.id
  papeisDaA = a.papeis
  escolaB = b.id
  papeisDaB = b.papeis

  // A conta que já existe em toda escola: a coordenação. É a única que
  // administra, e é ela que as travas de "não se trancar fora" protegem.
  const coord = await prisma.usuario.create({
    data: {
      escolaId: escolaA,
      nome: 'Coordenação',
      email: 'coord@escola.br',
      senhaHash: 'hash-de-teste',
      papeis: { create: [{ papelId: papeisDaA.COORDENACAO! }] },
    },
  })
  coordenacaoDaA = coord.id
})

function naEscolaA<T>(fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, fn)
}

const coordA = () => principalDe(escolaA, coordenacaoDaA)

describe('listar contas', () => {
  it('lista as contas da escola e NUNCA devolve senhaHash', async () => {
    const lista = await naEscolaA(() => listarUsuariosDaEscola(coordA(), deps))

    expect(lista).toHaveLength(1)
    expect(lista[0]!.email).toBe('coord@escola.br')
    expect(Object.keys(lista[0]!)).not.toContain('senhaHash')
    expect(JSON.stringify(lista)).not.toContain('hash-de-teste')
  })

  it('não vê as contas da escola vizinha', async () => {
    await prisma.usuario.create({
      data: {
        escolaId: escolaB,
        nome: 'Coordenação da vizinha',
        email: 'coord@vizinha.br',
        senhaHash: 'hash-de-teste',
        papeis: { create: [{ papelId: papeisDaB.COORDENACAO! }] },
      },
    })

    const lista = await naEscolaA(() => listarUsuariosDaEscola(coordA(), deps))
    expect(lista.map((u) => u.email)).toEqual(['coord@escola.br'])
  })

  it('marca a coordenação como único administrador', async () => {
    const lista = await naEscolaA(() => listarUsuariosDaEscola(coordA(), deps))
    expect(lista[0]!.unicoAdministrador).toBe(true)
  })

  it('o catálogo de papéis vem com a contagem de contas de cada um', async () => {
    const papeis = await naEscolaA(() => listarPapeisDaEscola(coordA(), deps))

    expect(papeis.find((p) => p.nome === 'COORDENACAO')?.quantidadeDeUsuarios).toBe(1)
    expect(papeis.find((p) => p.nome === 'BIBLIOTECARIO')?.quantidadeDeUsuarios).toBe(0)
    expect(papeis.find((p) => p.nome === 'SUPER_ADMIN')?.atribuivel).toBe(false)
  })
})

describe('criar conta', () => {
  it('a conta criada consegue entrar pelo login', async () => {
    // O cruzamento que importa: a gestão de contas ESCREVE e o login LÊ.
    // Um hash com outros parâmetros, ou o vínculo de papel faltando,
    // produz uma conta que aparece na tela e não entra no sistema.
    await naEscolaA(() =>
      criarUsuario(
        coordA(),
        {
          nome: 'Bibliotecária',
          email: 'bib@escola.br',
          senha: 'SenhaLonga#1',
          papelId: papeisDaA.BIBLIOTECARIO!,
        },
        deps,
      ),
    )

    const paraLogin = await naEscolaA(() => usuariosRepository.buscarPorEmail('bib@escola.br'))

    expect(paraLogin).not.toBeNull()
    expect(paraLogin!.ativo).toBe(true)
    expect(await verificarSenha('SenhaLonga#1', paraLogin!.senhaHash)).toBe(true)
    expect(paraLogin!.permissoes).toContain('emprestimo:criar')
    expect(paraLogin!.permissoes).not.toContain('usuario:gerenciar')
  })

  it('a conta nasce dentro da escola de quem a criou', async () => {
    const criado = await naEscolaA(() =>
      criarUsuario(
        coordA(),
        {
          nome: 'Bibliotecária',
          email: 'bib@escola.br',
          senha: 'SenhaLonga#1',
          papelId: papeisDaA.BIBLIOTECARIO!,
        },
        deps,
      ),
    )

    const noBanco = await prisma.usuario.findUniqueOrThrow({ where: { id: criado.id } })
    expect(noBanco.escolaId).toBe(escolaA)
  })

  it('usuário e vínculo de papel entram juntos — nunca conta sem papel', async () => {
    const criado = await naEscolaA(() =>
      criarUsuario(
        coordA(),
        {
          nome: 'Bibliotecária',
          email: 'bib@escola.br',
          senha: 'SenhaLonga#1',
          papelId: papeisDaA.BIBLIOTECARIO!,
        },
        deps,
      ),
    )

    const vinculos = await prisma.usuarioPapel.count({ where: { usuarioId: criado.id } })
    expect(vinculos).toBe(1)
  })

  it('o índice único [escolaId, email] recusa a conta gêmea', async () => {
    // Sem passar pelo serviço, de propósito: a checagem de e-mail em uso
    // existe para a mensagem em pt-BR, mas quem GARANTE é o índice — duas
    // operadoras criando a mesma conta ao mesmo tempo passam as duas pela
    // checagem.
    await naEscolaA(() =>
      gestaoDeUsuariosRepository.criar({
        nome: 'Bibliotecária',
        email: 'bib@escola.br',
        senhaHash: 'hash-de-teste',
        papelId: papeisDaA.BIBLIOTECARIO!,
      }),
    )

    await expect(
      naEscolaA(() =>
        gestaoDeUsuariosRepository.criar({
          nome: 'Outra',
          email: 'bib@escola.br',
          senhaHash: 'hash-de-teste',
          papelId: papeisDaA.BIBLIOTECARIO!,
        }),
      ),
    ).rejects.toThrow()
  })

  it('o MESMO e-mail em outra escola é uma conta legítima', async () => {
    await naEscolaA(() =>
      criarUsuario(
        coordA(),
        {
          nome: 'Bibliotecária',
          email: 'bib@escola.br',
          senha: 'SenhaLonga#1',
          papelId: papeisDaA.BIBLIOTECARIO!,
        },
        deps,
      ),
    )

    const naVizinha = await executarComTenant(escolaB, () =>
      criarUsuario(
        principalDe(escolaB, 'usr_qualquer'),
        {
          nome: 'Bibliotecária da vizinha',
          email: 'bib@escola.br',
          senha: 'SenhaLonga#1',
          papelId: papeisDaB.BIBLIOTECARIO!,
        },
        deps,
      ),
    )

    expect(naVizinha.email).toBe('bib@escola.br')
    expect(await prisma.usuario.count({ where: { email: 'bib@escola.br' } })).toBe(2)
  })

  it('papel da escola vizinha não é encontrado', async () => {
    await expect(
      naEscolaA(() =>
        criarUsuario(
          coordA(),
          {
            nome: 'Bibliotecária',
            email: 'bib@escola.br',
            senha: 'SenhaLonga#1',
            papelId: papeisDaB.BIBLIOTECARIO!,
          },
          deps,
        ),
      ),
    ).rejects.toThrow(PapelNaoEncontradoError)
  })

  it('registra na auditoria da escola, sem a senha', async () => {
    await naEscolaA(() =>
      criarUsuario(
        coordA(),
        {
          nome: 'Bibliotecária',
          email: 'bib@escola.br',
          senha: 'SenhaLonga#1',
          papelId: papeisDaA.BIBLIOTECARIO!,
        },
        deps,
      ),
    )

    const logs = await prisma.logAuditoria.findMany({ where: { acao: 'usuario.criar' } })

    expect(logs).toHaveLength(1)
    expect(logs[0]!.escolaId).toBe(escolaA)
    expect(logs[0]!.autorId).toBe(coordenacaoDaA)
    expect(JSON.stringify(logs[0]!.dadosDepois)).not.toContain('SenhaLonga#1')
    expect(JSON.stringify(logs[0]!.dadosDepois)).not.toContain('argon2')
  })
})

describe('desativar e reativar', () => {
  let bibliotecaria = ''

  beforeEach(async () => {
    const criada = await naEscolaA(() =>
      criarUsuario(
        coordA(),
        {
          nome: 'Bibliotecária',
          email: 'bib@escola.br',
          senha: 'SenhaLonga#1',
          papelId: papeisDaA.BIBLIOTECARIO!,
        },
        deps,
      ),
    )
    bibliotecaria = criada.id
  })

  it('desativar tranca o login da conta', async () => {
    await naEscolaA(() =>
      definirSituacaoDoUsuario(coordA(), { usuarioId: bibliotecaria, ativo: false }, deps),
    )

    const paraLogin = await naEscolaA(() => usuariosRepository.buscarPorEmail('bib@escola.br'))
    expect(paraLogin!.ativo).toBe(false)
  })

  it('reativar devolve o login', async () => {
    await naEscolaA(() =>
      definirSituacaoDoUsuario(coordA(), { usuarioId: bibliotecaria, ativo: false }, deps),
    )
    await naEscolaA(() =>
      definirSituacaoDoUsuario(coordA(), { usuarioId: bibliotecaria, ativo: true }, deps),
    )

    const paraLogin = await naEscolaA(() => usuariosRepository.buscarPorEmail('bib@escola.br'))
    expect(paraLogin!.ativo).toBe(true)
  })

  it('não desativa conta da escola vizinha', async () => {
    const daVizinha = await prisma.usuario.create({
      data: {
        escolaId: escolaB,
        nome: 'Coordenação da vizinha',
        email: 'coord@vizinha.br',
        senhaHash: 'hash-de-teste',
        papeis: { create: [{ papelId: papeisDaB.COORDENACAO! }] },
      },
    })

    await expect(
      naEscolaA(() =>
        definirSituacaoDoUsuario(coordA(), { usuarioId: daVizinha.id, ativo: false }, deps),
      ),
    ).rejects.toThrow(UsuarioNaoEncontradoError)

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: daVizinha.id } })
    expect(depois.ativo).toBe(true)
  })

  it('o último administrador continua ATIVO no banco depois da recusa', async () => {
    // Não basta o serviço lançar: se a escrita tivesse acontecido antes da
    // checagem, a exceção subiria com a porta já trancada.
    const outra = principalDe(escolaA, bibliotecaria)

    await expect(
      naEscolaA(() =>
        definirSituacaoDoUsuario(outra, { usuarioId: coordenacaoDaA, ativo: false }, deps),
      ),
    ).rejects.toThrow(SemAdministradorError)

    const noBanco = await prisma.usuario.findUniqueOrThrow({ where: { id: coordenacaoDaA } })
    expect(noBanco.ativo).toBe(true)
  })
})

describe('trocar papel', () => {
  it('SUBSTITUI o vínculo em vez de acumular', async () => {
    const criada = await naEscolaA(() =>
      criarUsuario(
        coordA(),
        {
          nome: 'Monitora',
          email: 'monitora@escola.br',
          senha: 'SenhaLonga#1',
          papelId: papeisDaA.MONITOR!,
        },
        deps,
      ),
    )

    await naEscolaA(() =>
      trocarPapelDoUsuario(
        coordA(),
        { usuarioId: criada.id, papelId: papeisDaA.BIBLIOTECARIO! },
        deps,
      ),
    )

    const vinculos = await prisma.usuarioPapel.findMany({ where: { usuarioId: criada.id } })
    expect(vinculos).toHaveLength(1)
    expect(vinculos[0]!.papelId).toBe(papeisDaA.BIBLIOTECARIO!)

    // E o login enxerga o papel novo, não a união dos dois.
    const paraLogin = await naEscolaA(() =>
      usuariosRepository.buscarPorEmail('monitora@escola.br'),
    )
    expect(paraLogin!.permissoes).toContain('obra:criar')
  })

  it('não mexe no vínculo de conta da escola vizinha', async () => {
    const daVizinha = await prisma.usuario.create({
      data: {
        escolaId: escolaB,
        nome: 'Monitora da vizinha',
        email: 'monitora@vizinha.br',
        senhaHash: 'hash-de-teste',
        papeis: { create: [{ papelId: papeisDaB.MONITOR! }] },
      },
    })

    await expect(
      naEscolaA(() =>
        trocarPapelDoUsuario(
          coordA(),
          { usuarioId: daVizinha.id, papelId: papeisDaA.BIBLIOTECARIO! },
          deps,
        ),
      ),
    ).rejects.toThrow(UsuarioNaoEncontradoError)

    const vinculos = await prisma.usuarioPapel.findMany({ where: { usuarioId: daVizinha.id } })
    expect(vinculos).toHaveLength(1)
    expect(vinculos[0]!.papelId).toBe(papeisDaB.MONITOR!)
  })
})

describe('editar permissões de um papel', () => {
  it('a permissão retirada deixa de valer no login', async () => {
    await naEscolaA(() =>
      criarUsuario(
        coordA(),
        {
          nome: 'Monitora',
          email: 'monitora@escola.br',
          senha: 'SenhaLonga#1',
          papelId: papeisDaA.MONITOR!,
        },
        deps,
      ),
    )

    await naEscolaA(() =>
      definirPermissoesDoPapel(
        coordA(),
        { papelId: papeisDaA.MONITOR!, permissoes: ['obra:ver'] },
        deps,
      ),
    )

    const paraLogin = await naEscolaA(() =>
      usuariosRepository.buscarPorEmail('monitora@escola.br'),
    )
    expect(paraLogin!.permissoes).toEqual(['obra:ver'])
  })

  it('não edita papel da escola vizinha', async () => {
    await expect(
      naEscolaA(() =>
        definirPermissoesDoPapel(
          coordA(),
          { papelId: papeisDaB.MONITOR!, permissoes: [] },
          deps,
        ),
      ),
    ).rejects.toThrow(PapelNaoEncontradoError)

    const intacto = await prisma.papel.findUniqueOrThrow({ where: { id: papeisDaB.MONITOR! } })
    expect(intacto.permissoes.length).toBeGreaterThan(0)
  })

  it('o papel do último administrador continua com a permissão depois da recusa', async () => {
    await expect(
      naEscolaA(() =>
        definirPermissoesDoPapel(
          coordA(),
          { papelId: papeisDaA.COORDENACAO!, permissoes: ['obra:ver'] },
          deps,
        ),
      ),
    ).rejects.toThrow(SemAdministradorError)

    const noBanco = await prisma.papel.findUniqueOrThrow({
      where: { id: papeisDaA.COORDENACAO! },
    })
    expect(noBanco.permissoes).toContain('usuario:gerenciar')
  })
})
