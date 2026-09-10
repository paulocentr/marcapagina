import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import type { SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

export interface LocalizacaoDoExemplar {
  nome: string
  corredor: string | null
  estante: string | null
  prateleira: string | null
}

/**
 * O exemplar como a operadora precisa vê-lo depois de bipar o tombo.
 *
 * Título, autor e estante ao lado do número: o tombo sozinho não confirma
 * nada, e bipar o exemplar errado só se descobre na devolução, quando o
 * livro certo já está com outra pessoa.
 *
 * `localizacao` vem com os quatro campos em vez de uma string montada
 * aqui: quem sabe se escreve "Estante 3 · prateleira 2" ou só "3" é a
 * tela, e montar o texto no serviço obrigaria a mudar o serviço para
 * mudar a etiqueta.
 */
export interface ExemplarBipado {
  id: string
  tombo: string
  situacao: SituacaoDoExemplar
  obraId: string
  tituloDaObra: string
  /** Na ordem em que foram catalogados. Vazio quando a obra não tem autor. */
  autores: string[]
  localizacao: LocalizacaoDoExemplar | null
}

/**
 * A primeira reserva VIVA da obra, como está no banco.
 *
 * Viva = espera (`AGUARDANDO`) ou já tem exemplar separado
 * (`DISPONIVEL`). Os dois casos interessam ao balcão e são perguntas
 * diferentes: "para quem separo" e "para quem isto já está separado".
 */
export interface CabecaDaFila {
  reservaId: string
  posicao: number
  nomeDoLeitor: string
  turma: string | null
  status: 'AGUARDANDO' | 'DISPONIVEL'
  exemplarSeparadoId: string | null
}

export interface ProximoDaFila {
  reservaId: string
  posicao: number
  nomeDoLeitor: string
  turma: string | null
  /**
   * Verdadeiro quando é ESTE exemplar que está guardado para ele.
   *
   * Derivado, nunca lido: a obra pode ter duas cópias e a reserva estar
   * presa à outra. Dizer "já separado" do exemplar na mão faria a
   * operadora devolvê-lo à estante achando a fila atendida — e o próximo
   * perderia a vez em silêncio.
   */
  jaSeparadoParaEle: boolean
}

export interface ConferenciaDoExemplar {
  exemplar: ExemplarBipado
  /** `null` quando não há fila para a obra. */
  proximoDaFila: ProximoDaFila | null
}

/**
 * A consulta de UMA bipagem de tombo no balcão.
 *
 * Um método só, e não um para o exemplar e outro para a fila, porque o
 * balcão faz esta pergunta dezenas de vezes por dia e a segunda chamada
 * dependeria da `obraId` que vem da primeira — duas idas ao banco em
 * série, com o aluno esperando na frente. A cabeça da fila entra num
 * join do mesmo SELECT.
 */
export interface RepositorioDeExemplarDoBalcao {
  conferirTombo(
    tombo: string,
  ): Promise<{ exemplar: ExemplarBipado; cabecaDaFila: CabecaDaFila | null } | null>
}

export interface DependenciasDeExemplarDoBalcao {
  exemplarDoBalcao: RepositorioDeExemplarDoBalcao
}

export class ExemplarNaoEncontradoError extends ErroDeDominio {
  constructor(readonly tombo: string) {
    super(
      `Não achei o tombo ${tombo} nesta escola. Confira o número.`,
      'EXEMPLAR_NAO_ENCONTRADO',
    )
  }
}

/**
 * Confere o exemplar bipado: o que é, onde mora, e quem o espera.
 *
 * Exige `obra:ver` — é leitura de acervo, e é a permissão que todo papel
 * de balcão tem, inclusive o MONITOR.
 */
export async function conferirExemplarNoBalcao(
  principal: Principal,
  tombo: string,
  deps: DependenciasDeExemplarDoBalcao,
): Promise<ConferenciaDoExemplar> {
  exigirPermissao(principal, 'obra:ver')

  // Mesma razão da matrícula: o leitor de código de barras às vezes
  // entrega espaço, ou um Enter, junto do número.
  const buscado = tombo.trim()
  const achado = await deps.exemplarDoBalcao.conferirTombo(buscado)
  if (!achado) throw new ExemplarNaoEncontradoError(buscado)

  return {
    exemplar: achado.exemplar,
    proximoDaFila:
      achado.cabecaDaFila === null
        ? null
        : {
            reservaId: achado.cabecaDaFila.reservaId,
            posicao: achado.cabecaDaFila.posicao,
            nomeDoLeitor: achado.cabecaDaFila.nomeDoLeitor,
            turma: achado.cabecaDaFila.turma,
            jaSeparadoParaEle:
              achado.cabecaDaFila.status === 'DISPONIVEL' &&
              achado.cabecaDaFila.exemplarSeparadoId === achado.exemplar.id,
          },
  }
}
