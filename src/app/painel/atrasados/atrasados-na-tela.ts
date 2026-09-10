import type { EmprestimoAtrasado } from '@/modules/circulacao/emprestimos.service'

/**
 * A lógica da tela de atrasados, em módulo puro — sem React e sem
 * servidor.
 *
 * Vive separado porque as decisões daqui são as que a coordenação age em
 * cima, e provar cada uma custa milissegundos:
 *
 *  1. **agrupar por turma** — a folha é entregue à professora da turma,
 *     uma por sala. Um agrupamento que deixa cair uma linha esconde um
 *     livro que está fora da estante e nunca vai ser cobrado;
 *  2. **do mais antigo para o mais recente** — quem está há 23 dias com o
 *     livro importa mais que quem venceu ontem, dentro da folha e entre
 *     as folhas;
 *  3. **quantos dias**, escrito como a coordenação lê.
 *
 * E a garantia que não pode ser desfeita: **não existe campo "atrasado"**.
 * `montarFolha` recalcula os dias a partir de `previstaPara` contra
 * `hoje` e RECUSA a lista quando o número que veio do serviço discorda das
 * datas. É o que faz um campo materializado — por cron, por cache, por
 * gatilho — explodir na tela em vez de mentir nela; e mentir na direção
 * pior, dizendo que está tudo em ordem.
 */

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Onde a leitura da folha muda de tom.
 *
 * São faixas de LEITURA, não regra de domínio: nenhuma penalidade depende
 * delas, e quem calcula suspensão é `penalidade.ts`, na devolução. Uma
 * semana é o intervalo entre duas visitas da turma à biblioteca — até ali,
 * o mais provável é esquecimento, e o recado na sala resolve. Passado um
 * mês, o livro perdeu o ciclo inteiro e a conversa deixa de ser com o
 * aluno.
 */
const DIAS_ATE_PERSISTIR = 7
const DIAS_ATE_PROLONGAR = 30

export type SeveridadeDoAtraso = 'RECENTE' | 'PERSISTENTE' | 'PROLONGADO'

/**
 * Os três tipos de grupo que a folha conhece — exaustivos de propósito.
 *
 * `SEM_TURMA` e `EQUIPE` existem para que ninguém caia fora do
 * agrupamento. Um aluno sem turma cadastrada e um empréstimo da equipe não
 * são entregues a nenhuma professora, mas continuam sendo livros fora da
 * estante: descartá-los faria a folha somar menos que a lista.
 */
export type TipoDeGrupo = 'TURMA' | 'SEM_TURMA' | 'EQUIPE'

export const ROTULO_SEM_TURMA = 'Sem turma'
export const ROTULO_DA_EQUIPE = 'Empréstimos da equipe'

export interface LinhaDeAtraso {
  atraso: EmprestimoAtrasado
  severidade: SeveridadeDoAtraso
  /** "1 dia", "23 dias" — já no singular ou plural certo. */
  atrasoEmPalavras: string
  /**
   * Quantos livros em atraso este MESMO leitor tem na lista inteira, e não
   * só neste grupo.
   *
   * Sempre 1 para empréstimo da equipe: o serviço não identifica quem da
   * equipe pegou (`leitorId` vem vazio), então somar duas linhas da equipe
   * como "2 livros do mesmo leitor" seria invenção.
   */
  livrosDoLeitor: number
}

export interface GrupoDeAtraso {
  tipo: TipoDeGrupo
  /** O que sai impresso no alto da folha da turma. */
  rotulo: string
  linhas: LinhaDeAtraso[]
  /** O atraso mais antigo do grupo — é por ele que os grupos se ordenam. */
  maiorAtrasoEmDias: number
}

export interface FolhaDeAtrasados {
  grupos: GrupoDeAtraso[]
  /** Livros em atraso. Contado das linhas, nunca digitado. */
  total: number
  /** 0 quando não há atraso nenhum — não há atraso a informar. */
  maiorAtrasoEmDias: number
}

export class AtrasoIncoerenteError extends Error {}

/**
 * "23 dias" — o número de dias com a palavra certa.
 *
 * Recusa zero e negativo em vez de escrever "0 dias de atraso": esta
 * frase vai numa folha de cobrança que a professora lê em voz alta para a
 * turma, e cobrar um atraso que não existe é o jeito mais rápido de a
 * escola parar de confiar na lista inteira.
 */
export function descreverAtraso(dias: number): string {
  exigirDiasDeAtraso(dias)
  return dias === 1 ? '1 dia' : `${dias} dias`
}

/**
 * O tom da linha, pelas faixas de leitura.
 *
 * `switch` não serve aqui porque a entrada é número, mas a saída continua
 * exaustiva: as três severidades estão cobertas por construção, e quem
 * acrescentar uma quarta faixa é obrigado pelo tipo a nomeá-la.
 */
