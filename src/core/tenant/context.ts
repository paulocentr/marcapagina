import { AsyncLocalStorage } from 'node:async_hooks'
import { SemTenantError } from '@/core/errors'

// AsyncLocalStorage exige Node runtime. Toda rota que toca banco declara
// `export const runtime = 'nodejs'`. O middleware roda em Edge e por isso
// nunca acessa banco — ele só verifica se o cookie existe.
const armazenamento = new AsyncLocalStorage<{ escolaId: string }>()

export function executarComTenant<T>(escolaId: string, fn: () => Promise<T>): Promise<T> {
  return armazenamento.run({ escolaId }, fn)
}

export function tenantAtual(): string {
  const contexto = armazenamento.getStore()
  if (!contexto) throw new SemTenantError()
  return contexto.escolaId
}

export function tenantAtualOuNulo(): string | null {
  return armazenamento.getStore()?.escolaId ?? null
}
