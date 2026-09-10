import { dbDoTenant } from '@/core/db/tenant-extension'
import type { Prisma } from '@prisma/client'
import type {
  ObraPedidaPelaTurma,
  PedidoDeTituloLivre,
  PedidoRegistrado,
  RepositorioDoCarrinho,
  RodadaRegistrada,
  StatusDoPedido,
} from '@/modules/carrinho/carrinho.service'

/**
 * Enquanto a compra não foi decidida, o pedido de título de fora do
 * acervo continua valendo como demanda. `ATENDIDO` é impossível aqui (não
 * há exemplar para atender) e `RECUSADO` é decisão já tomada — contá-lo
 * faria a lista pedir verba para o que a coordenação já vetou.
 */
const EM_ABERTO_PARA_COMPRA: StatusDoPedido[] = ['PENDENTE', 'SUGERIDO_COMPRA']

const CAMPOS_DO_PEDIDO = {
  id: true,
  alunoId: true,
  obraId: true,
  tituloLivre: true,
  tituloLivreNormalizado: true,
  status: true,
} satisfies Prisma.PedidoCarrinhoSelect

const CAMPOS_DA_RODADA = {
  id: true,
  turmaId: true,
  data: true,
  responsavelId: true,
  responsavelNome: true,
  observacao: true,
  status: true,
  exemplares: { select: { exemplarId: true } },
} satisfies Prisma.RodadaCarrinhoSelect

type LinhaDeRodada = Omit<RodadaRegistrada, 'exemplaresIds'> & {
  exemplares: { exemplarId: string }[]
}

function montarRodada(linha: LinhaDeRodada): RodadaRegistrada {
  const { exemplares, ...rodada } = linha
  return { ...rodada, exemplaresIds: exemplares.map((e) => e.exemplarId) }
}

