/**
 * A geometria dos gráficos do Painel do Leitor.
 *
 * Módulo puro, e é o ponto: escala de gráfico conferida a olho é escala
 * que mente na reunião pedagógica. Aqui dá para provar que a barra da
 * turma que emprestou 47 livros não passa do topo do eixo, que a turma
 * que emprestou UM continua visível, e que a turma que não emprestou
 * nada não ganha um risquinho de consolação.
 *
 * As regras de desenho são as das pranchas aprovadas: série única em uma
 * cor só, sem legenda (o título nomeia a série), marcas finas com ponta
 * arredondada ancorada na linha de base, grade discreta e rótulo de
 * valor SÓ onde ajuda.
 */

/** A altura do plot nas pranchas. Publicada para a tela não redigitá-la. */
export const ALTURA_DO_PLOT = 170

/**
 * A menor barra que ainda se vê.
 *
 * Uma turma que emprestou um livro contra uma que emprestou quinhentos
 * arredondaria para zero pixel e ficaria indistinguível da turma que não
 * emprestou nenhum — que é uma afirmação diferente e pedagogicamente
 * oposta.
 */
const ALTURA_MINIMA_VISIVEL = 2

/**
 * Os valores "redondos" que podem virar a marca do meio do eixo.
 *
 * Só inteiros: metade de um livro não existe, e uma marca de eixo em
 * "12,5" faz quem lê desconfiar do gráfico inteiro. A escada é fina o
 * bastante para o topo do eixo ficar perto do maior valor — folga demais
 * achata as barras e apaga a diferença entre as turmas, que é justamente
 * o que o gráfico existe para mostrar.
 */
const MANTISSAS = [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9] as const

export interface EscalaDeBarras {
  /** O topo do eixo. Sempre par, para a marca do meio ser inteira. */
  maximo: number
  /** Os valores das linhas de grade, do topo para a base. */
  marcas: number[]
  /** A altura em px de cada barra, na ordem em que os valores chegaram. */
  alturas: number[]
  /** Nenhum empréstimo no período. A tela diz isso com palavras. */
  vazio: boolean
}

function conferirContagens(valores: readonly number[]): void {
  for (const valor of valores) {
    if (!Number.isInteger(valor) || valor < 0) {
      throw new Error(
        `Contagem impossível de empréstimos: ${valor}. Número na tela é sempre ` +
          'contado, e contagem é inteira e não negativa.',
      )
    }
  }
}

/** O menor valor redondo da escada que é maior ou igual a `alvo`. */
function proximoRedondo(alvo: number): number {
  for (let expoente = 0; expoente <= 12; expoente += 1) {
    const potencia = 10 ** expoente
    for (const mantissa of MANTISSAS) {
      const candidato = mantissa * potencia
      if (Number.isInteger(candidato) && candidato >= alvo) return candidato
    }
  }

  // Uma biblioteca escolar não chega a 10^13 empréstimos numa semana.
  // Falhar alto em vez de devolver um eixo silenciosamente errado.
  throw new Error(`Não achei escala redonda para ${alvo}.`)
}

/**
 * As alturas das barras e as marcas do eixo.
 *
 * O topo do eixo é `2 × marca do meio`, e a marca do meio é o próximo
 * valor redondo acima da metade do maior valor — é assim que a grade sai
 * com três linhas inteiras (topo, meio, base), como na prancha.
 */
export function escalaDeBarras(
  valores: readonly number[],
  alturaEmPx: number = ALTURA_DO_PLOT,
): EscalaDeBarras {
  conferirContagens(valores)

  if (!Number.isFinite(alturaEmPx) || alturaEmPx <= 0) {
    throw new Error(`Altura de plot impossível: ${alturaEmPx}px.`)
  }

  const maior = valores.length === 0 ? 0 : Math.max(...valores)

  if (maior === 0) {
    // Período sem empréstimo: a grade continua desenhada com um eixo
    // pequeno e honesto, e as barras ficam em zero. Esconder o gráfico
    // faria a tela parecer quebrada num mês que foi só vazio — e um
    // eixo inventado (0 a 100) faria a linha de base parecer queda.
    return { maximo: 2, marcas: [2, 1, 0], alturas: valores.map(() => 0), vazio: true }
  }

  const meio = proximoRedondo(maior / 2)
  const maximo = meio * 2

  return {
    maximo,
    marcas: [maximo, meio, 0],
    alturas: valores.map((valor) => {
      if (valor === 0) return 0
      return Math.max(ALTURA_MINIMA_VISIVEL, Math.round((valor / maximo) * alturaEmPx))
    }),
    vazio: false,
  }
}

/**
 * Quais barras levam rótulo de valor.
 *
 * O maior e o menor, e mais nada: é o que responde "quem mais lê e quem
 * menos lê" sem cobrir o gráfico de números. Um número em cada barra
 * transforma o gráfico numa tabela mal formatada, e aí ninguém lê nem o
 * gráfico nem a tabela.
 *
 * Com menos de três barras não rotula nada — com duas, o eixo já diz.
 */
export function indicesComRotulo(valores: readonly number[]): number[] {
  conferirContagens(valores)

  if (valores.length < 3) return []

  const maior = Math.max(...valores)
  const menor = Math.min(...valores)
  if (maior === menor) return []

  const indiceDoMaior = valores.indexOf(maior)
  const indiceDoMenor = valores.indexOf(menor)

  return [indiceDoMaior, indiceDoMenor].sort((a, b) => a - b)
}

export interface Sparkline {
  /** Pronto para o atributo `points` de um `<polyline>`. */
  pontos: string
  /** A ponta direita, onde vai o marcador do valor de agora. */
  ultimo: { x: number; y: number }
}

/**
 * A tendência das últimas semanas, do tamanho de uma linha de texto.
 *
 * Ancorada em ZERO e não no menor valor da série: ancorar no menor
 * transforma uma variação de 3% num sobe-e-desce dramático, e o
 * sparkline passa a contar uma história que os números não contam.
 *
 * A exceção é a série constante, que ancorada em zero encostaria no topo
 * e pareceria crescimento máximo — ela sai numa reta no meio, que é o
 * que "não mudou" parece.
 *
 * Devolve `null` com menos de duas semanas: um ponto não é tendência, e
 * desenhar um traço reto ali afirmaria estabilidade sem base nenhuma.
 */
export function sparkline(
  valores: readonly number[],
  largura: number,
  altura: number,
): Sparkline | null {
  conferirContagens(valores)

  if (valores.length < 2) return null

  // Recuo para o traço e o marcador da ponta não saírem cortados pela
  // moldura do SVG.
  const recuo = 3
  const maior = Math.max(...valores)
  const menor = Math.min(...valores)

  const pontos = valores.map((valor, indice) => {
    const x = recuo + (indice / (valores.length - 1)) * (largura - 2 * recuo)
    const y =
      maior === menor
        ? altura / 2
        : recuo + (1 - valor / maior) * (altura - 2 * recuo)

    return { x: arredondar(x), y: arredondar(y) }
  })

  const ultimo = pontos[pontos.length - 1]
  if (!ultimo) throw new Error('Sparkline sem ponto final.')

  return {
    pontos: pontos.map((p) => `${p.x},${p.y}`).join(' '),
    ultimo,
  }
}

function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10
}
