import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

export interface CategoriaRegistrada {
  id: string
  nome: string
  cor: string | null
  parentId: string | null
}

export interface CategoriaEmArvore extends CategoriaRegistrada {
  filhas: CategoriaEmArvore[]
}

export interface RepositorioDeCategorias {
  listar(): Promise<CategoriaRegistrada[]>
  obter(id: string): Promise<CategoriaRegistrada | null>
  criar(dados: { nome: string; cor?: string; parentId?: string }): Promise<CategoriaRegistrada>
  contarObras(id: string): Promise<number>
  excluir(id: string): Promise<void>
}

export interface DependenciasDeCategorias {
  categorias: RepositorioDeCategorias
}

export class CategoriaMaeInexistenteError extends ErroDeDominio {
  constructor() {
    super('A categoria-mãe informada não existe nesta escola.', 'CATEGORIA_MAE_INEXISTENTE')
  }
}

export class CategoriaEmUsoError extends ErroDeDominio {
  constructor(readonly obras: number) {
    super(
      `Esta categoria não pode ser excluída: ${obras} obra(s) ainda usam ela.`,
      'CATEGORIA_EM_USO',
    )
  }
}

export async function criarCategoria(
  principal: Principal,
  entrada: { nome: string; cor?: string; parentId?: string },
  deps: DependenciasDeCategorias,
): Promise<CategoriaRegistrada> {
  exigirPermissao(principal, 'config:editar')

  const nome = entrada.nome.trim()
  if (!nome) throw new ErroDeDominio('Informe o nome da categoria.', 'NOME_OBRIGATORIO')

  if (entrada.parentId) {
    // Conferir aqui, e não deixar a FK reclamar, é o que faz a mensagem
    // ser em português e dizer o que houve. Passa pelo escopo de tenant,
    // então categoria de outra escola não serve como mãe.
    const mae = await deps.categorias.obter(entrada.parentId)
    if (!mae) throw new CategoriaMaeInexistenteError()
  }

  return deps.categorias.criar({ ...entrada, nome })
}

export async function excluirCategoria(
  principal: Principal,
  id: string,
  deps: DependenciasDeCategorias,
): Promise<void> {
  exigirPermissao(principal, 'config:editar')

  // Excluir categoria em uso deixaria obras sem classificação sem que
  // ninguém percebesse. O número vai na mensagem porque "não é possível
  // excluir" sem número manda a operadora caçar no escuro.
  const obras = await deps.categorias.contarObras(id)
  if (obras > 0) throw new CategoriaEmUsoError(obras)

  await deps.categorias.excluir(id)
}

/**
 * Monta a hierarquia em árvore a partir da lista plana. Uma consulta só:
 * o catálogo de categorias de uma escola cabe folgadamente em memória, e
 * uma consulta recursiva por nível seria N+1 disfarçado de elegância.
 */
export async function listarCategoriasEmArvore(
  deps: DependenciasDeCategorias,
): Promise<CategoriaEmArvore[]> {
  const planas = await deps.categorias.listar()

  const porId = new Map<string, CategoriaEmArvore>(
    planas.map((c) => [c.id, { ...c, filhas: [] }]),
  )

  const raizes: CategoriaEmArvore[] = []
  for (const categoria of porId.values()) {
    const mae = categoria.parentId ? porId.get(categoria.parentId) : undefined
    // Categoria cuja mãe sumiu vira raiz em vez de desaparecer da tela.
    // Some-se ela e a operadora concluiria que perdeu a classificação.
    if (mae) mae.filhas.push(categoria)
    else raizes.push(categoria)
  }

  return raizes
}
