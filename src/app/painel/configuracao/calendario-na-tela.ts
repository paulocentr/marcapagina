/**
 * O calendário de dias não letivos na tela — módulo puro, sem React.
 *
 * **Tudo aqui é TEXTO `aaaa-mm-dd`, e é de propósito.** O fuso da escola é
 * fixo em `prazo.ts`, não o do processo e muito menos o do navegador. Um
 * dia não letivo é um DIA, não um instante: passar por
 * `new Date(...)` / `toLocaleDateString()` no caminho de ida ou de volta
 * faz o 1º de janeiro marcado na secretaria virar 31 de dezembro no
 * servidor, e o prazo de todo mundo sai empurrado sem explicação.
 *
 * O único uso de `Date` é o dia da semana, sempre por
 * `new Date('aaaa-mm-ddT00:00:00.000Z').getUTCDay()` — construção e
 * leitura em UTC, exatamente como `prazo.ts` faz. Assim a resposta é a
 * mesma em São Paulo, em UTC e em Tóquio.
 */

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

const DIAS_DA_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** `2026-09-07` → `07/09/2026`, por recorte de texto e nada mais. */
export function escreverDiaIso(iso: string): string {
  const partes = FORMATO_ISO.exec(iso)
  if (!partes) {
    throw new Error(`"${iso}" não é um dia no formato aaaa-mm-dd.`)
  }

  return `${partes[3]}/${partes[2]}/${partes[1]}`
}

export type LeituraDeDia = { ok: true; dia: string } | { ok: false; erro: string }

/**
 * O que o campo de data entrega, conferido só no FORMATO.
 *
 * O `<input type="date">` já devolve `aaaa-mm-dd`, e o formato é
 * conferido aqui porque o campo pode ter sido preenchido à mão em
 * navegador sem seletor de data. Dia impossível — `2026-02-31` — é
 * recusado componente a componente por `calendario.service.ts`, e é a
 * mensagem dele que a tela mostra: repetir a checagem daria duas
 * mensagens diferentes para o mesmo erro.
 */
export function interpretarDiaDigitado(bruto: string): LeituraDeDia {
  const texto = bruto.trim()

  if (texto.length === 0) {
    return { ok: false, erro: 'Informe a data do dia não letivo.' }
  }
  if (!FORMATO_ISO.test(texto)) {
    return { ok: false, erro: `"${texto}" não é uma data. Use o formato aaaa-mm-dd.` }
  }

  return { ok: true, dia: texto }
}

export interface DiaNaoLetivoNaTela {
  /** `aaaa-mm-dd` — o que volta ao serviço, sem conversão nenhuma. */
  iso: string
  /** `dd/mm/aaaa`. */
  escrito: string
  diaDoMes: string
  diaDaSemana: string
  /**
   * Fim de semana já é fechado pelo cálculo do prazo. O dia marcado que
   * cai em sábado ou domingo não muda nada — e ver isso na lista explica
   * por que o prazo não se moveu, em vez de virar mistério.
   */
  ehFimDeSemana: boolean
}

export interface MesNaoLetivo {
  /** `aaaa-mm`, para chave de lista. */
  chave: string
  /** `setembro de 2026`. */
  titulo: string
  dias: DiaNaoLetivoNaTela[]
}

/**
 * Os dias marcados agrupados por mês, em ordem de calendário.
 *
 * A ordenação é de TEXTO: `aaaa-mm-dd` ordena lexicograficamente na
 * mesma ordem em que ordena cronologicamente, e isso vale para qualquer
 * fuso porque não há fuso envolvido.
 */
export function agruparPorMes(dias: readonly string[]): MesNaoLetivo[] {
  // O `Set` tira o dia repetido: dois botões de desmarcar para o mesmo
  // dia fariam o segundo clique parecer que não funcionou.
  const unicos = [...new Set(dias)].sort()
  const meses = new Map<string, MesNaoLetivo>()

  for (const iso of unicos) {
    const partes = FORMATO_ISO.exec(iso)
    if (!partes) {
      throw new Error(`Dia não letivo malformado no calendário: "${iso}". Esperado aaaa-mm-dd.`)
    }

    const ano = partes[1]!
    const mes = partes[2]!
    const dia = partes[3]!
    const indiceDoMes = Number(mes) - 1
    const nomeDoMes = MESES[indiceDoMes]
    if (nomeDoMes === undefined) {
      throw new Error(`Dia não letivo com mês inexistente: "${iso}".`)
    }

    // Meia-noite UTC, como em `prazo.ts`. O `getTime` confere que a data
    // existe de verdade: `2026-02-31` viraria 3 de março em silêncio, e a
    // lista mostraria um dia que ninguém marcou.
    const instante = new Date(`${iso}T00:00:00.000Z`)
    if (Number.isNaN(instante.getTime()) || instante.toISOString().slice(0, 10) !== iso) {
      throw new Error(`Dia não letivo que não existe no calendário: "${iso}".`)
    }

    const diaDaSemana = DIAS_DA_SEMANA[instante.getUTCDay()]!
    const chave = `${ano}-${mes}`

    const existente = meses.get(chave)
    const naTela: DiaNaoLetivoNaTela = {
      iso,
      escrito: escreverDiaIso(iso),
      diaDoMes: dia,
      diaDaSemana,
      ehFimDeSemana: instante.getUTCDay() === 0 || instante.getUTCDay() === 6,
    }

    if (existente === undefined) {
      meses.set(chave, { chave, titulo: `${nomeDoMes} de ${ano}`, dias: [naTela] })
    } else {
      existente.dias.push(naTela)
    }
  }

  // A `Map` preserva a ordem de inserção, e a inserção seguiu a lista já
  // ordenada — então os meses saem em ordem de calendário sem segunda
  // ordenação.
  return [...meses.values()]
}
