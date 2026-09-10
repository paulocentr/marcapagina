import { prisma } from "@/core/db/client";
import {
  clienteDeTransacaoAtual,
  comTransacao,
  existeTransacaoEmCurso,
} from "@/core/db/transacao";
import { tenantAtual } from "@/core/tenant/context";
import { MODELOS_ESCOPADOS_POR_TENANT } from "@/core/db/modelos-tenant";
import { OperacaoNaoEscopavelError } from "@/core/errors";

type Args = Record<string, unknown>;
type Delegate = Record<string, (args: Args) => Promise<unknown>>;

// findUnique aceita apenas campos únicos no where, então não dá para
// simplesmente acrescentar escolaId. A conversão para findFirst permite
// filtrar por qualquer campo — inclusive o tenant — mantendo a semântica
// de "no máximo um resultado".
const CONVERTE_PARA_FIND_FIRST: Record<string, string> = {
  findUnique: "findFirst",
  findUniqueOrThrow: "findFirstOrThrow",
};

// update e delete exigem where único; a variante *Many aceita qualquer
// filtro e é o que permite acrescentar o tenant sem abrir mão da garantia.
const CONVERTE_PARA_MANY: Record<string, string> = {
  update: "updateMany",
  delete: "deleteMany",
};

// Os desvios da extensão (findUnique→findFirst, update→updateMany) precisam
// sair pelo cliente CERTO. Dentro de uma transação isso é o cliente dela:
// escapar para o global faria a escrita sobreviver ao rollback — o pior
// tipo de defeito, porque o dado fica lá e a operação inteira "não
// aconteceu". Fora de transação é o cliente cru, que não reentra na
// extensão. (Dentro, a reentrada acontece e é inofensiva: aplicar o filtro
// de tenant duas vezes dá no mesmo, e o destino do desvio nunca desvia de
// novo — não há recursão infinita.)
function delegateDe(model: string): Delegate {
  const chave = model.charAt(0).toLowerCase() + model.slice(1);
  const base = clienteDeTransacaoAtual<unknown>() ?? prisma;
  return (base as Record<string, Delegate>)[chave]!;
}

// O filtro de tenant entra por AND, não por sobrescrita da chave.
// Sobrescrever faria `where: { escolaId: <vizinho> }` virar
// `where: { escolaId: <meu> }` — a consulta pediu o registro do vizinho e
// receberia, em silêncio, OUTRO registro. Com AND as duas condições
// coexistem, não se satisfazem juntas, e o resultado é vazio: quem tentou
// alcançar o vizinho não alcança nada (Global Constraint 3).
function comTenantNoWhere(args: Args, escolaId: string): Args {
  const where = (args.where ?? {}) as Record<string, unknown>;
  return { ...args, where: { AND: [where, { escolaId }] } };
}

function comTenantNoData(args: Args, escolaId: string): Args {
  const data = args.data;
  if (Array.isArray(data)) {
    return { ...args, data: data.map((d) => ({ ...(d as object), escolaId })) };
  }
  return { ...args, data: { ...(data as object), escolaId } };
}

// Escopar o WHERE de um update impede alcançar o registro do vizinho, mas
// não impede EMPURRAR o próprio registro para lá: basta mandar
// `data: { escolaId: <vizinho> }` e o dado muda de dono, entregue pela
// porta da frente a quem só tinha permissão de editá-lo. Por isso o data
// de toda escrita tem o escolaId reescrito para o tenant corrente.
function semTrocaDeDono(data: unknown, escolaId: string): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  if (!("escolaId" in data)) return data;
  return { ...data, escolaId };
}

function comDataSaneada(args: Args, escolaId: string): Args {
  if (!("data" in args)) return args;
  const data = args.data;
  if (Array.isArray(data)) {
    return { ...args, data: data.map((d) => semTrocaDeDono(d, escolaId)) };
  }
  return { ...args, data: semTrocaDeDono(data, escolaId) };
}

// O where de findUnique pode trazer chave composta aninhada
// (ex.: escolaId_matricula). Achatar antes de filtrar por tenant.
function achatarWhereComposto(
  where: Record<string, unknown>,
): Record<string, unknown> {
  const achatado: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(where)) {
    if (
      chave.includes("_") &&
      valor &&
      typeof valor === "object" &&
      !Array.isArray(valor)
    ) {
      Object.assign(achatado, valor);
    } else {
      achatado[chave] = valor;
    }
  }
  return achatado;
}

