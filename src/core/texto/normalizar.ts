/**
 * Chave de comparação para busca e deduplicação: minúsculas, sem acento,
 * espaço colapsado.
 *
 * O intervalo removido é só o dos diacríticos combinantes
 * (U+0300–U+036F), que a decomposição NFD separa da letra. Um regex mais
 * largo — `[^a-z ]`, por exemplo — apagaria títulos e nomes inteiros em
 * cirílico ou japonês, e todos eles colidiriam numa única chave vazia.
 *
 * A pontuação é preservada de propósito: "Vidas Secas" e "Vidas, Secas"
 * são coisas diferentes, e apagá-la faria títulos distintos colidirem.
 */
export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
