import { ErroDeDominio } from '@/core/errors'
import { FORCA_MINIMA_SENHA } from '@/core/auth/senha'
import { TODAS_AS_PERMISSOES, type Permissao } from '@/core/rbac/permissoes'

/**
 * As regras puras da gestão de contas da equipe.
 *
 * Módulo sem banco e sem HTTP de propósito. A garantia que mais importa
 * aqui — a escola nunca fica sem quem administre usuários — é uma
 * pergunta sobre a LISTA de usuários, não sobre uma tabela. Escrita como
 * função pura, ela cobre com um único trecho de código os TRÊS caminhos
 * que levam ao mesmo buraco: desativar o último administrador, trocar o
 * papel dele por um sem administração, e tirar a permissão do papel que
 * ele carrega.
 */

/**
 * As permissões sem as quais não há caminho de volta pela interface.
 *
 * `usuario:gerenciar` é a raiz: sem ela nenhuma conta nova é criada e
 * nenhum papel é atribuído. `papel:gerenciar` entra junto porque, sem
 * ela, o catálogo de papéis congela — devolver a permissão a um papel
 * exige justamente `papel:gerenciar`, e aí não existe primeira peça para
 * mover. As duas juntas são o par mínimo que mantém a escola capaz de se
 * reconfigurar sozinha.
 */
export const PERMISSOES_DE_ADMINISTRACAO = [
  'usuario:gerenciar',
  'papel:gerenciar',
] as const satisfies readonly Permissao[]

/**
 * O que uma escola pode conceder aos próprios papéis.
 *
 * `escola:gerenciar` fica de fora: é a permissão do dono do sistema, que
 * atravessa o tenant. Uma tela de escola que a concedesse entregaria o
 * isolamento entre escolas pela porta da frente — e o isolamento é
 * testado no CI.
 */
export const PERMISSOES_ATRIBUIVEIS_NA_ESCOLA: readonly Permissao[] = TODAS_AS_PERMISSOES.filter(
  (p) => !p.startsWith('escola:'),
)

/**
 * Papéis que a tela de uma escola não atribui a conta de equipe.
 *
 * `SUPER_ADMIN` não pertence a escola nenhuma e carrega `escola:*`.
 * `ALUNO` existe para o portal do leitor e tem zero permissões: numa
 * conta de staff ele produz um login que funciona e não faz nada — o que
 * se lê como conta quebrada, não como conta deliberada.
 *
 * Filtrar por NOME de papel aqui não é autorização por papel (que é
 * proibida): quem autoriza continua sendo `exigirPermissao` sobre o
 * `Principal`. Esta lista descreve o CATÁLOGO — quais papéis existem
 * para escolher —, e é uma decisão sobre o produto, não sobre quem está
 * logado.
 */
export const PAPEIS_NAO_ATRIBUIVEIS_NA_ESCOLA: readonly string[] = ['SUPER_ADMIN', 'ALUNO']

export class SenhaFracaError extends ErroDeDominio {
  constructor() {
    super(
      `A senha precisa de pelo menos ${FORCA_MINIMA_SENHA} caracteres. ` +
        'Ela abre o balcão inteiro, inclusive a ficha dos alunos.',
      'SENHA_FRACA',
    )
  }
}

export class PapelNaoAtribuivelError extends ErroDeDominio {
  constructor(readonly nomeDoPapel: string) {
    super(
      `O papel "${nomeDoPapel}" não é um papel desta escola: ela não o atribui ` +
        'a contas nem edita suas permissões.',
      'PAPEL_NAO_ATRIBUIVEL',
    )
  }
}

export class UsuarioNaoEncontradoError extends ErroDeDominio {
  constructor() {
    super('Esta conta não existe nesta escola.', 'USUARIO_NAO_ENCONTRADO')
  }
}

export class PapelNaoEncontradoError extends ErroDeDominio {
  constructor() {
    super('Este papel não existe nesta escola.', 'PAPEL_NAO_ENCONTRADO')
  }
}

export class EmailJaEmUsoError extends ErroDeDominio {
  constructor(readonly email: string) {
    super(
      `Já existe uma conta com o e-mail ${email} nesta escola. ` +
        'Se ela foi desativada, reative-a em vez de criar outra — a auditoria ' +
        'fica ligada à conta, não ao e-mail.',
      'EMAIL_JA_EM_USO',
    )
  }
}

export class NomeObrigatorioError extends ErroDeDominio {
  constructor() {
    super(
      'Informe o nome de quem vai usar a conta. É esse nome que aparece na ' +
        'auditoria de cada empréstimo.',
      'NOME_OBRIGATORIO',
    )
  }
}

export class EmailInvalidoError extends ErroDeDominio {
  constructor() {
    super('Informe um e-mail válido.', 'EMAIL_INVALIDO')
  }
}

export class AutoDesativacaoError extends ErroDeDominio {
  constructor() {
    super(
      'Você não pode desativar a própria conta. Quem consertaria seria justamente ' +
        'quem acabou de perder a entrada — peça a outra pessoa da coordenação.',
      'AUTO_DESATIVACAO',
    )
  }
}

export class PermissaoNaoConcedivelError extends ErroDeDominio {
  constructor(readonly permissoes: readonly string[]) {
    super(
      `Estas permissões não existem ou não são desta escola: ${permissoes.join(', ')}.`,
      'PERMISSAO_NAO_CONCEDIVEL',
    )
  }
}

