import { exigirQualquerPermissao } from '@/core/rbac/verificar'
import { normalizarParaBusca } from '@/core/texto/normalizar'
import type { Principal } from '@/core/auth/principal'

export interface AutorRegistrado {
  id: string
  nome: string
  nomeNormalizado: string
}

export interface RepositorioDeAutores {
  buscarPorNormalizados(normalizados: string[]): Promise<AutorRegistrado[]>
  criarMuitos(novos: { nome: string; nomeNormalizado: string }[]): Promise<AutorRegistrado[]>
}

export interface DependenciasDeAutores {
  autores: RepositorioDeAutores
}

// Chave de deduplicação, não texto de tela: "Clarice Lispector" e
// "clarice  LISPECTOR" são a MESMA pessoa. Sem isso o relatório de autor
// mais lido conta a mesma autora duas vezes, que é justamente o relatório
// que justificou modelar autor como entidade em vez de campo texto.
//
// É a mesma normalização usada no título da obra. Uma implementação só:
// duas cópias divergem na primeira correção feita em apenas uma delas.
export function normalizarNomeDeAutor(nome: string): string {
  return normalizarParaBusca(nome)
}

/**
 * Devolve os ids dos autores informados, criando apenas os que faltam.
 * A ordem do retorno acompanha a dos nomes recebidos, porque é ela que
 * vira `ObraAutor.ordem` — a ordem dos autores na capa não é decorativa.
 */
export async function garantirAutores(
  principal: Principal,
  nomes: string[],
  deps: DependenciasDeAutores,
): Promise<string[]> {
  // Criar ou editar obra: cadastrar o autor é passo interno dos dois, e
  // exigir só 'obra:criar' impediria quem tem apenas 'obra:editar' de
  // corrigir a autoria de uma ficha já cadastrada.
  exigirQualquerPermissao(principal, ['obra:criar', 'obra:editar'])

  const normalizados = nomes.map(normalizarNomeDeAutor)
  const distintos = [...new Set(normalizados.filter((n) => n.length > 0))]
  if (distintos.length === 0) return []

  // Uma busca e uma escrita, nunca uma por autor: numa sessão de
  // catalogação em série, N+1 é a diferença entre fluido e travado.
  const existentes = await deps.autores.buscarPorNormalizados(distintos)
  const porNormalizado = new Map(existentes.map((a) => [a.nomeNormalizado, a]))

  const faltantes = distintos.filter((n) => !porNormalizado.has(n))
  if (faltantes.length > 0) {
    // A grafia gravada é a da primeira ocorrência informada, não a
    // normalizada — o normalizado é chave, o nome é o que a tela mostra.
    const criados = await deps.autores.criarMuitos(
      faltantes.map((normalizado) => ({
        nome: nomes[normalizados.indexOf(normalizado)]!.replace(/\s+/g, ' ').trim(),
        nomeNormalizado: normalizado,
      })),
    )
    for (const a of criados) porNormalizado.set(a.nomeNormalizado, a)
  }

  return normalizados.filter((n) => n.length > 0).map((n) => porNormalizado.get(n)!.id)
}
