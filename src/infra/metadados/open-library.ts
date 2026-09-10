import {
  buscarPadrao,
  emHttps,
  extrairAno,
  numeroPositivo,
  pegarJson,
  textoOuIndefinido,
  type OpcoesDeProvedorHttp,
} from '@/infra/metadados/http'
import type { MetadadosDeObra, ProvedorDeMetadados } from '@/infra/metadados/provedor'

const ENDERECO = 'https://openlibrary.org/api/books'

interface LivroDaOpenLibrary {
  title?: string
  subtitle?: string
  authors?: { name?: string }[]
  publishers?: { name?: string }[]
  publish_date?: string
  number_of_pages?: number
  cover?: { small?: string; medium?: string; large?: string }
}

export function criarProvedorOpenLibrary(opcoes: OpcoesDeProvedorHttp = {}): ProvedorDeMetadados {
  const buscar = opcoes.buscar ?? buscarPadrao

  return {
    nome: 'open-library',

    async buscarPorIsbn(isbn: string, sinal?: AbortSignal): Promise<MetadadosDeObra | null> {
      const chave = `ISBN:${isbn}`
      const url = `${ENDERECO}?bibkeys=${encodeURIComponent(chave)}&format=json&jscmd=data`

      const corpo = await pegarJson<Record<string, LivroDaOpenLibrary>>(
        buscar,
        url,
        sinal,
        'open-library',
      )
      if (!corpo) return null

      // A Open Library responde 200 com objeto vazio quando não conhece o
      // ISBN — a ausência da chave é o "não achei" dela.
      const livro = corpo[chave]
      if (!livro) return null

      const titulo = textoOuIndefinido(livro.title)
      if (!titulo) return null

      return {
        isbn,
        titulo,
        subtitulo: textoOuIndefinido(livro.subtitle),
        autores: (livro.authors ?? [])
          .map((a) => textoOuIndefinido(a?.name))
          .filter((n): n is string => n !== undefined),
        editora: textoOuIndefinido(livro.publishers?.[0]?.name),
        anoPublicacao: extrairAno(livro.publish_date),
        numeroDePaginas: numeroPositivo(livro.number_of_pages),
        // A maior primeiro: a ficha mostra a capa em tamanho decente e o
        // navegador reduz. Ao contrário não tem volta — a pequena
        // ampliada fica borrada.
        capaUrl: emHttps(livro.cover?.large ?? livro.cover?.medium ?? livro.cover?.small),
      }
    },
  }
}
