import { prisma } from '@/core/db/client'
import { tenantAtual } from '@/core/tenant/context'
import { MODELOS_ESCOPADOS_POR_TENANT } from '@/core/db/modelos-tenant'

type Args = Record<string, unknown>
type Delegate = Record<string, (args: Args) => Promise<unknown>>

// findUnique aceita apenas campos únicos no where, então não dá para
// simplesmente acrescentar escolaId. A conversão para findFirst permite
// filtrar por qualquer campo — inclusive o tenant — mantendo a semântica
// de "no máximo um resultado".
const CONVERTE_PARA_FIND_FIRST: Record<string, string> = {
  findUnique: 'findFirst',
  findUniqueOrThrow: 'findFirstOrThrow',
}

function delegateDe(model: string): Delegate {
  const chave = model.charAt(0).toLowerCase() + model.slice(1)
  return (prisma as unknown as Record<string, Delegate>)[chave]!
}

// O filtro de tenant entra por AND, não por sobrescrita da chave.
// Sobrescrever faria `where: { escolaId: <vizinho> }` virar
// `where: { escolaId: <meu> }` — a consulta pediu o registro do vizinho e
// receberia, em silêncio, OUTRO registro. Com AND as duas condições
// coexistem, não se satisfazem juntas, e o resultado é vazio: quem tentou
// alcançar o vizinho não alcança nada (Global Constraint 3).
function comTenantNoWhere(args: Args, escolaId: string): Args {
  const where = (args.where ?? {}) as Record<string, unknown>
  return { ...args, where: { AND: [where, { escolaId }] } }
}

function comTenantNoData(args: Args, escolaId: string): Args {
  const data = args.data
  if (Array.isArray(data)) {
    return { ...args, data: data.map((d) => ({ ...(d as object), escolaId })) }
  }
  return { ...args, data: { ...(data as object), escolaId } }
}

// O where de findUnique pode trazer chave composta aninhada
// (ex.: escolaId_matricula). Achatar antes de filtrar por tenant.
function achatarWhereComposto(where: Record<string, unknown>): Record<string, unknown> {
  const achatado: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(where)) {
    if (chave.includes('_') && valor && typeof valor === 'object' && !Array.isArray(valor)) {
      Object.assign(achatado, valor)
    } else {
      achatado[chave] = valor
    }
  }
  return achatado
}

export function dbDoTenant() {
  const escolaId = tenantAtual()

  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !MODELOS_ESCOPADOS_POR_TENANT.has(model)) {
            return query(args)
          }

          const entrada = args as Args

          switch (operation) {
            case 'findUnique':
            case 'findUniqueOrThrow': {
              const alvo = CONVERTE_PARA_FIND_FIRST[operation]!
              const achatado = achatarWhereComposto((entrada.where ?? {}) as Record<string, unknown>)
              return delegateDe(model)[alvo]!(comTenantNoWhere({ ...entrada, where: achatado }, escolaId))
            }

            case 'findFirst':
            case 'findFirstOrThrow':
            case 'findMany':
            case 'count':
            case 'aggregate':
            case 'groupBy':
            case 'updateMany':
            case 'deleteMany':
              return query(comTenantNoWhere(entrada, escolaId))

            case 'update':
            case 'delete': {
              // update/delete exigem where único; converter para a variante
              // *Many garante o filtro de tenant sem abrir mão da segurança.
              const alvo = operation === 'update' ? 'updateMany' : 'deleteMany'
              const achatado = achatarWhereComposto((entrada.where ?? {}) as Record<string, unknown>)
              return delegateDe(model)[alvo]!(comTenantNoWhere({ ...entrada, where: achatado }, escolaId))
            }

            case 'create':
            case 'createMany':
              return query(comTenantNoData(entrada, escolaId))

            case 'upsert': {
              // upsert exige um campo único no TOPO do where — embrulhar
              // tudo em AND, como nas demais operações, tiraria o único de
              // lá e o Prisma recusaria a chamada. Então o where original
              // fica onde está e o tenant entra como filtro adicional: se o
              // registro achado for de outra escola, nada casa e o upsert
              // cai no ramo de create, que carimba o tenant corrente.
              const where = (entrada.where ?? {}) as Record<string, unknown>
              return query({
                ...entrada,
                where: { ...where, AND: [{ escolaId }] },
                create: { ...(entrada.create as object), escolaId },
              } as typeof args)
            }

            default:
              return query(entrada)
          }
        },
      },
    },
  })
}
