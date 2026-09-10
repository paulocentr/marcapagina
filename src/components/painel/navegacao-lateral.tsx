'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import type { ReactElement } from 'react'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone, Logotipo } from '@/components/ui/icones'
import { nomeDoProduto } from '@/core/produto'

/**
 * A navegação lateral de 236px das pranchas de staff.
 *
 * É cliente porque o item ativo depende do caminho atual (`usePathname`),
 * e não porque decide algo: os itens chegam prontos do servidor, já
 * filtrados por permissão. Esconder item NÃO é autorização — quem
 * autoriza é o serviço. A filtragem existe para o menu não mentir para a
 * operadora, oferecendo uma tela que vai recusá-la.
 */
export interface ItemDeNavegacao {
  titulo: string
  // `Route` e não `string`: com typedRoutes ligado, é isto que faz um
  // item de menu para rota inexistente virar erro de compilação em vez
  // de 404 descoberto pela operadora no meio da fila.
  href: Route
  icone: NomeDeIcone
}

export function NavegacaoLateral({
  itens,
  usuario,
}: {
  itens: ItemDeNavegacao[]
  usuario: { nome: string }
}): ReactElement {
  const caminho = usePathname()

  return (
    <nav
      aria-label="Seções do painel"
      className="flex w-[236px] shrink-0 flex-col border-r border-linha bg-superficie pt-[22px] pb-4"
    >
      <Link href="/painel" className="flex items-center gap-2.5 px-[18px] pb-[22px] text-tinta">
        <Logotipo tamanho={26} />
        <span className="font-serif text-lg font-bold tracking-[-0.02em]">{nomeDoProduto()}</span>
      </Link>

      <ul className="flex flex-col gap-px">
        {itens.map((item) => {
          const ativo = ehOItemAtivo(item.href, caminho, itens)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={ativo ? 'page' : undefined}
                className={
                  ativo
                    ? 'flex items-center gap-[11px] border-l-[3px] border-l-marca bg-marca-suave py-[9px] pr-[18px] pl-[14px] text-[13.5px] font-semibold text-marca-forte'
                    : 'flex items-center gap-[11px] border-l-[3px] border-l-transparent py-[9px] pr-[18px] pl-[14px] text-[13.5px] font-medium text-tinta-2 hover:bg-papel hover:text-tinta'
                }
              >
                <Icone nome={item.icone} tamanho={18} traco={1.7} />
                <span>{item.titulo}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="grow" />

      <div className="mt-4 flex items-center gap-2.5 border-t border-linha px-[18px] pt-[14px]">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-marca-suave text-[12.5px] font-bold text-marca-forte"
        >
          {iniciais(usuario.nome)}
        </span>
        <span className="min-w-0 grow truncate text-[13px] font-semibold text-tinta">
          {usuario.nome}
        </span>
        {/* Rota de servidor: apagar o cookie de sessão não é navegação de
            cliente, então é <a> e não <Link> — prefetch de /sair
            derrubaria a sessão de quem só passou o mouse. */}
        <a href="/sair" title="Sair" className="flex text-tinta-3 hover:text-tinta">
          <Icone nome="sair" tamanho={17} traco={1.6} />
          <span className="sr-only">Sair</span>
        </a>
      </div>
    </nav>
  )
}

/**
 * O item ativo é o de caminho mais específico que casa com a URL.
 *
 * Sem a regra do mais longo, `/painel/acervo/novo` acenderia dois itens
 * ao mesmo tempo (Acervo e Catalogar) e a barra à esquerda deixaria de
 * dizer onde a operadora está.
 */
export function ehOItemAtivo(
  href: string,
  caminho: string | null,
  itens: readonly { href: string }[],
): boolean {
  if (caminho === null) return false

  const candidatos = itens
    .map((item) => item.href)
    .filter((alvo) => caminho === alvo || caminho.startsWith(`${alvo}/`))

  if (candidatos.length === 0) return false

  let maisEspecifico = candidatos[0]!
  for (const alvo of candidatos) {
    if (alvo.length > maisEspecifico.length) maisEspecifico = alvo
  }

  return maisEspecifico === href
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0]!.charAt(0)
  const ultima = partes.length > 1 ? partes[partes.length - 1]!.charAt(0) : ''
  return `${primeira}${ultima}`.toUpperCase()
}
