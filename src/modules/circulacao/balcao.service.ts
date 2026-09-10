import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import { avaliarBloqueios, type Bloqueio } from '@/modules/circulacao/bloqueios'
import {
  resolverConfiguracao,
  type ConfiguracaoDaEscola,
  type OverrideDeSerie,
} from '@/modules/circulacao/configuracao'
import { calcularDataDeDevolucao } from '@/modules/circulacao/prazo'
import { diasDeAtraso } from '@/modules/circulacao/penalidade'
import type { Principal } from '@/core/auth/principal'

export interface LeitorParaBalcao {
  id: string
  nome: string
  matricula: string
  turma: string | null
  serie: string | null
  ativo: boolean
  suspensaoAte: Date | null
}

/**
 * Um livro que o leitor está com ele AGORA, como o banco o conhece.
 *
 * Repare no que NÃO está aqui: nada que diga "atrasado". O repositório
 * devolve o fato — a data prevista — e quem decide é `situacaoDoLivro`,
 * função pura. Assim não existe caminho pelo qual um campo materializado
 * possa entrar nesta tela: não há campo a ler (Global Constraint 16).
 */
export interface LivroEmMaos {
  emprestimoId: string
  exemplarId: string
  tombo: string
  tituloDaObra: string
  previstaPara: Date
  renovacoes: number
}

/** O mesmo livro, já julgado contra a data de hoje. */
export interface LivroNaFicha extends LivroEmMaos {
  atrasado: boolean
  /** Zero quando está em dia. Nunca negativo. */
  diasDeAtraso: number
}

export interface LeitorComSituacao extends LeitorParaBalcao {
  bloqueios: Bloqueio[]
  emprestimosAtivos: number
  limiteDaSerie: number
  /** Quantos dias a série deste leitor leva o livro. A prancha imprime. */
  prazoDaSerieEmDias: number
  /**
   * A data que a operadora pode ler em voz alta ANTES de confirmar.
   *
   * Calculada com `calcularDataDeDevolucao`, o mesmo caminho que o
   * empréstimo usa para gravar — inclusive o calendário de dias não
   * letivos. Uma segunda fórmula aqui faria a tela prometer uma data e o
   * empréstimo gravar outra.
   */
  devolucaoPrevistaSeEmprestarHoje: Date
  /** Os títulos em mãos, do vencimento mais próximo para o mais distante. */
  emMaos: LivroNaFicha[]
}

/**
 * Consultas que só a TELA do balcão precisa.
 *
 * Vive separado do contrato de `emprestar` de propósito: acrescentar
 * métodos de tela àquela interface obrigaria todo fake de empréstimo a
 * implementá-los para exercitar regra que não tem nada a ver com eles.
 */
export interface RepositorioDeConsultaDoBalcao {
  obterPorMatricula(matricula: string): Promise<LeitorParaBalcao | null>
  configuracaoDaEscola(): Promise<ConfiguracaoDaEscola>
  overridesPorSerie(): Promise<OverrideDeSerie[]>
  diasNaoLetivos(): Promise<Set<string>>
  /**
   * Os empréstimos em aberto do leitor, com título e tombo.
   *
   * Substituiu `contarAtivosDoAluno` e `contarAtrasadosDoAluno` neste
   * contrato: a ficha mostra a LISTA e, ao lado dela, "2 de 3". Com as
   * contagens vindo de consultas separadas, nada impedia a tela de dizer
   * "2 de 3" ao lado de três livros — e a operadora, vendo o número
   * discordar do que ela conta com o dedo, deixa de confiar nos dois.
   * Derivar contador e bloqueio desta mesma lista torna a divergência
   * impossível, não apenas improvável.
   *
   * Não recebe `hoje`: quem decide atraso é o serviço, e o repositório
   * não tem como opinar.
   */
  livrosEmMaos(alunoId: string): Promise<LivroEmMaos[]>
}

export interface DependenciasDeConsultaDoBalcao {
  consultaDoBalcao: RepositorioDeConsultaDoBalcao
}

export class LeitorNaoEncontradoError extends ErroDeDominio {
  constructor(readonly matricula: string) {
    super(
      `Não achei a matrícula ${matricula} nesta escola. Confira o número.`,
      'LEITOR_NAO_ENCONTRADO',
    )
  }
}

/**
 * O leitor E a situação dele, numa chamada só.
 *
 * Os bloqueios vêm JUNTO porque a spec §5.1 manda mostrá-los antes de
 * escolher o livro. Buscar o leitor e consultar bloqueios numa segunda
 * chamada deixaria uma janela em que a tela mostra o aluno como liberado
 * — e a operadora começaria a procurar o livro por nada.
 */
export async function buscarLeitorParaBalcao(
  principal: Principal,
  matricula: string,
  hoje: Date,
  deps: DependenciasDeConsultaDoBalcao,
): Promise<LeitorComSituacao> {
  exigirPermissao(principal, 'aluno:ver')

  // Leitor de código de barras às vezes entrega espaço junto do número.
  const buscada = matricula.trim()
  const leitor = await deps.consultaDoBalcao.obterPorMatricula(buscada)
  if (!leitor) throw new LeitorNaoEncontradoError(buscada)

  const [daEscola, overrides, emMaos, diasNaoLetivos] = await Promise.all([
    deps.consultaDoBalcao.configuracaoDaEscola(),
    deps.consultaDoBalcao.overridesPorSerie(),
    deps.consultaDoBalcao.livrosEmMaos(leitor.id),
    deps.consultaDoBalcao.diasNaoLetivos(),
  ])

  const config = resolverConfiguracao(leitor.serie, daEscola, overrides)

  const ficha = emMaos.map((livro) => situacaoDoLivro(livro, hoje))
  // Contador e bloqueio saem da MESMA lista que a tela imprime. Ver a
  // nota em `livrosEmMaos`: duas fontes para o mesmo número é o jeito
  // mais rápido de a tela se contradizer na frente do aluno.
  const ativos = ficha.length
  const atrasados = ficha.filter((livro) => livro.atrasado).length

  return {
    ...leitor,
    emMaos: ficha,
    emprestimosAtivos: ativos,
    // O número, não só o sim/não: a operadora decide melhor sabendo que
    // o aluno está com 2 de 3 do que sabendo apenas "pode".
    limiteDaSerie: config.limiteSimultaneo,
    prazoDaSerieEmDias: config.prazoEmDias,
    devolucaoPrevistaSeEmprestarHoje: calcularDataDeDevolucao(
      hoje,
      config.prazoEmDias,
      (dia) => diasNaoLetivos.has(dia.toISOString().slice(0, 10)),
    ),
    bloqueios: avaliarBloqueios(
      {
        ativo: leitor.ativo,
        emprestimosAtivos: ativos,
        emprestimosEmAtraso: atrasados,
        suspensaoAte: leitor.suspensaoAte,
      },
      config,
      hoje,
    ),
  }
}

/**
 * "Atrasado" decidido AQUI, sobre a data, e em lugar nenhum mais.
 *
 * `diasDeAtraso` é o mesmo cálculo que a penalidade usa na devolução, e
 * devolve 0 para quem vence hoje — quem vence hoje tem o dia inteiro. A
 * tela pintar de vermelho quem cumpriu o prazo é acusar o aluno na cara
 * dele, e é a forma mais rápida de a operadora perder a confiança na cor.
 */
function situacaoDoLivro(livro: LivroEmMaos, hoje: Date): LivroNaFicha {
  const dias = diasDeAtraso(livro.previstaPara, hoje)
  return { ...livro, atrasado: dias > 0, diasDeAtraso: dias }
}
