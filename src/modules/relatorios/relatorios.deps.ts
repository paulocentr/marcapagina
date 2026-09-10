import { emprestimosRepository } from '@/modules/circulacao/emprestimos.repository'
import { relatoriosRepository } from '@/modules/relatorios/relatorios.repository'
import type { DependenciasDeRelatorios } from '@/modules/relatorios/painel-do-leitor.service'

/**
 * Ponto de composição dos relatórios.
 *
 * Existe para que a tela e a rota de exportação nunca importem um
 * `*.repository.ts` — a Global Constraint 1 proíbe e há gate no CI. Quem
 * sabe montar o pacote é este módulo; quem o usa só pede o pacote pronto.
 *
 * O repositório de atrasados vem da CIRCULAÇÃO, e é reúso deliberado:
 * uma segunda consulta de `previstaPara < hoje` aqui divergiria da do
 * balcão na primeira correção feita em apenas uma delas, e aí o
 * relatório e o balcão passariam a discordar sobre quem está atrasado.
 */
export function dependenciasDeRelatorios(): DependenciasDeRelatorios {
  return {
    relatorios: relatoriosRepository,
    emprestimos: emprestimosRepository,
  }
}
