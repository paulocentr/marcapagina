import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

export type EstadoDeConservacao = 'NOVO' | 'BOM' | 'DESGASTADO' | 'DANIFICADO'

export type SituacaoDoExemplar =
  | 'DISPONIVEL'
  | 'EMPRESTADO'
  | 'RESERVADO'
  | 'EM_CARRINHO'
  | 'EM_MANUTENCAO'
  | 'EXTRAVIADO'
  | 'BAIXADO'

export type OrigemDoExemplar = 'COMPRA' | 'DOACAO' | 'GOVERNO'

/** As duas únicas situações que significam "saiu do acervo para sempre". */
export type SituacaoDeBaixa = Extract<SituacaoDoExemplar, 'BAIXADO' | 'EXTRAVIADO'>

export interface ExemplarRegistrado {
  id: string
  obraId: string
  tombo: string
  estado: EstadoDeConservacao
  situacao: SituacaoDoExemplar
  localizacaoId: string | null
  origem: OrigemDoExemplar
  observacao: string | null
}

export interface DadosParaCriarExemplares {
  obraId: string
  quantidade: number
  estado?: EstadoDeConservacao
  localizacaoId?: string
  origem?: OrigemDoExemplar
  dataDeAquisicao?: Date
  valorDeAquisicao?: number
}

export interface RepositorioDeExemplares {
  /**
   * Cria N exemplares com tombos sequenciais, numa transação, com o
   * próximo tombo calculado sob trava. É o repositório que faz isso, e
   * não o serviço, porque a garantia depende de transação e de trava de
   * banco — coisas que o serviço, por contrato, não conhece.
   */
  criarSequencial(dados: DadosParaCriarExemplares): Promise<ExemplarRegistrado[]>
  obter(exemplarId: string): Promise<ExemplarRegistrado | null>
  listarDaObra(obraId: string): Promise<ExemplarRegistrado[]>
  obterPorTombo(tombo: string): Promise<ExemplarRegistrado | null>
  atualizarSituacao(
    exemplarId: string,
    situacao: SituacaoDoExemplar,
    observacao: string,
  ): Promise<ExemplarRegistrado | null>
  contarPorSituacao(obraId: string): Promise<Record<SituacaoDoExemplar, number>>
}

export interface DependenciasDeExemplares {
  exemplares: RepositorioDeExemplares
}

// Um zero a mais em "10" vira 100 exemplares e uma limpeza manual — com
// tombos já queimados, que não voltam. O teto é folgado para a maior
// compra de livro didático plausível e ainda barra o engano de digitação.
export const LIMITE_DE_EXEMPLARES_POR_VEZ = 500

export class QuantidadeInvalidaError extends ErroDeDominio {
  constructor(mensagem: string) {
    super(mensagem, 'QUANTIDADE_INVALIDA')
  }
}

export class ExemplarInexistenteError extends ErroDeDominio {
  constructor() {
    super('Este exemplar não existe no acervo desta escola.', 'EXEMPLAR_INEXISTENTE')
  }
}

export class ExemplarEmprestadoError extends ErroDeDominio {
  constructor() {
    super(
      'Este exemplar está emprestado. Registre a devolução antes de dar baixa — ' +
        'senão o empréstimo em aberto some da cobrança sem o livro ter voltado.',
      'EXEMPLAR_EMPRESTADO',
    )
  }
}

export async function criarExemplares(
  principal: Principal,
  entrada: DadosParaCriarExemplares,
  deps: DependenciasDeExemplares,
): Promise<ExemplarRegistrado[]> {
  exigirPermissao(principal, 'exemplar:criar')

  const { quantidade } = entrada
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new QuantidadeInvalidaError('Informe quantos exemplares criar (pelo menos 1).')
  }
  if (quantidade > LIMITE_DE_EXEMPLARES_POR_VEZ) {
    throw new QuantidadeInvalidaError(
      `No máximo ${LIMITE_DE_EXEMPLARES_POR_VEZ} exemplares por vez. ` +
        `Para uma remessa maior, faça em lotes — tombo gerado não volta atrás.`,
    )
  }

  return deps.exemplares.criarSequencial(entrada)
}

export async function baixarExemplar(
  principal: Principal,
  entrada: { exemplarId: string; situacao: SituacaoDeBaixa; motivo: string },
  deps: DependenciasDeExemplares,
): Promise<ExemplarRegistrado> {
  exigirPermissao(principal, 'exemplar:baixar')

  const motivo = entrada.motivo.trim()
  if (!motivo) {
    // Baixa sem motivo é acervo sumindo sem explicação no relatório, e
    // ninguém consegue reconstruir a decisão meses depois.
    throw new ErroDeDominio('Informe o motivo da baixa.', 'MOTIVO_OBRIGATORIO')
  }

  const exemplar = await deps.exemplares.obter(entrada.exemplarId)
  if (!exemplar) throw new ExemplarInexistenteError()
  if (exemplar.situacao === 'EMPRESTADO') throw new ExemplarEmprestadoError()

  const atualizado = await deps.exemplares.atualizarSituacao(
    entrada.exemplarId,
    entrada.situacao,
    motivo,
  )
  if (!atualizado) throw new ExemplarInexistenteError()

  return atualizado
}

/**
 * Os exemplares de uma obra, em ordem de tombo — que é a ordem em que
 * estão na estante e na folha de etiquetas.
 */
export async function listarExemplaresDaObra(
  obraId: string,
  deps: DependenciasDeExemplares,
): Promise<ExemplarRegistrado[]> {
  return deps.exemplares.listarDaObra(obraId)
}

/**
 * Estoque é DERIVADO (spec §2.2): contagem de exemplares por situação,
 * nunca um número digitado que dessincroniza no primeiro empréstimo.
 */
export async function contarPorSituacao(
  obraId: string,
  deps: DependenciasDeExemplares,
): Promise<Record<SituacaoDoExemplar, number>> {
  return deps.exemplares.contarPorSituacao(obraId)
}
