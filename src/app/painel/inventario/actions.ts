'use server'

import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { ErroDeDominio } from '@/core/errors'
import { dependenciasDoAcervo } from '@/modules/acervo/acervo.deps'
import {
  abrirInventario,
  conferirTombo,
  fecharInventario,
  InventarioJaAbertoError,
  type DependenciasDeInventario,
  type InventarioRegistrado,
} from '@/modules/acervo/inventario.service'
import type { PrincipalStaff } from '@/core/auth/principal'
import type { SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'
import { bipadosJaConferidos, tombosDoEscopo, type TomboBipado } from './conferencia'

/**
 * As ações da conferência de acervo.
 *
 * Toda uma delas entra por `comStaffNoTenant`, que lê a sessão e abre o
 * contexto de tenant — e nenhuma delas decide se pode: a autorização
 * mora no serviço (`inventario:executar`), que recebe o `Principal` por
 * parâmetro. A tela é só o balcão de onde a operadora bipa.
 */

export interface ConferenciaAberta {
  inventarioId: string
  /** `null` = acervo inteiro. */
  localizacaoId: string | null
  responsavelNome: string
  /** A sessão já existia e foi retomada, em vez de aberta agora. */
  retomada: boolean
  /**
   * Os tombos congelados na abertura, já filtrados pelo escopo. É o
   * denominador do contador da tela — o mesmo que o relatório chamará de
   * `esperados` no fechamento.
   */
  tombosEsperados: string[]
  /** O que já havia sido conferido antes desta aba abrir. */
  jaConferidos: TomboBipado[]
}

export type RespostaDeAbertura =
  | { ok: true; conferencia: ConferenciaAberta }
  | { ok: false; erro: string }

/**
 * Começa a conferência — ou retoma a que já estava aberta neste escopo.
 *
 * A conferência de uma estante dura dias e a pessoa fecha o navegador no
 * meio dela. O serviço recusa, de propósito, abrir uma segunda sessão no
 * mesmo escopo: duas sessões produzem duas verdades sobre o mesmo
 * acervo. Sem a retomada, essa recusa vira beco sem saída — a tela diria
 * "já existe uma conferência aberta" e não haveria caminho nenhum até
 * ela.
 *
 * A retomada passa por `abrirInventario` de propósito, e só usa a recusa
 * dele como sinal: é o serviço que verifica `inventario:executar`, e ele
 * a verifica ANTES de olhar o banco. Assim o caminho da retomada é
 * autorizado pelo mesmo gate do caminho da abertura — ler a sessão
 * aberta direto do repositório passaria por fora da permissão.
 */
export async function abrirConferenciaAction(escopo: string): Promise<RespostaDeAbertura> {
  // Campo em branco no seletor é "acervo inteiro", que é o que o serviço
  // chama de `localizacaoId: null`. String vazia jamais é id.
  const localizacaoId = escopo.trim().length === 0 ? null : escopo.trim()

  try {
    return await comStaffNoTenant(async (principal) => {
      const deps = dependenciasDoAcervo()
      const { inventario, retomada } = await abrirOuRetomar(principal, localizacaoId, deps)

      // A foto congelada na abertura: é dela que sai o denominador do
      // contador e o que já estava conferido. Contar de novo no acervo
      // vivo faria o número mudar sozinho conforme empréstimos
      // acontecem durante a conferência.
      const itens = await deps.inventario.listarItens(inventario.id)

      return {
        ok: true as const,
        conferencia: {
          inventarioId: inventario.id,
          localizacaoId: inventario.localizacaoId,
          responsavelNome: inventario.responsavelNome,
          retomada,
          tombosEsperados: tombosDoEscopo(itens, inventario.localizacaoId),
          jaConferidos: bipadosJaConferidos(itens, inventario.localizacaoId),
        },
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

async function abrirOuRetomar(
  principal: PrincipalStaff,
  localizacaoId: string | null,
  deps: DependenciasDeInventario,
): Promise<{ inventario: InventarioRegistrado; retomada: boolean }> {
  try {
    return {
      inventario: await abrirInventario(principal, { localizacaoId }, deps),
      retomada: false,
    }
  } catch (erro) {
    if (!(erro instanceof InventarioJaAbertoError)) throw erro

    const aberta = await deps.inventario.buscarAbertoPorEscopo(localizacaoId)
    // Sumiu entre a recusa e a leitura (alguém fechou a sessão nesse
    // intervalo). A recusa original é a resposta honesta; inventar uma
    // sessão nova aqui abriria a segunda verdade que o serviço recusou.
    if (!aberta) throw erro

    return { inventario: aberta, retomada: true }
  }
}

export type RespostaDaBipagem =
  | { ok: true; tombo: string; foraDoLugar: boolean }
  | { ok: false; erro: string; codigo: string }

/**
 * Um tombo bipado.
 *
 * O código do erro sobe junto com a mensagem porque a tela reage
 * diferente a um deles: se a sessão foi encerrada em outra máquina, não
 * há mais o que bipar e continuar aceitando leituras seria empilhar
 * bipagens que não estão sendo gravadas em lugar nenhum.
 */
export async function conferirTomboAction(
  inventarioId: string,
  tombo: string,
): Promise<RespostaDaBipagem> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const leitura = await conferirTombo(
        principal,
        { inventarioId, tombo },
        dependenciasDoAcervo(),
      )
      return { ok: true as const, tombo: leitura.tombo, foraDoLugar: leitura.foraDoLugar }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message, codigo: erro.codigo }
    throw erro
  }
}

export interface LinhaDoRelatorio {
  tombo: string
  situacaoNaAbertura: SituacaoDoExemplar
}

/** As três listas da spec §5.7, e mais nenhuma. */
export interface RelatorioNaTela {
  esperados: number
  conferidos: number
  naoEncontrados: LinhaDoRelatorio[]
  foraDoLugar: LinhaDoRelatorio[]
  constamEmprestados: LinhaDoRelatorio[]
}

export type RespostaDoFechamento =
  | { ok: true; relatorio: RelatorioNaTela }
  | { ok: false; erro: string }

export async function fecharConferenciaAction(
  inventarioId: string,
): Promise<RespostaDoFechamento> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const relatorio = await fecharInventario(principal, inventarioId, dependenciasDoAcervo())

      return {
        ok: true as const,
        relatorio: {
          esperados: relatorio.esperados,
          conferidos: relatorio.conferidos,
          naoEncontrados: relatorio.naoEncontrados.map(emLinha),
          foraDoLugar: relatorio.foraDoLugar.map(emLinha),
          constamEmprestados: relatorio.constamEmprestados.map(emLinha),
        },
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

/**
 * Só o que a tela mostra atravessa a fronteira: tombo e o que o exemplar
 * constava ser na abertura. `exemplarId` e as localizações ficam no
 * servidor — a tela não tem o que fazer com eles, e o que não sai não
 * vaza.
 */
function emLinha(item: {
  tombo: string
  situacaoNaAbertura: SituacaoDoExemplar
}): LinhaDoRelatorio {
  return { tombo: item.tombo, situacaoNaAbertura: item.situacaoNaAbertura }
}
