import { auditRepository } from '@/core/audit/audit.repository'
import type { Principal } from '@/core/auth/principal'
import type { Prisma } from '@prisma/client'

export interface EventoDeAuditoria {
  autor: Principal | 'SISTEMA'
  acao: string
  entidade: string
  entidadeId?: string
  dadosAntes?: Record<string, unknown>
  dadosDepois?: Record<string, unknown>
  ip?: string
}

export async function registrarAuditoria(evento: EventoDeAuditoria): Promise<void> {
  try {
    const autor =
      evento.autor === 'SISTEMA'
        ? { tipo: 'SISTEMA', id: null, nome: 'Sistema' }
        : { tipo: evento.autor.reino, id: evento.autor.id, nome: evento.autor.nome }

    await auditRepository.inserir({
      autorTipo: autor.tipo,
      autorId: autor.id,
      autorNome: autor.nome,
      acao: evento.acao,
      entidade: evento.entidade,
      entidadeId: evento.entidadeId ?? null,
      dadosAntes: normalizarJson(evento.dadosAntes),
      dadosDepois: normalizarJson(evento.dadosDepois),
      ip: evento.ip ?? null,
    })
  } catch (erro) {
    // Auditoria NUNCA derruba a operação de negócio. Quando o empréstimo
    // já aconteceu, lançar aqui desfaria uma operação legítima por causa
    // do registro dela. O erro vai para o log do servidor, onde o Sentry
    // o coleta.
    console.error('[auditoria] falha ao registrar evento', {
      acao: evento.acao,
      entidade: evento.entidade,
      erro,
    })
  }
}

function normalizarJson(
  valor: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  if (valor === undefined) return undefined
  // Serializar aqui, e não no Prisma, faz o valor não-serializável falhar
  // dentro do try — onde a falha é engolida — em vez de escapar depois.
  return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue
}
