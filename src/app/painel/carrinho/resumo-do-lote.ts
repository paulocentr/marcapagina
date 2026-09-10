/**
 * O resumo do lote do carrinho, por ALUNO.
 *
 * Módulo puro, sem React e sem servidor: é o que permite provar em
 * milissegundos a garantia que dá sentido ao recurso — **um aluno
 * recusado não derruba o lote dos outros vinte e nove**. O serviço faz
 * uma transação por aluno justamente para isso (`emprestarEmLote`), e a
 * tela só cumpre o contrato se DISSER isso com clareza: os emprestados
 * continuam emprestados, e a recusa aparece com nome e motivo do lado.
 *
 * A terceira situação existe por causa de `LoteInterrompidoError`: quando
 * o banco cai no meio, o serviço devolve o parcial e o que sobrou nunca
 * foi tentado. Sem mostrar isso como NÃO LANÇADO a operadora relançaria o
 * lote inteiro às cegas e emprestaria de novo o que já saiu na mochila.
 */

/** Uma entrega que a operadora montou na tela, antes de ir ao servidor. */
export interface ItemMontado {
  alunoId: string
  alunoNome: string
  matricula: string
  tombo: string
  /**
   * O título, quando o tombo estava no romaneio da rodada. `null` quando
   * a operadora bipou um livro que não foi planejado — o serviço aceita,
   * e inventar um título aqui seria pior que não ter nenhum.
   */
  titulo: string | null
}

export type SituacaoNoLote = 'EMPRESTADO' | 'RECUSADO' | 'NAO_LANCADO'

export interface LinhaDoLote extends ItemMontado {
  situacao: SituacaoNoLote
  /** Só em `EMPRESTADO`. Já formatada como a escola escreve. */
  previstaPara: string | null
  /** Só em `RECUSADO`, na frase que o serviço devolveu em pt-BR. */
  motivo: string | null
}

export interface ResumoDoLote {
  /** Na ordem em que a operadora bipou — não na ordem do resultado. */
  linhas: LinhaDoLote[]
  emprestados: number
  recusados: number
  naoLancados: number
  /** As recusas juntadas pelo motivo, do mais frequente ao menos. */
  recusasPorMotivo: { motivo: string; quantos: number }[]
}

/** O recorte do que `emprestarEmLote` devolve e a tela precisa. */
export interface RetornoDoLote {
  emprestados: { alunoId: string; tombo: string; previstaPara: string }[]
  recusados: { alunoId: string; tombo: string; motivo: string }[]
}

/**
 * A identidade de uma linha é o PAR aluno+tombo.
 *
 * Casar só pelo aluno faria o segundo livro de quem levou dois herdar o
 * resultado do primeiro — e a operadora entregaria um livro que o
 * sistema recusou.
 */
function chaveDaLinha(alunoId: string, tombo: string): string {
  return `${alunoId} ${tombo}`
}

export function montarResumoDoLote(
  itens: ItemMontado[],
  retorno: RetornoDoLote,
): ResumoDoLote {
  const emprestadoPorChave = new Map(
    retorno.emprestados.map((e) => [chaveDaLinha(e.alunoId, e.tombo), e]),
  )
  const recusadoPorChave = new Map(
    retorno.recusados.map((r) => [chaveDaLinha(r.alunoId, r.tombo), r]),
  )

  const linhas: LinhaDoLote[] = itens.map((item) => {
    const chave = chaveDaLinha(item.alunoId, item.tombo)

    const emprestado = emprestadoPorChave.get(chave)
    if (emprestado) {
      return { ...item, situacao: 'EMPRESTADO', previstaPara: emprestado.previstaPara, motivo: null }
    }

    const recusado = recusadoPorChave.get(chave)
    if (recusado) {
      return { ...item, situacao: 'RECUSADO', previstaPara: null, motivo: recusado.motivo }
    }

    return { ...item, situacao: 'NAO_LANCADO', previstaPara: null, motivo: null }
  })

  // Resultado sem linha correspondente significa que a tela está
  // mostrando um lote diferente do que o servidor processou. Deixar
  // passar em silêncio esconderia um livro que saiu fisicamente com um
  // aluno — a operadora fecharia a rodada achando que ele nunca saiu.
  const daTela = new Set(itens.map((i) => chaveDaLinha(i.alunoId, i.tombo)))
  const orfaos = [...emprestadoPorChave.keys(), ...recusadoPorChave.keys()].filter(
    (chave) => !daTela.has(chave),
  )
  if (orfaos.length > 0) {
    throw new Error(
      `O resultado do lote não casa com o que está na tela: ${orfaos.length} ` +
        'resultado(s) sem linha. Recarregue a rodada antes de lançar mais nada.',
    )
  }

  const recusasPorMotivo = new Map<string, number>()
  for (const linha of linhas) {
    if (linha.motivo === null) continue
    // `?? 0` é proibido no projeto e aqui seria o caso didático: o zero
    // silencioso esconderia a diferença entre "motivo novo" e "contagem
    // que voltou vazia do mapa". O primeiro é 1, o segundo é defeito.
    const jaContadas = recusasPorMotivo.get(linha.motivo)
    recusasPorMotivo.set(linha.motivo, jaContadas === undefined ? 1 : jaContadas + 1)
  }

  return {
    linhas,
    // Contadas nas linhas que a tela mostra, e não no tamanho dos arrays
    // do servidor: assim o número no cabeçalho e a tabela embaixo dele
    // não têm como divergir.
    emprestados: linhas.filter((l) => l.situacao === 'EMPRESTADO').length,
    recusados: linhas.filter((l) => l.situacao === 'RECUSADO').length,
    naoLancados: linhas.filter((l) => l.situacao === 'NAO_LANCADO').length,
    recusasPorMotivo: [...recusasPorMotivo.entries()]
      .map(([motivo, quantos]) => ({ motivo, quantos }))
      .sort((a, b) => b.quantos - a.quantos || a.motivo.localeCompare(b.motivo)),
  }
}
