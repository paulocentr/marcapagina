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

const ENDERECO = 'https://www.googleapis.com/books/v1/volumes'

interface RespostaDoGoogle {
  totalItems?: number
  items?: {
    volumeInfo?: {
      title?: string
      subtitle?: string
      authors?: string[]
      publisher?: string
      publishedDate?: string
      description?: string
      pageCount?: number
      language?: string
      imageLinks?: { thumbnail?: string; smallThumbnail?: string }
    }
  }[]
}

export function criarProvedorGoogleBooks(opcoes: OpcoesDeProvedorHttp = {}): ProvedorDeMetadados {
  const buscar = opcoes.buscar ?? buscarPadrao

  return {
    nome: 'google-books',

    async buscarPorIsbn(isbn: string, sinal?: AbortSignal): Promise<MetadadosDeObra | null> {
      const url = `${ENDERECO}?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`
      const corpo = await pegarJson<RespostaDoGoogle>(buscar, url, sinal, 'google-books')
      if (!corpo) return null

      const volume = corpo.items?.[0]?.volumeInfo
      // Sem título não há ficha: melhor cair para o próximo provedor do
      // que criar uma obra chamada "" que ninguém acha depois.
      const titulo = textoOuIndefinido(volume?.title)
      if (!titulo) return null

      return {
        isbn,
        titulo,
        subtitulo: textoOuIndefinido(volume?.subtitle),
        autores: Array.isArray(volume?.authors)
          ? volume.authors.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
          : [],
        editora: textoOuIndefinido(volume?.publisher),
        anoPublicacao: extrairAno(volume?.publishedDate),
        numeroDePaginas: numeroPositivo(volume?.pageCount),
        idioma: textoOuIndefinido(volume?.language),
        sinopse: textoOuIndefinido(volume?.description),
        capaUrl: emHttps(volume?.imageLinks?.thumbnail ?? volume?.imageLinks?.smallThumbnail),
      }
    },
  }
}
