import { exigirPermissao } from '@/core/rbac/verificar'
import {
  compararTotais,
  contarPorSemana,
  diaDaEscolaEm,
  inicioDoDiaDaEscola,
  janelaDeTendencia,
  recortarPeriodo,
  periodoAnterior,
  type ChaveDePeriodo,
  type Comparacao,
  type Periodo,
} from '@/modules/relatorios/periodo'
import type {
  DependenciasDeEmprestimos,
  EmprestimoAtrasado,
} from '@/modules/circulacao/emprestimos.service'
import type { Principal } from '@/core/auth/principal'

/**
 * O Painel do Leitor: o que a coordenação leva para a reunião
 * pedagógica.
 *
 * Tudo aqui é CONTADO na hora. Não existe tabela de resumo, não existe
 * cache e não existe campo "atrasado": atraso é sempre
 * `previstaPara < hoje AND devolvidaEm IS NULL`, e um número
 * materializado por cron mente todo dia em que o cron falhar — na
 * direção pior, dizendo que está tudo em ordem.
 *
 * O serviço não conhece HTTP: recebe `Principal` e chama
 * `exigirPermissao` (decisão 13). Quem lê a sessão é a rota.
 */

/** Quantas semanas o sparkline de tendência mostra. */
export const SEMANAS_DA_TENDENCIA = 12

/** Quantas linhas de atraso a tela mostra antes do "ver todos". */
export const LIMITE_DE_ATRASADOS_NA_TELA = 6

/** O Top da prancha. */
export const LIMITE_DE_MAIS_EMPRESTADAS = 5

/**
 * Quantas obras paradas a consulta traz.
 *
 * Existe um limite porque a lista pode ser o acervo quase inteiro no
 * primeiro mês de uso — e um relatório que trava a tela da coordenação
 * na reunião é pior que um relatório mais curto. O TOTAL continua sendo
 * contado inteiro, então o número grande não mente.
 */
export const LIMITE_DE_ACERVO_PARADO = 50

export interface EmprestimosPorLeitor {
  /** `null` é a equipe: staff também pega livro emprestado. */
  alunoId: string | null
  quantidade: number
}

export interface LeitorComTurma {
  alunoId: string
  turmaId: string | null
}

export interface TurmaDaEscola {
  id: string
  nome: string
  /** "6" para o Fundamental, "1EM" para o Médio. */
  serie: string
}

export interface AlunosPorTurma {
  turmaId: string | null
  quantidade: number
}

export interface ObraContada {
  obraId: string
  titulo: string
  /** Primeiro autor. `null` quando a obra foi catalogada sem autoria. */
  autor: string | null
  quantidade: number
}

export interface ObraParada {
  obraId: string
  titulo: string
  autor: string | null
  /** Quantos exemplares existem parados — é o que vai no carrinho. */
  exemplares: number
}

/**
 * As consultas do painel.
 *
 * Cada método é UMA pergunta e traz o custo documentado na
 * implementação. Nenhum devolve lista aberta: onde a lista pode crescer
 * com o acervo, o limite é parâmetro obrigatório.
 *
 * A junção entre empréstimo e turma NÃO é feita aqui: o repositório
 * devolve as duas metades e o serviço as cruza. É o que torna
 * "empréstimo de aluno sem turma", "turma sem empréstimo" e "aluno que o
 * banco não devolveu" provável sem banco — três casos que a tela mostra
 * errado com muita facilidade.
 */
export interface RepositorioDeRelatorios {
  /** `inicio` inclusivo, `fim` EXCLUSIVO, como em todo o módulo. */
  contarEmprestimosEntre(inicio: Date, fim: Date): Promise<number>
  emprestimosPorLeitorEntre(inicio: Date, fim: Date): Promise<EmprestimosPorLeitor[]>
  turmasDeLeitores(alunoIds: readonly string[]): Promise<LeitorComTurma[]>
  listarTurmas(): Promise<TurmaDaEscola[]>
  alunosAtivosPorTurma(): Promise<AlunosPorTurma[]>
  /** Só os instantes de retirada, para a tendência ser agrupada em memória. */
  diasDeRetiradaEntre(inicio: Date, fim: Date): Promise<Date[]>
  contarEmprestimosEmMaos(): Promise<number>
  contarExemplaresNoAcervo(): Promise<number>
  contarLeitoresSuspensos(hoje: Date): Promise<number>
  maisEmprestadasEntre(inicio: Date, fim: Date, limite: number): Promise<ObraContada[]>
  obrasNuncaEmprestadas(
    limite: number,
  ): Promise<{ total: number; obras: ObraParada[] }>
}

