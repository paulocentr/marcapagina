import { intervaloDoDiaDaEscola } from '@/modules/circulacao/prazo'

/**
 * O recorte de período dos relatórios, no fuso da ESCOLA.
 *
 * Por que este módulo existe em vez de somar horas: um relatório "de
 * setembro" recortado no fuso do PROCESSO começa às 21h de 31/08 para
 * quem está na escola (o servidor da Vercel roda em UTC, a máquina da
 * secretaria em São Paulo). Os empréstimos das três últimas horas de
 * agosto entram em setembro, e o total do mês muda conforme onde o
 * código rodou — que é o tipo de divergência que ninguém reproduz e que
 * faz a coordenação parar de confiar no número.
 *
 * O fuso é lido de `prazo.ts`, e nunca declarado outra vez aqui: duas
 * constantes de fuso divergem na primeira mudança feita em apenas uma
 * delas. Deste módulo, tudo o que se sabe do fuso vem de
 * `intervaloDoDiaDaEscola` — que é público — e o resto é aritmética de
 * CALENDÁRIO sobre ano, mês e dia.
 */

export type ChaveDePeriodo = 'MES' | 'BIMESTRE' | 'ANO'

const CHAVES: readonly ChaveDePeriodo[] = ['MES', 'BIMESTRE', 'ANO']

/**
 * Um dia no calendário da escola. `mes` é 1–12, como a escola escreve, e
 * não 0–11 como o `Date` — o off-by-one de mês é caro demais num
 * relatório para ser deixado à atenção de quem lê.
 */
export interface DiaDaEscola {
  ano: number
  /** 1 = janeiro. */
  mes: number
  dia: number
}

export interface Periodo {
  chave: ChaveDePeriodo
  /** Instante inclusivo. */
  inicio: Date
  /** Instante EXCLUSIVO: o primeiro instante do período seguinte. */
  fim: Date
  primeiroDia: DiaDaEscola
  /** Último dia INCLUSIVE — o dia que a escola diria "até 30/09". */
  ultimoDia: DiaDaEscola
  /** "setembro de 2026". Em minúsculas: entra no meio de frase. */
  rotulo: string
}

