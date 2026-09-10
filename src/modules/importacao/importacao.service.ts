import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import type { Permissao } from '@/core/rbac/permissoes'

export interface CampoDeImportacao {
  chave: string
  rotulo: string
  obrigatorio: boolean
}

/** `{ erro }` ou `{ valor }` — nunca os dois, nunca nenhum. */
export type ResultadoDaLinha<T> = { erro: string } | { valor: T }

/**
 * O que um tipo de importação precisa saber sobre si mesmo.
 *
 * A máquina (mapeamento, numeração de linha, deduplicação, transação) é
 * a mesma para alunos e para acervo; o que muda é a validação e a
 * gravação. Separar assim evita dois importadores paralelos que divergem
 * na primeira correção feita em apenas um deles.
 */
export interface PlanoDeImportacao<T> {
  nome: string
  permissao: Permissao
  campos: CampoDeImportacao[]
  validarLinha(obter: (chave: string) => string): ResultadoDaLinha<T>
  chaveDeDeduplicacao(item: T): string
  jaExistentes(chaves: string[], deps: unknown): Promise<Set<string>>
  gravar(itens: T[], deps: unknown): Promise<void>
}

export interface ProblemaNaLinha {
  /** Número da linha COMO A OPERADORA VÊ no Excel — cabeçalho é a 1. */
  linha: number
  mensagem: string
}

export interface Previa<T> {
  validas: T[]
  problemas: ProblemaNaLinha[]
  /** Linhas cuja chave já existe no banco. Serão puladas, não é erro. */
  jaExistentes: ProblemaNaLinha[]
}

export interface EntradaDeImportacao<T> {
  plano: PlanoDeImportacao<T>
  cabecalho: string[]
  linhas: string[][]
  /** chave do campo → índice da coluna na planilha. */
  mapeamento: Record<string, number>
}

export interface DependenciasDeImportacao {
  emTransacao<T>(fn: () => Promise<T>): Promise<T>
}

export class MapeamentoIncompletoError extends ErroDeDominio {
  constructor(readonly faltando: string[]) {
    super(
      `Faltou dizer qual coluna da planilha corresponde a: ${faltando.join(', ')}.`,
      'MAPEAMENTO_INCOMPLETO',
    )
  }
}

export class ImportacaoComErrosError extends ErroDeDominio {
  constructor(readonly problemas: ProblemaNaLinha[]) {
    super(
      `A planilha tem ${problemas.length} linha(s) com problema. Nada foi importado — ` +
        `corrija e envie de novo.`,
      'IMPORTACAO_COM_ERROS',
    )
  }
}

export async function previsualizar<T>(
  principal: Principal,
  entrada: EntradaDeImportacao<T>,
  deps: DependenciasDeImportacao,
): Promise<Previa<T>> {
  exigirPermissao(principal, entrada.plano.permissao)
  return analisar(entrada, deps)
}

export interface ResultadoDaImportacao {
  importados: number
  ignorados: number
}

export async function importar<T>(
  principal: Principal,
  entrada: EntradaDeImportacao<T>,
  deps: DependenciasDeImportacao,
): Promise<ResultadoDaImportacao> {
  exigirPermissao(principal, entrada.plano.permissao)

  const previa = await analisar(entrada, deps)

  // Tudo ou nada. Importação parcial é o pior resultado possível: a
  // operadora não sabe de onde recomeçar, e reenviar o arquivo
  // duplicaria o que já entrou.
  if (previa.problemas.length > 0) throw new ImportacaoComErrosError(previa.problemas)

  // Sem linha nova não há transação a abrir. Reimportar a planilha
  // inteira da secretaria é o caso normal, e o normal não pode custar uma
  // transação vazia.
  if (previa.validas.length === 0) {
    return { importados: 0, ignorados: previa.jaExistentes.length }
  }

  await deps.emTransacao(() => entrada.plano.gravar(previa.validas, deps))

  return { importados: previa.validas.length, ignorados: previa.jaExistentes.length }
}

async function analisar<T>(
  entrada: EntradaDeImportacao<T>,
  deps: DependenciasDeImportacao,
): Promise<Previa<T>> {
  const { plano, mapeamento, linhas } = entrada

  const faltando = plano.campos
    .filter((campo) => campo.obrigatorio && mapeamento[campo.chave] === undefined)
    .map((campo) => campo.rotulo)
  if (faltando.length > 0) throw new MapeamentoIncompletoError(faltando)

  const validas: T[] = []
  const problemas: ProblemaNaLinha[] = []
  const chavesNoArquivo = new Map<string, number>()
  const candidatos: { item: T; chave: string; linha: number }[] = []

  linhas.forEach((celulas, indice) => {
    // +2: a planilha começa em 1 e a primeira linha é o cabeçalho. É o
    // número que a operadora vê no Excel, e é o único que a ajuda.
    const numeroDaLinha = indice + 2

    const obter = (chave: string): string => {
      const coluna = mapeamento[chave]
      if (coluna === undefined) return ''
      return (celulas[coluna] ?? '').trim()
    }

    const resultado = plano.validarLinha(obter)
    if ('erro' in resultado) {
      problemas.push({ linha: numeroDaLinha, mensagem: resultado.erro })
      return
    }

    const chave = plano.chaveDeDeduplicacao(resultado.valor)
    const linhaAnterior = chavesNoArquivo.get(chave)
    if (linhaAnterior !== undefined) {
      problemas.push({
        linha: numeroDaLinha,
        mensagem: `Chave "${chave}" repetida — já aparece na linha ${linhaAnterior}.`,
      })
      return
    }

    chavesNoArquivo.set(chave, numeroDaLinha)
    candidatos.push({ item: resultado.valor, chave, linha: numeroDaLinha })
  })

  // Uma consulta para todas as chaves, não uma por linha: 400 alunos não
  // podem virar 400 idas ao banco.
  const existentes = await plano.jaExistentes(
    candidatos.map((c) => c.chave),
    deps,
  )

  const jaExistentes: ProblemaNaLinha[] = []
  for (const candidato of candidatos) {
    if (existentes.has(candidato.chave)) {
      // Já existir NÃO é erro: reimportar a planilha da secretaria com
      // dois nomes novos é o caso normal, e falhar por causa dos antigos
      // tornaria o importador inútil.
      jaExistentes.push({
        linha: candidato.linha,
        mensagem: `"${candidato.chave}" já está cadastrado — esta linha será ignorada.`,
      })
      continue
    }
    validas.push(candidato.item)
  }

  return { validas, problemas, jaExistentes }
}
