import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import { normalizarIsbn } from '@/infra/metadados/isbn'
import { criarObra, type DependenciasDeObras, type ObraRegistrada } from '@/modules/acervo/obras.service'
import {
  criarExemplares,
  LIMITE_DE_EXEMPLARES_POR_VEZ,
  QuantidadeInvalidaError,
  type DependenciasDeExemplares,
  type ExemplarRegistrado,
  type OrigemDoExemplar,
  type EstadoDeConservacao,
} from '@/modules/acervo/exemplares.service'
import type { Principal } from '@/core/auth/principal'
import type { MetadadosDeObra, ProvedorDeMetadados } from '@/infra/metadados/provedor'

export interface DependenciasDeCatalogacao extends DependenciasDeObras, DependenciasDeExemplares {
  metadados: ProvedorDeMetadados
  /**
   * Executa tudo numa transação. Injetado em vez de importado para que o
   * serviço continue sem saber que banco existe (Global Constraint 4) —
   * nos testes de unidade é só uma função que chama o que recebeu.
   */
  emTransacao<T>(fn: () => Promise<T>): Promise<T>
}

export class IsbnInvalidoError extends ErroDeDominio {
  constructor(readonly informado: string) {
    super(
      'Este ISBN não confere. Verifique se algum dígito ficou trocado — ' +
        'não é o caso de cadastrar o livro como novo ainda.',
      'ISBN_INVALIDO',
    )
  }
}

export interface ResultadoDaConsulta {
  /** O ISBN em forma canônica, para a tela já preencher o manual. */
  isbn: string
  metadados: MetadadosDeObra | null
  /** Preenchido quando a escola JÁ tem uma ficha com este ISBN. */
  jaCadastrada: ObraRegistrada | null
}

/**
 * Passo 1 da catalogação em série: bipa o ISBN e mostra o que voltou.
 *
 * Não escreve nada. A operadora confere na tela e só então salva — é o
 * que impede a API de gravar ficha errada sem ninguém olhar.
 */
export async function consultarIsbn(
  principal: Principal,
  isbnBruto: string,
  deps: DependenciasDeCatalogacao,
): Promise<ResultadoDaConsulta> {
  exigirPermissao(principal, 'obra:ver')

  // Recusar aqui poupa a rede e, mais importante, dá à operadora a
  // mensagem certa: "você digitou errado", não "não achamos esse livro".
  // A segunda faria ela cadastrar uma duplicata manualmente.
  const isbn = normalizarIsbn(isbnBruto)
  if (!isbn) throw new IsbnInvalidoError(isbnBruto)

  // As duas consultas em paralelo: o acervo local é rápido e a rede é
  // lenta, então esperar uma pela outra só atrasaria a sessão.
  const [metadados, jaCadastrada] = await Promise.all([
    deps.metadados.buscarPorIsbn(isbn),
    procurarNoAcervo(isbn, deps),
  ])

  return { isbn, metadados, jaCadastrada }
}

export interface EntradaDeCatalogacao {
  metadados: MetadadosDeObra
  quantidadeDeExemplares: number
  /** Quando informado, acrescenta exemplares a uma ficha que já existe. */
  obraExistenteId?: string
  localizacaoId?: string
  origem?: OrigemDoExemplar
  estado?: EstadoDeConservacao
  categoriaId?: string
}

export interface ResultadoDaCatalogacao {
  obra: ObraRegistrada
  exemplares: ExemplarRegistrado[]
}

/**
 * Passo 2: grava a obra conferida e cria os exemplares com tombo.
 */
export async function catalogar(
  principal: Principal,
  entrada: EntradaDeCatalogacao,
  deps: DependenciasDeCatalogacao,
): Promise<ResultadoDaCatalogacao> {
  // AS DUAS permissões antes de qualquer escrita. Checar exemplar:criar
  // só na hora de criar o exemplar deixaria a obra já gravada e uma ficha
  // sem cópia nenhuma no acervo — que ninguém vê até procurar o livro.
  exigirPermissao(principal, 'obra:criar')
  exigirPermissao(principal, 'exemplar:criar')

  // Pela mesma razão, a quantidade é validada aqui e não só lá dentro.
  const { quantidadeDeExemplares: quantidade } = entrada
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new QuantidadeInvalidaError('Informe quantos exemplares criar (pelo menos 1).')
  }
  if (quantidade > LIMITE_DE_EXEMPLARES_POR_VEZ) {
    throw new QuantidadeInvalidaError(
      `No máximo ${LIMITE_DE_EXEMPLARES_POR_VEZ} exemplares por vez.`,
    )
  }

  // Obra, autores e exemplares vivem ou morrem juntos. Sem a transação,
  // uma falha na criação do exemplar deixaria no acervo uma ficha sem
  // cópia nenhuma — e ninguém saberia que ela está pela metade até
  // alguém procurar o livro na estante e não achar sequer o tombo.
  return deps.emTransacao(async () => {
    const obra = entrada.obraExistenteId
      ? await exigirObra(entrada.obraExistenteId, deps)
      : await criarObra(principal, paraEntradaDeObra(entrada), deps)

    const exemplares = await criarExemplares(
      principal,
      {
        obraId: obra.id,
        quantidade,
        estado: entrada.estado,
        localizacaoId: entrada.localizacaoId,
        origem: entrada.origem,
      },
      deps,
    )

    return { obra, exemplares }
  })
}

async function procurarNoAcervo(
  isbn: string,
  deps: DependenciasDeCatalogacao,
): Promise<ObraRegistrada | null> {
  const pagina = await deps.obras.buscar({ isbn, pagina: 1, porPagina: 1 })
  return pagina.itens[0] ?? null
}

async function exigirObra(
  obraId: string,
  deps: DependenciasDeCatalogacao,
): Promise<ObraRegistrada> {
  const obra = await deps.obras.obter(obraId)
  if (!obra) {
    throw new ErroDeDominio('Esta obra não existe no acervo desta escola.', 'OBRA_INEXISTENTE')
  }
  return obra
}

function paraEntradaDeObra(entrada: EntradaDeCatalogacao) {
  const m = entrada.metadados
  return {
    titulo: m.titulo,
    subtitulo: m.subtitulo,
    autores: m.autores,
    editora: m.editora,
    anoPublicacao: m.anoPublicacao,
    isbn: m.isbn,
    idioma: m.idioma,
    numeroDePaginas: m.numeroDePaginas,
    sinopse: m.sinopse,
    capaUrl: m.capaUrl,
    categoriaId: entrada.categoriaId,
  }
}
