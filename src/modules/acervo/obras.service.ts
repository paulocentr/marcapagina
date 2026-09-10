import { exigirPermissao } from '@/core/rbac/verificar'
import { normalizarParaBusca } from '@/core/texto/normalizar'
import { ErroDeDominio } from '@/core/errors'
import { garantirAutores, type DependenciasDeAutores } from '@/modules/acervo/autores.service'
import {
  entradaDeObraSchema,
  edicaoDeObraSchema,
  type EntradaDeObra,
  type EdicaoDeObra,
} from '@/modules/acervo/obras.schema'
import type { Principal } from '@/core/auth/principal'

export interface ObraRegistrada {
  id: string
  titulo: string
  subtitulo: string | null
  editora: string | null
  anoPublicacao: number | null
  isbn: string | null
  edicao: string | null
  idioma: string | null
  numeroDePaginas: number | null
  sinopse: string | null
  capaUrl: string | null
  cdd: string | null
  faixaEtaria: string | null
  categoriaId: string | null
}

export interface AutorDaObra {
  id: string
  nome: string
}

export interface ObraComDetalhes extends ObraRegistrada {
  autores: AutorDaObra[]
  totalDeExemplares: number
  exemplaresDisponiveis: number
}

/** O que vai para o banco: a entrada já validada, mais o normalizado. */
export interface DadosDeObraParaGravar extends Omit<ObraRegistrada, 'id'> {
  tituloNormalizado: string
}

export interface FiltroDeBusca {
  termo?: string
  categoriaId?: string
  isbn?: string
  pagina?: number
  porPagina?: number
}

export interface PaginaDeObras {
  itens: ObraComDetalhes[]
  total: number
  pagina: number
  porPagina: number
}

export interface RepositorioDeObras {
  criar(dados: DadosDeObraParaGravar): Promise<ObraRegistrada>
  atualizar(id: string, dados: Partial<DadosDeObraParaGravar>): Promise<ObraRegistrada | null>
  obter(id: string): Promise<ObraComDetalhes | null>
  buscar(filtro: FiltroDeBusca & { termoNormalizado?: string }): Promise<PaginaDeObras>
  definirAutores(obraId: string, autorIds: string[]): Promise<void>
  contarExemplares(obraId: string): Promise<number>
  excluir(id: string): Promise<void>
}

export interface DependenciasDeObras extends DependenciasDeAutores {
  obras: RepositorioDeObras
}

export class ObraInexistenteError extends ErroDeDominio {
  constructor() {
    super('Esta obra não existe no acervo desta escola.', 'OBRA_INEXISTENTE')
  }
}

export class ObraComExemplaresError extends ErroDeDominio {
  constructor(readonly exemplares: number) {
    super(
      `Esta obra não pode ser excluída: ela tem ${exemplares} exemplar(es) cadastrado(s). ` +
        `Dê baixa nos exemplares antes de excluir a ficha.`,
      'OBRA_COM_EXEMPLARES',
    )
  }
}

const PADRAO_POR_PAGINA = 20
const MAXIMO_POR_PAGINA = 100

export async function criarObra(
  principal: Principal,
  entrada: EntradaDeObra,
  deps: DependenciasDeObras,
): Promise<ObraRegistrada> {
  exigirPermissao(principal, 'obra:criar')

  const dados = entradaDeObraSchema.parse(entrada)

  // Os autores vêm antes da obra: se a criação do autor falhar, não fica
  // uma ficha sem autoria no acervo esperando alguém notar.
  const autorIds = dados.autores?.length
    ? await garantirAutores(principal, dados.autores, deps)
    : []

  const obra = await deps.obras.criar(paraGravar(dados))
  if (autorIds.length > 0) await deps.obras.definirAutores(obra.id, autorIds)

  return obra
}

