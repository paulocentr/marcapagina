import { ErroDeDominio } from '@/core/errors'

/**
 * O formato de `Turma.serie` — e por que ele é validado na ENTRADA.
 *
 * A série não é rótulo decorativo da turma: é chave lida por dois
 * consumidores que interpretam o texto.
 *
 * 1. `idadeTipicaDaSerie` (`src/modules/carrinho/faixa-etaria.ts`) casa
 *    `^([1-9])$` para o Fundamental e `^([1-3])EM$` para o Médio. O que
 *    ela não entende vira `null`, e `null` significa "não sei" — o filtro
 *    de faixa etária do Carrinho passa a liberar o acervo inteiro para
 *    aquela turma, sem erro nenhum na tela.
 * 2. O override por série da configuração de circulação
 *    (`resolverConfiguracao`) compara `o.serie === serie` por igualdade
 *    EXATA, sem trim e sem caixa. Uma turma gravada como `"1em"` nunca
 *    casa com o override de `"1EM"` que a coordenação cadastrou, e a
 *    turma silenciosamente herda o prazo da escola.
 *
 * Nenhuma das duas quebras aparece no cadastro. Elas aparecem semanas
 * depois, como "o Carrinho está sugerindo livro adulto para o 2º ano" e
 * "o 1º EM não está pegando o prazo que eu configurei". É por isso que a
 * validação mora aqui, na porta de entrada, e não numa convenção.
 *
 * Módulo PURO, sem I/O: é o que permite provar o formato contra o
 * consumidor de verdade numa suíte de milissegundos.
 */

/** As nove séries do Fundamental, como `idadeTipicaDaSerie` as lê. */
const FUNDAMENTAL = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/** As três do Médio. Sempre com o sufixo `EM`, sempre em caixa alta. */
const MEDIO = ['1EM', '2EM', '3EM'] as const

/**
 * As doze séries que a escola atende, em ordem escolar — do 1º ano do
 * Fundamental ao 3º do Médio (CLAUDE.md). É esta ordem que a tela imprime
 * no `select`; ordenar alfabeticamente colocaria "1EM" entre "1" e "2".
 */
export const SERIES_VALIDAS: readonly string[] = [...FUNDAMENTAL, ...MEDIO]

export class SerieInvalidaError extends ErroDeDominio {
  constructor(readonly informada: string) {
    super(
      `"${informada}" não é uma série que o sistema saiba ler. ` +
        `Use 1 a 9 para o Fundamental e 1EM, 2EM ou 3EM para o Médio — ` +
        `é esse formato que o filtro do Carrinho da Leitura e a configuração ` +
        `por série leem.`,
      'SERIE_INVALIDA',
    )
  }
}

/**
 * A série em forma canônica, ou `null` quando não é série nenhuma.
 *
 * Tolerante na leitura, rígida na saída: aceita o que a secretaria
 * escreve à mão — minúscula, espaço, o ordinal `º` que a escola usa em
 * "5º" e "1º EM" — e devolve SEMPRE um dos doze valores de
 * `SERIES_VALIDAS`. Recusar "5º" mandaria a operadora adivinhar a
 * grafia; aceitá-lo e gravá-lo como "5º" quebraria os dois consumidores.
 *
 * `null` e nunca uma série chutada: devolver "1" para "Maternal" seria
 * inventar a idade de uma turma inteira.
 */
export function normalizarSerie(bruto: string): string | null {
  const limpa = bruto
    .toUpperCase()
    // Ordinal masculino, ordinal feminino e o símbolo de grau, que é o
    // que o teclado do Windows produz quando se tenta digitar "º".
    .replace(/[ºª°]/g, '')
    // Espaço em qualquer lugar: "1º EM" chega aqui como "1 EM".
    .replace(/\s+/g, '')

  return (SERIES_VALIDAS as readonly string[]).includes(limpa) ? limpa : null
}

/** A série canônica, ou recusa em pt-BR dizendo o que serve. */
export function exigirSerie(bruto: string): string {
  const serie = normalizarSerie(bruto)
  if (serie === null) throw new SerieInvalidaError(bruto.trim())
  return serie
}

/**
 * A série como a escola fala, para a tela.
 *
 * Série que o sistema não conhece volta CRUA em vez de sumir: turma
 * antiga com série fora do formato existe no banco de quem já importou
 * planilha, e esconder a linha faria a turma desaparecer da lista sem
 * ninguém entender por quê. Aparecer com o texto estranho é o que faz a
 * coordenação corrigi-la.
 */
export function rotuloDaSerie(serie: string): string {
  if ((FUNDAMENTAL as readonly string[]).includes(serie)) {
    return `${serie}º ano do Fundamental`
  }

  const medio = /^([1-3])EM$/.exec(serie)
  if (medio) return `${medio[1]}º ano do Médio`

  return serie
}
