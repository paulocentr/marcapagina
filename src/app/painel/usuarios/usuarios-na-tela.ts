import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import type { Permissao } from '@/core/rbac/permissoes'
import type { PapelDoUsuario } from '@/modules/usuarios/usuarios'
import type { UsuarioNaTela } from '@/modules/usuarios/usuarios.service'

/**
 * A lógica da tela de contas, em módulo puro — sem React e sem servidor.
 *
 * Separado porque as decisões daqui são conferíveis em milissegundos e
 * caras de descobrir na tela:
 *
 *  1. **o editor de papéis mostra TODA permissão que a escola concede.**
 *     O catálogo em `permissoes.ts` cresce a cada plano, e uma permissão
 *     que não entrou em grupo nenhum não aparece na tela — a coordenação
 *     salva o papel achando que o viu inteiro;
 *  2. **nenhuma permissão aparece como chave crua.** `carrinho:gerenciar`
 *     não diz nada a quem coordena a biblioteca;
 *  3. **o estado da conta tem palavra E ícone.** Ativo dito só pela cor é
 *     a regra dura do sistema — e como "Ativa/Desativada" não existe no
 *     catálogo de `estados.ts` (que fala de exemplar e de leitor, não de
 *     conta), a dupla palavra+ícone é montada aqui e provada por teste.
 */

export interface SituacaoDaConta {
  palavra: string
  icone: NomeDeIcone
  /** Classe de cor. Acompanha a palavra; nunca é a informação. */
  cor: string
}

export function descreverConta(ativo: boolean): SituacaoDaConta {
  return ativo
    ? { palavra: 'Ativa', icone: 'check', cor: 'text-certo' }
    : { palavra: 'Desativada', icone: 'xis', cor: 'text-tinta-3' }
}

/**
 * O nome de exibição dos papéis de fábrica.
 *
 * Os papéis nascem com nome em CAIXA_ALTA (é a chave em
 * `PAPEIS_DE_FABRICA`), e mostrar `BIBLIOTECARIO` numa tela lida pela
 * coordenação parece nome de constante, não cargo de pessoa. Papel
 * criado pela escola já vem com o nome que ela escreveu e passa direto.
 */
const NOMES_DE_EXIBICAO: Record<string, string> = {
  SUPER_ADMIN: 'Dono do sistema',
  COORDENACAO: 'Coordenação',
  DIRECAO: 'Direção',
  BIBLIOTECARIO: 'Bibliotecária ou bibliotecário',
  MONITOR: 'Monitor de balcão',
  PROFESSOR: 'Professor',
  ALUNO: 'Leitor (portal do aluno)',
}

export function nomeDoPapelNaTela(nome: string): string {
  return NOMES_DE_EXIBICAO[nome] ?? nome
}

/**
 * Os papéis da conta em uma linha.
 *
 * Conta sem papel é DITA, não deixada em branco: em branco a coordenação
 * leria "ainda não carregou", quando o que existe é uma conta que entra
 * no sistema e não faz nada.
 */
export function resumirPapelDaConta(papeis: readonly PapelDoUsuario[]): string {
  if (papeis.length === 0) return 'sem papel'
  return papeis.map((p) => nomeDoPapelNaTela(p.nome)).join(' · ')
}

/**
 * Por que o botão de desativar está desligado — ou `null` se não está.
 *
 * A recusa de verdade mora no serviço (`definirSituacaoDoUsuario`); isto
 * existe para a tela não convidar ao clique que vai ser recusado, e para
 * dizer o motivo ANTES. Uma razão só: duas frases empilhadas no mesmo
 * botão desabilitado não ajudam ninguém a decidir o que fazer.
 */
export function motivoParaNaoDesativar(
  conta: { id: string; unicoAdministrador: boolean },
  principalId: string,
): string | null {
  if (conta.id === principalId) {
    return 'Você não pode desativar a própria conta. Peça a outra pessoa da coordenação.'
  }

  if (conta.unicoAdministrador) {
    return (
      'Esta é a única conta ativa que administra a escola. ' +
      'Dê o papel de coordenação a outra pessoa antes de desativá-la.'
    )
  }

  return null
}