/**
 * O repositório de atraso vem da CIRCULAÇÃO, injetado.
 *
 * Não há uma segunda consulta de atrasados aqui de propósito: duas
 * cópias da fronteira `previstaPara < hoje` divergem na primeira
 * correção feita em apenas uma delas, e aí o balcão e o relatório
 * passam a discordar sobre quem está atrasado — com o aluno na frente.
 */
export interface DependenciasDeRelatorios extends DependenciasDeEmprestimos {
  relatorios: RepositorioDeRelatorios
}

export interface LinhaDeTurma {
  /** `null` na linha dos leitores sem turma cadastrada. */
  turmaId: string | null
  nome: string
  emprestimos: number
  alunos: number
  /**
   * Empréstimos por aluno ativo — a medida de engajamento.
   *
   * `null` quando a turma não tem aluno ativo: dividir por zero daria
   * `Infinity`, e `?? 0` diria "zero engajamento" sobre uma turma que
   * não existe mais.
   */
  porAluno: number | null
}

export interface PainelDoLeitor {
  periodo: Periodo
  anterior: { rotulo: string; total: number }
  emprestimos: {
    total: number
    comparacao: Comparacao
    /** Um número por semana, do mais antigo para o mais recente. */
    tendencia: number[]
  }
  emMaos: {
    total: number
    exemplaresNoAcervo: number
    /** `null` quando não há acervo — "0%" afirmaria que há. */
    percentualDoAcervo: number | null
  }
  atrasados: {
    /** A lista INTEIRA; `lista` é só o começo dela. */
    total: number
    diasDoMaisAntigo: number | null
    leitoresSuspensos: number
    lista: EmprestimoAtrasado[]
  }
  leitores: {
    ativos: number
    total: number
    percentual: number | null
  }
  turmas: LinhaDeTurma[]
  maisEmprestadas: ObraContada[]
  acervoParado: { total: number; obras: ObraParada[] }
}

export interface EntradaDoPainel {
  chave: ChaveDePeriodo
  /** O instante de agora, injetado: é o que deixa o teste rodar em qualquer data. */
  agora: Date
}

const NOME_SEM_TURMA = 'Sem turma'

/**
 * A ordem curricular de uma série.
 *
 * O gráfico por turma tem de sair na ordem em que a escola pensa — 6º,
 * 7º, …, 9º, depois 1º ao 3º do Médio. Ordem alfabética do nome poria
 * "1º EM" antes de "6º A" e a coordenação leria o gráfico ao contrário.
 *
 * Série desconhecida vai para o fim em vez de quebrar: um relatório que
 * falha porque alguém cadastrou "EJA" é pior que um relatório com a EJA
 * na última coluna.
 */
export function ordemDaSerie(serie: string): number {
  const medio = serie.match(/^(\d+)\s*EM$/i)
  if (medio) return 100 + Number(medio[1])

  const fundamental = serie.match(/^(\d+)$/)
  if (fundamental) return Number(fundamental[1])

  return 1000
}

