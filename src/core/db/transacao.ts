import { AsyncLocalStorage } from 'node:async_hooks'

// Só o armazenamento mora aqui. `executarEmTransacao` fica em
// tenant-extension.ts porque precisa do cliente já estendido — e deixar
// os dois no mesmo arquivo criaria importação circular entre eles.
//
// Mesma técnica do contexto de tenant: a transação corrente viaja no
// AsyncLocalStorage em vez de ser passada de mão em mão por toda
// assinatura até o repositório. Sem isso, ou o serviço conheceria o
// cliente Prisma — furando a camada — ou cada repositório ganharia um
// parâmetro `tx` opcional que alguém esqueceria de repassar exatamente
// no caminho que precisa da garantia.
const armazenamento = new AsyncLocalStorage<unknown>()

export function clienteDeTransacaoAtual<T>(): T | null {
  return (armazenamento.getStore() as T | undefined) ?? null
}

export function comTransacao<T, R>(cliente: T, fn: () => Promise<R>): Promise<R> {
  return armazenamento.run(cliente, fn)
}

export function existeTransacaoEmCurso(): boolean {
  return armazenamento.getStore() !== undefined
}
