/**
 * Qual item da navegação está aceso.
 *
 * Módulo puro e sem React de propósito: é a única regra com decisão
 * dentro da casca do painel, e assim ela se prova sem renderizar nada.
 *
 * O item ativo é o de caminho mais específico que casa com a URL. Sem a
 * regra do mais longo, `/painel/acervo/novo` acenderia dois itens ao
 * mesmo tempo (Acervo e Catalogar) e a barra à esquerda deixaria de
 * dizer onde a operadora está — e é para isso que ela existe.
 */
export function ehOItemAtivo(
  href: string,
  caminho: string | null,
  itens: readonly { href: string }[],
): boolean {
  if (caminho === null) return false

  // `startsWith` com a barra: `/painel/acervoteca` não é filha de
  // `/painel/acervo`, e sem a barra passaria por filha.
  const candidatos = itens
    .map((item) => item.href)
    .filter((alvo) => caminho === alvo || caminho.startsWith(`${alvo}/`))

  if (candidatos.length === 0) return false

  let maisEspecifico = candidatos[0]!
  for (const alvo of candidatos) {
    if (alvo.length > maisEspecifico.length) maisEspecifico = alvo
  }

  return maisEspecifico === href
}