export async function montarPainelDoLeitor(
  principal: Principal | null,
  entrada: EntradaDoPainel,
  deps: DependenciasDeRelatorios,
): Promise<PainelDoLeitor> {
  exigirPermissao(principal, 'relatorio:ver')

  const periodo = recortarPeriodo(entrada.chave, entrada.agora)
  const anterior = periodoAnterior(periodo)
  const tendencia = janelaDeTendencia(periodo, SEMANAS_DA_TENDENCIA)
  const repo = deps.relatorios

  // As consultas de atraso e de suspensão comparam contra colunas
  // `@db.Date` e derivam o DIA do instante que recebem. Passar
  // `new Date()` cru faria o dia virar às 21h em São Paulo, porque lá o
  // dia UTC já é o seguinte: no fim da tarde a coordenação veria como
  // atrasado o aluno que ainda tem o dia inteiro de amanhã. Normalizar
  // para a meia-noite do dia da ESCOLA resolve sem tocar na circulação.
  const hoje = inicioDoDiaDaEscola(diaDaEscolaEm(entrada.agora))

  // Primeira onda: tudo o que não depende de nada. Em paralelo porque
  // são consultas independentes e a tela abre num clique só.
  const [
    porLeitor,
    totalAnterior,
    diasDeRetirada,
    emMaos,
    exemplaresNoAcervo,
    leitoresSuspensos,
    turmas,
    alunosPorTurma,
    maisEmprestadas,
    acervoParado,
    atrasados,
  ] = await Promise.all([
    repo.emprestimosPorLeitorEntre(periodo.inicio, periodo.fim),
    repo.contarEmprestimosEntre(anterior.inicio, anterior.fim),
    repo.diasDeRetiradaEntre(tendencia.inicio, tendencia.fim),
    repo.contarEmprestimosEmMaos(),
    repo.contarExemplaresNoAcervo(),
    repo.contarLeitoresSuspensos(hoje),
    repo.listarTurmas(),
    repo.alunosAtivosPorTurma(),
    repo.maisEmprestadasEntre(periodo.inicio, periodo.fim, LIMITE_DE_MAIS_EMPRESTADAS),
    repo.obrasNuncaEmprestadas(LIMITE_DE_ACERVO_PARADO),
    deps.emprestimos.listarAtrasados(hoje),
  ])

  // Segunda onda: a turma de cada leitor que apareceu no período. Só
  // dos que apareceram — pedir todos os alunos da escola para desenhar
  // onze barras seria varredura à toa.
  const idsDeLeitores = porLeitor
    .map((linha) => linha.alunoId)
    .filter((id): id is string => id !== null)

  const turmasDeLeitores =
    idsDeLeitores.length === 0 ? [] : await repo.turmasDeLeitores(idsDeLeitores)

  // O total sai da MESMA lista que alimenta o gráfico. Uma segunda
  // consulta de total poderia discordar do gráfico na mesma tela, e a
  // coordenação levaria os dois números para a reunião.
  const total = porLeitor.reduce((soma, linha) => soma + linha.quantidade, 0)

  return {
    periodo,
    anterior: { rotulo: anterior.rotulo, total: totalAnterior },
    emprestimos: {
      total,
      comparacao: compararTotais(total, totalAnterior),
      tendencia: contarPorSemana(tendencia.semanas, diasDeRetirada),
    },
    emMaos: {
      total: emMaos,
      exemplaresNoAcervo,
      percentualDoAcervo: proporcao(emMaos, exemplaresNoAcervo),
    },
    atrasados: {
      total: atrasados.length,
      // A lista já vem do mais antigo para o mais recente — é a ordem em
      // que a coordenação cobra —, então o mais antigo é o primeiro.
      diasDoMaisAntigo: atrasados[0]?.diasDeAtraso ?? null,
      leitoresSuspensos,
      lista: atrasados.slice(0, LIMITE_DE_ATRASADOS_NA_TELA),
    },
    leitores: leitoresDoPeriodo(porLeitor, alunosPorTurma),
    turmas: montarLinhasDeTurma(porLeitor, turmasDeLeitores, turmas, alunosPorTurma),
    maisEmprestadas,
    acervoParado,
  }
}

/** Porcentagem, ou `null` quando não há base. Nunca `?? 0`. */
function proporcao(parte: number, todo: number): number | null {
  if (todo <= 0) return null
  return (parte / todo) * 100
}

function leitoresDoPeriodo(
  porLeitor: readonly EmprestimosPorLeitor[],
  alunosPorTurma: readonly AlunosPorTurma[],
): PainelDoLeitor['leitores'] {
  // Uma linha por aluno é o que a consulta agrupada devolve, então
  // contar linhas conta LEITORES distintos — não empréstimos. A linha da
  // equipe (`alunoId` nulo) fica fora: contá-la inflaria "44% dos alunos
  // pegaram ao menos um livro" com quem não é aluno.
  const ativos = porLeitor.filter((linha) => linha.alunoId !== null).length
  const total = alunosPorTurma.reduce((soma, linha) => soma + linha.quantidade, 0)

  return { ativos, total, percentual: proporcao(ativos, total) }
}

/**
 * As linhas do gráfico e da tabela por turma.
 *
 * Duas medidas na mesma linha, e de propósito: `emprestimos` é o
 * absoluto (o que o gráfico desenha) e `porAluno` é o engajamento (a
 * comparação justa). São escalas diferentes e por isso nunca compartilham
 * eixo — a turma de 30 alunos ganha sempre no absoluto só por ser maior,
 * e o ranking absoluto passaria a mentir sobre quem lê.
 */
