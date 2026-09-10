import { gerarHash } from '@/core/auth/senha'
import { exigirPermissao, exigirQualquerPermissao } from '@/core/rbac/verificar'
import {
  administracaoSemDono,
  ehPapelAtribuivelNaEscola,
  exigirAdministradorRemanescente,
  exigirPapelAtribuivel,
  normalizarEmail,
  normalizarNome,
  permissoesDoUsuario,
  validarPermissoesConcedidas,
  validarSenhaNova,
  AutoDesativacaoError,
  EmailJaEmUsoError,
  PapelNaoEncontradoError,
  UsuarioNaoEncontradoError,
  type PapelDoUsuario,
  type UsuarioParaLotacao,
} from '@/modules/usuarios/usuarios'
import type { EventoDeAuditoria } from '@/core/audit/audit.service'
import type { Principal } from '@/core/auth/principal'
import type { Permissao } from '@/core/rbac/permissoes'

/**
 * Gestão das contas da equipe e dos papéis da escola.
 *
 * Por que isto existe: a bibliotecária e a monitora operam o balcão todo
 * dia. Sem conta própria, a coordenação empresta a senha dela — e aí
 * TODA linha da auditoria passa a dizer que foi a coordenação. O log de
 * auditoria deixa de servir para o que existe: dizer quem fez.
 *
 * Autorização é por PERMISSÃO, nunca por papel: o serviço recebe
 * `Principal` por parâmetro e chama `exigirPermissao` (decisão 13). Quem
 * lê a sessão é a rota.
 *
 * `senhaHash` NÃO aparece em nenhum tipo devolvido daqui. Não é
 * disciplina de quem escreve a query — é o tipo do repositório que não
 * tem o campo, então vazá-lo para a tela não compila.
 */

/** Uma conta da equipe, como o repositório a entrega. Sem `senhaHash`. */
export interface UsuarioDaEscola {
  id: string
  nome: string
  email: string
  ativo: boolean
  criadoEm: Date
  papeis: PapelDoUsuario[]
}

export interface PapelDaEscola {
  id: string
  nome: string
  descricao: string | null
  /** Papel de fábrica. Não pode ser excluído; as permissões, sim, editadas. */
  deSistema: boolean
  permissoes: Permissao[]
  quantidadeDeUsuarios: number
}

export interface RepositorioDeGestaoDeUsuarios {
  listar(): Promise<UsuarioDaEscola[]>
  buscarPorEmail(email: string): Promise<UsuarioDaEscola | null>
  criar(dados: {
    nome: string
    email: string
    senhaHash: string
    papelId: string
  }): Promise<UsuarioDaEscola>
  definirAtivo(usuarioId: string, ativo: boolean): Promise<void>
  substituirPapel(usuarioId: string, papelId: string): Promise<void>
  listarPapeis(): Promise<PapelDaEscola[]>
  buscarPapelPorId(papelId: string): Promise<PapelDaEscola | null>
  definirPermissoesDoPapel(papelId: string, permissoes: Permissao[]): Promise<void>
}

export interface DependenciasDeUsuarios {
  gestaoDeUsuarios: RepositorioDeGestaoDeUsuarios
  emTransacao<T>(fn: () => Promise<T>): Promise<T>
  registrarAuditoria(evento: EventoDeAuditoria): Promise<void>
}

export interface UsuarioNaTela extends UsuarioDaEscola {
  /** A união dos papéis — o que esta conta pode fazer, hoje. */
  permissoes: Permissao[]
  /**
   * Se desativar ESTA conta deixaria a escola sem administrador.
   *
   * Derivado da MESMA função pura que o serviço usa para recusar, e é o
   * ponto: o aviso da tela e a recusa do clique não conseguem discordar.
   */
  unicoAdministrador: boolean
}

export interface PapelNaTela extends PapelDaEscola {
  /** Se a tela desta escola pode oferecê-lo e editá-lo. */
  atribuivel: boolean
}

export interface ContaCriada {
  id: string
  nome: string
  email: string
  ativo: boolean
  papeis: PapelDoUsuario[]
  permissoes: Permissao[]
}

export interface EntradaDeNovoUsuario {
  nome: string
  email: string
  senha: string
  papelId: string
}

export async function listarUsuariosDaEscola(
  principal: Principal,
  deps: DependenciasDeUsuarios,
): Promise<UsuarioNaTela[]> {
  exigirPermissao(principal, 'usuario:gerenciar')

  const usuarios = await deps.gestaoDeUsuarios.listar()
  const lotacao = usuarios.map(paraLotacao)

  return usuarios.map((usuario) => ({
    ...usuario,
    permissoes: permissoesDoUsuario(usuario.papeis),
    unicoAdministrador:
      // Quem já está inativo não sustenta administração nenhuma: marcá-lo
      // faria a tela avisar "é o último" sobre uma conta que não entra.
      usuario.ativo && administracaoSemDono(comUsuarioInativo(lotacao, usuario.id)).length > 0,
  }))
}

