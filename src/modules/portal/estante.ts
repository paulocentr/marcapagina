import { diasDeAtraso } from '@/modules/circulacao/penalidade'
import type { ConfiguracaoDaEscola } from '@/modules/circulacao/configuracao'
import type {
  EstadoDoMeuCadastro,
  LivroNaMinhaEstante,
  MeuLivroComFila,
  MinhaEstante,
  PossibilidadeDeRenovar,
} from '@/modules/portal/portal.tipos'

/**
 * As regras do portal, em funções PURAS.
 *
 * Nada aqui toca banco: recebe o que já foi lido e devolve a decisão. É o
 * que permite provar o portal inteiro — atraso, limite, renovação — numa
 * suíte de milissegundos, incluindo as fronteiras que só aparecem à noite
 * e na virada do prazo.
 *
 * O que este módulo NÃO faz: escolher o aluno. Ele recebe os livros já
 * escopados pelo serviço, que só sabe o `id` da sessão. Autorização mora
 * em `autorizacao-do-aluno.ts` e no serviço; aqui é só regra de negócio.
 */

export interface EntradaDoResumoDaEstante {
  livros: readonly MeuLivroComFila[]
  leitor: EstadoDoMeuCadastro
  reservaPronta: { titulo: string; retirarAte: Date } | null
  config: ConfiguracaoDaEscola
  /** "Hoje" no dia da ESCOLA — ver `dia-da-escola.ts`. */
  hoje: Date
}

export function resumirEstante(entrada: EntradaDoResumoDaEstante): MinhaEstante {
  const { livros, leitor, config, hoje } = entrada

  const naEstante: LivroNaMinhaEstante[] = livros.map((livro) => {
    const atrasoEmDias = diasDeAtraso(livro.previstaPara, hoje)
    return {
      emprestimoId: livro.emprestimoId,
      titulo: livro.titulo,
      autor: livro.autor,
      previstaPara: livro.previstaPara,
      diasDeAtraso: atrasoEmDias,
      atrasado: atrasoEmDias > 0,
      // A MESMA função que o serviço de renovação chama. Se a tela
      // decidisse por conta própria, o botão apareceria para uma
      // renovação que o serviço recusa — e o aluno levaria a culpa por
      // um botão que não devia estar ali.
      renovacao: avaliarRenovacao(livro, leitor, config, hoje),
    }
  })

  const suspensoAte = suspensaoVigente(leitor, hoje)
  const comAtraso = naEstante.some((livro) => livro.atrasado)

  return {
    livros: naEstante,
    limiteDaMinhaSerie: config.limiteSimultaneo,
    quantosAindaPodeLevar: quantosAindaCabem({
      emMaos: naEstante.length,
      limite: config.limiteSimultaneo,
      cadastroAtivo: leitor.ativo,
      suspensoAte,
      comAtraso,
    }),
    porqueNaoPodeLevar: porqueNaoPodeLevar({
      emMaos: naEstante.length,
      limite: config.limiteSimultaneo,
      cadastroAtivo: leitor.ativo,
      suspensoAte,
      comAtraso,
    }),
    suspensoAte,
    reservaPronta: entrada.reservaPronta,
  }
}

interface SituacaoDeEmprestar {
  emMaos: number
  limite: number
  cadastroAtivo: boolean
  suspensoAte: Date | null
  comAtraso: boolean
}

/**
 * Quantos livros ainda cabem.
 *
 * Os mesmos quatro impedimentos que `avaliarBloqueios` aplica no balcão
 * (bloqueios.ts): cadastro inativo, suspensão vigente, limite da série e
 * livro em atraso. Aqui eles viram um NÚMERO em vez de uma lista de
 * mensagens porque a prancha pede o número — e porque as mensagens do
 * balcão são escritas para a operadora ler em voz alta ("Este leitor
 * está desativado"), não para o aluno ler sobre si mesmo.
 *
 * Zero e não negativo: empréstimo forçado no balcão passa do limite de
 * propósito, e "-1" na tela do aluno não significa nada.
 */
function quantosAindaCabem(situacao: SituacaoDeEmprestar): number {
  if (!situacao.cadastroAtivo) return 0
  if (situacao.suspensoAte !== null) return 0
  if (situacao.comAtraso) return 0

  const sobra = situacao.limite - situacao.emMaos
  return sobra > 0 ? sobra : 0
}

