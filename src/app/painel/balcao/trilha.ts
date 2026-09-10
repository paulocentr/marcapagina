import type { EstadoDeChip } from '@/components/ui/estados'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import type { TipoDeMovimento } from '@/modules/circulacao/painel-do-balcao.service'

/**
 * O que a trilha lateral do balcão DIZ, em módulo puro.
 *
 * Sem React e sem servidor de propósito: a trilha existe para a operadora
 * conferir o dia com o aluno na frente dela, e cada frase daqui é uma
 * afirmação sobre número que alguém contou. Provar isso em milissegundos
 * é o que permite garantir as duas coisas que a trilha não pode errar —
 * contar o DIA (e não a tira exibida) e nunca contradizer a lista que
 * está desenhada ao lado do contador.
 *
 * Nada aqui inventa número: toda função recebe o que o serviço devolveu e
 * recusa a entrada contraditória em vez de escolher uma das metades.
 */

/** Tom visual da tira. Acompanha a palavra, nunca a substitui. */
export type TomDaTira = 'certo' | 'neutro' | 'atencao' | 'alerta' | 'fita'

/**
 * Fuso da escola.
 *
 * ESPELHO de `FUSO_DA_ESCOLA` em `src/modules/circulacao/prazo.ts`, que é
 * a autoridade: é lá que se decide o que é "hoje" para os contadores do
 * dia. O módulo não o exporta, e o serviço não formata hora — então a
 * constante aparece duas vezes no projeto. O teste
 * `tests/unit/balcao/trilha.test.ts` amarra as duas: ele formata a
 * meia-noite que `intervaloDoDiaDaEscola` devolve e exige "00:00". Se
 * alguém trocar o fuso de um lado só, aquele teste fica vermelho — sem
 * ele, a tira mostraria movimento de 22h num dia que o contador já virou.
 */
const FUSO_DA_ESCOLA = 'America/Sao_Paulo'

const FORMATADOR_DE_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DA_ESCOLA,
  hour: '2-digit',
  minute: '2-digit',
  // `h23` explícito para a meia-noite sair "00:00" e não "24:00".
  hourCycle: 'h23',
})

/**
 * A hora de um INSTANTE, como quem está no balcão a leu no relógio.
 *
 * Vale para `retiradaEm` e `devolvidaEm`, que são timestamps. Não vale
 * para coluna `@db.Date` — ver `formatarDiaUtc`.
 */
export function formatarHoraDaEscola(instante: Date): string {
  return FORMATADOR_DE_HORA.format(instante)
}

/**
 * dd/mm/aaaa a partir de uma coluna `@db.Date`.
 *
 * Em UTC, e não no fuso da escola, porque `@db.Date` chega como
 * meia-noite UTC: convertê-la para São Paulo devolveria 21h do DIA
 * ANTERIOR, e a tela diria que o livro venceu um dia antes do que venceu.
 */
export function formatarDataUtc(data: Date): string {
  return `${diaEmDoisDigitos(data)}/${mesEmDoisDigitos(data)}/${data.getUTCFullYear()}`
}

/** dd/mm — a forma curta, para a coluna estreita da trilha. */
export function formatarDiaUtc(data: Date): string {
  return `${diaEmDoisDigitos(data)}/${mesEmDoisDigitos(data)}`
}

function diaEmDoisDigitos(data: Date): string {
  return String(data.getUTCDate()).padStart(2, '0')
}

function mesEmDoisDigitos(data: Date): string {
  return String(data.getUTCMonth() + 1).padStart(2, '0')
}

export interface PalavraComTom {
  palavra: string
  tom: TomDaTira
}

/**
 * "saiu" / "voltou" — a palavra do movimento na tira.
 *
 * `Record` exaustivo, e não `if`: um terceiro tipo de movimento no
 * serviço vira erro de compilação aqui, em vez de uma linha da tira sem
 * palavra nenhuma dizendo o estado só pela cor.
 */
const POR_TIPO: Record<TipoDeMovimento, PalavraComTom> = {
  RETIRADA: { palavra: 'saiu', tom: 'certo' },
  DEVOLUCAO: { palavra: 'voltou', tom: 'neutro' },
}