export async function editarObra(
  principal: Principal,
  obraId: string,
  entrada: EdicaoDeObra,
  deps: DependenciasDeObras,
): Promise<ObraRegistrada> {
  exigirPermissao(principal, 'obra:editar')

  const dados = edicaoDeObraSchema.parse(entrada)

  const alteracoes: Partial<DadosDeObraParaGravar> = {}
  if (dados.titulo !== undefined) {
    alteracoes.titulo = dados.titulo
    // O normalizado acompanha o título SEMPRE. Deixar os dois divergirem
    // faz a obra sumir da busca sem nenhum sinal de que sumiu.
    alteracoes.tituloNormalizado = normalizarParaBusca(dados.titulo)
  }
  for (const campo of CAMPOS_OPCIONAIS) {
    if (dados[campo] !== undefined) {
      Object.assign(alteracoes, { [campo]: dados[campo] })
    }
  }

  const obra = await deps.obras.atualizar(obraId, alteracoes)
  if (!obra) throw new ObraInexistenteError()

  // `undefined` significa "não mexa na autoria"; `[]` significa "apague".
  // Sem essa distinção, editar só a editora apagaria os autores por
  // omissão — e ninguém desconfiaria antes do relatório sair errado.
  if (dados.autores !== undefined) {
    const autorIds = await garantirAutores(principal, dados.autores, deps)
    await deps.obras.definirAutores(obraId, autorIds)
  }

  return obra
}

export async function excluirObra(
  principal: Principal,
  obraId: string,
  deps: DependenciasDeObras,
): Promise<void> {
  exigirPermissao(principal, 'obra:excluir')

  // O banco também recusa (onDelete: Restrict), mas ali o erro sai em
  // inglês e sem o número. Checar aqui é o que produz uma mensagem que a
  // operadora consegue agir a respeito.
  const exemplares = await deps.obras.contarExemplares(obraId)
  if (exemplares > 0) throw new ObraComExemplaresError(exemplares)

  await deps.obras.excluir(obraId)
}

export async function obterObra(
  obraId: string,
  deps: DependenciasDeObras,
): Promise<ObraComDetalhes> {
  const obra = await deps.obras.obter(obraId)
  if (!obra) throw new ObraInexistenteError()
  return obra
}

/**
 * Busca no acervo. O caminho por título é de primeira classe (spec §2.2):
 * o sistema tem que funcionar com a estante inteira sem etiqueta, porque
 * a etiquetagem é gradual e pode nunca terminar.
 */
export async function buscarObras(
  filtro: FiltroDeBusca,
  deps: DependenciasDeObras,
): Promise<PaginaDeObras> {
  const termo = filtro.termo?.trim()
  const porPagina = Math.min(filtro.porPagina ?? PADRAO_POR_PAGINA, MAXIMO_POR_PAGINA)
  const pagina = Math.max(filtro.pagina ?? 1, 1)

  return deps.obras.buscar({
    ...filtro,
    pagina,
    porPagina,
    // O repositório compara contra a coluna normalizada; normalizar o
    // termo aqui é o que faz "sertao" achar "Sertão".
    termoNormalizado: termo ? normalizarParaBusca(termo) : undefined,
  })
}

const CAMPOS_OPCIONAIS = [
  'subtitulo',
  'editora',
  'anoPublicacao',
  'isbn',
  'edicao',
  'idioma',
  'numeroDePaginas',
  'sinopse',
  'capaUrl',
  'cdd',
  'faixaEtaria',
  'categoriaId',
] as const

function paraGravar(dados: EntradaDeObra): DadosDeObraParaGravar {
  return {
    titulo: dados.titulo,
    tituloNormalizado: normalizarParaBusca(dados.titulo),
    subtitulo: dados.subtitulo ?? null,
    editora: dados.editora ?? null,
    anoPublicacao: dados.anoPublicacao ?? null,
    isbn: dados.isbn ?? null,
    edicao: dados.edicao ?? null,
    idioma: dados.idioma ?? null,
    numeroDePaginas: dados.numeroDePaginas ?? null,
    sinopse: dados.sinopse ?? null,
    capaUrl: dados.capaUrl ?? null,
    cdd: dados.cdd ?? null,
    faixaEtaria: dados.faixaEtaria ?? null,
    categoriaId: dados.categoriaId ?? null,
  }
}
