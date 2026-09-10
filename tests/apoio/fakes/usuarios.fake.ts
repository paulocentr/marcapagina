import type {
  RepositorioDeUsuarios,
  RepositorioDeAlunos,
  UsuarioComPapeis,
  AlunoParaLogin,
} from '@/modules/autenticacao/autenticacao.service'

// Fakes em memória: é o retorno concreto do padrão repository. Os testes
// de regra rodam em milissegundos, sem banco e sem Docker.
export function criarFakeDeUsuarios() {
  const porId = new Map<string, UsuarioComPapeis>()
  let aoBuscarCallback: (() => void) | null = null

  return {
    semear(u: UsuarioComPapeis) {
      porId.set(u.id, u)
    },
    desativar(id: string) {
      const u = porId.get(id)
      if (u) porId.set(id, { ...u, ativo: false })
    },
    aoBuscar(cb: () => void) {
      aoBuscarCallback = cb
    },
    async buscarPorEmail(email: string): Promise<UsuarioComPapeis | null> {
      aoBuscarCallback?.()
      for (const u of porId.values()) if (u.email === email) return u
      return null
    },
  } satisfies RepositorioDeUsuarios & Record<string, unknown>
}

export function criarFakeDeAlunos() {
  const porId = new Map<string, AlunoParaLogin>()

  return {
    semear(a: AlunoParaLogin) {
      porId.set(a.id, a)
    },
    desativar(id: string) {
      const a = porId.get(id)
      if (a) porId.set(id, { ...a, ativo: false })
    },
    async buscarPorMatricula(matricula: string): Promise<AlunoParaLogin | null> {
      for (const a of porId.values()) if (a.matricula === matricula) return a
      return null
    },
  } satisfies RepositorioDeAlunos & Record<string, unknown>
}