function montarLinhasDeTurma(
  porLeitor: readonly EmprestimosPorLeitor[],
  turmasDeLeitores: readonly LeitorComTurma[],
  turmas: readonly TurmaDaEscola[],
  alunosPorTurma: readonly AlunosPorTurma[],
): LinhaDeTurma[] {
  const turmaDoAluno = new Map(turmasDeLeitores.map((l) => [l.alunoId, l.turmaId]))
  const alunosDaTurma = new Map(alunosPorTurma.map((l) => [l.turmaId, l.quantidade]))

  const emprestimosDaTurma = new Map<string | null, number>()
  let semTurma = 0

  for (const linha of porLeitor) {
    // A equipe não pertence a turma nenhuma: somá-la a "sem turma"
    // misturaria o livro da professora com o do aluno sem matrícula em
    // turma, que são coisas diferentes na reunião pedagógica.
    if (linha.alunoId === null) continue

    // `has` e não `get() ?? null`: o aluno que a segunda consulta não
    // devolveu — excluído entre as duas — não pode SUMIR do gráfico, ou
    // a soma das barras passa a discordar do número grande ao lado. Ele
    // entra em "sem turma", que é onde ele de fato está.
    const turmaId = turmaDoAluno.has(linha.alunoId)
      ? (turmaDoAluno.get(linha.alunoId) as string | null)
      : null

    if (turmaId === null) {
      semTurma += linha.quantidade
      continue
    }

    emprestimosDaTurma.set(turmaId, (emprestimosDaTurma.get(turmaId) ?? 0) + linha.quantidade)
  }

  const linhas: LinhaDeTurma[] = [...turmas]
    // Ordem curricular, e o nome só desempata turmas da mesma série.
    .sort(
      (a, b) =>
        ordemDaSerie(a.serie) - ordemDaSerie(b.serie) ||
        a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }),
    )
    .map((turma) => {
      // Turma sem empréstimo aparece com ZERO em vez de desaparecer: a
      // turma que não vai à biblioteca é justamente a informação que
      // muda decisão pedagógica.
      const emprestimos = emprestimosDaTurma.get(turma.id) ?? 0
      const alunos = alunosDaTurma.get(turma.id) ?? 0

      return {
        turmaId: turma.id,
        nome: turma.nome,
        emprestimos,
        alunos,
        porAluno: alunos > 0 ? emprestimos / alunos : null,
      }
    })
    // Sem aluno ativo E sem empréstimo no período: é a turma de um ano
    // letivo que já passou, e ela não tem nada a dizer num relatório de
    // leitura. O filtro é AQUI e não na consulta de propósito —
    // `listarTurmas` traz todas as turmas da escola justamente para que
    // nenhum `turmaId` de aluno fique sem linha: uma turma faltando na
    // lista faria os empréstimos dela desaparecerem do gráfico em
    // silêncio, e a soma das barras discordaria do número grande ao lado.
    .filter((linha) => linha.emprestimos > 0 || linha.alunos > 0)

  if (semTurma > 0 || (alunosDaTurma.get(null) ?? 0) > 0) {
    const alunos = alunosDaTurma.get(null) ?? 0
    linhas.push({
      turmaId: null,
      nome: NOME_SEM_TURMA,
      emprestimos: semTurma,
      alunos,
      porAluno: alunos > 0 ? semTurma / alunos : null,
    })
  }

  return linhas
}

/**
 * O painel para EXPORTAR.
 *
 * Exige `relatorio:exportar` e delega para `montarPainelDoLeitor`, que
 * exige `relatorio:ver` — baixar é ver mais levar embora, e as duas
 * permissões existem separadas justamente porque o professor enxerga o
 * painel da própria turma e não leva o arquivo com a escola inteira.
 *
 * Não monta nada por conta: o arquivo tem de dizer o MESMO que a tela
 * dizia quando o botão foi clicado, e duas montagens diferentes
 * divergiriam justamente na frente da direção.
 */
export async function exportarPainelDoLeitor(
  principal: Principal | null,
  entrada: EntradaDoPainel,
  deps: DependenciasDeRelatorios,
): Promise<PainelDoLeitor> {
  exigirPermissao(principal, 'relatorio:exportar')
  return montarPainelDoLeitor(principal, entrada, deps)
}
