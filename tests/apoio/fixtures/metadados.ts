// Fixtures no formato real das duas APIs, capturadas uma vez e
// versionadas. Nenhum teste toca a rede: um teste que depende de rede é
// um teste que falha na sexta-feira por motivo alheio ao código.

export const GOOGLE_BOOKS_COMPLETO = {
  totalItems: 1,
  items: [
    {
      volumeInfo: {
        title: 'Dom Casmurro',
        subtitle: 'edição comentada',
        authors: ['Machado de Assis'],
        publisher: 'Companhia das Letras',
        publishedDate: '2016-03-14',
        description: 'Bento Santiago narra sua história.',
        pageCount: 256,
        language: 'pt-BR',
        // O Google devolve capa em http; a página é https e o navegador
        // bloqueia a imagem sem dizer nada.
        imageLinks: {
          smallThumbnail: 'http://books.google.com/books/content?id=abc&zoom=5',
          thumbnail: 'http://books.google.com/books/content?id=abc&zoom=1',
        },
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9788535902778' }],
      },
    },
  ],
}

export const GOOGLE_BOOKS_MAGRO = {
  totalItems: 1,
  items: [{ volumeInfo: { title: 'Apostila de Matemática' } }],
}

export const GOOGLE_BOOKS_VAZIO = { totalItems: 0 }

export const OPEN_LIBRARY_COMPLETO = {
  'ISBN:9788535902778': {
    title: 'Dom Casmurro',
    subtitle: 'romance',
    authors: [{ name: 'Machado de Assis' }],
    publishers: [{ name: 'Companhia das Letras' }],
    publish_date: '2016',
    number_of_pages: 256,
    cover: {
      small: 'https://covers.openlibrary.org/b/id/1-S.jpg',
      medium: 'https://covers.openlibrary.org/b/id/1-M.jpg',
      large: 'https://covers.openlibrary.org/b/id/1-L.jpg',
    },
  },
}

export const OPEN_LIBRARY_MAGRO = {
  'ISBN:9788535902778': { title: 'Livro Sem Nada' },
}

export const OPEN_LIBRARY_VAZIO = {}
