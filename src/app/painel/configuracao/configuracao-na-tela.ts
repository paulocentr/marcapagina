import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'

/**
 * A lógica da tela de configuração, em módulo puro — sem React e sem
 * servidor.
 *
 * Três trabalhos, e cada um vale um módulo próprio provado em
 * milissegundos:
 *
 *  1. **ler número de campo de texto.** É a tela inteira: seis campos, e
 *     `Number('')` é 0 e `Number('abc')` é NaN. Um prazo 0 faz todo
 *     empréstimo nascer vencido; um NaN faz o cálculo do vencimento
 *     devolver data inválida no balcão, com o aluno na frente.
 *  2. **dizer o que é herdado e o que a série sobrescreve.** O override
 *     vale CAMPO A CAMPO, e sem isso escrito na tela a coordenação não
 *     entende por que o 6º ano tem prazo diferente — e muda o prazo da
 *     escola esperando mudar o dele.
 *  3. **escrever o valor em português**, com plural e com o zero por
 *     extenso: "não permite renovação" em vez de "0 renovações".
 *
 * **O que este módulo NÃO faz: validar faixa.** Piso, teto e "precisa ser
 * inteiro" moram em `validarConfiguracao`, no domínio, e é a mensagem dele
 * que a tela mostra. Duas cópias da mesma regra divergem na primeira
 * correção feita em apenas uma — e a divergência aparece como "a tela
 * aceitou e o serviço recusou", que ninguém sabe reportar.
 */

export const CAMPOS_NUMERICOS = [
  'prazoEmDias',
  'limiteSimultaneo',
  'maximoDeRenovacoes',
  'diasDeSuspensaoPorDiaDeAtraso',
  'prazoDeRetiradaEmDias',
] as const

export type CampoNumerico = (typeof CAMPOS_NUMERICOS)[number]
export type CampoDaConfiguracao = CampoNumerico | 'alunoPodeReservar'

/** Todos os campos, na ordem em que a tela os mostra. */
export const CAMPOS_DA_CONFIGURACAO: readonly CampoDaConfiguracao[] = [
  ...CAMPOS_NUMERICOS,
  'alunoPodeReservar',
]

export interface DescricaoDeCampo {
  /** O rótulo do campo no formulário. */
  rotulo: string
  /**
   * O nome do campo DENTRO de frase — o mesmo vocabulário que
   * `validarConfiguracao` usa nas mensagens dele. Duas palavras
   * diferentes para o mesmo campo fariam a coordenação achar que a tela
   * e o sistema falam de coisas distintas.
   */
  nome: string
  artigo: 'o' | 'os'
  /** A consequência, em uma linha. É o que a coordenação lê para decidir. */
  ajuda: string
}

export const DESCRICOES: Record<CampoDaConfiguracao, DescricaoDeCampo> = {
  prazoEmDias: {
    rotulo: 'Prazo de empréstimo',
    nome: 'prazo de empréstimo em dias',
    artigo: 'o',
    ajuda:
      'Dias corridos, não úteis. Se o vencimento cair em fim de semana, feriado ou recesso, ' +
      'o sistema empurra para o próximo dia letivo — o aluno não pode ser marcado como ' +
      'atrasado num dia em que a escola estava fechada.',
  },
  limiteSimultaneo: {
    rotulo: 'Livros ao mesmo tempo',
    nome: 'limite de livros simultâneos',
    artigo: 'o',
    ajuda:
      'Quantos livros o leitor pode ter em mãos. Ao atingir o limite, o balcão recusa o ' +
      'próximo empréstimo até ele devolver algum.',
  },
  maximoDeRenovacoes: {
    rotulo: 'Renovações por empréstimo',
    nome: 'máximo de renovações',
    artigo: 'o',
    ajuda:
      'Zero desliga a renovação. A renovação também é recusada quando há fila de reserva ' +
      'para o título, independente deste número.',
  },
  diasDeSuspensaoPorDiaDeAtraso: {
    rotulo: 'Suspensão por dia de atraso',
    nome: 'dias de suspensão por dia de atraso',
    artigo: 'os',
    ajuda:
      'Dias sem poder pegar livro, contados por cada dia de atraso na devolução. Zero ' +
      'desliga a penalidade sem desligar o controle do atraso.',
  },
  prazoDeRetiradaEmDias: {
    rotulo: 'Prazo para retirar reserva',
    nome: 'prazo de retirada de reserva',
    artigo: 'o',
    ajuda:
      'Quanto tempo o exemplar separado espera na prateleira do balcão. Passado o prazo, a ' +
      'vez passa sozinha para o próximo da fila na virada do dia.',
  },
  alunoPodeReservar: {
    rotulo: 'Aluno pode reservar',
    nome: 'aluno pode reservar',
    artigo: 'o',
    ajuda:
      'Se o aluno reserva pelo portal por conta própria. Com "não", só a biblioteca cria ' +
      'reserva — o balcão continua reservando pelo aluno.',
  },
}