/**
 * O fuso da escola, para escrever a data de criação da conta.
 *
 * Repetido de `prazo.ts` (que não o exporta) de propósito, e o comentário
 * é a ligação: no dia em que ele virar configuração por escola, os dois
 * lugares mudam juntos. Aqui a consequência de errar é cosmética — a
 * conta aparecer criada um dia depois —, enquanto em `prazo.ts` é uma
 * data de devolução errada. Por isso a duplicação é aceitável aqui e não
 * lá.
 *
 * `criadoEm` é um INSTANTE (`DateTime`), não uma coluna de dia: às 21h em
 * São Paulo já é o dia seguinte em UTC, e formatar por UTC diria à
 * coordenação que a conta nasceu num dia em que a secretaria estava
 * fechada.
 */
const FUSO_DA_ESCOLA = 'America/Sao_Paulo'

const FORMATADOR_DE_DIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DA_ESCOLA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** dd/mm/aaaa, no dia em que o instante cai para quem está na escola. */
export function formatarDiaDaEscola(instante: Date): string {
  return FORMATADOR_DE_DIA.format(instante)
}

/**
 * A conta como a tabela a desenha.
 *
 * Tipo próprio, e estreito de propósito: é ele que atravessa a fronteira
 * servidor→cliente. Passar o `UsuarioNaTela` do serviço adiante mandaria
 * para o navegador tudo o que o serviço souber da conta hoje e amanhã —
 * e o campo que ninguém quer lá é justamente o que a gestão de contas é
 * a única a escrever.
 */
export interface ContaNaTela {
  id: string
  nome: string
  email: string
  ativo: boolean
  /** `null` quando a conta está sem papel — o `<select>` mostra isso. */
  papelId: string | null
  resumoDoPapel: string
  criadaEm: string
  unicoAdministrador: boolean
  /** A conta de quem está olhando a tela. */
  souEu: boolean
  motivoParaNaoDesativar: string | null
}

export function montarContas(
  usuarios: readonly UsuarioNaTela[],
  principalId: string,
): ContaNaTela[] {
  return usuarios.map((usuario) => ({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    ativo: usuario.ativo,
    // O primeiro papel: a tela atribui UM por conta. Se o banco tiver
    // mais (o schema permite), `resumoDoPapel` nomeia todos e o `<select>`
    // mostra o primeiro — dizer a verdade parcial é melhor que esconder a
    // conta com dois papéis.
    papelId: usuario.papeis[0]?.id ?? null,
    resumoDoPapel: resumirPapelDaConta(usuario.papeis),
    criadaEm: formatarDiaDaEscola(usuario.criadoEm),
    unicoAdministrador: usuario.unicoAdministrador,
    souEu: usuario.id === principalId,
    motivoParaNaoDesativar: motivoParaNaoDesativar(usuario, principalId),
  }))
}

/**
 * O rótulo em pt-BR de cada permissão.
 *
 * `Record<Permissao, string>` de propósito: acrescentar uma permissão ao
 * catálogo sem escrever o rótulo dela é erro de COMPILAÇÃO, não uma
 * chave crua aparecendo na tela de papéis.
 */
