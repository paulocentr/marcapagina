import type { ChaveDePeriodo, Comparacao } from '@/modules/relatorios/periodo'

/**
 * As decisões de TEXTO da tela do Painel do Leitor.
 *
 * Módulo puro, separado do JSX, porque cada frase daqui é uma afirmação
 * que a coordenação vai repetir na reunião: "+11% sobre agosto" é
 * diferente de "estável", e "0,0 por aluno" é diferente de "não há aluno
 * nessa turma". Frase montada no meio do JSX não tem como ser provada.
 */

export const ROTULO_DO_PERIODO: Record<ChaveDePeriodo, string> = {
  MES: 'Mês',
  BIMESTRE: 'Bimestre',
  ANO: 'Ano letivo',
}

export type TomDaComparacao = 'alta' | 'baixa' | 'neutro'

export interface ComparacaoNaTela {
  tom: TomDaComparacao
  texto: string
}

export function descreverComparacao(
  comparacao: Comparacao,
  rotuloAnterior: string,
): ComparacaoNaTela {
  switch (comparacao.tipo) {
    case 'SEM_BASE':
      // Nenhuma porcentagem aqui: dividir por zero daria Infinity, e
      // "+0%" afirmaria estabilidade sobre um período que não existiu.
      return {
        tom: 'neutro',
        texto: `sem base de comparação — ${rotuloAnterior} não teve empréstimo`,
      }

    case 'IGUAL':
      return { tom: 'neutro', texto: `igual a ${rotuloAnterior} (${comparacao.anterior})` }

    default: {
      const sinal = comparacao.tipo === 'ALTA' ? '+' : '-'
      // Arredondou para zero mas os totais diferem: "+0%" não quer dizer
      // nada, e "igual" seria falso. A frase diz as duas coisas certas.
      const quanto =
        comparacao.percentual === 0
          ? `${comparacao.tipo === 'ALTA' ? 'alta' : 'queda'} de menos de 1%`
          : `${sinal}${comparacao.percentual}%`

      return {
        tom: comparacao.tipo === 'ALTA' ? 'alta' : 'baixa',
        texto: `${quanto} sobre ${rotuloAnterior} (${comparacao.anterior})`,
      }
    }
  }
}

/**
 * Número com vírgula decimal e uma casa. `null` continua `null`.
 *
 * Devolver `null` em vez de "0" é o ponto: quem chama tem de decidir o
 * que dizer quando não há base, e "0% do acervo circulando" afirmaria
 * que existe acervo.
 */
export function numeroNaTela(valor: number | null, casas = 1): string | null {
  if (valor === null) return null
  return String(Number(valor.toFixed(casas))).replace('.', ',')
}

/** Duas casas: a diferença de engajamento entre turmas é fina. */
export function porAlunoNaTela(valor: number | null): string {
  const texto = numeroNaTela(valor, 2)
  // Palavra e não célula vazia: um branco na tabela parece campo que não
  // carregou, e "0" afirmaria que a turma não lê.
  return texto === null ? 'sem aluno ativo' : texto
}

/**
 * dd/mm, lido em UTC.
 *
 * As colunas de vencimento são `@db.Date` e o Postgres as devolve como
 * meia-noite UTC. Formatar no fuso do navegador mostraria 17/08 para
 * quem está a oeste de Greenwich — a data do sistema e a da etiqueta
 * passariam a discordar.
 */
export function dataCurta(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}`
}