/** `o prazo de empréstimo em dias` — para entrar no meio de uma frase. */
export function comArtigo(campo: CampoDaConfiguracao): string {
  const { artigo, nome } = DESCRICOES[campo]
  return `${artigo} ${nome}`
}

function comArtigoMaiusculo(campo: CampoDaConfiguracao): string {
  const frase = comArtigo(campo)
  return frase.charAt(0).toUpperCase() + frase.slice(1)
}

/**
 * O valor de um campo escrito em português, com unidade e plural.
 *
 * Recusa valor impossível em vez de escrever "NaN dias de prazo": a
 * configuração vem do banco e pode chegar quebrada, e um número absurdo
 * desenhado com naturalidade ensina a coordenação a não confiar em
 * nenhum número da tela.
 */
export function formatarValor(campo: CampoDaConfiguracao, valor: number | boolean): string {
  if (campo === 'alunoPodeReservar') {
    if (typeof valor !== 'boolean') {
      throw new Error(
        `Valor impossível para ${comArtigo(campo)}: ${String(valor)}. ` +
          'Só sim ou não respondem quem reserva.',
      )
    }
    return valor ? 'o aluno pode reservar' : 'só a biblioteca reserva'
  }

  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) {
    throw new Error(
      `Valor impossível para ${comArtigo(campo)}: ${String(valor)}. ` +
        'Só número inteiro não negativo conta dias e livros.',
    )
  }

  switch (campo) {
    case 'prazoEmDias':
      return `${valor} ${valor === 1 ? 'dia' : 'dias'} de prazo`
    case 'limiteSimultaneo':
      return `${valor} ${valor === 1 ? 'livro' : 'livros'} ao mesmo tempo`
    case 'maximoDeRenovacoes':
      // Zero não é ausência de valor: é a coordenação desligando a
      // renovação. "0 renovações" faria alguém procurar um campo vazio.
      if (valor === 0) return 'não permite renovação'
      return `${valor} ${valor === 1 ? 'renovação' : 'renovações'}`
    case 'diasDeSuspensaoPorDiaDeAtraso':
      if (valor === 0) return 'sem suspensão por atraso'
      return `${valor} ${valor === 1 ? 'dia' : 'dias'} de suspensão por dia de atraso`
    case 'prazoDeRetiradaEmDias':
      return `${valor} ${valor === 1 ? 'dia' : 'dias'} para retirar a reserva`
  }
}

/**
 * A configuração efetiva em uma linha.
 *
 * Serve para o cabeçalho da tela e para a confirmação depois de salvar —
 * a coordenação lê o que passou a valer sem reconferir seis campos.
 */
export function resumirConfiguracao(config: ConfiguracaoDaEscola): string {
  return CAMPOS_DA_CONFIGURACAO.map((campo) => formatarValor(campo, config[campo])).join(' · ')
}

export type OrigemDoValor = 'ESCOLA' | 'SERIE'

export interface LinhaDaSerie {
  campo: CampoDaConfiguracao
  rotulo: string
  origem: OrigemDoValor
  /** O que vale para esta série. */
  valorEfetivo: string
  /** O que valeria se a série herdasse — a comparação que explica o ajuste. */
  valorDaEscola: string
}

