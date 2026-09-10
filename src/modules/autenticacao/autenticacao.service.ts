import { verificarSenha } from '@/core/auth/senha'
import { CredenciaisInvalidasError } from '@/core/errors'
import type { PrincipalStaff, PrincipalAluno } from '@/core/auth/principal'
import type { Permissao } from '@/core/rbac/permissoes'
import type { Reino } from '@/core/auth/tentativas'

export interface UsuarioComPapeis {
  id: string
  escolaId: string
  nome: string
  email: string
  senhaHash: string
  ativo: boolean
  permissoes: Permissao[]
}

export interface AlunoParaLogin {
  id: string
  escolaId: string
  nome: string
  matricula: string
  dataNascimento: Date
  ativo: boolean
}

export interface RepositorioDeUsuarios {
  buscarPorEmail(email: string): Promise<UsuarioComPapeis | null>
}

export interface RepositorioDeAlunos {
  buscarPorMatricula(matricula: string): Promise<AlunoParaLogin | null>
}

export interface DependenciasDeAutenticacao {
  usuarios: RepositorioDeUsuarios
  alunos: RepositorioDeAlunos
  verificarBloqueio(p: { identificador: string; reino: Reino; ip: string }): Promise<void>
  registrarTentativa(p: {
    identificador: string
    reino: Reino
    ip: string
    sucesso: boolean
    escolaId?: string
  }): Promise<void>
}

export async function autenticarStaff(
  entrada: { email: string; senha: string; escolaId: string; ip: string },
  deps: DependenciasDeAutenticacao,
): Promise<PrincipalStaff> {
  const email = entrada.email.trim().toLowerCase()

  // Bloqueio ANTES de tocar o banco: sob ataque, não queremos nem gastar
  // a consulta nem o custo do Argon2.
  await deps.verificarBloqueio({ identificador: email, reino: 'STAFF', ip: entrada.ip })

  const usuario = await deps.usuarios.buscarPorEmail(email)

  // Mesmo caminho de falha para inexistente, inativo e senha errada:
  // qualquer diferença de mensagem ou de tempo entrega quais e-mails
  // existem no sistema.
  const senhaConfere =
    usuario !== null && usuario.ativo && (await verificarSenha(entrada.senha, usuario.senhaHash))

  if (!usuario || !senhaConfere) {
    await deps.registrarTentativa({
      identificador: email,
      reino: 'STAFF',
      ip: entrada.ip,
      sucesso: false,
      escolaId: entrada.escolaId,
    })
    throw new CredenciaisInvalidasError()
  }

  await deps.registrarTentativa({
    identificador: email,
    reino: 'STAFF',
    ip: entrada.ip,
    sucesso: true,
    escolaId: usuario.escolaId,
  })

  return {
    reino: 'STAFF',
    id: usuario.id,
    escolaId: usuario.escolaId,
    nome: usuario.nome,
    permissoes: usuario.permissoes,
  }
}

export async function autenticarAluno(
  entrada: { matricula: string; dataNascimento: string; escolaId: string; ip: string },
  deps: DependenciasDeAutenticacao,
): Promise<PrincipalAluno> {
  const matricula = entrada.matricula.trim()

  await deps.verificarBloqueio({ identificador: matricula, reino: 'ALUNO', ip: entrada.ip })

  const aluno = await deps.alunos.buscarPorMatricula(matricula)

  const nascimentoConfere =
    aluno !== null && aluno.ativo && formatarData(aluno.dataNascimento) === entrada.dataNascimento

  if (!aluno || !nascimentoConfere) {
    await deps.registrarTentativa({
      identificador: matricula,
      reino: 'ALUNO',
      ip: entrada.ip,
      sucesso: false,
      escolaId: entrada.escolaId,
    })
    throw new CredenciaisInvalidasError()
  }

  await deps.registrarTentativa({
    identificador: matricula,
    reino: 'ALUNO',
    ip: entrada.ip,
    sucesso: true,
    escolaId: aluno.escolaId,
  })

  return {
    reino: 'ALUNO',
    id: aluno.id,
    escolaId: aluno.escolaId,
    nome: aluno.nome,
    matricula: aluno.matricula,
  }
}

// A coluna é @db.Date, então a data volta em UTC à meia-noite. Usar
// getUTC* evita que o fuso do servidor desloque o dia — em São Paulo,
// getFullYear() sobre 2012-03-15T00:00:00Z devolveria 14 de março.
function formatarData(data: Date): string {
  const ano = data.getUTCFullYear()
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(data.getUTCDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}
