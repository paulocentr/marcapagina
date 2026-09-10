import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import {
  edicaoDeAlunoSchema,
  entradaDeAlunoSchema,
  type EdicaoDeAluno,
  type EntradaDeAluno,
} from '@/modules/leitores/alunos.schema'
import {
  TurmaInexistenteError,
  type DependenciasDeTurmas,
} from '@/modules/leitores/turmas.service'
import type { Principal } from '@/core/auth/principal'

/**
 * Cadastro de leitores. É o gargalo do sistema: sem aluno cadastrado, o
 * balcão não empresta para ninguém.
 *
 * ─── A regra que governa todos os tipos deste arquivo ───────────────
 *
 * **A data de nascimento é CREDENCIAL, não dado cadastral.** O aluno
 * entra no portal com matrícula + data de nascimento (decisão 3 do
 * projeto). Por isso ela entra em `EntradaDeAluno` e não sai em NENHUM
 * tipo de retorno — nem na lista, nem na ficha, nem no resultado de
 * criar ou editar. Não é convenção: o tipo não tem o campo, então não
 * existe caminho para a credencial chegar ao navegador sem alguém mudar
 * um contrato de propósito. Há teste de unidade e de integração nos dois
 * lados disso.
 *
 * A consequência prática está na edição: o formulário abre com a data em
 * BRANCO, e branco significa "não mexa". Mandar a data para o cliente só
 * para preencher um campo que talvez nem seja editado seria expor a
 * credencial de graça.
 */

export interface TurmaDoAluno {
  id: string
  nome: string
  /** Canônica — `"5"`, `"1EM"`. É o que o Carrinho e a circulação leem. */
  serie: string
}

/**
 * O aluno como toda tela o vê.
 *
 * Repare no que NÃO está aqui: `dataNascimento`. Ver a nota do topo.
 */
export interface AlunoRegistrado {
  id: string
  matricula: string
  nome: string
  ativo: boolean
  turma: TurmaDoAluno | null
}

/** O aluno na ficha: acrescenta responsável e o que ele tem em mãos. */
export interface FichaDoAluno extends AlunoRegistrado {
  responsavelNome: string | null
  responsavelEmail: string | null
  responsavelTelefone: string | null
  /**
   * Quantos livros o aluno está com ele AGORA.
   *
   * Contado por `previstaPara`/`devolvidaEm IS NULL`, nunca lido de um
   * campo materializado — não existe campo "atrasado" neste sistema
   * (Global Constraint 16).
   */
  livrosEmMaos: number
}

/** O que vai para o banco. A data em ISO curta; o repositório a carimba. */
export interface DadosDeAlunoParaGravar {
  matricula: string
  nome: string
  /** `aaaa-mm-dd`. O repositório grava com `T00:00:00.000Z`. */
  dataNascimento: string
  turmaId: string | null
  responsavelNome: string | null
  responsavelEmail: string | null
  responsavelTelefone: string | null
}

export interface FiltroDeAlunos {
  /** Parte do nome ou da matrícula. */
  termo?: string
  turmaId?: string
  /** Sem turma nenhuma — o aluno que chegou antes de a turma existir. */
  semTurma?: boolean
  apenasAtivos?: boolean
  pagina?: number
  porPagina?: number
}

export interface PaginaDeAlunos {
  itens: AlunoRegistrado[]
  total: number
  pagina: number
  porPagina: number
}

export interface RepositorioDeAlunos {
  buscar(filtro: FiltroDeAlunos): Promise<PaginaDeAlunos>
  obter(id: string): Promise<FichaDoAluno | null>
  /** Só o necessário para nomear o dono da matrícula na recusa. */
  obterPorMatricula(matricula: string): Promise<{ id: string; nome: string } | null>
  criar(dados: DadosDeAlunoParaGravar): Promise<AlunoRegistrado>
  atualizar(id: string, dados: Partial<DadosDeAlunoParaGravar>): Promise<AlunoRegistrado | null>
  definirAtivo(id: string, ativo: boolean): Promise<AlunoRegistrado | null>
  /** Empréstimos em aberto: `devolvidaEm IS NULL`. */
  contarLivrosEmMaos(id: string): Promise<number>
}

export interface DependenciasDeAlunos extends DependenciasDeTurmas {
  alunos: RepositorioDeAlunos
}

export class AlunoInexistenteError extends ErroDeDominio {
  constructor() {
    super('Este aluno não existe nesta escola.', 'ALUNO_INEXISTENTE')
  }
}

export class MatriculaEmUsoError extends ErroDeDominio {
  constructor(
    readonly matricula: string,
    readonly deQuem: string | null,
  ) {
    super(
      deQuem === null
        ? `A matrícula ${matricula} já está cadastrada nesta escola.`
        : `A matrícula ${matricula} já é de ${deQuem} nesta escola. ` +
            `Confira o número — matrícula é única por escola.`,
      'MATRICULA_EM_USO',
    )
  }
}