/**
 * O override da série, campo a campo, dizendo de onde cada valor vem.
 *
 * `!== undefined` e não `??` sobre o valor: zero renovações e
 * `alunoPodeReservar: false` são decisões legítimas da coordenação, e
 * tratá-las como ausência diria "herda da escola" justamente onde a
 * série proibiu algo — liberando na tela o que a coordenação vedou.
 *
 * Sobrescrito com o MESMO valor da escola continua sobrescrito, porque é
 * o que o banco guarda: se a escola mudar o prazo amanhã, esta série não
 * acompanha.
 */
export function descreverSerie(
  daEscola: ConfiguracaoDaEscola,
  override: OverrideDeSerie,
): LinhaDaSerie[] {
  return CAMPOS_DA_CONFIGURACAO.map((campo): LinhaDaSerie => {
    const proprio = override[campo]
    const efetivo = proprio === undefined ? daEscola[campo] : proprio

    return {
      campo,
      rotulo: DESCRICOES[campo].rotulo,
      origem: proprio === undefined ? 'ESCOLA' : 'SERIE',
      valorEfetivo: formatarValor(campo, efetivo),
      valorDaEscola: formatarValor(campo, daEscola[campo]),
    }
  })
}

export function separarPorOrigem(linhas: readonly LinhaDaSerie[]): {
  ajustados: LinhaDaSerie[]
  herdados: LinhaDaSerie[]
} {
  return {
    ajustados: linhas.filter((linha) => linha.origem === 'SERIE'),
    herdados: linhas.filter((linha) => linha.origem === 'ESCOLA'),
  }
}

export type LeituraDeInteiro = { ok: true; valor: number } | { ok: false; erro: string }

/**
 * Lê um inteiro digitado, ou diz o que está errado.
 *
 * Só dígitos: sem sinal, sem separador decimal, sem notação científica.
 * Não é rigor gratuito — `Number('1e3')` é 1000 e `Number('1,5')` é NaN,
 * e nenhum dos dois é o que a pessoa quis dizer. Este é o único lugar da
 * tela onde texto vira número, e é por isso que ele pode ser provado.
 */
export function interpretarInteiro(bruto: string, campo: CampoDaConfiguracao): LeituraDeInteiro {
  const texto = bruto.trim()

  if (texto.length === 0) {
    return { ok: false, erro: `Informe ${comArtigo(campo)}.` }
  }

  // `\d` do JavaScript é ASCII 0-9 e nada mais — dígito arábico-índico
  // não passa, e é o certo: `Number('٧')` é 7, e um número que a
  // operadora não consegue reler na tela não serve para conferir nada.
  if (!/^\d+$/.test(texto)) {
    return {
      ok: false,
      erro:
        `${comArtigoMaiusculo(campo)} precisa ser um número inteiro, ` +
        'escrito só com dígitos.',
    }
  }

  const valor = Number(texto)
  if (!Number.isSafeInteger(valor)) {
    return {
      ok: false,
      erro: `${comArtigoMaiusculo(campo)} tem dígitos demais para ser um número de verdade.`,
    }
  }

  return { ok: true, valor }
}

export type LeituraOpcional =
  | { ok: true; valor: number | undefined }
  | { ok: false; erro: string }

/**
 * O mesmo, para o campo da série: vazio significa **herdar**.
 *
 * Vazio é herança e texto torto é erro. Tratar "abc" como herança
 * gravaria uma série silenciosamente diferente da que foi digitada.
 */
export function interpretarInteiroOpcional(
  bruto: string,
  campo: CampoDaConfiguracao,
): LeituraOpcional {
  if (bruto.trim().length === 0) return { ok: true, valor: undefined }

  const lido = interpretarInteiro(bruto, campo)
  return lido.ok ? { ok: true, valor: lido.valor } : lido
}

export type LeituraBooleana = { ok: true; valor: boolean } | { ok: false; erro: string }

export function interpretarBooleano(bruto: string): LeituraBooleana {
  if (bruto === 'SIM') return { ok: true, valor: true }
  if (bruto === 'NAO') return { ok: true, valor: false }
  return { ok: false, erro: 'Diga se o aluno pode reservar pelo portal.' }
}

export type LeituraBooleanaOpcional =
  | { ok: true; valor: boolean | undefined }
  | { ok: false; erro: string }

