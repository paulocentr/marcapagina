import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

/**
 * Ano letivo: o período em que as turmas daquele ano existem.
 *
 * É a raiz do cadastro de leitores — turma pende de ano letivo, e aluno
 * pende de turma. O "ativo" é UM só, e é o que a tela usa para abrir no
 * ano corrente sem obrigar a coordenação a escolher a cada visita.
 */

export interface AnoLetivoRegistrado {
  id: string
  ano: number
  dataInicio: Date
  dataFim: Date
  ativo: boolean
}

/** O que vai para o banco. `Date`, porque as colunas são de data. */
export interface DadosDeAnoLetivoParaGravar {
  ano: number
  dataInicio: Date
  dataFim: Date
  ativo: boolean
}

export interface RepositorioDeAnosLetivos {
  listar(): Promise<AnoLetivoRegistrado[]>
  obter(id: string): Promise<AnoLetivoRegistrado | null>
  obterPorAno(ano: number): Promise<AnoLetivoRegistrado | null>
  criar(dados: DadosDeAnoLetivoParaGravar): Promise<AnoLetivoRegistrado>
  /** Zera o ativo de TODOS. Só faz sentido dentro da troca de ano. */
  desativarTodos(): Promise<void>
  definirAtivo(id: string): Promise<AnoLetivoRegistrado | null>
}

export interface DependenciasDeAnosLetivos {
  anosLetivos: RepositorioDeAnosLetivos
  /**
   * Executa tudo numa transação. Injetado em vez de importado para que o
   * serviço continue sem saber que banco existe (Global Constraint 4) —
   * nos testes de unidade é só uma função que chama o que recebeu.
   */
  emTransacao<T>(fn: () => Promise<T>): Promise<T>
}

export class AnoLetivoInexistenteError extends ErroDeDominio {
  constructor() {
    super('Este ano letivo não existe nesta escola.', 'ANO_LETIVO_INEXISTENTE')
  }
}

export class AnoLetivoJaExisteError extends ErroDeDominio {
  constructor(readonly ano: number) {
    super(
      `O ano letivo de ${ano} já está cadastrado. Edite o que existe em vez de criar outro — ` +
        `as turmas de ${ano} estão penduradas nele.`,
      'ANO_LETIVO_JA_EXISTE',
    )
  }
}

export class PeriodoInvalidoError extends ErroDeDominio {
  constructor(mensagem: string) {
    super(mensagem, 'PERIODO_INVALIDO')
  }
}

// Barreira contra dedo escorregado, não decisão pedagógica: um ano letivo
// de 1200 ou de 3000 só pode ser engano de digitação, e ele viraria a
// raiz de um cadastro inteiro de turmas.
const ANO_MINIMO = 2000
const ANOS_DE_FOLGA_NO_FUTURO = 2

export interface EntradaDeAnoLetivo {
  ano: number
  /** ISO curta, `aaaa-mm-dd` — como a tela manda. */
  dataInicio: string
  dataFim: string
  /** Quando `true`, este passa a ser o ano ativo e os outros saem. */
  ativo?: boolean
}

export async function listarAnosLetivos(
  principal: Principal,
  deps: DependenciasDeAnosLetivos,
): Promise<AnoLetivoRegistrado[]> {
  // `aluno:ver` e não `turma:gerenciar`: a lista alimenta o filtro de
  // turmas da tela de alunos, que o monitor de balcão também abre.
  exigirPermissao(principal, 'aluno:ver')
  return deps.anosLetivos.listar()
}