export class SemAdministradorError extends ErroDeDominio {
  constructor(readonly orfas: readonly Permissao[]) {
    super(
      'Esta mudança deixaria a escola sem ninguém ativo para ' +
        `${orfas.map(frasePorPermissao).join(' nem ')}. ` +
        'Dê o papel a outra pessoa primeiro — depois desta mudança não haveria ' +
        'caminho de volta pela tela.',
      'SEM_ADMINISTRADOR',
    )
  }
}

function frasePorPermissao(permissao: Permissao): string {
  return permissao === 'usuario:gerenciar' ? 'gerenciar contas' : 'editar papéis'
}

/** A forma mínima de um usuário para a conta de administradores. */
export interface UsuarioParaLotacao {
  id: string
  ativo: boolean
  permissoes: readonly Permissao[]
}

export interface PapelDoUsuario {
  id: string
  nome: string
  permissoes: readonly Permissao[]
}

/** A união das permissões dos papéis do usuário, sem repetição. */
export function permissoesDoUsuario(papeis: readonly PapelDoUsuario[]): Permissao[] {
  const unidas = new Set<Permissao>()
  for (const papel of papeis) {
    for (const permissao of papel.permissoes) unidas.add(permissao)
  }
  return [...unidas]
}

/**
 * As permissões de administração que NINGUÉM ativo carrega nesta lista.
 *
 * Vazio significa "a escola continua administrável". Qualquer coisa
 * diferente de vazio é uma trancada de porta pelo lado de fora: a
 * permissão continua registrada no banco, mas em conta que não entra
 * mais, e nenhuma tela consegue devolvê-la.
 *
 * O usuário DESATIVADO não conta como dono. É exatamente o caso que
 * passaria despercebido: o banco fica consistente, a linha existe, e a
 * escola fica sem administrador.
 */
export function administracaoSemDono(usuarios: readonly UsuarioParaLotacao[]): Permissao[] {
  const ativos = usuarios.filter((u) => u.ativo)

  return PERMISSOES_DE_ADMINISTRACAO.filter(
    (permissao) => !ativos.some((u) => u.permissoes.includes(permissao)),
  )
}

/** Lança quando a lista projetada deixa alguma administração sem dono. */
export function exigirAdministradorRemanescente(usuarios: readonly UsuarioParaLotacao[]): void {
  const orfas = administracaoSemDono(usuarios)
  if (orfas.length > 0) throw new SemAdministradorError(orfas)
}

export function ehPapelAtribuivelNaEscola(nomeDoPapel: string): boolean {
  return !PAPEIS_NAO_ATRIBUIVEIS_NA_ESCOLA.includes(nomeDoPapel)
}

export function exigirPapelAtribuivel(nomeDoPapel: string): void {
  if (!ehPapelAtribuivelNaEscola(nomeDoPapel)) throw new PapelNaoAtribuivelError(nomeDoPapel)
}

/**
 * Recusa senha curta.
 *
 * O comprimento é medido sobre a senha SEM espaço em volta: "         a"
 * tem dez caracteres e uma letra, e aceitá-la seria contar espaço como
 * segredo. O espaço no meio continua valendo — frase-senha é boa senha.
 */
export function validarSenhaNova(senha: string): void {
  if (senha.trim().length < FORCA_MINIMA_SENHA) throw new SenhaFracaError()
}

/**
 * O nome como ele vai para a auditoria.
 *
 * Sem nome, cada empréstimo do log ficaria assinado por uma linha em
 * branco — e a auditoria existe justamente para dizer quem fez.
 */
export function normalizarNome(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ')
  if (limpo.length === 0) throw new NomeObrigatorioError()
  return limpo
}

/**
 * O e-mail em minúsculas e sem espaço em volta.
 *
 * A MESMA normalização do login (`autenticarStaff`). Gravar
 * "Bib@Escola.BR" e procurar "bib@escola.br" no login criaria uma conta
 * que existe e nunca entra — e o índice único `[escolaId, email]` não
 * pegaria a gêmea, porque para o Postgres as duas grafias são diferentes.
 */
export function normalizarEmail(email: string): string {
  const limpo = email.trim().toLowerCase()

  // Validação deliberadamente frouxa: exige uma arroba com algo dos dois
  // lados e um ponto no domínio. Regra mais apertada que isso recusa
  // e-mail válido de escola, e o e-mail aqui não é canal de confirmação —
  // é identificador de login digitado pela coordenação.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) throw new EmailInvalidoError()
  return limpo
}

/**
 * Filtra a lista de permissões que uma escola tentou conceder.
 *
 * Recusa em bloco em vez de descartar em silêncio: uma permissão
 * descartada sem aviso fecharia a tela de papéis dizendo "salvo" com o
 * papel diferente do que a coordenação montou.
 */
export function validarPermissoesConcedidas(permissoes: readonly string[]): Permissao[] {
  const recusadas = permissoes.filter(
    (p) => !(PERMISSOES_ATRIBUIVEIS_NA_ESCOLA as readonly string[]).includes(p),
  )
  if (recusadas.length > 0) throw new PermissaoNaoConcedivelError(recusadas)

  // Duplicata na entrada viraria duplicata na coluna String[] do banco, e
  // aí a mesma permissão apareceria duas vezes na tela do papel.
  return [...new Set(permissoes as readonly Permissao[])]
}