export function rotuloDoMovimento(tipo: TipoDeMovimento): PalavraComTom {
  return POR_TIPO[tipo]
}

/**
 * "em dia" / "8 dias de atraso" na linha da devolução.
 *
 * `null` entra e `null` sai: na RETIRADA não existe atraso a informar, e
 * escrever "em dia" ali seria afirmar algo sobre um evento que não é
 * devolução.
 */
export function fraseDoAtrasoNaTira(diasDeAtraso: number | null): PalavraComTom | null {
  if (diasDeAtraso === null) return null

  if (!Number.isInteger(diasDeAtraso) || diasDeAtraso < 0) {
    throw new Error(
      `Dias de atraso impossíveis na tira do balcão: ${diasDeAtraso}. ` +
        'O serviço devolve 0 para quem voltou em dia e nunca um número negativo.',
    )
  }

  if (diasDeAtraso === 0) return { palavra: 'em dia', tom: 'neutro' }
  return { palavra: `${fraseDeDias(diasDeAtraso)} de atraso`, tom: 'atencao' }
}

/** "1 dia" / "8 dias" — para nenhuma tela escrever o plural à mão. */
function fraseDeDias(dias: number): string {
  return dias === 1 ? '1 dia' : `${dias} dias`
}

/**
 * "mostrando os 5 mais recentes de 27" — ou nada.
 *
 * O contador do cabeçalho conta o DIA e a tira mostra só as linhas que
 * cabem. Sem esta frase, a coordenação lê 27 ao lado de cinco linhas e
 * conclui que uma das duas está errada; com ela, as duas continuam
 * verdadeiras. Cala quando nada foi cortado, porque aí não há o que
 * confessar.
 */
export function fraseDoCorte(mostrados: number, total: number): string | null {
  if (!Number.isInteger(mostrados) || !Number.isInteger(total) || mostrados < 0 || total < 0) {
    throw new Error(
      `Contagem impossível na tira do balcão: ${mostrados} de ${total}. ` +
        'Só números inteiros contam atendimentos.',
    )
  }

  if (mostrados > total) {
    throw new Error(
      `Contagem impossível na tira do balcão: ${mostrados} linhas de um total de ${total}. ` +
        'A tira é um corte do dia — não pode mostrar mais atendimentos do que houve.',
    )
  }

  if (mostrados === total) return null
  return `mostrando os ${mostrados} mais recentes de ${total}`
}

export interface ChipDoLivro {
  estado: EstadoDeChip
  complemento: string
}

/**
 * O chip de um livro em mãos do leitor: "Atrasado · 8 dias" ou
 * "Em dia · até 19/09".
 *
 * As duas metades da entrada TÊM de concordar: o serviço deriva
 * `atrasado` de `diasDeAtraso > 0`, na mesma função. Se chegarem
 * discordando, alguém as calculou por caminhos diferentes — e escolher
 * uma delas aqui pintaria de vermelho quem cumpriu o prazo (ou de verde
 * quem não cumpriu) na frente do aluno. Falhar alto é a única saída
 * honesta.
 */
export function chipDoLivroEmMaos(livro: {
  atrasado: boolean
  diasDeAtraso: number
  /** Já formatada como dd/mm. */
  previstaPara: string
}): ChipDoLivro {
  if (!Number.isInteger(livro.diasDeAtraso) || livro.diasDeAtraso < 0) {
    throw new Error(
      `Dias de atraso impossíveis na ficha do leitor: ${livro.diasDeAtraso}.`,
    )
  }

  if (livro.atrasado !== livro.diasDeAtraso > 0) {
    throw new Error(
      `Ficha do leitor contraditória: atrasado=${livro.atrasado} com ` +
        `${livro.diasDeAtraso} dia(s) de atraso. As duas metades saem da mesma ` +
        'função do serviço; discordando, uma delas é fruto de outro cálculo.',
    )
  }

  if (livro.atrasado) {
    return { estado: 'ATRASADO', complemento: `· ${fraseDeDias(livro.diasDeAtraso)}` }
  }

  return { estado: 'EM_DIA', complemento: `· até ${livro.previstaPara}` }
}

