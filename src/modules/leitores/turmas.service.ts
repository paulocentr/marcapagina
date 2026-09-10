import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import { exigirSerie } from '@/modules/leitores/serie'
import {
  AnoLetivoInexistenteError,
  type DependenciasDeAnosLetivos,
} from '@/modules/leitores/anos-letivos.service'
import type { Principal } from '@/core/auth/principal'

/**
 * Turmas: nome, série, turno e o ano letivo a que pertencem.
 *
 * A SÉRIE é o campo que este serviço protege com mais cuidado, e o
 * motivo está em `serie.ts`: ela é lida pelo filtro de faixa etária do
 * Carrinho e pelo override de circulação por série, os dois
 * interpretando o texto. Série em formato livre não quebra o cadastro —
 * quebra os dois consumidores, semanas depois, sem erro na tela.
 */

/** Os turnos que a escola opera. Fechado de propósito: ver `exigirTurno`. */
export const TURNOS = ['MANHA', 'TARDE', 'NOITE', 'INTEGRAL'] as const
export type Turno = (typeof TURNOS)[number]

export const ROTULO_DO_TURNO: Record<Turno, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  NOITE: 'Noite',
  INTEGRAL: 'Integral',
}

export interface TurmaRegistrada {
  id: string
  nome: string
  /** Sempre canônica: `"1"`–`"9"` ou `"1EM"`–`"3EM"`. */
  serie: string
  turno: string
  anoLetivoId: string
}

/** A turma com o que a tela precisa mostrar ao lado dela. */
export interface TurmaNaLista extends TurmaRegistrada {
  ano: number
  anoLetivoAtivo: boolean
  /** Quantos alunos ATIVOS ela tem. Contado, nunca digitado. */
  alunos: number
}

export interface DadosDeTurmaParaGravar {
  nome: string
  serie: string
  turno: string
  anoLetivoId: string
}

export interface RepositorioDeTurmas {
  listar(filtro?: { anoLetivoId?: string }): Promise<TurmaNaLista[]>
  obter(id: string): Promise<TurmaRegistrada | null>
  obterPorNome(anoLetivoId: string, nome: string): Promise<TurmaRegistrada | null>
  criar(dados: DadosDeTurmaParaGravar): Promise<TurmaRegistrada>
  atualizar(id: string, dados: Partial<DadosDeTurmaParaGravar>): Promise<TurmaRegistrada | null>
  contarAlunos(id: string): Promise<number>
}

export interface DependenciasDeTurmas extends DependenciasDeAnosLetivos {
  turmas: RepositorioDeTurmas
}

export class TurmaInexistenteError extends ErroDeDominio {
  constructor() {
    super('Esta turma não existe nesta escola.', 'TURMA_INEXISTENTE')
  }
}

export class TurmaJaExisteError extends ErroDeDominio {
  constructor(readonly nome: string) {
    super(
      `Já existe uma turma "${nome}" neste ano letivo. ` +
        `Dois nomes iguais no mesmo ano fazem a operadora escolher a errada no balcão.`,
      'TURMA_JA_EXISTE',
    )
  }
}

export class TurnoInvalidoError extends ErroDeDominio {
  constructor(readonly informado: string) {
    super(
      `"${informado}" não é um turno conhecido. Use manhã, tarde, noite ou integral.`,
      'TURNO_INVALIDO',
    )
  }
}

export class NomeDeTurmaObrigatorioError extends ErroDeDominio {
  constructor() {
    super('Informe o nome da turma, como "5º A".', 'NOME_DE_TURMA_OBRIGATORIO')
  }
}

export interface EntradaDeTurma {
  nome: string
  serie: string
  turno: string
  anoLetivoId: string
}

export type EdicaoDeTurma = Partial<EntradaDeTurma>

export async function listarTurmas(
  principal: Principal,
  filtro: { anoLetivoId?: string },
  deps: DependenciasDeTurmas,
): Promise<TurmaNaLista[]> {
  // `aluno:ver`: a lista de turmas é o que o formulário de aluno e o
  // filtro da lista de alunos consomem, e o monitor de balcão abre as
  // duas telas. Exigir `turma:gerenciar` aqui deixaria o formulário de
  // aluno sem turma para escolher.
  exigirPermissao(principal, 'aluno:ver')
  return deps.turmas.listar(filtro)
}

