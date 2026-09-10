import { ErroDeDominio } from '@/core/errors'
import type { RepositorioDeContextoDoLeitor } from '@/modules/circulacao/reservas.service'
import type { RepositorioDeReservas } from '@/modules/circulacao/reservas.tipos'

/**
 * Contratos do portal do aluno.
 *
 * A regra que organiza este arquivo inteiro: **todo método do repositório
 * recebe `alunoId` como PRIMEIRO parâmetro e o usa no `where`**. Não
 * existe método que devolva "o empréstimo tal" sem dizer de quem — porque
 * o serviço só tem um `alunoId` para passar, o da sessão, e nenhuma
 * função pública do portal aceita id de aluno de fora.
 *
 * O `alunoId` volta em toda linha lida de propósito: é o que permite ao
 * serviço conferir, antes de a linha subir para a tela, que ela é mesmo do
 * aluno da sessão (`exigirTodosMeus`). Sem esse campo de volta a
 * conferência seria impossível e o filtro do repositório viraria a única
 * proteção — combinada, não verificável.
 */

/** Um livro em mãos, como o banco o conhece. */
export interface MeuLivroEmMaos {
  emprestimoId: string
  /**
   * De quem é o empréstimo, segundo o banco. `null` no empréstimo da
   * equipe. Volta para ser CONFERIDO, não para ser exibido.
   */
  alunoId: string | null
  obraId: string
  titulo: string
  /** O primeiro autor da obra, quando há. Obra sem autor é comum no acervo. */
  autor: string | null
  previstaPara: Date
  renovacoes: number
}

/**
 * O livro em mãos já com o tamanho da fila da obra.
 *
 * A fila entra num segundo passo porque a contagem sai do MESMO método
 * que o balcão usa (`contarAguardando`) — dois caminhos para o mesmo
 * número daria à tela do aluno a chance de discordar da tela da
 * operadora sobre quantos esperam.
 */
export type MeuLivroComFila = MeuLivroEmMaos & { naFila: number }

/** A reserva que já tem exemplar separado no balcão, esperando retirada. */
export interface MinhaReservaPronta {
  reservaId: string
  alunoId: string
  titulo: string
  retirarAte: Date
}

/** O empréstimo alcançado para renovar. */
export interface MeuEmprestimoParaRenovar extends MeuLivroEmMaos {
  devolvidaEm: Date | null
}

export interface RepositorioDoPortal {
  /** Os livros em mãos: `devolvidaEm IS NULL`, do aluno pedido. */
  meusLivrosEmMaos(alunoId: string): Promise<MeuLivroEmMaos[]>

  /**
   * A reserva DISPONIVEL do aluno, se houver.
   *
   * Uma só, a mais próxima de vencer: é aviso de "vá ao balcão", não
   * relatório. Duas reservas prontas ao mesmo tempo é caso raro, e a
   * segunda aparece quando a primeira sair.
   */
  minhaReservaPronta(alunoId: string): Promise<MinhaReservaPronta | null>

  /** Um empréstimo específico, DO ALUNO pedido — o filtro está no WHERE. */
  meuEmprestimo(alunoId: string, emprestimoId: string): Promise<MeuEmprestimoParaRenovar | null>

  /**
   * Grava a renovação. Devolve quantas linhas mudaram.
   *
   * O `alunoId` entra no WHERE junto com `devolvidaEm: null`: a escrita
   * é escopada pelo dono, não só a leitura. Escopar apenas a leitura
   * impediria VER o empréstimo do colega e ainda assim permitiria
   * ESCREVER nele, bastando o id.
   */
  registrarMinhaRenovacao(
    alunoId: string,
    emprestimoId: string,
    novaPrevista: Date,
  ): Promise<number>
}

/**
 * As dependências do portal.
 *
 * Três e não uma: `portal` é o que só o portal lê (e é escopado por
 * aluno em todo método); as outras duas são REUSADAS da circulação de
 * propósito.
 *
 * Reusar `obterLeitor`, `configuracaoDaEscola`, `overridesPorSerie`,
 * `diasNaoLetivos` e `contarAguardando` não é economia de digitação: é a
 * garantia de que o número no celular do aluno é o mesmo número da tela
 * da operadora. Um repositório próprio do portal traria uma segunda
 * cópia do padrão de configuração (`PADRAO` em `balcao.repository.ts`) e,
 * no dia em que a escola não tivesse configurado nada, o portal
 * anunciaria um prazo que o balcão não pratica.
 */
export interface DependenciasDoPortal {
  portal: RepositorioDoPortal
  leitor: Pick<
    RepositorioDeContextoDoLeitor,
    'obterLeitor' | 'configuracaoDaEscola' | 'overridesPorSerie' | 'diasNaoLetivos'
  >
  reservas: Pick<RepositorioDeReservas, 'contarAguardando'>
}

/** O que o portal precisa saber do cadastro do próprio aluno. */
export interface EstadoDoMeuCadastro {
  ativo: boolean
  /** Último dia da suspensão, inclusive. `null` quando não há. */
  suspensaoAte: Date | null
}

export type MotivoDeNaoRenovar =
  | 'CADASTRO_INATIVO'
  | 'LEITOR_SUSPENSO'
  | 'LIVRO_ATRASADO'
  | 'MAXIMO_DE_RENOVACOES'
  | 'OBRA_COM_FILA'

/**
 * Pode renovar, ou o motivo de não poder.
 *
 * União discriminada e não um par de booleanos: `pode: false` sem motivo
 * seria um botão desabilitado sem explicação, e o aluno não tem balcão à
 * mão para perguntar por quê.
 */
export type PossibilidadeDeRenovar =
  | { pode: true; porDias: number }
  | { pode: false; motivo: MotivoDeNaoRenovar; explicacao: string }

export interface LivroNaMinhaEstante {
  emprestimoId: string
  titulo: string
  autor: string | null
  previstaPara: Date
  /**
   * 0 quando em dia. Derivado de `previstaPara < hoje`, sempre — não
   * existe campo "atrasado" no banco (Global Constraint 16).
   */
  diasDeAtraso: number
  atrasado: boolean
  renovacao: PossibilidadeDeRenovar
}

export interface MinhaEstante {
  livros: LivroNaMinhaEstante[]
  /** O limite de livros simultâneos da série do aluno. O número, não o sim/não. */
  limiteDaMinhaSerie: number
  /** Quantos ainda cabem, já descontado o que está em mãos. Nunca negativo. */
  quantosAindaPodeLevar: number
  /** Por que não cabe mais nenhum. `null` quando cabe. */
  porqueNaoPodeLevar: string | null
  /** Último dia da suspensão VIGENTE. `null` quando não há. */
  suspensoAte: Date | null
  reservaPronta: { titulo: string; retirarAte: Date } | null
}

export class LivroNaoEstaComVoceError extends ErroDeDominio {
  constructor() {
    // Mesma mensagem para "não existe" e para "é do colega", de
    // propósito: distinguir os dois responderia "este id existe?" a quem
    // experimentasse ids.
    super('Este livro não está com você.', 'LIVRO_NAO_ESTA_COM_VOCE')
  }
}

export class LivroJaDevolvidoError extends ErroDeDominio {
  constructor() {
    super('Este livro já foi devolvido — não há o que renovar.', 'LIVRO_JA_DEVOLVIDO')
  }
}

export class RenovacaoRecusadaError extends ErroDeDominio {
  constructor(
    readonly motivo: MotivoDeNaoRenovar,
    explicacao: string,
  ) {
    super(explicacao, `RENOVACAO_RECUSADA_${motivo}`)
  }
}
