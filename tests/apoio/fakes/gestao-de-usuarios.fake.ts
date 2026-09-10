import type { Permissao } from '@/core/rbac/permissoes'
import type {
  PapelDaEscola,
  RepositorioDeGestaoDeUsuarios,
  UsuarioDaEscola,
} from '@/modules/usuarios/usuarios.service'

/**
 * Repositório de gestão de contas em memória.
 *
 * É o retorno concreto do padrão repository: as regras da gestão de
 * usuários — em especial "a escola nunca fica sem administrador" — são
 * provadas aqui em milissegundos, sem banco e sem Docker. As queries
 * ficam para o teste de integração.
 *
 * O fake NÃO guarda `senhaHash` nos objetos que devolve, de propósito: se
 * o serviço um dia passar a vazar o hash para a tela, o tipo do
 * repositório é o primeiro lugar onde isso aparece.
 */
export function criarFakeDeGestaoDeUsuarios() {
  const usuarios = new Map<string, UsuarioDaEscola>()
  const papeis = new Map<string, PapelDaEscola>()
  const hashes = new Map<string, string>()
  let sequencia = 0

  function papelOuFalha(papelId: string): PapelDaEscola {
    const papel = papeis.get(papelId)
    if (!papel) throw new Error(`fake: papel ${papelId} não semeado`)
    return papel
  }

  return {
    semearPapel(papel: PapelDaEscola) {
      papeis.set(papel.id, papel)
    },

    semearUsuario(usuario: UsuarioDaEscola) {
      usuarios.set(usuario.id, usuario)
    },

    /** Só para o teste conferir que a senha foi gravada como hash. */
    hashDe(usuarioId: string): string | undefined {
      return hashes.get(usuarioId)
    },

    async listar(): Promise<UsuarioDaEscola[]> {
      return [...usuarios.values()].map((u) => ({ ...u, papeis: [...u.papeis] }))
    },


    async buscarPorEmail(email: string): Promise<UsuarioDaEscola | null> {
      for (const u of usuarios.values()) if (u.email === email) return { ...u }
      return null
    },

    async criar(dados: {
      nome: string
      email: string
      senhaHash: string
      papelId: string
    }): Promise<UsuarioDaEscola> {
      sequencia += 1
      const id = `usr_fake_${sequencia}`
      const papel = papelOuFalha(dados.papelId)

      const criado: UsuarioDaEscola = {
        id,
        nome: dados.nome,
        email: dados.email,
        ativo: true,
        criadoEm: new Date('2026-09-10T12:00:00Z'),
        papeis: [{ id: papel.id, nome: papel.nome, permissoes: [...papel.permissoes] }],
      }

      usuarios.set(id, criado)
      hashes.set(id, dados.senhaHash)
      return { ...criado }
    },

    async definirAtivo(usuarioId: string, ativo: boolean): Promise<void> {
      const usuario = usuarios.get(usuarioId)
      if (!usuario) throw new Error(`fake: usuário ${usuarioId} não semeado`)
      usuarios.set(usuarioId, { ...usuario, ativo })
    },

    async substituirPapel(usuarioId: string, papelId: string): Promise<void> {
      const usuario = usuarios.get(usuarioId)
      if (!usuario) throw new Error(`fake: usuário ${usuarioId} não semeado`)
      const papel = papelOuFalha(papelId)
      usuarios.set(usuarioId, {
        ...usuario,
        papeis: [{ id: papel.id, nome: papel.nome, permissoes: [...papel.permissoes] }],
      })
    },

    async listarPapeis(): Promise<PapelDaEscola[]> {
      return [...papeis.values()].map((p) => ({ ...p, permissoes: [...p.permissoes] }))
    },

    async buscarPapelPorId(papelId: string): Promise<PapelDaEscola | null> {
      const papel = papeis.get(papelId)
      return papel ? { ...papel, permissoes: [...papel.permissoes] } : null
    },

    async definirPermissoesDoPapel(papelId: string, permissoes: Permissao[]): Promise<void> {
      const papel = papelOuFalha(papelId)
      papeis.set(papelId, { ...papel, permissoes: [...permissoes] })

      // O vínculo é por papel: mudar as permissões do papel muda, na hora,
      // as de todo mundo que o carrega. O fake precisa refletir isso —
      // senão o teste do "último administrador" passaria por acidente.
      for (const usuario of usuarios.values()) {
        if (!usuario.papeis.some((p) => p.id === papelId)) continue
        usuarios.set(usuario.id, {
          ...usuario,
          papeis: usuario.papeis.map((p) =>
            p.id === papelId ? { ...p, permissoes: [...permissoes] } : p,
          ),
        })
      }
    },
  } satisfies RepositorioDeGestaoDeUsuarios & Record<string, unknown>
}
