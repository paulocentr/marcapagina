import { dbDoTenant } from '@/core/db/tenant-extension'
import type {
  CabecaDaFila,
  ExemplarBipado,
  RepositorioDeExemplarDoBalcao,
} from '@/modules/circulacao/exemplar-do-balcao.service'
import type { SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

export const exemplarDoBalcaoRepository: RepositorioDeExemplarDoBalcao = {
  /**
   * Tudo que a bipagem de um tombo precisa, em UMA ida ao banco.
   *
   * Autores, localização e a cabeça da fila entram como joins do mesmo
   * SELECT. Buscar a fila numa segunda chamada dependeria da `obraId`
   * que só existe depois da primeira — duas consultas em série, com o
   * aluno esperando na frente do balcão.
   */
  async conferirTombo(
    tombo: string,
  ): Promise<{ exemplar: ExemplarBipado; cabecaDaFila: CabecaDaFila | null } | null> {
    const linha = await dbDoTenant().exemplar.findFirst({
      where: { tombo },
      select: {
        id: true,
        tombo: true,
        situacao: true,
        obraId: true,
        localizacao: {
          select: { nome: true, corredor: true, estante: true, prateleira: true },
        },
        obra: {
          select: {
            titulo: true,
            // Autoria não é conjunto: a ordem faz parte da ficha.
            autores: {
              orderBy: { ordem: 'asc' },
              select: { autor: { select: { nome: true } } },
            },
            // A fila VIVA da obra — quem espera e quem já tem exemplar
            // separado. A reserva é da OBRA, não do exemplar, então
            // bipar qualquer cópia mostra a mesma fila (spec §5.2).
            //
            // `take: 1` sobre a ordem de chegada: a faixa fala de uma
            // pessoa só, e trazer a fila inteira para usar a primeira
            // linha seria arrastar N reservas por bipagem.
            reservas: {
              where: { status: { in: ['AGUARDANDO', 'DISPONIVEL'] } },
              // Mesma ordem de `reservas.repository.ts`: posição, com
              // desempate por data de criação. Duas reservas podem nascer
              // com a MESMA posição, e sem o desempate a cabeça da fila
              // mudaria de consulta para consulta.
              orderBy: [{ posicao: 'asc' }, { criadaEm: 'asc' }],
              take: 1,
              select: {
                id: true,
                posicao: true,
                status: true,
                exemplarSeparadoId: true,
                aluno: { select: { nome: true, turma: { select: { nome: true } } } },
              },
            },
          },
        },
      },
    })

    if (!linha) return null

    const cabeca = linha.obra.reservas[0]

    return {
      exemplar: {
        id: linha.id,
        tombo: linha.tombo,
        situacao: linha.situacao as SituacaoDoExemplar,
        obraId: linha.obraId,
        tituloDaObra: linha.obra.titulo,
        autores: linha.obra.autores.map((ligacao) => ligacao.autor.nome),
        localizacao: linha.localizacao,
      },
      cabecaDaFila:
        cabeca === undefined
          ? null
          : {
              reservaId: cabeca.id,
              posicao: cabeca.posicao,
              // O WHERE já restringe aos dois status vivos; o cast é o
              // que o enum do Prisma pede para virar a união estreita do
              // contrato.
              status: cabeca.status as CabecaDaFila['status'],
              exemplarSeparadoId: cabeca.exemplarSeparadoId,
              nomeDoLeitor: cabeca.aluno.nome,
              turma: cabeca.aluno.turma?.nome ?? null,
            },
    }
  },
}
