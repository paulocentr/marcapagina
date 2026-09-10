import { ehStaff, type Principal, type PrincipalStaff } from '@/core/auth/principal'
import { NaoAutenticadoError, SemPermissaoError } from '@/core/errors'
import type { Permissao } from '@/core/rbac/permissoes'

// Funções puras, sem I/O: é o que permite testá-las sem banco e sem HTTP.
// Os guards da camada de rota (guards.ts) apenas leem a sessão e delegam
// para cá.
export function temPermissao(principal: Principal | null, permissao: Permissao): boolean {
  if (!principal || !ehStaff(principal)) return false
  return principal.permissoes.includes(permissao)
}

export function exigirPermissao(
  principal: Principal | null,
  permissao: Permissao,
): asserts principal is PrincipalStaff {
  // Os dois casos são diferentes e o chamador precisa distingui-los:
  // sem sessão redireciona para o login; sem permissão mostra recusa.
  // Redirecionar para o login alguém que já está logado vira laço.
  if (!principal) throw new NaoAutenticadoError()
  if (!temPermissao(principal, permissao)) throw new SemPermissaoError(permissao)
}

/**
 * Exige QUALQUER uma das permissões da lista.
 *
 * Existe para ações que são passo interno de mais de um fluxo. Cadastrar
 * um autor acontece tanto ao criar obra quanto ao editar: exigir só
 * `obra:criar` impediria quem tem apenas `obra:editar` de corrigir a
 * autoria de uma ficha — uma recusa que ninguém entenderia.
 */
export function exigirQualquerPermissao(
  principal: Principal | null,
  permissoes: readonly Permissao[],
): asserts principal is PrincipalStaff {
  if (permissoes.length === 0) {
    // "Qualquer uma de nenhuma" só pode ser bug do chamador. Deixar passar
    // transformaria o engano em autorização concedida.
    throw new Error('exigirQualquerPermissao recebeu lista vazia de permissões.')
  }

  if (!principal) throw new NaoAutenticadoError()
  if (!permissoes.some((p) => temPermissao(principal, p))) {
    // Nomeia a primeira: a mensagem ao usuário é genérica de qualquer
    // forma, e o campo serve para o log dizer o que faltava.
    throw new SemPermissaoError(permissoes[0]!)
  }
}