/**
 * As TRÊS respostas da série: herda, pode, não pode.
 *
 * Sem a recusa do valor inesperado, qualquer coisa fora do esperado
 * cairia no ramo do `false` e proibiria a reserva da série inteira sem
 * ninguém ter pedido.
 */
export function interpretarHerancaBooleana(bruto: string): LeituraBooleanaOpcional {
  if (bruto === 'HERDA') return { ok: true, valor: undefined }
  if (bruto === 'SIM') return { ok: true, valor: true }
  if (bruto === 'NAO') return { ok: true, valor: false }
  return { ok: false, erro: 'Diga se esta série herda a regra de reserva da escola.' }
}

export type ErrosPorCampo = Partial<Record<CampoDaConfiguracao, string>>

export type FormularioDaEscola = Record<CampoDaConfiguracao, string>
export type FormularioDaSerie = FormularioDaEscola & { serie: string }

export type MontagemDaEscola =
  | { ok: true; config: ConfiguracaoDaEscola }
  | { ok: false; porCampo: ErrosPorCampo }

/**
 * O formulário da escola vira `ConfiguracaoDaEscola`, ou a lista do que
 * não deu para ler.
 *
 * Todos os campos são lidos ANTES de decidir, para que a coordenação
 * corrija os seis de uma vez em vez de descobrir um erro por salvamento.
 */
export function montarConfiguracaoDaEscola(form: FormularioDaEscola): MontagemDaEscola {
  const prazo = interpretarInteiro(form.prazoEmDias, 'prazoEmDias')
  const limite = interpretarInteiro(form.limiteSimultaneo, 'limiteSimultaneo')
  const renovacoes = interpretarInteiro(form.maximoDeRenovacoes, 'maximoDeRenovacoes')
  const suspensao = interpretarInteiro(
    form.diasDeSuspensaoPorDiaDeAtraso,
    'diasDeSuspensaoPorDiaDeAtraso',
  )
  const retirada = interpretarInteiro(form.prazoDeRetiradaEmDias, 'prazoDeRetiradaEmDias')
  const reserva = interpretarBooleano(form.alunoPodeReservar)

  if (
    prazo.ok &&
    limite.ok &&
    renovacoes.ok &&
    suspensao.ok &&
    retirada.ok &&
    reserva.ok
  ) {
    return {
      ok: true,
      config: {
        prazoEmDias: prazo.valor,
        limiteSimultaneo: limite.valor,
        maximoDeRenovacoes: renovacoes.valor,
        diasDeSuspensaoPorDiaDeAtraso: suspensao.valor,
        prazoDeRetiradaEmDias: retirada.valor,
        alunoPodeReservar: reserva.valor,
      },
    }
  }

  const porCampo: ErrosPorCampo = {}
  if (!prazo.ok) porCampo.prazoEmDias = prazo.erro
  if (!limite.ok) porCampo.limiteSimultaneo = limite.erro
  if (!renovacoes.ok) porCampo.maximoDeRenovacoes = renovacoes.erro
  if (!suspensao.ok) porCampo.diasDeSuspensaoPorDiaDeAtraso = suspensao.erro
  if (!retirada.ok) porCampo.prazoDeRetiradaEmDias = retirada.erro
  if (!reserva.ok) porCampo.alunoPodeReservar = reserva.erro

  return { ok: false, porCampo }
}

export type MontagemDaSerie =
  | { ok: true; override: OverrideDeSerie }
  | { ok: false; porCampo: ErrosPorCampo }

/**
 * O formulário da série vira `OverrideDeSerie` com **só os campos
 * preenchidos** — é o que faz o override valer campo a campo.
 *
 * A série vai adiante sem julgamento: série vazia e override que não muda
 * nada são recusados por `definirOverrideDeSerie`, com as frases dele.
 */
