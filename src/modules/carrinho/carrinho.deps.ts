import { executarEmTransacao } from '@/core/db/tenant-extension'
import { registrarAuditoria } from '@/core/audit/audit.service'
import { balcaoRepository } from '@/modules/circulacao/balcao.repository'
import { carrinhoRepository } from '@/modules/carrinho/carrinho.repository'
import type { DependenciasDoLote } from '@/modules/carrinho/carrinho.service'

/**
 * Ponto de composição do Carrinho da Leitura.
 *
 * Existe para que as telas nunca importem um `*.repository.ts` — a
 * Global Constraint 1 proíbe e há gate no CI. A rota pede o pacote pronto
 * e passa adiante; quem sabe montá-lo é este módulo.
 *
 * Traz o repositório do BALCÃO junto porque o empréstimo em lote reusa
 * `emprestar`: a regra de bloqueio, prazo e reserva do carrinho é a mesma
 * do balcão, e é o único jeito de os dois não divergirem na primeira
 * mudança de configuração.
 */
export function dependenciasDoCarrinho(): DependenciasDoLote {
  return {
    carrinho: carrinhoRepository,
    balcao: balcaoRepository,
    emTransacao: executarEmTransacao,
    registrarAuditoria,
  }
}