export interface SituacaoNaPrateleira {
  /** A palavra que a operadora lê. Nunca só a cor. */
  palavra: string
  icone: NomeDeIcone
  tom: TomDaTira
  /** A linha de baixo: o que fazer, ou quanto tempo ainda há. */
  frase: string
}

/**
 * O destaque de um exemplar separado na prateleira física.
 *
 * Três casos, e o terceiro é o que não pode desaparecer: o **vencido**.
 * Ele só existe quando o job de expiração não rodou de madrugada — e é
 * exatamente aí que o livro fica parado atrás do balcão sem ninguém saber
 * por quê. Esconder o vencido faria a prateleira parecer em ordem
 * justamente no dia em que não está.
 *
 * As três metades da entrada têm de concordar com `diasParaRetirar`, que
 * é de onde o serviço derivou as duas booleanas.
 */
export function situacaoNaPrateleira(item: {
  vencido: boolean
  venceHoje: boolean
  diasParaRetirar: number
  /** Já formatada como dd/mm. */
  retirarAte: string
}): SituacaoNaPrateleira {
  if (!Number.isInteger(item.diasParaRetirar)) {
    throw new Error(`Prazo de retirada impossível: ${item.diasParaRetirar} dia(s).`)
  }

  if (item.vencido !== item.diasParaRetirar < 0 || item.venceHoje !== (item.diasParaRetirar === 0)) {
    throw new Error(
      `Prazo de retirada contraditório: vencido=${item.vencido}, ` +
        `venceHoje=${item.venceHoje} com ${item.diasParaRetirar} dia(s). O serviço ` +
        'deriva as duas do mesmo número, e a prateleira não escolhe entre eles.',
    )
  }

  if (item.vencido) {
    return {
      palavra: 'retirada vencida',
      icone: 'aviso',
      tom: 'alerta',
      frase: `o prazo era ${item.retirarAte} — devolva à estante ou passe a vez`,
    }
  }

  if (item.venceHoje) {
    return {
      palavra: 'vence hoje',
      icone: 'relogio',
      tom: 'atencao',
      frase: 'volta à estante amanhã',
    }
  }

  return {
    palavra: `até ${item.retirarAte}`,
    icone: 'fita',
    tom: 'fita',
    frase: `${fraseDeDias(item.diasParaRetirar)} para retirar`,
  }
}

/**
 * Onde o exemplar mora, numa linha — "Literatura · estante 4 · prateleira 2".
 *
 * O serviço devolve os quatro campos separados de propósito, para que
 * mudar a forma de escrever a estante não seja mudança de serviço. Campo
 * ausente (ou só com espaço, que é o que a catalogação parcial deixa)
 * simplesmente não é escrito: "estante null" mandaria a operadora
 * procurar uma prateleira que não existe.
 */
export function textoDaLocalizacao(
  localizacao: {
    nome: string
    corredor: string | null
    estante: string | null
    prateleira: string | null
  } | null,
): string | null {
  if (localizacao === null) return null

  const partes = [
    localizacao.nome,
    rotulado('corredor', localizacao.corredor),
    rotulado('estante', localizacao.estante),
    rotulado('prateleira', localizacao.prateleira),
  ].filter((parte): parte is string => parte !== null)

  if (partes.length === 0) return null
  return partes.join(' · ')
}

function rotulado(rotulo: string, valor: string | null): string | null {
  if (valor === null) return null
  const limpo = valor.trim()
  return limpo.length === 0 ? null : `${rotulo} ${limpo}`
}

/**
 * O primeiro nome, para o título "Em mãos de Ana" na coluna de 336px.
 *
 * Primeiro nome e mais nada: cortar "Ana Beatriz Rocha" em "Ana Beatriz"
 * exigiria adivinhar onde acaba o nome e começa o sobrenome, e o nome
 * completo já está escrito na ficha ao lado. `null` sem nome nenhum —
 * "Em mãos de " com o vazio no fim é pior que um título genérico.
 */
export function primeiroNome(nome: string): string | null {
  const primeira = nome.trim().split(/\s+/).at(0)
  if (primeira === undefined || primeira.length === 0) return null
  return primeira
}
