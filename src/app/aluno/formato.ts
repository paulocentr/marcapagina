/**
 * As datas do portal, escritas como a escola escreve.
 *
 * Tudo por componente **UTC**, sem exceção: `previstaPara` e `retirarAte`
 * saem de coluna `@db.Date`, ou seja meia-noite UTC. Formatar com
 * `toLocaleDateString` no fuso do processo mostraria 23/09 para um livro
 * que vence em 24/09 — um dia a menos, no lugar exato onde o aluno olha
 * para decidir quando devolver.
 */
export function formatarDia(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getUTCFullYear()}`
}

/** dd/mm, para onde o ano é ruído — o prazo de retirada é desta semana. */
export function formatarDiaCurto(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}`
}

/** "1 livro" / "2 livros" — para nenhuma tela escrever o plural à mão. */
export function contarLivros(quantos: number): string {
  if (!Number.isInteger(quantos) || quantos < 0) {
    throw new Error(`Contagem impossível de livros: ${quantos}.`)
  }
  return quantos === 1 ? '1 livro' : `${quantos} livros`
}
