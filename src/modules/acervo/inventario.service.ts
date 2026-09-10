import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import type { ExemplarRegistrado, SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

export type StatusDoInventario = 'ABERTO' | 'FECHADO' | 'CANCELADO'

export interface InventarioRegistrado {
  id: string
  localizacaoId: string | null
  responsavelId: string
  responsavelNome: string
  status: StatusDoInventario
}

export interface ItemDeInventario {
  exemplarId: string
  tombo: string
  /**
   * A situação no momento da ABERTURA, não a de agora.
   *
   * É ela que decide, no fechamento, se um exemplar ausente é perda ou
   * empréstimo em curso — e a situação de hoje já mudou quando o
   * inventário fecha, dias depois.
   */
  situacaoNaAbertura: SituacaoDoExemplar
  localizacaoEsperadaId: string | null
  conferido: boolean
  localizacaoEncontradaId: string | null
}

export interface RepositorioDeInventario {
  buscarAbertoPorEscopo(localizacaoId: string | null): Promise<InventarioRegistrado | null>
  listarExemplaresDoEscopo(localizacaoId: string | null): Promise<ExemplarRegistrado[]>
  abrir(
    dados: Omit<InventarioRegistrado, 'id' | 'status'>,
    doEscopo: ExemplarRegistrado[],
  ): Promise<InventarioRegistrado>
  obter(inventarioId: string): Promise<InventarioRegistrado | null>
  listarItens(inventarioId: string): Promise<ItemDeInventario[]>
  buscarExemplarPorTombo(tombo: string): Promise<ExemplarRegistrado | null>
  marcarConferido(
    inventarioId: string,
    exemplarId: string,
    localizacaoEncontradaId: string | null,
  ): Promise<void>
  fechar(inventarioId: string): Promise<void>
}

export interface DependenciasDeInventario {
  inventario: RepositorioDeInventario
}

export class InventarioJaAbertoError extends ErroDeDominio {
  constructor() {
    super(
      'Já existe uma conferência aberta para este escopo. Feche a anterior antes de começar outra.',
      'INVENTARIO_JA_ABERTO',
    )
  }
}

export class InventarioFechadoError extends ErroDeDominio {
  constructor() {
    super('Esta conferência já foi encerrada.', 'INVENTARIO_FECHADO')
  }
}

export class InventarioInexistenteError extends ErroDeDominio {
  constructor() {
    super('Esta conferência não existe nesta escola.', 'INVENTARIO_INEXISTENTE')
  }
}

export class TomboDesconhecidoError extends ErroDeDominio {
  constructor(readonly tombo: string) {
    super(
      `O tombo ${tombo} não existe no acervo desta escola. Confira se o número foi lido certo.`,
      'TOMBO_DESCONHECIDO',
    )
  }
}

export interface RelatorioDeInventario {
  inventarioId: string
  esperados: number
  conferidos: number
  /** Deveria estar na estante e não apareceu. É a lista de perda. */
  naoEncontrados: ItemDeInventario[]
  /** Apareceu aqui, mas pertence a outra localização. */
  foraDoLugar: ItemDeInventario[]
  /** Ausente porque está com um leitor — não é perda. */
  constamEmprestados: ItemDeInventario[]
}

export async function abrirInventario(
  principal: Principal,
  entrada: { localizacaoId?: string | null },
  deps: DependenciasDeInventario,
): Promise<InventarioRegistrado> {
  exigirPermissao(principal, 'inventario:executar')

  const localizacaoId = entrada.localizacaoId ?? null

  // Duas sessões abertas na mesma estante produzem duas verdades sobre o
  // mesmo acervo, e nenhuma das duas confiável.
  const aberto = await deps.inventario.buscarAbertoPorEscopo(localizacaoId)
  if (aberto) throw new InventarioJaAbertoError()

  // Os exemplares são CONGELADOS na abertura. Recalcular no fechamento
  // faria o relatório mudar sozinho conforme empréstimos acontecem
  // durante a conferência, que dura dias.
  const doEscopo = await deps.inventario.listarExemplaresDoEscopo(localizacaoId)

  return deps.inventario.abrir(
    {
      localizacaoId,
      responsavelId: principal.id,
      responsavelNome: principal.nome,
    },
    doEscopo,
  )
}

export async function conferirTombo(
  principal: Principal,
  entrada: { inventarioId: string; tombo: string },
  deps: DependenciasDeInventario,
): Promise<{ tombo: string; foraDoLugar: boolean }> {
  exigirPermissao(principal, 'inventario:executar')

  const inventario = await exigirAberto(entrada.inventarioId, deps)

  const tombo = entrada.tombo.trim()
  const exemplar = await deps.inventario.buscarExemplarPorTombo(tombo)
  // Tombo inexistente é erro de leitura ou etiqueta errada, e a operadora
  // precisa saber na hora — não no fim, quando não lembra mais qual livro
  // estava na mão.
  if (!exemplar) throw new TomboDesconhecidoError(tombo)

  // Conferir o mesmo tombo duas vezes não é erro: a operadora bipa em
  // sequência e repete sem perceber, e um alarme falso no meio da estante
  // é pior que a repetição.
  await deps.inventario.marcarConferido(
    inventario.id,
    exemplar.id,
    inventario.localizacaoId,
  )

  return {
    tombo,
    foraDoLugar:
      inventario.localizacaoId !== null && exemplar.localizacaoId !== inventario.localizacaoId,
  }
}

export async function fecharInventario(
  principal: Principal,
  inventarioId: string,
  deps: DependenciasDeInventario,
): Promise<RelatorioDeInventario> {
  exigirPermissao(principal, 'inventario:executar')

  const inventario = await exigirAberto(inventarioId, deps)
  const itens = await deps.inventario.listarItens(inventarioId)

  // "Esperados" é o que foi congelado na abertura para ESTE escopo. Um
  // exemplar de outra estante que apareceu aqui entra no relatório como
  // fora do lugar, mas não infla o total que a operadora deveria achar —
  // senão a conferência nunca fecharia em 100% e o número perderia o
  // sentido de "terminei".
  const doEscopo =
    inventario.localizacaoId === null
      ? itens
      : itens.filter((i) => i.localizacaoEsperadaId === inventario.localizacaoId)

  // As três listas da spec §5.7. A separação entre "não encontrado" e
  // "consta emprestado" é o ponto: confundir os dois faz a coordenação
  // caçar um livro que está legitimamente na mochila de um aluno.
  const ausentes = itens.filter((i) => !i.conferido)

  const relatorio: RelatorioDeInventario = {
    inventarioId,
    esperados: doEscopo.length,
    conferidos: doEscopo.filter((i) => i.conferido).length,
    naoEncontrados: ausentes.filter((i) => i.situacaoNaAbertura !== 'EMPRESTADO'),
    constamEmprestados: ausentes.filter((i) => i.situacaoNaAbertura === 'EMPRESTADO'),
    foraDoLugar: itens.filter(
      (i) =>
        i.conferido &&
        i.localizacaoEncontradaId !== null &&
        i.localizacaoEsperadaId !== i.localizacaoEncontradaId,
    ),
  }

  await deps.inventario.fechar(inventarioId)
  return relatorio
}

async function exigirAberto(
  inventarioId: string,
  deps: DependenciasDeInventario,
): Promise<InventarioRegistrado> {
  const inventario = await deps.inventario.obter(inventarioId)
  if (!inventario) throw new InventarioInexistenteError()
  if (inventario.status !== 'ABERTO') throw new InventarioFechadoError()
  return inventario
}