export async function criarAnoLetivo(
  principal: Principal,
  entrada: EntradaDeAnoLetivo,
  deps: DependenciasDeAnosLetivos,
): Promise<AnoLetivoRegistrado> {
  exigirPermissao(principal, 'turma:gerenciar')

  const ano = exigirAnoPlausivel(entrada.ano)
  const dataInicio = exigirData(entrada.dataInicio, 'data de início')
  const dataFim = exigirData(entrada.dataFim, 'data de término')

  if (dataFim.getTime() <= dataInicio.getTime()) {
    throw new PeriodoInvalidoError(
      'A data de término do ano letivo precisa ser depois da data de início.',
    )
  }

  // Conferir aqui, e não deixar o índice único reclamar, é o que faz a
  // mensagem dizer o ano e o que fazer a respeito.
  const jaExiste = await deps.anosLetivos.obterPorAno(ano)
  if (jaExiste) throw new AnoLetivoJaExisteError(ano)

  const queroAtivo = entrada.ativo === true

  // A criação e a troca do ativo vivem ou morrem juntas: sem a transação,
  // uma falha depois de criar deixaria a escola com DOIS anos ativos — e
  // "qual é o ano corrente" passaria a depender da ordem da consulta.
  return deps.emTransacao(async () => {
    if (queroAtivo) await deps.anosLetivos.desativarTodos()
    return deps.anosLetivos.criar({ ano, dataInicio, dataFim, ativo: queroAtivo })
  })
}

/**
 * Marca qual ano letivo é o corrente.
 *
 * Desativa todos e ativa um, na MESMA transação. Duas escritas separadas
 * têm um instante em que a escola não tem ano ativo nenhum — e outro em
 * que tem dois. A tela que abre nesse instante escolhe o ano errado sem
 * nada indicar que escolheu.
 */
export async function definirAnoLetivoAtivo(
  principal: Principal,
  anoLetivoId: string,
  deps: DependenciasDeAnosLetivos,
): Promise<AnoLetivoRegistrado> {
  exigirPermissao(principal, 'turma:gerenciar')

  return deps.emTransacao(async () => {
    // Dentro da transação: conferir fora deixaria a janela em que o ano
    // é apagado entre a checagem e a escrita, e o `desativarTodos` teria
    // rodado para nada — a escola ficaria sem ano ativo.
    const alvo = await deps.anosLetivos.obter(anoLetivoId)
    if (!alvo) throw new AnoLetivoInexistenteError()

    await deps.anosLetivos.desativarTodos()

    const ativo = await deps.anosLetivos.definirAtivo(anoLetivoId)
    if (!ativo) throw new AnoLetivoInexistenteError()
    return ativo
  })
}

function exigirAnoPlausivel(bruto: number): number {
  const teto = new Date().getUTCFullYear() + ANOS_DE_FOLGA_NO_FUTURO

  if (!Number.isInteger(bruto)) {
    throw new PeriodoInvalidoError('O ano letivo precisa ser um número inteiro, como 2026.')
  }
  if (bruto < ANO_MINIMO || bruto > teto) {
    throw new PeriodoInvalidoError(
      `O ano letivo precisa estar entre ${ANO_MINIMO} e ${teto}. Confira se sobrou um dígito.`,
    )
  }

  return bruto
}

/**
 * `aaaa-mm-dd` para `Date` à meia-noite UTC.
 *
 * O `T00:00:00.000Z` não é enfeite: sem ele, `new Date('2026-02-01')`
 * lido em São Paulo já nasce como 31 de janeiro em horário local, e o
 * início do ano letivo aparece um dia antes na tela da secretaria.
 *
 * Valida componente a componente em vez de entregar a string ao `Date`:
 * `new Date('2026-02-31')` não estoura, ele devolve 3 de março — e o ano
 * letivo passaria a terminar num dia que ninguém digitou.
 */
function exigirData(bruto: string, oQue: string): Date {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto.trim())
  if (!partes) {
    throw new PeriodoInvalidoError(`Informe a ${oQue} do ano letivo no formato aaaa-mm-dd.`)
  }

  const ano = Number.parseInt(partes[1]!, 10)
  const mes = Number.parseInt(partes[2]!, 10)
  const dia = Number.parseInt(partes[3]!, 10)

  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) {
    throw new PeriodoInvalidoError(`A ${oQue} do ano letivo não existe no calendário.`)
  }

  return new Date(Date.UTC(ano, mes - 1, dia))
}

function diasNoMes(ano: number, mes: number): number {
  // Dia 0 do mês seguinte é o último deste mês; o próprio Date cuida do
  // ano bissexto, sem tabela mantida à mão.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}