export class AlunoComLivrosEmMaosError extends ErroDeDominio {
  constructor(
    readonly nome: string,
    readonly livrosEmMaos: number,
  ) {
    super(
      `${nome} está com ${livrosEmMaos} livro(s) em mãos. ` +
        `Desativar bloqueia empréstimo E devolução no balcão, então o livro fica sem ` +
        `caminho de volta. Receba os livros primeiro, ou confirme a desativação se o ` +
        `aluno saiu da escola sem devolver.`,
      'ALUNO_COM_LIVROS_EM_MAOS',
    )
  }
}

const PADRAO_POR_PAGINA = 20
const MAXIMO_POR_PAGINA = 100

/**
 * A lista de alunos, paginada.
 *
 * A busca é por parte do nome (ignorando a caixa) ou por matrícula.
 * Diferente do acervo, ela NÃO ignora acento: `Aluno` não tem coluna
 * normalizada como `Obra.tituloNormalizado`, e inventar uma exigiria
 * migração. Está documentado aqui em vez de prometido na tela.
 */
export async function listarAlunos(
  principal: Principal,
  filtro: FiltroDeAlunos,
  deps: DependenciasDeAlunos,
): Promise<PaginaDeAlunos> {
  exigirPermissao(principal, 'aluno:ver')

  const termo = filtro.termo?.trim()
  const porPagina = Math.min(filtro.porPagina ?? PADRAO_POR_PAGINA, MAXIMO_POR_PAGINA)
  const pagina = Math.max(filtro.pagina ?? 1, 1)

  return deps.alunos.buscar({
    ...filtro,
    // Campo de busca esvaziado manda string vazia. Tratá-la como termo
    // faria a lista responder vazia, e a operadora concluiria que os
    // alunos desapareceram.
    termo: termo && termo.length > 0 ? termo : undefined,
    pagina,
    porPagina,
  })
}

export async function obterFichaDoAluno(
  principal: Principal,
  alunoId: string,
  deps: DependenciasDeAlunos,
): Promise<FichaDoAluno> {
  exigirPermissao(principal, 'aluno:ver')

  const aluno = await deps.alunos.obter(alunoId)
  if (!aluno) throw new AlunoInexistenteError()
  return aluno
}

export async function criarAluno(
  principal: Principal,
  entrada: EntradaDeAluno,
  deps: DependenciasDeAlunos,
): Promise<AlunoRegistrado> {
  exigirPermissao(principal, 'aluno:criar')

  const dados = entradaDeAlunoSchema.parse(entrada)

  await exigirTurmaQueExiste(dados.turmaId, deps)
  await exigirMatriculaLivre(dados.matricula, null, deps)

  // A checagem acima tem uma janela: duas operadoras cadastrando a mesma
  // matrícula ao mesmo tempo passam as duas por ela. Quem barra a
  // segunda é o índice único `escolaId_matricula` do banco, e o
  // repositório traduz aquele erro para `MatriculaEmUsoError` — é o que
  // impede o P2002 do Prisma de chegar cru na cara da operadora.
  return deps.alunos.criar({
    matricula: dados.matricula,
    nome: dados.nome,
    dataNascimento: dados.dataNascimento,
    turmaId: dados.turmaId ?? null,
    responsavelNome: dados.responsavelNome ?? null,
    responsavelEmail: dados.responsavelEmail ?? null,
    responsavelTelefone: dados.responsavelTelefone ?? null,
  })
}

export async function editarAluno(
  principal: Principal,
  alunoId: string,
  entrada: EdicaoDeAluno,
  deps: DependenciasDeAlunos,
): Promise<AlunoRegistrado> {
  exigirPermissao(principal, 'aluno:editar')

  const dados = edicaoDeAlunoSchema.parse(entrada)

  const atual = await deps.alunos.obter(alunoId)
  if (!atual) throw new AlunoInexistenteError()

  const alteracoes: Partial<DadosDeAlunoParaGravar> = {}

  if (dados.matricula !== undefined && dados.matricula !== atual.matricula) {
    // Só quando MUDOU. A tela manda o formulário inteiro; comparar apenas
    // "existe alguém com esta matrícula" recusaria toda edição de aluno,
    // porque ele mesmo tem a matrícula dele.
    await exigirMatriculaLivre(dados.matricula, alunoId, deps)
    alteracoes.matricula = dados.matricula
  }

  if (dados.nome !== undefined) alteracoes.nome = dados.nome

  // A data só é tocada quando vem. Ausente é "não mexa" — a tela de
  // edição abre o campo em branco de propósito, e zerar a credencial do
  // aluno numa edição de nome o trancaria fora do portal em silêncio.
  if (dados.dataNascimento !== undefined) alteracoes.dataNascimento = dados.dataNascimento

  // `null` é "tire da turma"; `undefined` é "não mexa". Sem a distinção,
  // editar o telefone do responsável tiraria o aluno da turma por
  // omissão — e ele desapareceria dos relatórios por turma.
  if (dados.turmaId !== undefined) {
    if (dados.turmaId === null) {
      alteracoes.turmaId = null
    } else {
      await exigirTurmaQueExiste(dados.turmaId, deps)
      alteracoes.turmaId = dados.turmaId
    }
  }

  for (const campo of ['responsavelNome', 'responsavelEmail', 'responsavelTelefone'] as const) {
    if (dados[campo] !== undefined) alteracoes[campo] = dados[campo]
  }

  const aluno = await deps.alunos.atualizar(alunoId, alteracoes)
  if (!aluno) throw new AlunoInexistenteError()
  return aluno
}