export function classificarAtraso(dias: number): SeveridadeDoAtraso {
  exigirDiasDeAtraso(dias)

  if (dias <= DIAS_ATE_PERSISTIR) return 'RECENTE'
  if (dias < DIAS_ATE_PROLONGAR) return 'PERSISTENTE'
  return 'PROLONGADO'
}

/**
 * A lista do serviço virada folha: um grupo por turma, o mais antigo em
 * cima, e nada perdido no caminho.
 *
 * `hoje` entra por parâmetro (não sai de `new Date()` aqui dentro) pelo
 * mesmo motivo do repositório: é o que torna a fronteira testável sem
 * esperar o dia virar — e é o que permite conferir os dias de atraso
 * contra as datas.
 */
export function montarFolha(atrasados: EmprestimoAtrasado[], hoje: Date): FolhaDeAtrasados {
  const referencia = diaEmUtc(hoje)
  const livrosPorLeitor = contarPorLeitor(atrasados)

  const linhas = atrasados.map((atraso): LinhaDeAtraso => {
    const dias = conferirDiasDeAtraso(atraso, referencia)
    const chave = chaveDoLeitor(atraso)

    return {
      atraso,
      severidade: classificarAtraso(dias),
      atrasoEmPalavras: descreverAtraso(dias),
      // Sem leitor identificado não há quem contar: ver a nota do campo.
      livrosDoLeitor: chave === null ? 1 : (livrosPorLeitor.get(chave) ?? 1),
    }
  })

  const grupos = ordenarGrupos(agrupar(linhas))

  // Conferência de conservação. Parece redundante e não é: é o que garante
  // que uma chave de grupo nova (ou uma turma com nome vazio) não faça um
  // livro desaparecer da folha em silêncio — e um livro que não aparece em
  // folha nenhuma nunca é cobrado.
  const somaDosGrupos = grupos.reduce((soma, grupo) => soma + grupo.linhas.length, 0)
  if (somaDosGrupos !== linhas.length) {
    throw new AtrasoIncoerenteError(
      `A folha agrupou ${somaDosGrupos} de ${linhas.length} livro(s) em atraso. ` +
        'Livro que não entra em nenhuma folha nunca é cobrado.',
    )
  }

  return {
    grupos,
    total: linhas.length,
    maiorAtrasoEmDias: grupos.reduce((maior, grupo) => Math.max(maior, grupo.maiorAtrasoEmDias), 0),
  }
}

/**
 * Os dias de atraso conferidos contra as DATAS.
 *
 * O serviço já os manda calculados, e este recálculo é de propósito uma
 * segunda conta independente. Enquanto as duas concordarem, a tela está
 * derivando o atraso de `previstaPara < hoje AND devolvidaEm IS NULL`. No
 * dia em que alguém materializar um campo, elas divergem e a tela para —
 * em vez de imprimir "3 dias" para quem está com o livro há 23.
 *
 * A fronteira é a MESMA do repositório: dia em UTC contra dia em UTC.
 * Adotar aqui o dia do fuso da escola faria a conferência acusar
 * divergência por três horas todas as noites, sem defeito nenhum.
 */
function conferirDiasDeAtraso(atraso: EmprestimoAtrasado, referencia: number): number {
  const dasDatas = Math.round((referencia - diaEmUtc(atraso.previstaPara)) / MILISSEGUNDOS_POR_DIA)

  if (dasDatas < 1) {
    throw new AtrasoIncoerenteError(
      `O empréstimo ${atraso.emprestimoId} veio na lista de atrasados com vencimento em ` +
        `${atraso.previstaPara.toISOString().slice(0, 10)}, que não passou. ` +
        'Quem vence hoje tem o dia inteiro para devolver.',
    )
  }

  if (dasDatas !== atraso.diasDeAtraso) {
    throw new AtrasoIncoerenteError(
      `O empréstimo ${atraso.emprestimoId} diz ${atraso.diasDeAtraso} dia(s) de atraso, mas as ` +
        `datas dizem ${dasDatas}. Atraso é sempre derivado de previstaPara contra hoje — ` +
        'um número que discorda das datas é campo materializado, e ele mente para menos.',
    )
  }

  return dasDatas
}

/**
 * A identidade do leitor, ou `null` quando não há uma.
 *
 * `leitorId` vazio é como `listarAtrasados` marca empréstimo da equipe —
 * staff também pega livro, e penalidade é de aluno. Turma junto disso é
 * contradição: turma é de aluno.
 */
function chaveDoLeitor(atraso: EmprestimoAtrasado): string | null {
  if (atraso.leitorId !== '') return atraso.leitorId

  if (atraso.turma !== null) {
    throw new AtrasoIncoerenteError(
      `O empréstimo ${atraso.emprestimoId} veio sem leitor identificado e com a turma ` +
        `"${atraso.turma}". Turma é de aluno: a folha daquela sala listaria um livro ` +
        'que não é de aluno nenhum.',
    )
  }

  return null
}

