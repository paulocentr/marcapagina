import { dbDoTenant } from '@/core/db/tenant-extension'
import type {
  RepositorioDeConsultaDoCarrinho,
  RodadaEmAberto,
  TurmaDoCarrinho,
} from '@/modules/carrinho/carrinho-consulta.service'

export const consultaDoCarrinhoRepository: RepositorioDeConsultaDoCarrinho = {
  async turmasDoAnoLetivoAtivo(): Promise<TurmaDoCarrinho[]> {
    // Só as turmas do ano letivo ATIVO. Sem esse filtro a lista traria o
    // 5º A de 2024 junto com o de 2026, com o mesmo nome na tela e alunos
    // que já saíram da escola — e a rodada sairia para uma sala vazia.
    return dbDoTenant().turma.findMany({
      where: { anoLetivo: { ativo: true } },
      select: { id: true, nome: true, serie: true },
      orderBy: { nome: 'asc' },
    })
  },

  async rodadasPlanejadas(): Promise<RodadaEmAberto[]> {
    const linhas = await dbDoTenant().rodadaCarrinho.findMany({
      where: { status: 'PLANEJADA' },
      select: {
        id: true,
        turmaId: true,
        data: true,
        responsavelNome: true,
        observacao: true,
        turma: { select: { nome: true, serie: true } },
        exemplares: {
          select: {
            exemplarId: true,
            // O tombo e o título vêm na MESMA consulta: são eles que a
            // operadora confere contra a etiqueta do livro que voltou na
            // caixa, e resolvê-los depois seria um N+1 por rodada.
            exemplar: { select: { tombo: true, obra: { select: { titulo: true } } } },
          },
          orderBy: { exemplar: { tombo: 'asc' } },
        },
      },
      // A rodada mais recente primeiro: é a que acabou de voltar da sala.
      orderBy: { data: 'desc' },
    })

    return linhas.map((linha) => ({
      id: linha.id,
      turmaId: linha.turmaId,
      turmaNome: linha.turma.nome,
      turmaSerie: linha.turma.serie,
      data: linha.data,
      responsavelNome: linha.responsavelNome,
      observacao: linha.observacao,
      livros: linha.exemplares.map((item) => ({
        exemplarId: item.exemplarId,
        tombo: item.exemplar.tombo,
        titulo: item.exemplar.obra.titulo,
      })),
    }))
  },
}
