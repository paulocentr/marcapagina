import { dbDoTenant } from '@/core/db/tenant-extension'
import type {
  MeuEmprestimoParaRenovar,
  MeuLivroEmMaos,
  MinhaReservaPronta,
  RepositorioDoPortal,
} from '@/modules/portal/portal.tipos'

/**
 * O repositório do portal.
 *
 * A regra de todo método daqui, sem exceção: **`alunoId` entra no `where`.**
 * Não é conveniência de consulta, é a primeira das duas barreiras que
 * impedem um aluno de alcançar o dado do colega — e a única que também
 * protege a ESCRITA. Escopar apenas a leitura impediria VER o empréstimo
 * do colega e ainda assim permitiria MUDAR o prazo dele, bastando o id
 * chegar pelo formulário.
 *
 * O `escolaId` não aparece em nenhum `where` daqui: a extensão de tenant
 * o injeta em toda query de modelo escopado, lendo o contexto que a rota
 * abriu a partir da sessão. Aluno de outra escola não é alcançável nem
 * com o id certo na mão.
 *
 * `alunoId` volta em toda linha de propósito — é o que permite ao serviço
 * conferir de novo, antes de a linha subir para a tela.
 */

const CAMPOS_DO_LIVRO = {
  id: true,
  alunoId: true,
  previstaPara: true,
  renovacoes: true,
  exemplar: {
    select: {
      obraId: true,
      obra: {
        select: {
          titulo: true,
          // Só o primeiro autor: a tela do celular mostra um, e trazer a
          // lista inteira de uma obra com seis organizadores seria seis
          // linhas por livro para desenhar uma.
          autores: {
            orderBy: { ordem: 'asc' as const },
            take: 1,
            select: { autor: { select: { nome: true } } },
          },
        },
      },
    },
  },
} as const

interface LinhaDoLivro {
  id: string
  alunoId: string | null
  previstaPara: Date
  renovacoes: number
  exemplar: {
    obraId: string
    obra: { titulo: string; autores: { autor: { nome: string } }[] }
  }
}

function paraLivro(linha: LinhaDoLivro): MeuLivroEmMaos {
  const primeiro = linha.exemplar.obra.autores[0]
  return {
    emprestimoId: linha.id,
    alunoId: linha.alunoId,
    obraId: linha.exemplar.obraId,
    titulo: linha.exemplar.obra.titulo,
    // `null` e não string vazia: obra sem autor é comum no acervo da
    // escola (apostila, cartilha), e a tela precisa saber a diferença
    // entre "não tem autor" e "tem, mas está em branco".
    autor: primeiro === undefined ? null : primeiro.autor.nome,
    previstaPara: linha.previstaPara,
    renovacoes: linha.renovacoes,
  }
}

export const portalRepository: RepositorioDoPortal = {
  async meusLivrosEmMaos(alunoId: string): Promise<MeuLivroEmMaos[]> {
    const linhas = (await dbDoTenant().emprestimo.findMany({
      // `devolvidaEm: null` é o que significa "em mãos". Não existe campo
      // "em curso" nem campo "atrasado" (Global Constraint 16): os dois
      // são derivados, sempre.
      where: { alunoId, devolvidaEm: null },
      // O que vence primeiro no topo: é a ordem em que o aluno precisa
      // agir, e coincide com o atrasado aparecendo antes.
      orderBy: [{ previstaPara: 'asc' }, { retiradaEm: 'asc' }],
      select: CAMPOS_DO_LIVRO,
    })) as LinhaDoLivro[]

    return linhas.map(paraLivro)
  },

  async minhaReservaPronta(alunoId: string): Promise<MinhaReservaPronta | null> {
    const linha = await dbDoTenant().reserva.findFirst({
      // DISPONIVEL e não AGUARDANDO: só a reserva com exemplar separado
      // manda o aluno ao balcão. Anunciar "sua reserva chegou" para quem
      // ainda espera na fila o faria ir buscar um livro que não está lá.
      where: { alunoId, status: 'DISPONIVEL' },
      // A que vence primeiro: é a que ele perde se não for hoje.
      orderBy: { retirarAte: 'asc' },
      select: {
        id: true,
        alunoId: true,
        retirarAte: true,
        obra: { select: { titulo: true } },
      },
    })

    if (!linha) return null
    // Reserva DISPONIVEL sem `retirarAte` seria estado impossível — quem
    // separa o exemplar liga o relógio na mesma escrita. Avisar em vez de
    // inventar uma data: prazo errado no portal faz o aluno perder a vez.
    if (linha.retirarAte === null) {
      throw new Error(
        `Reserva ${linha.id} está DISPONIVEL sem prazo de retirada. ` +
          `O portal não inventa a data: corrija a reserva no painel.`,
      )
    }

    return {
      reservaId: linha.id,
      alunoId: linha.alunoId,
      titulo: linha.obra.titulo,
      retirarAte: linha.retirarAte,
    }
  },

  async meuEmprestimo(
    alunoId: string,
    emprestimoId: string,
  ): Promise<MeuEmprestimoParaRenovar | null> {
    const linha = (await dbDoTenant().emprestimo.findFirst({
      // `alunoId` junto com o id: é o que faz o id do empréstimo do
      // colega, digitado no formulário, não achar nada.
      where: { id: emprestimoId, alunoId },
      select: { ...CAMPOS_DO_LIVRO, devolvidaEm: true },
    })) as (LinhaDoLivro & { devolvidaEm: Date | null }) | null

    if (!linha) return null
    return { ...paraLivro(linha), devolvidaEm: linha.devolvidaEm }
  },

  async registrarMinhaRenovacao(
    alunoId: string,
    emprestimoId: string,
    novaPrevista: Date,
  ): Promise<number> {
    const resultado = await dbDoTenant().emprestimo.updateMany({
      // Três condições, cada uma tapando um buraco diferente:
      // `alunoId` impede mexer no empréstimo do colega; `devolvidaEm:
      // null` impede ressuscitar um empréstimo que o balcão encerrou
      // enquanto o aluno tocava o botão — sem ela o livro ficaria
      // emprestado para sempre, já de volta na estante.
      where: { id: emprestimoId, alunoId, devolvidaEm: null },
      // `increment` e não um número calculado fora: a contagem é a regra
      // que faz o máximo de renovações valer, e reescrevê-la com um valor
      // lido antes perderia a renovação concorrente.
      data: { previstaPara: novaPrevista, renovacoes: { increment: 1 } },
    })

    return resultado.count
  },
}