/**
 * O catálogo de papéis.
 *
 * Exige QUALQUER uma das duas permissões de administração: a tela de
 * contas precisa da lista para oferecer o papel na criação, e a tela de
 * papéis precisa dela para editar. Exigir as duas juntas recusaria quem
 * tem exatamente a permissão de editar papéis.
 */
export async function listarPapeisDaEscola(
  principal: Principal,
  deps: DependenciasDeUsuarios,
): Promise<PapelNaTela[]> {
  exigirQualquerPermissao(principal, ['usuario:gerenciar', 'papel:gerenciar'])

  const papeis = await deps.gestaoDeUsuarios.listarPapeis()
  return papeis.map((papel) => ({ ...papel, atribuivel: ehPapelAtribuivelNaEscola(papel.nome) }))
}

export async function criarUsuario(
  principal: Principal,
  entrada: EntradaDeNovoUsuario,
  deps: DependenciasDeUsuarios,
): Promise<ContaCriada> {
  exigirPermissao(principal, 'usuario:gerenciar')

  const nome = normalizarNome(entrada.nome)
  const email = normalizarEmail(entrada.email)
  validarSenhaNova(entrada.senha)

  const papel = await deps.gestaoDeUsuarios.buscarPapelPorId(entrada.papelId)
  if (!papel) throw new PapelNaoEncontradoError()
  exigirPapelAtribuivel(papel.nome)

  // Checagem explícita para a mensagem em pt-BR. O índice único
  // `[escolaId, email]` continua sendo a garantia de verdade: duas
  // operadoras criando a mesma conta ao mesmo tempo passam as duas por
  // aqui, e é o banco que recusa a segunda.
  const existente = await deps.gestaoDeUsuarios.buscarPorEmail(email)
  if (existente) throw new EmailJaEmUsoError(email)

  // Argon2id com os parâmetros do OWASP, direto de core/auth/senha. Não
  // entra por injeção de propósito: um ponto de composição que escolhe o
  // hash é um ponto de composição que pode escolher um pior.
  const senhaHash = await gerarHash(entrada.senha)

  // Transação: usuário gravado sem o vínculo de papel é uma conta que
  // entra e não pode fazer nada — e ninguém liga o sintoma ("ela loga e
  // não vê nada") à criação da conta.
  const criado = await deps.emTransacao(() =>
    deps.gestaoDeUsuarios.criar({ nome, email, senhaHash, papelId: papel.id }),
  )

  // Fora da transação: a conta já existe, e desfazê-la por causa do
  // registro seria pior que o registro faltando. `registrarAuditoria` já
  // engole o próprio erro.
  //
  // Nem a senha nem o hash entram no evento. O log de auditoria é lido
  // por quem tem `auditoria:ver`, que não é quem administra contas.
  await deps
    .registrarAuditoria({
      autor: principal,
      acao: 'usuario.criar',
      entidade: 'Usuario',
      entidadeId: criado.id,
      dadosDepois: { nome: criado.nome, email: criado.email, papeis: [papel.nome] },
    })
    .catch(() => undefined)

  return {
    id: criado.id,
    nome: criado.nome,
    email: criado.email,
    ativo: criado.ativo,
    papeis: criado.papeis,
    permissoes: permissoesDoUsuario(criado.papeis),
  }
}

/**
 * Desativa ou reativa uma conta.
 *
 * Desativar é o botão de revogação do sistema: as permissões viajam no
 * token de sessão, e é a conta inativa que impede a PRÓXIMA sessão.
 *
 * Duas recusas moram aqui, e não na tela — a Server Action é alcançável
 * sem passar por ela:
 *
 * 1. ninguém desativa a própria conta;
 * 2. ninguém desativa a última conta ativa que administra a escola.
 */
export async function definirSituacaoDoUsuario(
  principal: Principal,
  entrada: { usuarioId: string; ativo: boolean },
  deps: DependenciasDeUsuarios,
): Promise<void> {
  exigirPermissao(principal, 'usuario:gerenciar')

  const usuarios = await deps.gestaoDeUsuarios.listar()
  const alvo = usuarios.find((u) => u.id === entrada.usuarioId)
  if (!alvo) throw new UsuarioNaoEncontradoError()

  // Nada mudou: gravar e auditar encheria o log de eventos que não
  // descrevem mudança nenhuma, e é justamente o log que precisa ser
  // legível quando alguém for procurar o que aconteceu.
  if (alvo.ativo === entrada.ativo) return

  if (!entrada.ativo) {
    if (alvo.id === principal.id) throw new AutoDesativacaoError()
    exigirAdministradorRemanescente(comUsuarioInativo(usuarios.map(paraLotacao), alvo.id))
  }

  await deps.gestaoDeUsuarios.definirAtivo(alvo.id, entrada.ativo)

  await deps
    .registrarAuditoria({
      autor: principal,
      acao: entrada.ativo ? 'usuario.reativar' : 'usuario.desativar',
      entidade: 'Usuario',
      entidadeId: alvo.id,
      dadosAntes: { nome: alvo.nome, email: alvo.email, ativo: alvo.ativo },
      dadosDepois: { ativo: entrada.ativo },
    })
    .catch(() => undefined)
}