export function montarOverrideDeSerie(form: FormularioDaSerie): MontagemDaSerie {
  const prazo = interpretarInteiroOpcional(form.prazoEmDias, 'prazoEmDias')
  const limite = interpretarInteiroOpcional(form.limiteSimultaneo, 'limiteSimultaneo')
  const renovacoes = interpretarInteiroOpcional(form.maximoDeRenovacoes, 'maximoDeRenovacoes')
  const suspensao = interpretarInteiroOpcional(
    form.diasDeSuspensaoPorDiaDeAtraso,
    'diasDeSuspensaoPorDiaDeAtraso',
  )
  const retirada = interpretarInteiroOpcional(
    form.prazoDeRetiradaEmDias,
    'prazoDeRetiradaEmDias',
  )
  const reserva = interpretarHerancaBooleana(form.alunoPodeReservar)

  if (
    prazo.ok &&
    limite.ok &&
    renovacoes.ok &&
    suspensao.ok &&
    retirada.ok &&
    reserva.ok
  ) {
    const override: OverrideDeSerie = { serie: form.serie }

    // Chave ausente é herança; chave presente com `undefined` NÃO é a
    // mesma coisa para o repositório, que percorre as chaves do objeto.
    if (prazo.valor !== undefined) override.prazoEmDias = prazo.valor
    if (limite.valor !== undefined) override.limiteSimultaneo = limite.valor
    if (renovacoes.valor !== undefined) override.maximoDeRenovacoes = renovacoes.valor
    if (suspensao.valor !== undefined) {
      override.diasDeSuspensaoPorDiaDeAtraso = suspensao.valor
    }
    if (retirada.valor !== undefined) override.prazoDeRetiradaEmDias = retirada.valor
    if (reserva.valor !== undefined) override.alunoPodeReservar = reserva.valor

    return { ok: true, override }
  }

  const porCampo: ErrosPorCampo = {}
  if (!prazo.ok) porCampo.prazoEmDias = prazo.erro
  if (!limite.ok) porCampo.limiteSimultaneo = limite.erro
  if (!renovacoes.ok) porCampo.maximoDeRenovacoes = renovacoes.erro
  if (!suspensao.ok) porCampo.diasDeSuspensaoPorDiaDeAtraso = suspensao.erro
  if (!retirada.ok) porCampo.prazoDeRetiradaEmDias = retirada.erro
  if (!reserva.ok) porCampo.alunoPodeReservar = reserva.erro

  return { ok: false, porCampo }
}

/** O formulário da série pré-preenchido com o override que já existe. */
export function formularioDoOverride(override: OverrideDeSerie): FormularioDaSerie {
  return {
    serie: override.serie,
    prazoEmDias: textoOuVazio(override.prazoEmDias),
    limiteSimultaneo: textoOuVazio(override.limiteSimultaneo),
    maximoDeRenovacoes: textoOuVazio(override.maximoDeRenovacoes),
    diasDeSuspensaoPorDiaDeAtraso: textoOuVazio(override.diasDeSuspensaoPorDiaDeAtraso),
    prazoDeRetiradaEmDias: textoOuVazio(override.prazoDeRetiradaEmDias),
    alunoPodeReservar:
      override.alunoPodeReservar === undefined
        ? 'HERDA'
        : override.alunoPodeReservar
          ? 'SIM'
          : 'NAO',
  }
}

/** O formulário da escola preenchido com o que vale hoje. */
export function formularioDaConfiguracao(config: ConfiguracaoDaEscola): FormularioDaEscola {
  return {
    prazoEmDias: String(config.prazoEmDias),
    limiteSimultaneo: String(config.limiteSimultaneo),
    maximoDeRenovacoes: String(config.maximoDeRenovacoes),
    diasDeSuspensaoPorDiaDeAtraso: String(config.diasDeSuspensaoPorDiaDeAtraso),
    prazoDeRetiradaEmDias: String(config.prazoDeRetiradaEmDias),
    alunoPodeReservar: config.alunoPodeReservar ? 'SIM' : 'NAO',
  }
}

/** Campo vazio quando a série herda — nunca `undefined` num `value`. */
function textoOuVazio(valor: number | undefined): string {
  return valor === undefined ? '' : String(valor)
}

/** O formulário de série em branco, para cadastrar um ajuste novo. */
export const FORMULARIO_DE_SERIE_EM_BRANCO: FormularioDaSerie = {
  serie: '',
  prazoEmDias: '',
  limiteSimultaneo: '',
  maximoDeRenovacoes: '',
  diasDeSuspensaoPorDiaDeAtraso: '',
  prazoDeRetiradaEmDias: '',
  alunoPodeReservar: 'HERDA',
}