// O escolaId é capturado AGORA, por quem monta o cliente — não lido lá
// dentro na hora da execução. O Prisma adia a execução da query até o
// `await`, e nesse momento o AsyncLocalStorage do tenant já não é o mesmo:
// ler o tenant tarde devolve "fora de contexto" para uma chamada que
// estava perfeitamente dentro dele.
function extensaoDeTenant(escolaId: string) {
  return {
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model?: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!model || !MODELOS_ESCOPADOS_POR_TENANT.has(model)) {
            return query(args);
          }

          const entrada = args as Args;

          switch (operation) {
            case "findUnique":
            case "findUniqueOrThrow": {
              const alvo = CONVERTE_PARA_FIND_FIRST[operation]!;
              const achatado = achatarWhereComposto(
                (entrada.where ?? {}) as Record<string, unknown>,
              );
              return delegateDe(model)[alvo]!(
                comTenantNoWhere({ ...entrada, where: achatado }, escolaId),
              );
            }

            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "count":
            case "aggregate":
            case "groupBy":
            case "deleteMany":
              return query(comTenantNoWhere(entrada, escolaId));

            case "updateMany":
            case "updateManyAndReturn":
              return query(
                comDataSaneada(comTenantNoWhere(entrada, escolaId), escolaId),
              );

            case "update":
            case "delete": {
              const alvo = CONVERTE_PARA_MANY[operation]!;
              const achatado = achatarWhereComposto(
                (entrada.where ?? {}) as Record<string, unknown>,
              );
              const escopado = comTenantNoWhere(
                { ...entrada, where: achatado },
                escolaId,
              );
              return delegateDe(model)[alvo]!(
                comDataSaneada(escopado, escolaId),
              );
            }

            case "create":
            case "createMany":
            case "createManyAndReturn":
              return query(comTenantNoData(entrada, escolaId));

            case "upsert": {
              // upsert exige um campo único no TOPO do where — embrulhar
              // tudo em AND, como nas demais operações, tiraria o único de
              // lá e o Prisma recusaria a chamada. Então o where original
              // fica onde está e o tenant entra como filtro adicional: se o
              // registro achado for de outra escola, nada casa e o upsert
              // cai no ramo de create, que carimba o tenant corrente.
              const where = (entrada.where ?? {}) as Record<string, unknown>;
              return query({
                ...entrada,
                where: { ...where, AND: [{ escolaId }] },
                update: semTrocaDeDono(entrada.update, escolaId),
                create: { ...(entrada.create as object), escolaId },
              } as typeof args);
            }

            default:
              // Fail-closed. A alternativa — deixar passar o que não se
              // sabe escopar — transforma cada operação nova do Prisma numa
              // porta aberta que ninguém vê até o dado do vizinho aparecer
              // na tela. Falhar alto custa um erro em desenvolvimento;
              // deixar passar custa um vazamento em produção.
              throw new OperacaoNaoEscopavelError(operation, model);
          }
        },
      },
    },
  } as const;
}

function estenderNoTenant(escolaId: string) {
  return prisma.$extends(extensaoDeTenant(escolaId) as never);
}

type ClienteEstendido = ReturnType<typeof estenderNoTenant>;

/**
 * O cliente Prisma escopado no tenant corrente. Dentro de uma transação,
 * é o cliente DA transação — senão a escrita escaparia dela e
 * sobreviveria a um rollback.
 */
export function dbDoTenant(): ClienteEstendido {
  const daTransacao = clienteDeTransacaoAtual<ClienteEstendido>();
  if (daTransacao) return daTransacao;

  // tenantAtual() é chamado AQUI, ainda dentro do contexto de quem pediu
  // o cliente, e o valor viaja capturado na extensão.
  return estenderNoTenant(tenantAtual());
}

/**
 * Executa `fn` numa transação. Repositórios chamados lá dentro a enxergam
 * automaticamente, via `dbDoTenant()`.
 *
 * Reentrante de propósito: se já houver transação em curso, reaproveita a
 * mesma em vez de abrir outra. O Prisma recusa transação aninhada, e
 * `criarExemplares` — que abre a sua para travar o tombo — é chamado
 * tanto sozinho quanto de dentro da catalogação.
 */
export async function executarEmTransacao<T>(fn: () => Promise<T>): Promise<T> {
  if (existeTransacaoEmCurso()) return fn();

  // O cliente é estendido ANTES de abrir a transação: o cliente de
  // transação do Prisma não aceita $extends, então estender depois é
  // impossível. Assim o `tx` que vai para o AsyncLocalStorage já nasce
  // escopado no tenant.
  const estendido = estenderNoTenant(tenantAtual());

  return estendido.$transaction((tx) => comTransacao(tx, fn), {
    // A catalogação em série cria obra, autores e N exemplares, e a
    // geração de tombo espera a trava consultiva. O padrão de 5 s do
    // Prisma é curto para isso quando duas operadoras catalogam juntas.
    timeout: 20_000,
  });
}