export const ROTULOS_DE_PERMISSAO: Record<Permissao, string> = {
  'obra:ver': 'Ver o acervo e buscar títulos',
  'obra:criar': 'Cadastrar obra nova',
  'obra:editar': 'Corrigir ficha de obra',
  'obra:excluir': 'Excluir obra',
  'exemplar:criar': 'Cadastrar exemplar e gerar tombo',
  'exemplar:editar': 'Corrigir dados do exemplar',
  'exemplar:baixar': 'Dar baixa em exemplar (perda, descarte)',

  'emprestimo:criar': 'Emprestar no balcão',
  'emprestimo:devolver': 'Receber devolução',
  'emprestimo:renovar': 'Renovar empréstimo',
  'emprestimo:forcar': 'Liberar empréstimo bloqueado, com justificativa',
  'reserva:criar': 'Registrar reserva',
  'reserva:gerenciar': 'Cancelar reserva e mexer na fila',

  'aluno:ver': 'Ver a ficha do leitor',
  'aluno:criar': 'Cadastrar aluno',
  'aluno:editar': 'Corrigir cadastro de aluno',
  'aluno:importar': 'Importar alunos de planilha',
  'turma:gerenciar': 'Criar e organizar turmas',

  'carrinho:gerenciar': 'Montar rodadas do Carrinho da Leitura',

  'inventario:executar': 'Conferir o acervo (inventário)',

  'relatorio:ver': 'Ver relatórios',
  'relatorio:exportar': 'Exportar relatórios em planilha',

  'usuario:gerenciar': 'Criar, desativar e trocar o papel das contas da equipe',
  'papel:gerenciar': 'Editar as permissões dos papéis',
  'config:editar': 'Mudar prazo, limite e calendário',
  'auditoria:ver': 'Ler o registro de quem fez o quê',

  // Permissão do dono do sistema. Não é oferecida no editor de papéis de
  // uma escola — atravessaria o tenant. O rótulo existe porque o tipo
  // exige a chave, e porque a auditoria pode precisar exibi-la.
  'escola:gerenciar': 'Gerenciar escolas do sistema',
}

export interface GrupoDePermissoes {
  titulo: string
  /** O que este grupo significa no dia a dia da biblioteca. */
  explicacao: string
  permissoes: readonly Permissao[]
}

/**
 * Os grupos do editor de papéis.
 *
 * Agrupados pelo TRABALHO, não pelo prefixo técnico: quem monta um papel
 * está pensando "a monitora atende o balcão e não mexe em cadastro", e
 * não em `emprestimo:*`. `escola:gerenciar` não entra em grupo nenhum,
 * de propósito — uma escola não concede a permissão que atravessa
 * escolas.
 */
export const GRUPOS_DE_PERMISSAO: readonly GrupoDePermissoes[] = [
  {
    titulo: 'Balcão',
    explicacao: 'Emprestar, receber de volta, renovar e cuidar da fila de reserva.',
    permissoes: [
      'emprestimo:criar',
      'emprestimo:devolver',
      'emprestimo:renovar',
      'emprestimo:forcar',
      'reserva:criar',
      'reserva:gerenciar',
    ],
  },
  {
    titulo: 'Acervo',
    explicacao: 'Catalogar, corrigir fichas e dar baixa em exemplar.',
    permissoes: [
      'obra:ver',
      'obra:criar',
      'obra:editar',
      'obra:excluir',
      'exemplar:criar',
      'exemplar:editar',
      'exemplar:baixar',
      'inventario:executar',
    ],
  },
  {
    titulo: 'Leitores e turmas',
    explicacao: 'Cadastro dos alunos e organização das turmas.',
    permissoes: ['aluno:ver', 'aluno:criar', 'aluno:editar', 'aluno:importar', 'turma:gerenciar'],
  },
  {
    titulo: 'Carrinho da Leitura',
    explicacao: 'As rodadas do carrinho que circula pelas salas.',
    permissoes: ['carrinho:gerenciar'],
  },
  {
    titulo: 'Relatórios',
    explicacao: 'Números da biblioteca e exportação em planilha.',
    permissoes: ['relatorio:ver', 'relatorio:exportar'],
  },
  {
    titulo: 'Administração da escola',
    explicacao:
      'As permissões que mudam o próprio sistema. Sem as duas primeiras, ninguém ' +
      'da escola consegue criar conta nem editar papel — e não há volta pela tela.',
    permissoes: ['usuario:gerenciar', 'papel:gerenciar', 'config:editar', 'auditoria:ver'],
  },
]