/**
 * O motivo, na ordem em que o aluno precisa resolver.
 *
 * Um só, e não a lista inteira que o balcão acumula: a operadora precisa
 * ver tudo junto para explicar de uma vez; o aluno precisa saber o
 * PRÓXIMO passo. "Devolva o atrasado" é ação; quatro frases de recusa no
 * celular é um muro.
 */
function porqueNaoPodeLevar(situacao: SituacaoDeEmprestar): string | null {
  if (!situacao.cadastroAtivo) {
    return 'Seu cadastro está inativo na biblioteca. Fale com a coordenação.'
  }
  if (situacao.suspensoAte !== null) {
    return `Você está sem poder levar livros até ${formatarDia(situacao.suspensoAte)}.`
  }
  if (situacao.comAtraso) {
    return 'Devolva o livro em atraso para poder pegar outro.'
  }
  if (situacao.emMaos >= situacao.limite) {
    return `Você já está com ${situacao.emMaos} livro(s), que é o limite da sua série.`
  }
  return null
}

/**
 * Pode renovar este livro?
 *
 * Função pública de propósito: é a MESMA que o serviço de renovação
 * chama antes de escrever. O botão na tela e a recusa no servidor saem
 * daqui, então não há como discordarem.
 *
 * As regras replicam as do balcão (`renovar.service.ts`), com UM
 * estreitamento: o portal não renova livro atrasado. Renovar empurra
 * `previstaPara` para frente, e a penalidade da devolução é derivada de
 * `previstaPara` — em auto-atendimento, renovar o atrasado seria o aluno
 * apagando a própria suspensão com um toque. Estreitar é seguro; alargar
 * nunca seria (o portal jamais autoriza o que o balcão recusa).
 */
export function avaliarRenovacao(
  livro: MeuLivroComFila,
  leitor: EstadoDoMeuCadastro,
  config: ConfiguracaoDaEscola,
  hoje: Date,
): PossibilidadeDeRenovar {
  if (!leitor.ativo) {
    return {
      pode: false,
      motivo: 'CADASTRO_INATIVO',
      explicacao: 'Seu cadastro está inativo na biblioteca. Fale com a coordenação.',
    }
  }

  const suspensoAte = suspensaoVigente(leitor, hoje)
  if (suspensoAte !== null) {
    return {
      pode: false,
      motivo: 'LEITOR_SUSPENSO',
      explicacao: `Você não pode renovar enquanto estiver suspenso, até ${formatarDia(suspensoAte)}.`,
    }
  }

  if (diasDeAtraso(livro.previstaPara, hoje) > 0) {
    return {
      pode: false,
      motivo: 'LIVRO_ATRASADO',
      explicacao: 'Este livro está atrasado. Devolva na biblioteca — pelo portal não dá para renovar.',
    }
  }

  if (livro.renovacoes >= config.maximoDeRenovacoes) {
    return {
      pode: false,
      motivo: 'MAXIMO_DE_RENOVACOES',
      explicacao:
        config.maximoDeRenovacoes === 0
          ? 'A biblioteca não permite renovar os livros da sua série.'
          : `Você já renovou este livro ${config.maximoDeRenovacoes} vez(es), que é o máximo da sua série.`,
    }
  }

  // A fila vem ANTES da data justamente para não dar a vez de quem
  // esperou a quem já leu (spec §5.2).
  if (livro.naFila > 0) {
    return {
      pode: false,
      motivo: 'OBRA_COM_FILA',
      explicacao:
        livro.naFila === 1
          ? 'Uma pessoa está esperando por este livro. Devolva na data para ela poder ler.'
          : `${livro.naFila} pessoas estão esperando por este livro. Devolva na data para elas poderem ler.`,
    }
  }

  return { pode: true, porDias: config.prazoEmDias }
}

/**
 * A suspensão que ainda vale hoje, ou `null`.
 *
 * Vale o DIA INTEIRO em que termina — liberar na manhã do último dia
 * encurta a penalidade, exatamente como em `bloqueios.ts`.
 */
function suspensaoVigente(leitor: EstadoDoMeuCadastro, hoje: Date): Date | null {
  if (leitor.suspensaoAte === null) return null
  return diaEmUtc(hoje) > diaEmUtc(leitor.suspensaoAte) ? null : leitor.suspensaoAte
}

function diaEmUtc(data: Date): number {
  return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate())
}

/** dd/mm/aaaa — como a escola escreve. */
function formatarDia(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getUTCFullYear()}`
}