/**
 * Troca o papel de uma conta.
 *
 * Um papel por conta, e não um conjunto: é o modelo que a coordenação
 * consegue conferir de relance na tela ("quem é monitor?"). O schema
 * suporta vários, e o dia em que a escola precisar de dois o repositório
 * é o único lugar a mudar.
 *
 * A recusa que importa: o último administrador não se rebaixa. É o
 * caminho mais fácil de se trancar fora — a coordenação se dá o papel de
 * monitor "para ver a tela do balcão" e perde a volta.
 */
export async function trocarPapelDoUsuario(
  principal: Principal,
  entrada: { usuarioId: string; papelId: string },
  deps: DependenciasDeUsuarios,
): Promise<void> {
  exigirPermissao(principal, 'usuario:gerenciar')

  const papel = await deps.gestaoDeUsuarios.buscarPapelPorId(entrada.papelId)
  if (!papel) throw new PapelNaoEncontradoError()
  exigirPapelAtribuivel(papel.nome)

  const usuarios = await deps.gestaoDeUsuarios.listar()
  const alvo = usuarios.find((u) => u.id === entrada.usuarioId)
  if (!alvo) throw new UsuarioNaoEncontradoError()

  const projetado = usuarios.map(paraLotacao).map((u) =>
    u.id === alvo.id ? { ...u, permissoes: papel.permissoes } : u,
  )
  exigirAdministradorRemanescente(projetado)

  // Transação: substituir papel é apagar o vínculo antigo e gravar o
  // novo. Sem transação, a falha no meio deixa a conta SEM papel nenhum —
  // ela entra e não faz nada, e o sintoma não aponta para aqui.
  await deps.emTransacao(() => deps.gestaoDeUsuarios.substituirPapel(alvo.id, papel.id))

  await deps
    .registrarAuditoria({
      autor: principal,
      acao: 'usuario.trocar-papel',
      entidade: 'Usuario',
      entidadeId: alvo.id,
      dadosAntes: { papeis: alvo.papeis.map((p) => p.nome) },
      dadosDepois: { papeis: [papel.nome] },
    })
    .catch(() => undefined)
}

/**
 * Reescreve as permissões de um papel.
 *
 * O terceiro caminho para o mesmo buraco, e o menos óbvio: ninguém é
 * desativado nem rebaixado — o PAPEL perde `usuario:gerenciar`, e todo
 * mundo que o carrega a perde no mesmo instante.
 */
export async function definirPermissoesDoPapel(
  principal: Principal,
  entrada: { papelId: string; permissoes: readonly string[] },
  deps: DependenciasDeUsuarios,
): Promise<void> {
  exigirPermissao(principal, 'papel:gerenciar')

  const papel = await deps.gestaoDeUsuarios.buscarPapelPorId(entrada.papelId)
  if (!papel) throw new PapelNaoEncontradoError()
  exigirPapelAtribuivel(papel.nome)

  const permissoes = validarPermissoesConcedidas(entrada.permissoes)

  const usuarios = await deps.gestaoDeUsuarios.listar()
  const projetado = usuarios.map((usuario) =>
    paraLotacao({
      ...usuario,
      papeis: usuario.papeis.map((p) => (p.id === papel.id ? { ...p, permissoes } : p)),
    }),
  )
  exigirAdministradorRemanescente(projetado)

  await deps.gestaoDeUsuarios.definirPermissoesDoPapel(papel.id, permissoes)

  await deps
    .registrarAuditoria({
      autor: principal,
      acao: 'papel.editar-permissoes',
      entidade: 'Papel',
      entidadeId: papel.id,
      dadosAntes: { permissoes: papel.permissoes },
      dadosDepois: { permissoes },
    })
    .catch(() => undefined)
}

function paraLotacao(usuario: UsuarioDaEscola): UsuarioParaLotacao {
  return { id: usuario.id, ativo: usuario.ativo, permissoes: permissoesDoUsuario(usuario.papeis) }
}

/** A mesma lista, com um dos usuários marcado como inativo. */
function comUsuarioInativo(
  usuarios: readonly UsuarioParaLotacao[],
  usuarioId: string,
): UsuarioParaLotacao[] {
  return usuarios.map((u) => (u.id === usuarioId ? { ...u, ativo: false } : u))
}
