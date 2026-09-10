'use client'

import type { ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'

/**
 * Imprimir a folha.
 *
 * Cliente porque `window.print()` só existe no navegador — e é um
 * `<button type="button">`, não um `<Link>` para rota de impressão: com o
 * App Router, o prefetch de um `<Link>` executa o handler do destino sem
 * ninguém clicar. Numa rota que só desenha, isso é desperdício; o hábito
 * de apontar `<Link>` para handler é o que um dia dispara escrita sem
 * clique.
 *
 * Não abre diálogo de configuração próprio: quem escolhe impressora,
 * páginas e cópias é o diálogo do sistema, que a secretaria já conhece.
 */
export function BotaoDeImprimir(): ReactElement {
  return (
    <Botao
      type="button"
      variante="secundaria"
      icone="impressora"
      onClick={() => window.print()}
    >
      Imprimir a lista por turma
    </Botao>
  )
}
