import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import type { ItemDeInventario } from '@/modules/acervo/inventario.service'
import type { SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

/**
 * O que a tela de conferência DIZ, em módulo puro.
 *
 * Conferir acervo é trabalho físico: alguém percorre a estante de pé,
 * com o leitor de código de barras numa mão e o livro na outra, e a tela
 * é a única coisa que sabe onde a pessoa parou. Tudo que ela afirma —
 * quantos já passaram, quantos faltam, se este tombo já foi bipado, o
 * que o exemplar constava ser na abertura — é uma afirmação sobre número
 * que alguém contou, e nenhuma delas pode ser inventada aqui.
 *
 * Sem React e sem servidor de propósito: é o que permite provar em
 * milissegundos que o contador da tela e o relatório de fechamento
 * contam a mesma coisa. Uma conferência que fecha em "87 de 87" e um
 * relatório que diz que faltam três é o pior resultado possível — a
 * coordenação para de procurar exatamente quando deveria começar.
 */

/** Uma linha da lista de bipados: o tombo, o alerta e quantas leituras. */
export interface TomboBipado {
  tombo: string
  /** O exemplar pertence a outra estante — quem disse foi o serviço. */
  foraDoLugar: boolean
  /**
   * Quantas vezes este tombo foi lido nesta sessão.
   *
   * Existe porque repetir NÃO é erro (o serviço aceita de propósito), e
   * a operadora precisa ver que já passou por ele sem que a linha seja
   * duplicada — duas linhas iguais fariam o contador dizer 88 numa
   * estante de 87.
   */
  vezes: number
}

/** O que a tela responde à última leitura. Palavra e ícone vêm do catálogo. */
export type ResultadoDaBipagem = 'CONFERIDO' | 'FORA_DO_LUGAR' | 'REPETIDO'

/**
 * Os grupos que a conferência sabe mostrar: os três resultados de uma
 * bipagem e os três grupos do relatório de fechamento — não mais.
 *
 * As três listas do relatório são as do serviço (`RelatorioDeInventario`)
 * e da spec §5.7: não encontrado, fora do lugar, consta emprestado. Não
 * existe uma quarta.
 */
export type SituacaoNaConferencia = ResultadoDaBipagem | 'NAO_ENCONTRADO' | 'CONSTA_EMPRESTADO'

export interface AparenciaNaConferencia {
  /** A palavra que a operadora lê. Obrigatória — cor sozinha não informa. */
  palavra: string
  /** O desenho que acompanha a palavra. Obrigatório pelo mesmo motivo. */
  icone: NomeDeIcone
  classes: string
}

/**
 * O catálogo dos grupos desta tela.
 *
 * Mora aqui, e não em `components/ui/estados.ts`, por dois motivos: o
 * kit é de outra frente de trabalho, e nenhum destes seis é estado de
 * exemplar — são estados de uma CONFERÊNCIA, que só esta tela conhece. A
 * regra dura vale igual: palavra E ícone sempre, nunca só a cor, e é o
 * teste de unidade que confere as duas metades de cada entrada.
 */
export const SITUACOES_DA_CONFERENCIA: Record<SituacaoNaConferencia, AparenciaNaConferencia> = {
  CONFERIDO: { palavra: 'Conferido', icone: 'check', classes: 'bg-certo-suave text-certo' },
  // "Fora do lugar" é atenção, não erro: o livro está aqui, na mão da
  // operadora — só mora em outra estante.
  FORA_DO_LUGAR: { palavra: 'Fora do lugar', icone: 'troca', classes: 'bg-atencao-suave text-atencao' },
  REPETIDO: { palavra: 'Já bipado', icone: 'info', classes: 'bg-papel-2 text-tinta-2' },
  NAO_ENCONTRADO: { palavra: 'Não encontrado', icone: 'aviso', classes: 'bg-alerta-suave text-alerta' },
  // "Consta" e não "está": o sistema afirma o que registrou, e é isso
  // que a operadora vai conferir com o leitor.
  CONSTA_EMPRESTADO: { palavra: 'Consta emprestado', icone: 'troca', classes: 'bg-papel-2 text-tinta-2' },
}

/**
 * A lista de bipados depois de uma leitura, e o que dizer sobre ela.
 *
 * Devolve lista nova e não altera a recebida: a lista É o contador da
 * tela, e um contador guardado à parte teria como divergir da lista que
 * a operadora está lendo ao lado dele.
 *
 * O tombo repetido volta para a frente porque a frente é "o último livro
 * que passou pela minha mão" — e é isso que a pessoa procura na tela
 * quando é interrompida no meio da estante.
 */
export function registrarBipagem(
  bipados: readonly TomboBipado[],
  leitura: { tombo: string; foraDoLugar: boolean },
): { bipados: TomboBipado[]; resultado: ResultadoDaBipagem } {
  const tombo = leitura.tombo.trim()
  if (tombo.length === 0) {
    throw new Error(
      'Bipagem sem tombo. Uma linha em branco na lista da conferência é uma linha ' +
        'sobre a qual não há o que fazer, e ainda infla o contador da estante.',
    )
  }

  const anterior = bipados.find((b) => b.tombo === tombo)
  const resto = bipados.filter((b) => b.tombo !== tombo)

  if (anterior) {
    return {
      bipados: [{ tombo, foraDoLugar: leitura.foraDoLugar, vezes: anterior.vezes + 1 }, ...resto],
      resultado: 'REPETIDO',
    }
  }

  return {
    bipados: [{ tombo, foraDoLugar: leitura.foraDoLugar, vezes: 1 }, ...resto],
    resultado: leitura.foraDoLugar ? 'FORA_DO_LUGAR' : 'CONFERIDO',
  }
}

/**
 * Os tombos que ESTA conferência espera achar — o denominador da tela.
 *
 * ESPELHO da regra de escopo de `fecharInventario`, que é a autoridade:
 * é lá que se decide o que entra em `esperados`. O espelho existe porque
 * o serviço só devolve aquele número no FECHAMENTO, e a tela precisa
 * dizer "12 de 87" enquanto a pessoa ainda está na estante.
 *
 * `tests/unit/inventario/conferencia.test.ts` amarra os dois: ele abre,
 * bipa um exemplar de outra estante, fecha, e exige que a contagem daqui
 * seja igual ao `esperados` do relatório. Se alguém mudar um lado só,
 * aquele teste fica vermelho — sem ele, a operadora fecharia a estante
 * em 100% com um livro faltando.
 *
 * Um exemplar de outra estante que apareceu aqui NÃO entra: ele é
 * "fora do lugar", e inflar o denominador com ele faria a conferência
 * nunca chegar ao fim.
 */
export function tombosDoEscopo(
  itens: readonly ItemDeInventario[],
  localizacaoId: string | null,
): string[] {
  const doEscopo =
    localizacaoId === null
      ? itens
      : itens.filter((i) => i.localizacaoEsperadaId === localizacaoId)

  return doEscopo.map((i) => i.tombo)
}

/**
 * A lista de bipados de uma conferência RETOMADA.
 *
 * A conferência dura dias e a pessoa fecha o navegador no meio da
 * estante. Sem isto, retomar mostraria zero bipados numa sessão com
 * metade da estante conferida — e a pessoa recomeçaria do primeiro
 * livro, que é o jeito mais rápido de a conferência nunca terminar.
 *
 * `foraDoLugar` sai da MESMA comparação que o relatório usa (esperada
 * contra encontrada), para a tela retomada não contradizer o relatório
 * que ela mesma vai gerar no fim.
 *
 * A ordem é a do repositório (tombo crescente), e não a das leituras:
 * a sessão retomada não sabe em que ordem os livros passaram ontem, e
 * inventar uma ordem seria dizer "você parou aqui" sem saber.
 */
export function bipadosJaConferidos(
  itens: readonly ItemDeInventario[],
  localizacaoId: string | null,
): TomboBipado[] {
  return itens
    .filter((i) => i.conferido)
    .map((i) => ({
      tombo: i.tombo,
      // No acervo inteiro não existe "lugar errado", e o serviço nem
      // compara: a conferência sem estante cobre tudo. O `localizacaoId`
      // aparece na condição para que isso continue verdade mesmo se uma
      // foto antiga tiver guardado uma localização encontrada.
      foraDoLugar:
        localizacaoId !== null &&
        i.localizacaoEncontradaId !== null &&
        i.localizacaoEsperadaId !== i.localizacaoEncontradaId,
      // Uma leitura é o que se sabe: o banco guarda que foi conferido,
      // não quantas vezes o leitor bipou.
      vezes: 1,
    }))
}

export interface ProgressoDaConferencia {
  /** Do escopo, já bipados. É o mesmo número que o relatório chamará de `conferidos`. */
  conferidos: number
  esperados: number
  faltam: number
  /** Bipados que não pertencem a esta estante — contados à parte, nunca somados. */
  foraDoEscopo: number
}

/**
 * "12 de 87 conferidos · faltam 75", com os de outra estante à parte.
 *
 * Somar o exemplar de outra estante ao conferido seria a tela dizer 88
 * numa estante de 87 — e, pior, fechar em "100%" com um livro faltando,
 * porque o que apareceu de fora ocupou o lugar do que não apareceu.
 *
 * Recusa entrada contraditória em vez de escolher uma das metades: um
 * tombo repetido na lista significa que o contador passou a somar o
 * mesmo livro duas vezes, e não há metade certa para escolher.
 */
export function progressoDaConferencia(
  bipados: readonly TomboBipado[],
  tombosEsperados: readonly string[],
): ProgressoDaConferencia {
  const doEscopo = new Set(tombosEsperados)
  if (doEscopo.size !== tombosEsperados.length) {
    throw new Error(
      'Escopo de conferência com tombo repetido: o tombo é único no acervo, e um ' +
        'denominador inflado faz a estante nunca fechar.',
    )
  }

  const vistos = new Set<string>()
  let conferidos = 0
  let foraDoEscopo = 0

  for (const bipado of bipados) {
    if (!Number.isInteger(bipado.vezes) || bipado.vezes < 1) {
      throw new Error(
        `Leituras impossíveis do tombo ${bipado.tombo}: ${bipado.vezes}. Uma linha na ` +
          'lista de bipados existe porque houve ao menos uma leitura.',
      )
    }
    if (vistos.has(bipado.tombo)) {
      throw new Error(
        `Lista de bipados com o tombo ${bipado.tombo} duas vezes. Repetir a leitura ` +
          'não é erro, duplicar a linha é: o contador passaria a somar o mesmo livro duas vezes.',
      )
    }
    vistos.add(bipado.tombo)

    if (doEscopo.has(bipado.tombo)) conferidos += 1
    else foraDoEscopo += 1
  }

  return {
    conferidos,
    esperados: tombosEsperados.length,
    faltam: tombosEsperados.length - conferidos,
    foraDoEscopo,
  }
}

/** "1 exemplar" / "3 exemplares" — nenhuma tela escreve o plural à mão. */
export function fraseDeExemplares(quantidade: number): string {
  return quantidade === 1 ? '1 exemplar' : `${quantidade} exemplares`
}

/**
 * "2 de outra estante" — ou nada.
 *
 * Cala quando não houve nenhum, porque aí não há o que confessar. Sem a
 * frase, a operadora leria 14 bipados ao lado de "12 de 87 conferidos" e
 * concluiria que uma das duas contas está errada; com ela, as duas
 * continuam verdadeiras.
 */
export function fraseDeForaDoEscopo(quantidade: number): string | null {
  if (!Number.isInteger(quantidade) || quantidade < 0) {
    throw new Error(`Contagem impossível de exemplares de outra estante: ${quantidade}.`)
  }
  if (quantidade === 0) return null
  return `${quantidade} de outra estante`
}

/**
 * O que o exemplar CONSTAVA ser quando a conferência abriu.
 *
 * É a frase que explica a ausência de uma linha do relatório. O serviço
 * separa "consta emprestado" das outras ausências porque confundir os
 * dois faz a coordenação caçar um livro que está na mochila de um aluno
 * — mas as demais ausências também têm motivo conhecido: exemplar no
 * carrinho da leitura, em manutenção ou separado atrás do balcão não
 * está na estante e não é perda. Sem esta frase, essas linhas
 * apareceriam em "não encontrado" sem nenhuma pista, e a operadora
 * procuraria na prateleira um livro que está a três metros dela.
 *
 * `Record` exaustivo: uma situação nova no schema vira erro de
 * compilação aqui, e não uma linha muda no relatório.
 */
const FRASE_DA_SITUACAO: Record<SituacaoDoExemplar, string> = {
  DISPONIVEL: 'constava disponível na estante',
  EMPRESTADO: 'constava emprestado a um leitor',
  RESERVADO: 'constava separado para reserva, atrás do balcão',
  EM_CARRINHO: 'constava no Carrinho da Leitura',
  EM_MANUTENCAO: 'constava em manutenção',
  // As duas últimas não entram na foto da abertura (o repositório as
  // exclui de propósito, para não enterrar as perdas reais em perdas que
  // a escola já conhece). Ficam declaradas porque o tipo cobra as sete —
  // e porque uma foto antiga pode tê-las guardado.
  EXTRAVIADO: 'constava extraviado',
  BAIXADO: 'constava baixado do acervo',
}

export function fraseDaSituacaoNaAbertura(situacao: SituacaoDoExemplar): string {
  return FRASE_DA_SITUACAO[situacao]
}