export async function obterTurma(
  principal: Principal,
  turmaId: string,
  deps: DependenciasDeTurmas,
): Promise<TurmaRegistrada> {
  exigirPermissao(principal, 'aluno:ver')

  const turma = await deps.turmas.obter(turmaId)
  if (!turma) throw new TurmaInexistenteError()
  return turma
}

export async function criarTurma(
  principal: Principal,
  entrada: EntradaDeTurma,
  deps: DependenciasDeTurmas,
): Promise<TurmaRegistrada> {
  exigirPermissao(principal, 'turma:gerenciar')

  const nome = exigirNome(entrada.nome)
  const serie = exigirSerie(entrada.serie)
  const turno = exigirTurno(entrada.turno)

  // O ano letivo passa pelo escopo de tenant, então um id da escola
  // vizinha não é achado — e a recusa sai em pt-BR em vez de a chave
  // estrangeira estourar em inglês na cara da operadora.
  const anoLetivo = await deps.anosLetivos.obter(entrada.anoLetivoId)
  if (!anoLetivo) throw new AnoLetivoInexistenteError()

  const homonima = await deps.turmas.obterPorNome(entrada.anoLetivoId, nome)
  if (homonima) throw new TurmaJaExisteError(nome)

  return deps.turmas.criar({ nome, serie, turno, anoLetivoId: entrada.anoLetivoId })
}

export async function editarTurma(
  principal: Principal,
  turmaId: string,
  entrada: EdicaoDeTurma,
  deps: DependenciasDeTurmas,
): Promise<TurmaRegistrada> {
  exigirPermissao(principal, 'turma:gerenciar')

  const atual = await deps.turmas.obter(turmaId)
  if (!atual) throw new TurmaInexistenteError()

  const alteracoes: Partial<DadosDeTurmaParaGravar> = {}

  if (entrada.nome !== undefined) alteracoes.nome = exigirNome(entrada.nome)
  if (entrada.serie !== undefined) alteracoes.serie = exigirSerie(entrada.serie)
  if (entrada.turno !== undefined) alteracoes.turno = exigirTurno(entrada.turno)

  if (entrada.anoLetivoId !== undefined) {
    const anoLetivo = await deps.anosLetivos.obter(entrada.anoLetivoId)
    if (!anoLetivo) throw new AnoLetivoInexistenteError()
    alteracoes.anoLetivoId = entrada.anoLetivoId
  }

  // O nome é único por ano letivo, e QUALQUER um dos dois pode ter
  // mudado. Conferir só quando o nome mudou deixaria passar a turma que
  // troca de ano e vira homônima da que já estava lá.
  const nomeFinal = alteracoes.nome === undefined ? atual.nome : alteracoes.nome
  const anoFinal =
    alteracoes.anoLetivoId === undefined ? atual.anoLetivoId : alteracoes.anoLetivoId

  if (nomeFinal !== atual.nome || anoFinal !== atual.anoLetivoId) {
    const homonima = await deps.turmas.obterPorNome(anoFinal, nomeFinal)
    // `homonima.id !== turmaId` porque a tela manda o formulário inteiro:
    // sem isso, salvar a turma sem mudar o nome recusaria a si mesma.
    if (homonima && homonima.id !== turmaId) throw new TurmaJaExisteError(nomeFinal)
  }

  const turma = await deps.turmas.atualizar(turmaId, alteracoes)
  if (!turma) throw new TurmaInexistenteError()
  return turma
}

function exigirNome(bruto: string): string {
  // `trim` apara as pontas mas deixa o espaço do meio: "5º  A" e "5º A"
  // seriam duas turmas visualmente idênticas na lista, e a operadora
  // escolheria a errada no balcão sem ver diferença nenhuma.
  const nome = bruto.replace(/\s+/g, ' ').trim()
  if (nome.length === 0) throw new NomeDeTurmaObrigatorioError()
  return nome
}

/**
 * O turno em forma canônica.
 *
 * A lista é FECHADA porque a coluna é texto livre no schema e o relatório
 * "atrasados por turno" agrupa por ela: `"Manhã"`, `"manha"` e `"MANHA"`
 * viram três turnos distintos num relatório que deveria ter três linhas
 * no total. O acento é removido para casar com `MANHA`, que é a forma já
 * gravada pelo seed e por todos os testes de circulação.
 */
function exigirTurno(bruto: string): Turno {
  const limpo = bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()

  if (!(TURNOS as readonly string[]).includes(limpo)) throw new TurnoInvalidoError(bruto.trim())
  return limpo as Turno
}