export interface EntradaDeDesativacao {
  alunoId: string
  /**
   * A operadora já viu o aviso de livros em mãos e quer prosseguir.
   *
   * Existe porque desativar com livro na mochila do aluno é uma decisão
   * legítima — aluno que saiu da escola sem devolver acontece — e ao
   * mesmo tempo é a decisão que a operadora mais se arrepende de tomar
   * sem saber. Então o padrão é AVISAR, e prosseguir é explícito.
   */
  confirmado?: boolean
}

export interface AlunoDesativado {
  aluno: AlunoRegistrado
  /** Quantos livros ficaram com ele. A tela imprime este número. */
  livrosEmMaos: number
}

/**
 * Desativa o aluno. NÃO apaga nada.
 *
 * Aluno desativado é bloqueio de empréstimo — `avaliarBloqueios` trata o
 * caso `INATIVO` — e não exclusão. Não existe caminho de exclusão neste
 * serviço de propósito: apagar o aluno órfanaria empréstimo, reserva,
 * penalidade e pedido de carrinho, e o relatório de engajamento passaria
 * a contar um ano letivo que não bate com nada.
 */
export async function desativarAluno(
  principal: Principal,
  entrada: EntradaDeDesativacao,
  deps: DependenciasDeAlunos,
): Promise<AlunoDesativado> {
  exigirPermissao(principal, 'aluno:editar')

  // Contagem e escrita na MESMA transação. Separadas, uma devolução
  // acontecida entre as duas faria a tela dizer "desativado, e 1 livro
  // continua com ele" sobre um aluno que já devolveu tudo — e a
  // operadora iria procurar na estante um livro que já está lá.
  return deps.emTransacao(async () => {
    const atual = await deps.alunos.obter(entrada.alunoId)
    if (!atual) throw new AlunoInexistenteError()

    const livrosEmMaos = await deps.alunos.contarLivrosEmMaos(entrada.alunoId)

    if (livrosEmMaos > 0 && entrada.confirmado !== true) {
      throw new AlunoComLivrosEmMaosError(atual.nome, livrosEmMaos)
    }

    const aluno = await deps.alunos.definirAtivo(entrada.alunoId, false)
    if (!aluno) throw new AlunoInexistenteError()

    return { aluno, livrosEmMaos }
  })
}

export async function reativarAluno(
  principal: Principal,
  alunoId: string,
  deps: DependenciasDeAlunos,
): Promise<AlunoRegistrado> {
  exigirPermissao(principal, 'aluno:editar')

  const aluno = await deps.alunos.definirAtivo(alunoId, true)
  if (!aluno) throw new AlunoInexistenteError()
  return aluno
}

async function exigirTurmaQueExiste(
  turmaId: string | undefined,
  deps: DependenciasDeAlunos,
): Promise<void> {
  // Aluno sem turma é legítimo: ele chega antes de a turma dele existir,
  // e recusar obrigaria a operadora a inventar uma turma para conseguir
  // cadastrar o aluno que está na frente dela.
  if (turmaId === undefined) return

  // Passa pelo escopo de tenant, então turma da escola vizinha não é
  // achada — e a recusa sai em pt-BR em vez de a chave estrangeira
  // estourar em inglês.
  const turma = await deps.turmas.obter(turmaId)
  if (!turma) throw new TurmaInexistenteError()
}

async function exigirMatriculaLivre(
  matricula: string,
  proprioId: string | null,
  deps: DependenciasDeAlunos,
): Promise<void> {
  const dono = await deps.alunos.obterPorMatricula(matricula)
  if (!dono) return
  if (proprioId !== null && dono.id === proprioId) return

  // O NOME do outro aluno vai na mensagem: sem ele, a operadora não sabe
  // se digitou o número errado ou se o aluno já está cadastrado — e as
  // duas coisas pedem ações opostas.
  throw new MatriculaEmUsoError(matricula, dono.nome)
}
