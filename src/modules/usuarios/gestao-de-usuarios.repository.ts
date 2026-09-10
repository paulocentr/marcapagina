import { dbDoTenant } from '@/core/db/tenant-extension'
import { ehPermissaoValida, type Permissao } from '@/core/rbac/permissoes'
import type { Prisma } from '@prisma/client'
import type {
  PapelDaEscola,
  RepositorioDeGestaoDeUsuarios,
  UsuarioDaEscola,
} from '@/modules/usuarios/usuarios.service'

/**
 * As queries da gestão de contas da equipe.
 *
 * `senhaHash` NÃO aparece em nenhum `select` deste arquivo, e é
 * deliberado: o Prisma devolve TODAS as colunas escalares quando o
 * `select` é omitido, então listar contas sem `select` explícito levaria
 * o hash de senha de toda a equipe para a tela. O tipo
 * `UsuarioDaEscola` não tem o campo, então o esquecimento também não
 * compila — mas a lista explícita é a primeira barreira, e a que não
 * depende de ninguém ler o tipo.
 *
 * Todo acesso passa por `dbDoTenant()`: a extensão de tenant injeta o
 * `escolaId` no `where` de leitura e no `data` de escrita, e é o que
 * impede a coordenação de uma escola de enxergar — ou de criar — conta na
 * outra.
 */

const CAMPOS_DO_USUARIO = {
  id: true,
  nome: true,
  email: true,
  ativo: true,
  criadoEm: true,
  papeis: {
    select: {
      papel: { select: { id: true, nome: true, permissoes: true } },
    },
  },
} as const

const CAMPOS_DO_PAPEL = {
  id: true,
  nome: true,
  descricao: true,
  deSistema: true,
  permissoes: true,
  _count: { select: { usuarios: true } },
} as const

interface LinhaDeUsuario {
  id: string
  nome: string
  email: string
  ativo: boolean
  criadoEm: Date
  papeis: { papel: { id: string; nome: string; permissoes: string[] } }[]
}

interface LinhaDePapel {
  id: string
  nome: string
  descricao: string | null
  deSistema: boolean
  permissoes: string[]
  _count: { usuarios: number }
}

/**
 * Permissão que não existe mais no catálogo NÃO é concedida.
 *
 * Mesma regra do repositório do login: o banco guarda só a atribuição, e
 * uma permissão renomeada em código deixa string órfã na coluna. Filtrar
 * é o comportamento seguro — e mantém a tela de papéis mostrando
 * exatamente o que vale.
 */
function permissoesConhecidas(brutas: readonly string[]): Permissao[] {
  return brutas.filter(ehPermissaoValida)
}

function paraUsuario(linha: LinhaDeUsuario): UsuarioDaEscola {
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    ativo: linha.ativo,
    criadoEm: linha.criadoEm,
    papeis: linha.papeis.map(({ papel }) => ({
      id: papel.id,
      nome: papel.nome,
      permissoes: permissoesConhecidas(papel.permissoes),
    })),
  }
}

function paraPapel(linha: LinhaDePapel): PapelDaEscola {
  return {
    id: linha.id,
    nome: linha.nome,
    descricao: linha.descricao,
    deSistema: linha.deSistema,
    permissoes: permissoesConhecidas(linha.permissoes),
    quantidadeDeUsuarios: linha._count.usuarios,
  }
}

export const gestaoDeUsuariosRepository: RepositorioDeGestaoDeUsuarios = {
  async listar(): Promise<UsuarioDaEscola[]> {
    const linhas = (await dbDoTenant().usuario.findMany({
      select: CAMPOS_DO_USUARIO,
      // Ativos primeiro, em ordem de nome: a tela é uma lista de gente, e
      // quem trabalha na biblioteca hoje é quem a coordenação procura.
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    })) as unknown as LinhaDeUsuario[]

    return linhas.map(paraUsuario)
  },

  async buscarPorEmail(email: string): Promise<UsuarioDaEscola | null> {
    const linha = (await dbDoTenant().usuario.findFirst({
      where: { email },
      select: CAMPOS_DO_USUARIO,
    })) as unknown as LinhaDeUsuario | null

    return linha ? paraUsuario(linha) : null
  },

  async criar(dados: {
    nome: string
    email: string
    senhaHash: string
    papelId: string
  }): Promise<UsuarioDaEscola> {
    // Escrita ANINHADA, não duas chamadas: conta e vínculo de papel entram
    // na mesma instrução, e o Prisma a executa atomicamente. Uma conta
    // gravada sem papel entra no sistema e não pode fazer nada — sintoma
    // que ninguém liga à criação da conta.
    //
    // O `papelId` já foi provado desta escola pelo serviço, que o leu por
    // `buscarPapelPorId` (escopado por tenant). Aqui o vínculo não passa
    // pela extensão: `UsuarioPapel` é tabela de junção e é escopada pelas
    // pontas.
    const linha = (await dbDoTenant().usuario.create({
      // O cast é o mesmo dos outros repositórios: o tipo do Prisma exige a
      // relação `escola`, e é a extensão de tenant que injeta o `escolaId`
      // — em runtime, e por cima de qualquer valor que viesse de fora.
      // Satisfazer o tipo à mão aqui significaria escrever o escolaId no
      // repositório, que é exatamente o que a Global Constraint 3 proíbe.
      data: {
        nome: dados.nome,
        email: dados.email,
        senhaHash: dados.senhaHash,
        papeis: { create: [{ papelId: dados.papelId }] },
      } as unknown as Prisma.UsuarioCreateInput,
      select: CAMPOS_DO_USUARIO,
    })) as unknown as LinhaDeUsuario

    return paraUsuario(linha)
  },

  async definirAtivo(usuarioId: string, ativo: boolean): Promise<void> {
    // `update` com where único: a extensão o converte em `updateMany` com
    // o tenant no AND, então o id de outra escola não casa com nada e a
    // escrita não acontece.
    await dbDoTenant().usuario.update({ where: { id: usuarioId }, data: { ativo } })
  },

  async substituirPapel(usuarioId: string, papelId: string): Promise<void> {
    // Um papel por conta: apaga o vínculo antigo e grava o novo. As duas
    // escritas correm dentro da transação aberta pelo serviço — sem ela,
    // a falha no meio deixa a conta SEM papel nenhum.
    //
    // `UsuarioPapel` fica fora do escopo de tenant (é junção), então o
    // `deleteMany` daqui não leva filtro de escola. O que o torna seguro é
    // o serviço ter encontrado o usuário por `listar()`, que É escopado:
    // um id de outra escola nunca chega até aqui.
    await dbDoTenant().usuarioPapel.deleteMany({ where: { usuarioId } })
    await dbDoTenant().usuarioPapel.create({ data: { usuarioId, papelId } })
  },

  async listarPapeis(): Promise<PapelDaEscola[]> {
    const linhas = (await dbDoTenant().papel.findMany({
      select: CAMPOS_DO_PAPEL,
      orderBy: { nome: 'asc' },
    })) as unknown as LinhaDePapel[]

    return linhas.map(paraPapel)
  },

  async buscarPapelPorId(papelId: string): Promise<PapelDaEscola | null> {
    const linha = (await dbDoTenant().papel.findFirst({
      where: { id: papelId },
      select: CAMPOS_DO_PAPEL,
    })) as unknown as LinhaDePapel | null

    return linha ? paraPapel(linha) : null
  },

  async definirPermissoesDoPapel(papelId: string, permissoes: Permissao[]): Promise<void> {
    await dbDoTenant().papel.update({
      where: { id: papelId },
      data: { permissoes: [...permissoes] },
    })
  },
}
