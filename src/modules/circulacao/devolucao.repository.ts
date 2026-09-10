import { dbDoTenant } from '@/core/db/tenant-extension'
import { balcaoRepository } from '@/modules/circulacao/balcao.repository'
import type {
  RepositorioDeDevolucao,
  EmprestimoParaDevolucao,
} from '@/modules/circulacao/devolver.service'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'
import type { EstadoDeConservacao, SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

/** Como o resultado aparece quando quem levou o livro foi da equipe. */
const LEITOR_DA_EQUIPE = 'Leitor da equipe'

export const devolucaoRepository: RepositorioDeDevolucao = {
  async emprestimoAtivoPorTombo(tombo: string): Promise<EmprestimoParaDevolucao | null> {
    // `devolvidaEm: null` é o que transforma "o tombo" em "o empréstimo
    // ativo do tombo". Sem ele, o mesmo exemplar traria o empréstimo do
    // ano passado e a devolução reabriria o histórico.
    const emprestimo = await dbDoTenant().emprestimo.findFirst({
      where: { devolvidaEm: null, exemplar: { tombo } },
      select: {
        id: true,
        exemplarId: true,
        alunoId: true,
        previstaPara: true,
        exemplar: { select: { tombo: true, obraId: true, obra: { select: { titulo: true } } } },
        // Nome e série vêm juntos: o nome é para a operadora confirmar em
        // voz alta de quem era o livro, a série decide o fator de
        // suspensão.
        aluno: { select: { nome: true, turma: { select: { serie: true } } } },
      },
    })

    if (!emprestimo) return null

    return {
      id: emprestimo.id,
      exemplarId: emprestimo.exemplarId,
      obraId: emprestimo.exemplar.obraId,
      tombo: emprestimo.exemplar.tombo,
      alunoId: emprestimo.alunoId,
      nomeDoLeitor: emprestimo.aluno?.nome ?? LEITOR_DA_EQUIPE,
      tituloDaObra: emprestimo.exemplar.obra.titulo,
      previstaPara: emprestimo.previstaPara,
      serieDoLeitor: emprestimo.aluno?.turma?.serie ?? null,
    }
  },

  async registrarDevolucao(dados: {
    emprestimoId: string
    devolvidaEm: Date
    operadorDevolucaoId: string
    estado: EstadoDeConservacao
    observacao: string | null
  }): Promise<boolean> {
    // A condição `devolvidaEm: null` faz o próprio banco decidir quem
    // devolveu primeiro. Um `update` por id aceitaria a segunda devolução
    // e aplicaria a penalidade duas vezes pelo mesmo atraso.
    const { count } = await dbDoTenant().emprestimo.updateMany({
      where: { id: dados.emprestimoId, devolvidaEm: null },
      data: {
        devolvidaEm: dados.devolvidaEm,
        operadorDevolucaoId: dados.operadorDevolucaoId,
        estadoNaDevolucao: dados.estado,
        observacao: dados.observacao,
      },
    })

    return count === 1
  },

  async atualizarExemplarNaDevolucao(
    exemplarId: string,
    situacao: SituacaoDoExemplar,
    estado: EstadoDeConservacao,
  ): Promise<void> {
    await dbDoTenant().exemplar.updateMany({
      where: { id: exemplarId },
      data: { situacao, estado },
    })
  },

  // As três abaixo são exatamente as mesmas leituras do balcão. Duplicar
  // as consultas criaria duas verdades sobre a configuração da escola, e
  // um dia elas divergiriam — com o empréstimo e a devolução usando
  // regras diferentes para o mesmo aluno.
  configuracaoDaEscola(): Promise<ConfiguracaoDaEscola> {
    return balcaoRepository.configuracaoDaEscola()
  },

  overridesPorSerie(): Promise<OverrideDeSerie[]> {
    return balcaoRepository.overridesPorSerie()
  },

  diasNaoLetivos(): Promise<Set<string>> {
    return balcaoRepository.diasNaoLetivos()
  },
}
