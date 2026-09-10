/**
 * O inventário de ícones, em módulo puro e sem JSX.
 *
 * Fica separado do desenho (`icones.tsx`) por dois motivos:
 *
 * 1. o catálogo de estados (`estados.ts`) precisa apontar para um ícone
 *    sem arrastar React para dentro de um módulo que os testes de unidade
 *    importam em milissegundos;
 * 2. `ICONES` em `icones.tsx` é um `Record<NomeDeIcone, …>` — ou seja,
 *    acrescentar um nome aqui sem desenhar o ícone é erro de compilação,
 *    e apontar para um ícone inexistente também.
 *
 * Nada de emoji: emoji muda de forma por sistema operacional e não
 * respeita a cor do estado. Todo ícone é SVG de traço em grade de 20.
 */
export const NOMES_DE_ICONE = [
  // estados e resultados
  'check',
  'troca',
  'relogio',
  'fita',
  'aviso',
  'xis',
  'info',
  // navegação e ações
  'painel',
  'busca',
  'mais',
  'livros',
  'codigo-de-barras',
  'carrinho',
  'pessoas',
  'grafico',
  'ajustes',
  'sair',
  'impressora',
  'imagem',
] as const

export type NomeDeIcone = (typeof NOMES_DE_ICONE)[number]
