import type { ReactElement } from 'react'

/**
 * A versão de PAPEL desta mesma página.
 *
 * É `@media print` e não um PDF novo de propósito: a folha impressa tem de
 * ser exatamente o que a coordenação acabou de conferir na tela. Um
 * gerador de PDF em outra camada é uma segunda montagem da mesma lista, e
 * duas montagens divergem na primeira correção feita em apenas uma delas —
 * com o detalhe de que a divergência aparece no papel, depois de a folha
 * já estar na mão da professora.
 *
 * O recorte é feito por `visibility` sobre `body *`, e não escondendo a
 * navegação lateral pelo seletor dela: a casca do painel é de outra frente
 * de trabalho, e um seletor apontado para a marcação do vizinho quebra
 * calado no dia em que ele reorganizar o menu — quebra imprimindo o menu
 * no meio da folha.
 *
 * Sem acento grave dentro da string: ela é um template literal, e um
 * acento grave num comentário de CSS a encerraria no meio.
 */
const CSS = `
@media print {
  /*
   * Tudo invisível, e só a folha de volta. É visibility e não display
   * porque visibility é herdada: os filhos da folha voltam a aparecer sem
   * precisar listá-los um a um.
   */
  body * {
    visibility: hidden;
  }

  #folha-de-atrasados,
  #folha-de-atrasados * {
    visibility: visible;
  }

  /*
   * O elemento continua ocupando o lugar dele no fluxo, atrás de uma
   * navegação de 236px que está invisível mas continua empurrando. Sem
   * tirá-lo do fluxo, a folha sai com uma coluna vazia na esquerda de
   * todas as páginas.
   */
  #folha-de-atrasados {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }

  /* O que é controle de tela não vira tinta. */
  .nao-imprime,
  .nao-imprime * {
    visibility: hidden !important;
  }

  /*
   * Uma turma por página: a folha é entregue à professora daquela sala, e
   * duas turmas na mesma folha obrigariam a coordenação a fotocopiar a
   * mesma página para duas salas — ou a entregar a uma professora a lista
   * dos alunos da outra.
   *
   * Borda preta e sem sombra: fundo colorido e sombra gastam tinta e não
   * dizem nada no papel.
   */
  .folha-de-turma {
    break-inside: avoid;
    border-color: #000;
    box-shadow: none;
  }

  .folha-de-turma + .folha-de-turma {
    break-before: page;
  }
}

@page {
  margin: 14mm;
}
`

export function EstiloDeImpressao(): ReactElement {
  // `precedence` faz o React 19 içar a folha para o <head> e desduplicá-la
  // — sem isso, uma navegação de cliente que remonte a página poderia
  // injetar o mesmo <style> duas vezes.
  return (
    <style href="atrasados-impressao" precedence="default">
      {CSS}
    </style>
  )
}