export const carrinhoRepository: RepositorioDoCarrinho = {
  async obterTurma(turmaId: string) {
    return dbDoTenant().turma.findFirst({
      where: { id: turmaId },
      select: { id: true, serie: true },
    })
  },

  async obterAluno(alunoId: string) {
    return dbDoTenant().aluno.findFirst({
      where: { id: alunoId },
      select: { id: true, nome: true },
    })
  },

  async obraExiste(obraId: string): Promise<boolean> {
    const obra = await dbDoTenant().obra.findFirst({ where: { id: obraId }, select: { id: true } })
    return obra !== null
  },

  async obraPorTituloNormalizado(tituloNormalizado: string) {
    return dbDoTenant().obra.findFirst({
      where: { tituloNormalizado },
      select: { id: true },
    })
  },

  async pedidoPendenteIgual(chave): Promise<PedidoRegistrado | null> {
    return dbDoTenant().pedidoCarrinho.findFirst({
      where: {
        alunoId: chave.alunoId,
        obraId: chave.obraId,
        tituloLivreNormalizado: chave.tituloLivreNormalizado,
        status: 'PENDENTE',
      },
      select: CAMPOS_DO_PEDIDO,
    }) as unknown as Promise<PedidoRegistrado | null>
  },

  async criarPedido(dados): Promise<PedidoRegistrado> {
    // Cast pelo mesmo motivo documentado em audit.repository.ts: o tipo
    // gerado exige escolaId, que a extensão de tenant injeta em runtime.
    return dbDoTenant().pedidoCarrinho.create({
      data: dados as unknown as Prisma.PedidoCarrinhoCreateInput,
      select: CAMPOS_DO_PEDIDO,
    }) as unknown as Promise<PedidoRegistrado>
  },

  async criarRodada(dados): Promise<RodadaRegistrada> {
    const { exemplaresIds, ...rodada } = dados

    const criada = await dbDoTenant().rodadaCarrinho.create({
      data: {
        ...rodada,
        // Os exemplares entram na MESMA escrita da rodada. Gravá-los
        // depois deixaria, num erro no meio, uma rodada planejada sem
        // nenhum livro — e a operadora empurraria o carrinho vazio.
        exemplares: { create: exemplaresIds.map((exemplarId) => ({ exemplarId })) },
      } as unknown as Prisma.RodadaCarrinhoCreateInput,
      select: CAMPOS_DA_RODADA,
    })

    return montarRodada(criada as unknown as LinhaDeRodada)
  },

  async obterRodada(rodadaId: string): Promise<RodadaRegistrada | null> {
    const linha = await dbDoTenant().rodadaCarrinho.findFirst({
      where: { id: rodadaId },
      select: CAMPOS_DA_RODADA,
    })

    return linha === null ? null : montarRodada(linha as unknown as LinhaDeRodada)
  },

  async marcarRodadaRealizada(rodadaId: string): Promise<void> {
    await dbDoTenant().rodadaCarrinho.updateMany({
      where: { id: rodadaId },
      data: { status: 'REALIZADA' },
    })
  },

  async obrasPedidasPelaTurma(turmaId: string): Promise<ObraPedidaPelaTurma[]> {
    // Os pedidos vêm com a obra e os exemplares numa consulta só. Um
    // `groupBy` daria a contagem, mas não os tombos disponíveis nem a
    // faixa etária, e voltaríamos a consultar obra por obra — N+1 num
    // laço que a operadora espera na tela de montagem do carrinho.
    const pedidos = await dbDoTenant().pedidoCarrinho.findMany({
      where: {
        status: 'PENDENTE',
        obraId: { not: null },
        aluno: { turmaId },
      },
      select: {
        alunoId: true,
        obraId: true,
        obra: {
          select: {
            id: true,
            titulo: true,
            faixaEtaria: true,
            exemplares: {
              where: { situacao: 'DISPONIVEL' },
              select: { id: true, tombo: true },
              orderBy: { tombo: 'asc' },
            },
          },
        },
      },
    })

    const porObra = new Map<string, ObraPedidaPelaTurma & { quemPediu: Set<string> }>()

    for (const pedido of pedidos) {
      // `obraId: { not: null }` já garante a obra; o `continue` existe só
      // porque o tipo gerado não sabe disso. Não é um caso silencioso.
      if (!pedido.obra) continue

      const linha = porObra.get(pedido.obra.id)
      if (linha) {
        linha.quemPediu.add(pedido.alunoId)
        continue
      }

      porObra.set(pedido.obra.id, {
        obraId: pedido.obra.id,
        titulo: pedido.obra.titulo,
        faixaEtaria: pedido.obra.faixaEtaria,
        pedidos: 0,
        exemplaresDisponiveis: pedido.obra.exemplares,
        quemPediu: new Set([pedido.alunoId]),
      })
    }

    // A demanda é de ALUNOS distintos: o mesmo aluno pedindo duas vezes
    // não justifica levar duas cópias para a sala.
    return [...porObra.values()].map(({ quemPediu, ...obra }) => ({
      ...obra,
      pedidos: quemPediu.size,
    }))
  },

  async atenderPedidoPendente(alunoId: string, exemplarId: string): Promise<void> {
    await dbDoTenant().pedidoCarrinho.updateMany({
      where: {
        alunoId,
        status: 'PENDENTE',
        obra: { exemplares: { some: { id: exemplarId } } },
      },
      data: { status: 'ATENDIDO' },
    })
  },

  async pedidosDeTituloLivreEmAberto(): Promise<PedidoDeTituloLivre[]> {
    const linhas = await dbDoTenant().pedidoCarrinho.findMany({
      where: {
        tituloLivreNormalizado: { not: null },
        status: { in: EM_ABERTO_PARA_COMPRA },
      },
      select: { alunoId: true, tituloLivre: true, tituloLivreNormalizado: true },
      // A grafia que a lista mostra é a do primeiro aluno que pediu.
      orderBy: { criadoEm: 'asc' },
    })

    const pedidos: PedidoDeTituloLivre[] = []
    for (const linha of linhas) {
      // Um pedido com normalizado preenchido e título vazio seria dado
      // corrompido, não um caso a tratar: entrar na lista de compra com
      // título em branco faria a coordenação pedir verba para "".
      if (linha.tituloLivre === null || linha.tituloLivreNormalizado === null) continue
      pedidos.push({
        alunoId: linha.alunoId,
        titulo: linha.tituloLivre,
        tituloNormalizado: linha.tituloLivreNormalizado,
      })
    }
    return pedidos
  },
}
