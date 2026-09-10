/**
 * Normaliza um ISBN digitado ou bipado para a forma canônica de 13
 * dígitos, validando o dígito verificador. Devolve `null` quando não é
 * um ISBN válido.
 *
 * Validar o verificador, e não só o formato, é o que separa "esse livro
 * não está no acervo" de "você digitou errado". Sem isso, um dígito
 * trocado vira uma consulta que não acha nada, a operadora conclui que o
 * livro é novo e cadastra uma duplicata — no meio de uma sessão em série,
 * onde ninguém para para conferir.
 *
 * Leitor USB de código de barras se comporta como teclado (spec §7), então
 * o que chega aqui é exatamente o que chegaria digitado: com hífen, com
 * espaço, e às vezes com o X do ISBN-10.
 */
export function normalizarIsbn(bruto: string): string | null {
  const limpo = bruto.replace(/[\s-]/g, '').toUpperCase()

  if (limpo.length === 10) {
    if (!/^\d{9}[\dX]$/.test(limpo)) return null
    if (!verificador10Confere(limpo)) return null
    return paraIsbn13(limpo)
  }

  if (limpo.length === 13) {
    if (!/^\d{13}$/.test(limpo)) return null
    // 978 e 979 são os únicos prefixos GS1 atribuídos a livro. Treze
    // dígitos com verificador certo e outro prefixo é outro produto.
    if (!limpo.startsWith('978') && !limpo.startsWith('979')) return null
    return verificador13Confere(limpo) ? limpo : null
  }

  return null
}

function verificador10Confere(isbn10: string): boolean {
  const soma = [...isbn10].reduce((total, caractere, indice) => {
    const valor = caractere === 'X' ? 10 : Number(caractere)
    return total + valor * (10 - indice)
  }, 0)
  return soma % 11 === 0
}

function verificador13Confere(isbn13: string): boolean {
  const soma = [...isbn13].reduce((total, caractere, indice) => {
    return total + Number(caractere) * (indice % 2 === 0 ? 1 : 3)
  }, 0)
  return soma % 10 === 0
}

function paraIsbn13(isbn10: string): string {
  // O X só pode ser verificador do ISBN-10; ele não sobrevive à conversão,
  // porque o verificador de 13 é recalculado do zero.
  const base = `978${isbn10.slice(0, 9)}`
  const soma = [...base].reduce((total, caractere, indice) => {
    return total + Number(caractere) * (indice % 2 === 0 ? 1 : 3)
  }, 0)
  return `${base}${(10 - (soma % 10)) % 10}`
}
