import type { ProblemaNaLinha } from '@/modules/importacao/importacao.service'

/**
 * O PLANO da importação, resumido para a operadora decidir.
 *
 * Módulo puro, sem React e sem servidor. Existe porque a tela tem uma
 * obrigação que não é enfeite: mostrar o que vai acontecer ANTES de
 * gravar. Importador que grava primeiro e avisa depois é como a escola
 * perde o controle da própria base — trezentos cadastros errados entram
 * de uma vez, e ninguém sabe quais eram.
 *
 * Duas garantias que este arquivo carrega, e que a suíte prova:
 *
 * 1. **Tudo ou nada.** Com qualquer linha problemática o serviço recusa
 *    a planilha inteira (`ImportacaoComErrosError`), então `podeGravar`
 *    é falso e a tela não desenha botão de confirmar — botão que só sabe
 *    dar erro é pior que botão nenhum.
 * 2. **O número da linha da planilha viaja junto do motivo.** A operadora
 *    vai abrir o arquivo no Excel para consertar; "data inválida" sem o
 *    número manda ela reler 400 linhas à procura de qual.
 */

/**
 * O motivo sem as partes que mudam de linha para linha.
 *
 * Sem isto, quarenta matrículas repetidas viram quarenta "motivos"
 * diferentes — cada mensagem cita a própria matrícula e a própria linha —
 * e o resumo deixa de resumir exatamente quando mais precisa.
 *
 * A canonicalização é textual de propósito: nenhuma taxonomia de erros
 * inventada aqui. O serviço é o dono das mensagens, elas já vêm em pt-BR
 * e são o que a operadora lê; substituir por categorias nossas seria
 * traduzir errado a cada mensagem nova que o plano ganhar.
 */
export function resumirMotivo(mensagem: string): string {
  const canonico = mensagem
    // Valor entre aspas: matrícula, chave, título.
    .replace(/"[^"]*"/g, '"…"')
    // Número solto: "já aparece na linha 3". Datas de exemplo como
    // "aaaa-mm-dd" não têm dígito e sobrevivem intactas — e é bom que
    // sobrevivam, porque é a mensagem que ENSINA o formato aceito.
    .replace(/\d+/g, '…')
    .replace(/\s+/g, ' ')
    .trim()

  // Mensagem que era só número viraria um motivo vazio, e um grupo sem
  // rótulo na tela é pior que o texto original.
  return canonico.replace(/…/g, '').trim().length === 0 ? mensagem : canonico
}

export interface GrupoDeMotivo {
  motivo: string
  /** As linhas da planilha, em ordem crescente. */
  linhas: number[]
}

export function agruparPorMotivo(problemas: ProblemaNaLinha[]): GrupoDeMotivo[] {
  const porMotivo = new Map<string, number[]>()

  for (const problema of problemas) {
    const motivo = resumirMotivo(problema.mensagem)
    const linhas = porMotivo.get(motivo)
    // `?? []` seria o atalho proibido pelo projeto — e aqui esconderia a
    // diferença entre "motivo novo" e "mapa devolveu vazio".
    if (linhas === undefined) {
      porMotivo.set(motivo, [problema.linha])
      continue
    }
    linhas.push(problema.linha)
  }

  return [...porMotivo.entries()]
    .map(([motivo, linhas]) => ({ motivo, linhas: [...linhas].sort((a, b) => a - b) }))
    .sort(
      (a, b) =>
        b.linhas.length - a.linhas.length ||
        (a.linhas[0] ?? 0) - (b.linhas[0] ?? 0) ||
        a.motivo.localeCompare(b.motivo, 'pt-BR'),
    )
}

/** O recorte da prévia do serviço que a tela precisa para resumir. */
export interface PreviaParaResumo {
  /** Quantas linhas viram cadastro novo (`Previa.validas.length`). */
  entram: number
  /** Linhas cuja matrícula já está no banco. Serão puladas, não é erro. */
  jaCadastrados: ProblemaNaLinha[]
  /** Linhas que o plano recusou. Com qualquer uma, nada é gravado. */
  problemas: ProblemaNaLinha[]
}

export interface ResumoDoPlano {
  entram: number
  jaCadastrados: number
  comProblema: number
  /** As três somadas: é o total de linhas de dados que o arquivo tinha. */
  linhasLidas: number
  /**
   * Se há o que confirmar.
   *
   * Falso com qualquer problema (a importação é tudo-ou-nada) e falso
   * quando nenhuma linha é nova — nesse caso o serviço não abre nem
   * transação, e um botão aceso prometeria uma gravação que não acontece.
   */
  podeGravar: boolean
  motivosDosProblemas: GrupoDeMotivo[]
  /** Os já cadastrados também agrupados: são muitos e não são erro. */
  motivosDosJaCadastrados: GrupoDeMotivo[]
}

export function resumirPlano(previa: PreviaParaResumo): ResumoDoPlano {
  const jaCadastrados = previa.jaCadastrados.length
  const comProblema = previa.problemas.length

  return {
    entram: previa.entram,
    jaCadastrados,
    comProblema,
    linhasLidas: previa.entram + jaCadastrados + comProblema,
    podeGravar: comProblema === 0 && previa.entram > 0,
    motivosDosProblemas: agruparPorMotivo(previa.problemas),
    motivosDosJaCadastrados: agruparPorMotivo(previa.jaCadastrados),
  }
}

/**
 * A data como a escola escreve, a partir da ISO curta que o plano
 * normalizou.
 *
 * Recorte de string e nada de `new Date()`: a data de nascimento é a
 * SENHA do aluno no portal (spec §2.3), e um `Date` construído aqui
 * desloca o dia conforme o fuso do processo — a amostra na tela passaria
 * a mostrar 14/03 para quem nasceu em 15/03, e a operadora confirmaria a
 * importação achando que a planilha está errada.
 *
 * Formato inesperado volta como veio: inventar uma data para caber no
 * molde seria mostrar na tela um dado que ninguém vai gravar.
 */
export function dataComoAEscolaEscreve(iso: string): string {
  const partes = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!partes) return iso
  return `${partes[3]}/${partes[2]}/${partes[1]}`
}

/** "linhas 7, 12 e 40" — como se lê em voz alta para quem está no Excel. */
export function frasearLinhas(linhas: number[]): string {
  const numeros = linhas.map(String)
  if (numeros.length === 0) return ''
  if (numeros.length === 1) return `linha ${numeros[0]}`
  const ultimo = numeros[numeros.length - 1]
  return `linhas ${numeros.slice(0, -1).join(', ')} e ${ultimo}`
}
