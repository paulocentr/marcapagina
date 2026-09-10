import { executarEmTransacao } from '@/core/db/tenant-extension'
import { registrarAuditoria } from '@/core/audit/audit.service'
import { balcaoRepository } from '@/modules/circulacao/balcao.repository'
import { consultaDoBalcaoRepository } from '@/modules/circulacao/balcao-consulta.repository'
import { carrinhoRepository } from '@/modules/carrinho/carrinho.repository'
import { consultaDoCarrinhoRepository } from '@/modules/carrinho/carrinho-consulta.repository'
import type { DependenciasDoLote } from '@/modules/carrinho/carrinho.service'
import type { DependenciasDeConsultaDoCarrinho } from '@/modules/carrinho/carrinho-consulta.service'
import type { DependenciasDeConsultaDoBalcao } from '@/modules/circulacao/balcao.service'

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
 *
 * Traz também a CONSULTA do balcão, que o pacote não tinha: o lote é
 * indexado por `alunoId`, e o que a operadora bipa na volta do carrinho é
 * a matrícula da carteirinha. Quem traduz uma na outra é
 * `buscarLeitorParaBalcao` — a mesma consulta do balcão, e não uma
 * segunda busca de leitor que poderia responder diferente dela.
 */
export function dependenciasDoCarrinho(): DependenciasDoLote &
  DependenciasDeConsultaDoCarrinho &
  DependenciasDeConsultaDoBalcao {
  return {
    carrinho: carrinhoRepository,
    consultaDoCarrinho: consultaDoCarrinhoRepository,
    balcao: balcaoRepository,
    consultaDoBalcao: consultaDoBalcaoRepository,
    emTransacao: executarEmTransacao,
    registrarAuditoria,
  }
}
