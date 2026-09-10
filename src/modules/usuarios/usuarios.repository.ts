import { dbDoTenant } from '@/core/db/tenant-extension'
import { ehPermissaoValida, type Permissao } from '@/core/rbac/permissoes'
import type {
  RepositorioDeUsuarios,
  RepositorioDeAlunos,
  UsuarioComPapeis,
  AlunoParaLogin,
} from '@/modules/autenticacao/autenticacao.service'

export const usuariosRepository: RepositorioDeUsuarios = {
  async buscarPorEmail(email: string): Promise<UsuarioComPapeis | null> {
    const usuario = await dbDoTenant().usuario.findFirst({
      where: { email },
      include: { papeis: { include: { papel: true } } },
    })
    if (!usuario) return null

    // Permissões vindas do banco podem conter valores que não existem mais
    // no catálogo (permissão renomeada, papel antigo). Filtrar é o
    // comportamento seguro: uma permissão desconhecida nunca é concedida.
    const permissoes = new Set<Permissao>()
    for (const vinculo of usuario.papeis) {
      for (const bruta of vinculo.papel.permissoes) {
        if (ehPermissaoValida(bruta)) permissoes.add(bruta)
      }
    }

    return {
      id: usuario.id,
      escolaId: usuario.escolaId,
      nome: usuario.nome,
      email: usuario.email,
      senhaHash: usuario.senhaHash,
      ativo: usuario.ativo,
      permissoes: [...permissoes],
    }
  },
}

export const alunosParaLoginRepository: RepositorioDeAlunos = {
  async buscarPorMatricula(matricula: string): Promise<AlunoParaLogin | null> {
    const aluno = await dbDoTenant().aluno.findFirst({ where: { matricula } })
    if (!aluno) return null

    return {
      id: aluno.id,
      escolaId: aluno.escolaId,
      nome: aluno.nome,
      matricula: aluno.matricula,
      dataNascimento: aluno.dataNascimento,
      ativo: aluno.ativo,
    }
  },
}
