/**
 * Faixa etária: casar o rótulo do acervo com a idade da turma.
 *
 * PURO, sem I/O — recebe o que já foi lido e devolve decisão. É o que
 * permite provar "livro de 14+ não vai para o 2º ano" numa suíte de
 * milissegundos, em vez de um caso de integração por combinação.
 *
 * Os dois lados são texto livre e nenhum deles é confiável:
 * `Obra.faixaEtaria` é preenchido pelas APIs de metadados ou digitado à
 * mão, e `Turma.serie` é o que a secretaria escreveu. Por isso toda
 * conversão devolve `null` quando não entende, e `null` significa
 * "não sei" — nunca zero.
 */

/** 1º ano do Fundamental. A escola não atende antes disso. */
const IDADE_NO_PRIMEIRO_ANO = 6
/** 1º ano do Médio: continua exatamente de onde o 9º parou. */
const IDADE_NO_PRIMEIRO_ANO_DO_MEDIO = 15

/**
 * Nenhum livro do acervo escolar tem idade mínima fora daqui. O teto
 * existe porque o campo é texto livre e alguém vai digitar um ano de
 * publicação nele: aceitar 2020 como idade mínima esconderia o acervo
 * INTEIRO de todas as turmas, e a sugestão viria vazia sem nenhuma pista
 * do motivo.
 */
const IDADE_MINIMA_PLAUSIVEL = 0
const IDADE_MAXIMA_PLAUSIVEL = 18

/**
 * A idade típica de quem está naquela série.
 *
 * Formatos aceitos são os dois que o schema documenta em `Turma.serie`:
 * `"5"` (Fundamental) e `"1EM"` (Médio).
 */
export function idadeTipicaDaSerie(serie: string | null): number | null {
  if (serie === null) return null

  const limpa = serie.trim().toUpperCase()

  const medio = /^([1-3])EM$/.exec(limpa)
  if (medio) {
    return IDADE_NO_PRIMEIRO_ANO_DO_MEDIO + (Number.parseInt(medio[1]!, 10) - 1)
  }

  const fundamental = /^([1-9])$/.exec(limpa)
  if (fundamental) {
    return IDADE_NO_PRIMEIRO_ANO + (Number.parseInt(fundamental[1]!, 10) - 1)
  }

  // Turma multisseriada, EJA, "Maternal": a escola pode ter, e o que este
  // módulo tem a dizer sobre elas é nada. Devolver um número chutado aqui
  // faria o filtro esconder livros com base num palpite.
  return null
}

/**
 * A idade mínima que o rótulo do acervo declara.
 *
 * O primeiro número plausível do texto é a ponta de baixo: "9 a 12 anos"
 * é um livro a partir dos 9. `Number.parseInt` roda sobre o que o regex
 * já provou ser dígito — nunca sobre a entrada crua.
 */
export function idadeMinimaDaFaixa(faixaEtaria: string | null): number | null {
  if (faixaEtaria === null) return null

  const digitos = /\d+/.exec(faixaEtaria)
  if (!digitos) return null

  const idade = Number.parseInt(digitos[0]!, 10)
  if (idade < IDADE_MINIMA_PLAUSIVEL || idade > IDADE_MAXIMA_PLAUSIVEL) return null

  return idade
}

/**
 * O livro pode ser sugerido para esta turma?
 *
 * O filtro é de UM lado só: barra o que está ACIMA da idade da turma.
 * Livro fácil demais continua passando — o carrinho existe para atender
 * pedidos que os próprios alunos fizeram, e esconder o título que um
 * deles escreveu com o próprio nome por ser "infantil demais" é julgar
 * gosto, não proteger ninguém.
 *
 * Quando qualquer um dos dois lados é desconhecido, o livro passa. A
 * maioria do acervo infantojuvenil nacional volta das APIs de metadados
 * sem faixa etária nenhuma (spec §5.5): filtrar pelo desconhecido
 * esvaziaria a sugestão e a operadora concluiria que ninguém pediu nada.
 */
export function obraCabeNaTurma(faixaEtaria: string | null, serie: string | null): boolean {
  const idadeMinima = idadeMinimaDaFaixa(faixaEtaria)
  if (idadeMinima === null) return true

  const idadeDaTurma = idadeTipicaDaSerie(serie)
  if (idadeDaTurma === null) return true

  return idadeMinima <= idadeDaTurma
}