function contarPorLeitor(atrasados: EmprestimoAtrasado[]): Map<string, number> {
  const contagem = new Map<string, number>()

  for (const atraso of atrasados) {
    const chave = chaveDoLeitor(atraso)
    if (chave === null) continue
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }

  return contagem
}

function agrupar(linhas: LinhaDeAtraso[]): GrupoDeAtraso[] {
  const porRotulo = new Map<string, GrupoDeAtraso>()

  for (const linha of linhas) {
    const { tipo, rotulo } = destinoDaLinha(linha.atraso)
    const existente = porRotulo.get(rotulo)

    if (existente === undefined) {
      porRotulo.set(rotulo, {
        tipo,
        rotulo,
        linhas: [linha],
        maiorAtrasoEmDias: linha.atraso.diasDeAtraso,
      })
      continue
    }

    existente.linhas.push(linha)
    existente.maiorAtrasoEmDias = Math.max(
      existente.maiorAtrasoEmDias,
      linha.atraso.diasDeAtraso,
    )
  }

  for (const grupo of porRotulo.values()) grupo.linhas.sort(maisAntigoPrimeiro)

  return [...porRotulo.values()]
}

/**
 * Qual folha recebe esta linha.
 *
 * O rótulo é a chave do agrupamento, e por isso `SEM_TURMA` e `EQUIPE`
 * têm rótulo próprio e reservado: se a turma vazia caísse no mesmo balde
 * de um nome de turma qualquer, dois grupos diferentes se somariam numa
 * folha só.
 */
function destinoDaLinha(atraso: EmprestimoAtrasado): { tipo: TipoDeGrupo; rotulo: string } {
  if (chaveDoLeitor(atraso) === null) return { tipo: 'EQUIPE', rotulo: ROTULO_DA_EQUIPE }

  // Turma em branco é o mesmo caso de turma ausente: não existe folha para
  // entregar. Deixá-la formar um grupo de rótulo vazio imprimiria uma
  // folha sem destinatário.
  const nome = atraso.turma === null ? '' : atraso.turma.trim()
  if (nome === '') return { tipo: 'SEM_TURMA', rotulo: ROTULO_SEM_TURMA }

  return { tipo: 'TURMA', rotulo: nome }
}

/**
 * Do mais antigo para o mais recente. O desempate por nome e depois por
 * tombo mantém a folha idêntica entre duas impressões do mesmo dia — uma
 * professora conferindo a folha de ontem contra a de hoje não deve
 * encontrar as linhas trocadas de lugar.
 */
function maisAntigoPrimeiro(a: LinhaDeAtraso, b: LinhaDeAtraso): number {
  return (
    a.atraso.previstaPara.getTime() - b.atraso.previstaPara.getTime() ||
    a.atraso.nomeDoLeitor.localeCompare(b.atraso.nomeDoLeitor, 'pt-BR') ||
    a.atraso.tombo.localeCompare(b.atraso.tombo, 'pt-BR')
  )
}

/**
 * As turmas primeiro, do atraso mais antigo para o mais recente; depois
 * "sem turma" e os empréstimos da equipe.
 *
 * Os dois últimos não são entregues a nenhuma professora — mantê-los no
 * fim deixa contíguas as folhas que de fato saem da impressora para as
 * salas.
 */
const ORDEM_DOS_TIPOS: Record<TipoDeGrupo, number> = { TURMA: 0, SEM_TURMA: 1, EQUIPE: 2 }

function ordenarGrupos(grupos: GrupoDeAtraso[]): GrupoDeAtraso[] {
  return [...grupos].sort(
    (a, b) =>
      ORDEM_DOS_TIPOS[a.tipo] - ORDEM_DOS_TIPOS[b.tipo] ||
      b.maiorAtrasoEmDias - a.maiorAtrasoEmDias ||
      a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
  )
}

function exigirDiasDeAtraso(dias: number): void {
  if (!Number.isInteger(dias) || dias < 1) {
    throw new AtrasoIncoerenteError(
      `Dias de atraso inválidos: ${dias}. Atraso é inteiro de pelo menos um dia — ` +
        'quem vence hoje tem o dia inteiro e não está atrasado.',
    )
  }
}

/**
 * dd/mm/aaaa — como a escola escreve, não como o ISO escreve.
 *
 * `getUTC*` e não `toLocaleDateString`: `previstaPara` guarda um DIA em
 * meia-noite UTC, e formatar pelo fuso do processo imprimiria o dia
 * anterior em toda máquina a oeste de Greenwich — que é a máquina da
 * secretaria. O ano vem inteiro porque esta folha é de cobrança: um
 * vencimento de dezembro passado escrito "18/12" parece coisa de semana
 * que vem.
 */
export function formatarDataDaEscola(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getUTCFullYear()}`
}

/**
 * O DIA da data, em UTC.
 *
 * `previstaPara` é coluna `@db.Date` e guarda um dia em meia-noite UTC.
 * Comparar instantes com hora deixaria o vencimento de hoje cair do lado
 * errado da fronteira.
 */
function diaEmUtc(data: Date): number {
  return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate())
}
