import { criarProvedorGoogleBooks } from '@/infra/metadados/google-books'
import { criarProvedorOpenLibrary } from '@/infra/metadados/open-library'
import { emCascata } from '@/infra/metadados/em-cascata'
import type { MetadadosDeObra, ProvedorDeMetadados } from '@/infra/metadados/provedor'

export type { MetadadosDeObra, ProvedorDeMetadados }
export { normalizarIsbn } from '@/infra/metadados/isbn'

/**
 * O provedor que as rotas usam.
 *
 * Google Books primeiro, Open Library depois: nenhuma das duas cobre o
 * catálogo brasileiro sozinha, especialmente didático e infantojuvenil
 * nacional (spec §2.6), e a ordem reflete qual acerta mais no acervo que
 * esta escola tem.
 *
 * `MP_METADADOS_FAKE=1` troca a rede por um provedor de fixtures. É a
 * única concessão ao teste, e fica confinada AQUI, no ponto de
 * composição: nem o serviço nem a rota sabem que ela existe. Sem isso o
 * E2E dependeria de rede, e um teste que depende de rede falha na
 * sexta-feira por motivo alheio ao código.
 */
export function provedorDeMetadados(): ProvedorDeMetadados {
  if (process.env.MP_METADADOS_FAKE === '1') return provedorDeFixtures()

  return emCascata(criarProvedorGoogleBooks(), criarProvedorOpenLibrary())
}

const FIXTURES: Record<string, MetadadosDeObra> = {
  '9788535902778': {
    isbn: '9788535902778',
    titulo: 'Dom Casmurro',
    autores: ['Machado de Assis'],
    editora: 'Companhia das Letras',
    anoPublicacao: 2016,
    numeroDePaginas: 256,
    idioma: 'pt-BR',
    capaUrl: 'https://exemplo.invalido/capa-dom-casmurro.jpg',
    fonte: 'fixture',
  },
}

function provedorDeFixtures(): ProvedorDeMetadados {
  // Passa pela mesma cascata: assim o E2E exercita a normalização de ISBN
  // e o caminho de "nenhum provedor achou", não um atalho paralelo.
  return emCascata({
    nome: 'fixture',
    async buscarPorIsbn(isbn: string): Promise<MetadadosDeObra | null> {
      return FIXTURES[isbn] ?? null
    },
  })
}