export function ehChaveDePeriodo(valor: string): valor is ChaveDePeriodo {
  return (CHAVES as readonly string[]).includes(valor)
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

/**
 * O instante em que um dia da escola começa.
 *
 * Meio-dia UTC é usado como sonda porque ele cai dentro do dia que o
 * nome diz em qualquer fuso do planeta (o deslocamento máximo é de 14
 * horas): assim `intervaloDoDiaDaEscola` — que sabe o fuso — devolve a
 * janela do dia certo, e este módulo não precisa saber qual é o fuso.
 */
export function inicioDoDiaDaEscola(dia: DiaDaEscola): Date {
  const sonda = new Date(Date.UTC(dia.ano, dia.mes - 1, dia.dia, 12, 0, 0, 0))

  if (Number.isNaN(sonda.getTime())) {
    // Falhar alto: um instante inválido viraria um intervalo que não
    // casa com nada, e a tela diria "nenhum empréstimo" num mês cheio.
    throw new Error(`Dia impossível no calendário da escola: ${JSON.stringify(dia)}.`)
  }

  return intervaloDoDiaDaEscola(sonda).inicio
}

/**
 * O dia em que um instante cai PARA QUEM ESTÁ NA ESCOLA.
 *
 * Testa os três dias candidatos em volta do dia UTC porque o dia da
 * escola pode estar um à frente ou um atrás — e não faz a conta do
 * deslocamento à mão justamente para não guardar aqui uma segunda cópia
 * do fuso.
 */
export function diaDaEscolaEm(instante: Date): DiaDaEscola {
  if (Number.isNaN(instante.getTime())) {
    throw new Error('Instante inválido: não dá para dizer em que dia da escola ele cai.')
  }

  const base: DiaDaEscola = {
    ano: instante.getUTCFullYear(),
    mes: instante.getUTCMonth() + 1,
    dia: instante.getUTCDate(),
  }

  for (const deslocamento of [0, -1, 1]) {
    const candidato = somarDias(base, deslocamento)
    const inicio = inicioDoDiaDaEscola(candidato)
    const fim = inicioDoDiaDaEscola(somarDias(candidato, 1))

    if (instante.getTime() >= inicio.getTime() && instante.getTime() < fim.getTime()) {
      return candidato
    }
  }

  // Inalcançável enquanto o deslocamento do fuso for menor que 24 horas.
  // Existe porque devolver um dia errado em silêncio seria pior: o
  // relatório sairia com o mês trocado e ninguém notaria.
  throw new Error(
    `Não consegui dizer em que dia da escola cai ${instante.toISOString()}. ` +
      'O fuso da escola mudou de deslocamento em mais de 24 horas?',
  )
}

/** Aritmética de CALENDÁRIO: "o dia seguinte a 30/09 é 01/10". */
function somarDias(dia: DiaDaEscola, dias: number): DiaDaEscola {
  const movido = new Date(Date.UTC(dia.ano, dia.mes - 1, dia.dia + dias))
  return {
    ano: movido.getUTCFullYear(),
    mes: movido.getUTCMonth() + 1,
    dia: movido.getUTCDate(),
  }
}

function somarMeses(dia: DiaDaEscola, meses: number): DiaDaEscola {
  // Sempre aplicado ao dia 1, que é o único dia que existe em todo mês.
  const movido = new Date(Date.UTC(dia.ano, dia.mes - 1 + meses, dia.dia))
  return {
    ano: movido.getUTCFullYear(),
    mes: movido.getUTCMonth() + 1,
    dia: movido.getUTCDate(),
  }
}

function nomeDoMes(mes: number): string {
  const nome = MESES[mes - 1]
  if (!nome) throw new Error(`Mês fora do calendário: ${mes}.`)
  return nome
}

/**
 * O período que contém `agora`.
 *
 * `MES` é o mês corrente. `BIMESTRE` é o bloco de dois meses do ano
 * civil — janeiro-fevereiro, março-abril, e assim por diante: é como a
 * escola divide o boletim, e o bloco não se move conforme o dia em que
 * alguém abre a tela. `ANO` é o ano civil inteiro, que no Brasil contém
 * o ano letivo (fevereiro a dezembro).
 */
export function recortarPeriodo(chave: ChaveDePeriodo, agora: Date): Periodo {
  const hoje = diaDaEscolaEm(agora)

  switch (chave) {
    case 'MES':
      return periodoDeMeses(chave, { ano: hoje.ano, mes: hoje.mes, dia: 1 }, 1)

    case 'BIMESTRE': {
      // Bloco fixo do ano civil: o mês 9 e o mês 10 caem no MESMO
      // bimestre, então o número não muda de significado no dia 1º de
      // outubro.
      const primeiroMesDoBloco = Math.floor((hoje.mes - 1) / 2) * 2 + 1
      return periodoDeMeses(chave, { ano: hoje.ano, mes: primeiroMesDoBloco, dia: 1 }, 2)
    }

    case 'ANO':
      return periodoDeMeses(chave, { ano: hoje.ano, mes: 1, dia: 1 }, 12)
  }
}

function periodoDeMeses(
  chave: ChaveDePeriodo,
  primeiroDia: DiaDaEscola,
  meses: number,
): Periodo {
  const primeiroDiaSeguinte = somarMeses(primeiroDia, meses)
  const ultimoDia = somarDias(primeiroDiaSeguinte, -1)

  return {
    chave,
    inicio: inicioDoDiaDaEscola(primeiroDia),
    // O fim é o COMEÇO do período seguinte, e a janela é meia-aberta:
    // assim cada dia pertence a exatamente um período. Usar o último
    // instante do último dia deixaria de fora o que aconteceu depois
    // dele e contaria a fronteira duas vezes.
    fim: inicioDoDiaDaEscola(primeiroDiaSeguinte),
    primeiroDia,
    ultimoDia,
    rotulo: rotuloDe(chave, primeiroDia, ultimoDia),
  }
}

function rotuloDe(chave: ChaveDePeriodo, primeiro: DiaDaEscola, ultimo: DiaDaEscola): string {
  switch (chave) {
    case 'MES':
      return `${nomeDoMes(primeiro.mes)} de ${primeiro.ano}`
    case 'BIMESTRE':
      return primeiro.ano === ultimo.ano
        ? `${nomeDoMes(primeiro.mes)} e ${nomeDoMes(ultimo.mes)} de ${ultimo.ano}`
        : `${nomeDoMes(primeiro.mes)} de ${primeiro.ano} e ${nomeDoMes(ultimo.mes)} de ${ultimo.ano}`
    case 'ANO':
      return `ano letivo de ${primeiro.ano}`
  }
}

/**
 * O período imediatamente anterior, do mesmo tamanho de calendário.
 *
 * "Mesmo tamanho de calendário" e não "mesmo número de dias": fevereiro
 * comparado com 31 dias de janeiro daria uma queda de 10% que é só o
 * calendário. O anterior de setembro é agosto inteiro.
 */
export function periodoAnterior(periodo: Periodo): Periodo {
  const meses = periodo.chave === 'MES' ? 1 : periodo.chave === 'BIMESTRE' ? 2 : 12
  return periodoDeMeses(periodo.chave, somarMeses(periodo.primeiroDia, -meses), meses)
}

export type Comparacao =
  | { tipo: 'SEM_BASE'; anterior: 0 }
  | { tipo: 'IGUAL'; anterior: number }
  | { tipo: 'ALTA' | 'BAIXA'; anterior: number; percentual: number }

/**
 * A variação sobre o período anterior.
 *
 * `SEM_BASE` é um estado de primeira classe, não um zero: o primeiro mês
 * do sistema não tem com o que comparar, e dividir por zero daria
 * `Infinity` — que com `?? 0` viraria "+0%" na tela, afirmando
 * estabilidade sobre um mês que não existiu.
 *
 * `percentual` é sempre positivo; quem diz a direção é o `tipo`. Um
 * "-20%" com tipo BAIXA seria a mesma informação escrita duas vezes, e
 * as duas divergiriam no dia em que alguém mexesse em uma.
 */
export function compararTotais(atual: number, anterior: number): Comparacao {
  if (
    !Number.isInteger(atual) ||
    !Number.isInteger(anterior) ||
    atual < 0 ||
    anterior < 0
  ) {
    throw new Error(
      `Contagem impossível de empréstimos: ${atual} contra ${anterior}. ` +
        'Número na tela é sempre contado, e contagem é inteira e não negativa.',
    )
  }

  if (anterior === 0) return { tipo: 'SEM_BASE', anterior: 0 }
  if (atual === anterior) return { tipo: 'IGUAL', anterior }

  const percentual = Math.round((Math.abs(atual - anterior) / anterior) * 100)
  return { tipo: atual > anterior ? 'ALTA' : 'BAIXA', anterior, percentual }
}

export interface SemanaDaTendencia {
  inicio: Date
  /** EXCLUSIVO, como em todo intervalo deste módulo. */
  fim: Date
  primeiroDia: DiaDaEscola
}

export interface JanelaDeTendencia {
  inicio: Date
  fim: Date
  semanas: SemanaDaTendencia[]
}

/**
 * As últimas N semanas que terminam junto com o período.
 *
 * A janela é de TENDÊNCIA e por isso não é o período: um sparkline com
 * quatro pontos (as semanas de um mês) não mostra tendência nenhuma, e
 * parar uma semana antes do fim do período desenharia uma queda que é só
 * a semana incompleta faltando.
 *
 * Semanas de sete dias de CALENDÁRIO da escola, não de 168 horas: no dia
 * em que o Brasil voltar a ter horário de verão, a semana que contém a
 * virada tem 167 ou 169 horas, e contar em milissegundos deslocaria
 * todos os baldes seguintes em uma hora.
 */
export function janelaDeTendencia(periodo: Periodo, semanas: number): JanelaDeTendencia {
  if (!Number.isInteger(semanas) || semanas < 1) {
    throw new Error('A tendência precisa de pelo menos uma semana.')
  }

  const baldes: SemanaDaTendencia[] = []

  // Do fim para o começo: a última semana termina exatamente no fim do
  // período, e as outras se encaixam para trás.
  let fimDoBalde = periodo.fim
  let primeiroDiaDoBalde = somarDias(periodo.ultimoDia, -6)

  for (let i = 0; i < semanas; i += 1) {
    baldes.unshift({
      inicio: inicioDoDiaDaEscola(primeiroDiaDoBalde),
      fim: fimDoBalde,
      primeiroDia: primeiroDiaDoBalde,
    })
    fimDoBalde = inicioDoDiaDaEscola(primeiroDiaDoBalde)
    primeiroDiaDoBalde = somarDias(primeiroDiaDoBalde, -7)
  }

  const primeiro = baldes[0]
  const ultimo = baldes[baldes.length - 1]
  if (!primeiro || !ultimo) throw new Error('Janela de tendência sem semanas.')

  return { inicio: primeiro.inicio, fim: ultimo.fim, semanas: baldes }
}

/**
 * Quantas retiradas caíram em cada semana da janela.
 *
 * Recebe os INSTANTES já lidos do banco e conta em memória porque o
 * Postgres agruparia por semana só com `date_trunc`, e `date_trunc` só
 * chega aqui por SQL cru — que passa por fora da extensão de tenant e
 * levaria o empréstimo da escola vizinha para dentro deste gráfico.
 *
 * O que está fora da janela é ignorado: são retiradas reais, mas não
 * fazem parte da tendência desenhada.
 */
export function contarPorSemana(
  semanas: readonly SemanaDaTendencia[],
  instantes: readonly Date[],
): number[] {
  const contagem = semanas.map(() => 0)

  for (const instante of instantes) {
    const quando = instante.getTime()
    const indice = semanas.findIndex(
      (semana) => quando >= semana.inicio.getTime() && quando < semana.fim.getTime(),
    )
    // `findIndex` devolveu um índice de `semanas`, e `contagem` tem
    // exatamente o mesmo tamanho — mas o compilador não sabe disso.
    const anterior = contagem[indice]
    if (anterior !== undefined) contagem[indice] = anterior + 1
  }

  return contagem
}
