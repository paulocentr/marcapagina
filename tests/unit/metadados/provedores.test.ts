import { describe, it, expect, vi } from 'vitest'
import { criarProvedorGoogleBooks } from '@/infra/metadados/google-books'
import { criarProvedorOpenLibrary } from '@/infra/metadados/open-library'
import {
  GOOGLE_BOOKS_COMPLETO,
  GOOGLE_BOOKS_MAGRO,
  GOOGLE_BOOKS_VAZIO,
  OPEN_LIBRARY_COMPLETO,
  OPEN_LIBRARY_MAGRO,
  OPEN_LIBRARY_VAZIO,
} from '../../apoio/fixtures/metadados'

const ISBN = '9788535902778'

function fetchQueDevolve(corpo: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as unknown as Response)
}

describe('Google Books', () => {
  it('mapeia a resposta completa para MetadadosDeObra', async () => {
    const provedor = criarProvedorGoogleBooks({ buscar: fetchQueDevolve(GOOGLE_BOOKS_COMPLETO) })

    const achado = await provedor.buscarPorIsbn(ISBN)

    expect(achado).toMatchObject({
      isbn: ISBN,
      titulo: 'Dom Casmurro',
      subtitulo: 'edição comentada',
      autores: ['Machado de Assis'],
      editora: 'Companhia das Letras',
      anoPublicacao: 2016,
      numeroDePaginas: 256,
      idioma: 'pt-BR',
    })
  })

  it('troca http por https na URL da capa', async () => {
    // O Google devolve capa em http; a página é https e o navegador
    // bloqueia a imagem sem dizer nada — a ficha fica sem capa e ninguém
    // entende por quê.
    const provedor = criarProvedorGoogleBooks({ buscar: fetchQueDevolve(GOOGLE_BOOKS_COMPLETO) })

    const achado = await provedor.buscarPorIsbn(ISBN)

    expect(achado?.capaUrl?.startsWith('https://')).toBe(true)
  })

  it('sobrevive a campos ausentes sem inventar valor', async () => {
    // Sem `?? ''` e sem `?? 0`: campo ausente vira undefined e a tela
    // mostra vazio para a operadora preencher. Um zero inventado em
    // "número de páginas" é pior que um branco, porque ela não o vê.
    const provedor = criarProvedorGoogleBooks({ buscar: fetchQueDevolve(GOOGLE_BOOKS_MAGRO) })

    const achado = await provedor.buscarPorIsbn(ISBN)

    expect(achado?.titulo).toBe('Apostila de Matemática')
    expect(achado?.autores).toEqual([])
    expect(achado?.numeroDePaginas).toBeUndefined()
    expect(achado?.editora).toBeUndefined()
    expect(achado?.anoPublicacao).toBeUndefined()
  })

  it('devolve null quando não achou', async () => {
    const provedor = criarProvedorGoogleBooks({ buscar: fetchQueDevolve(GOOGLE_BOOKS_VAZIO) })

    await expect(provedor.buscarPorIsbn(ISBN)).resolves.toBeNull()
  })

  it('devolve null em resposta de erro HTTP, sem lançar', async () => {
    const provedor = criarProvedorGoogleBooks({ buscar: fetchQueDevolve({}, 503) })

    await expect(provedor.buscarPorIsbn(ISBN)).resolves.toBeNull()
  })

  it('extrai só o ano de uma data completa', async () => {
    const provedor = criarProvedorGoogleBooks({ buscar: fetchQueDevolve(GOOGLE_BOOKS_COMPLETO) })

    expect((await provedor.buscarPorIsbn(ISBN))?.anoPublicacao).toBe(2016)
  })

  it('consulta pelo ISBN recebido', async () => {
    const buscar = fetchQueDevolve(GOOGLE_BOOKS_COMPLETO)
    const provedor = criarProvedorGoogleBooks({ buscar })

    await provedor.buscarPorIsbn(ISBN)

    expect(String(buscar.mock.calls[0]?.[0])).toContain(ISBN)
  })
})

describe('Open Library', () => {
  it('mapeia a resposta completa para MetadadosDeObra', async () => {
    const provedor = criarProvedorOpenLibrary({ buscar: fetchQueDevolve(OPEN_LIBRARY_COMPLETO) })

    const achado = await provedor.buscarPorIsbn(ISBN)

    expect(achado).toMatchObject({
      isbn: ISBN,
      titulo: 'Dom Casmurro',
      subtitulo: 'romance',
      autores: ['Machado de Assis'],
      editora: 'Companhia das Letras',
      anoPublicacao: 2016,
      numeroDePaginas: 256,
    })
  })

  it('prefere a capa grande', async () => {
    const provedor = criarProvedorOpenLibrary({ buscar: fetchQueDevolve(OPEN_LIBRARY_COMPLETO) })

    expect((await provedor.buscarPorIsbn(ISBN))?.capaUrl).toContain('-L.jpg')
  })

  it('sobrevive a campos ausentes sem inventar valor', async () => {
    const provedor = criarProvedorOpenLibrary({ buscar: fetchQueDevolve(OPEN_LIBRARY_MAGRO) })

    const achado = await provedor.buscarPorIsbn(ISBN)

    expect(achado?.titulo).toBe('Livro Sem Nada')
    expect(achado?.autores).toEqual([])
    expect(achado?.capaUrl).toBeUndefined()
    expect(achado?.numeroDePaginas).toBeUndefined()
  })

  it('devolve null quando a chave do ISBN não vem na resposta', async () => {
    const provedor = criarProvedorOpenLibrary({ buscar: fetchQueDevolve(OPEN_LIBRARY_VAZIO) })

    await expect(provedor.buscarPorIsbn(ISBN)).resolves.toBeNull()
  })

  it('devolve null em resposta de erro HTTP, sem lançar', async () => {
    const provedor = criarProvedorOpenLibrary({ buscar: fetchQueDevolve({}, 500) })

    await expect(provedor.buscarPorIsbn(ISBN)).resolves.toBeNull()
  })

  it('extrai o ano de um publish_date por extenso', async () => {
    const provedor = criarProvedorOpenLibrary({
      buscar: fetchQueDevolve({
        'ISBN:9788535902778': { title: 'X', publish_date: 'March 14, 2016' },
      }),
    })

    expect((await provedor.buscarPorIsbn(ISBN))?.anoPublicacao).toBe(2016)
  })

  it('ignora publish_date sem ano em vez de gravar lixo', async () => {
    const provedor = criarProvedorOpenLibrary({
      buscar: fetchQueDevolve({ 'ISBN:9788535902778': { title: 'X', publish_date: 'sem data' } }),
    })

    expect((await provedor.buscarPorIsbn(ISBN))?.anoPublicacao).toBeUndefined()
  })
})
