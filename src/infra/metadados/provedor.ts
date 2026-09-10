/**
 * O que uma consulta por ISBN devolve, já normalizado — cada provedor
 * traduz o próprio formato para este, e o resto do sistema não sabe de
 * onde veio.
 *
 * Todo campo além de título e ISBN é opcional, e ausência é `undefined`,
 * nunca `''` nem `0`. Um zero inventado em "número de páginas" é pior que
 * um branco: o branco a operadora preenche, o zero ela não vê
 * (Global Constraint 9).
 */
export interface MetadadosDeObra {
  isbn: string
  titulo: string
  subtitulo?: string
  autores: string[]
  editora?: string
  anoPublicacao?: number
  numeroDePaginas?: number
  idioma?: string
  sinopse?: string
  capaUrl?: string
  /** Qual provedor respondeu. Serve para rastrear ficha estranha depois. */
  fonte?: string
}

export interface ProvedorDeMetadados {
  nome: string
  /**
   * Recebe o ISBN JÁ normalizado (13 dígitos, verificador conferido).
   * Devolve `null` quando não encontra — não lança por "não achei".
   */
  buscarPorIsbn(isbn: string, sinal?: AbortSignal): Promise<MetadadosDeObra | null>
}
