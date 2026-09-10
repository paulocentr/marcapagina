import type { ReactElement, ReactNode } from 'react'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'

/**
 * Os ícones do kit: SVG de traço inline, grade de 20, sem biblioteca.
 *
 * Os desenhos são os das pranchas aprovadas, copiados e não reinventados.
 * `stroke-width` é atributo herdado em SVG, então a moldura define o
 * traço e cada desenho só declara a forma — é isso que deixa o mesmo
 * ícone legível a 11px dentro de um chip (traço grosso) e a 24px numa
 * faixa (traço fino).
 *
 * Emoji não entra: muda de forma por sistema, não aceita a cor do estado
 * e não tem como ficar alinhado com o texto em altura de controle.
 */

export interface PropsDeIcone {
  /** Lado do quadrado, em px. As pranchas usam 11, 16, 18, 20 e 22. */
  tamanho?: number
  /** Espessura do traço na grade de 20. Mais grosso em tamanho pequeno. */
  traco?: number
  className?: string
}

export type ComponenteDeIcone = (props: PropsDeIcone) => ReactElement

function Moldura({
  tamanho = 16,
  traco = 1.7,
  className,
  children,
}: PropsDeIcone & { children: ReactNode }): ReactElement {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

function IconeCheck(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M4 10.5l4 4 8-9" />
    </Moldura>
  )
}

function IconeTroca(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M3 7h11l-3-3M17 13H6l3 3" />
    </Moldura>
  )
}

function IconeRelogio(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.3l2.8 1.9" />
    </Moldura>
  )
}

function IconeFita(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M6 3h8v14l-4-3-4 3V3z" fill="currentColor" stroke="none" />
    </Moldura>
  )
}

function IconeAviso(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M10 3l7.5 13.5H2.5z" />
      <path d="M10 8.2v3.2" />
      <circle cx="10" cy="13.8" r="0.9" fill="currentColor" stroke="none" />
    </Moldura>
  )
}

function IconeXis(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M5 5l10 10M15 5L5 15" />
    </Moldura>
  )
}

function IconeInfo(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6.3" r="0.95" fill="currentColor" stroke="none" />
    </Moldura>
  )
}

function IconePainel(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <rect x="3" y="3" width="6" height="6" rx="1.2" />
      <rect x="11" y="3" width="6" height="6" rx="1.2" />
      <rect x="3" y="11" width="6" height="6" rx="1.2" />
      <rect x="11" y="11" width="6" height="6" rx="1.2" />
    </Moldura>
  )
}

function IconeBusca(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <circle cx="9" cy="9" r="5.2" />
      <path d="M12.9 12.9L17 17" />
    </Moldura>
  )
}

function IconeMais(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M10 4v12M4 10h12" />
    </Moldura>
  )
}

function IconeLivros(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <rect x="3.5" y="4" width="5" height="12" rx="1.2" />
      <rect x="11.5" y="4" width="5" height="12" rx="1.2" />
    </Moldura>
  )
}

function IconeCodigoDeBarras({ traco = 1.5, ...resto }: PropsDeIcone): ReactElement {
  return (
    <Moldura traco={traco} {...resto}>
      <path d="M3 5v10M6 5v10M8.4 5v10M11.2 5v10M14 5v10M17 5v10" />
    </Moldura>
  )
}

function IconeCarrinho(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M2.5 3.5h2.2l2 9.2h8.1l1.9-6.7H6.2" />
      <circle cx="7.6" cy="16" r="1.3" />
      <circle cx="13.8" cy="16" r="1.3" />
    </Moldura>
  )
}

function IconePessoas(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <circle cx="8" cy="7.4" r="2.8" />
      <path d="M3 16.6c0-2.6 2.2-4.3 5-4.3s5 1.7 5 4.3" />
      <path d="M13.4 5.3a2.6 2.6 0 010 5M15.2 16.6c0-1.7-.5-3-1.5-3.9" />
    </Moldura>
  )
}

function IconeGrafico(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M3.5 16.5V9.5M8 16.5V4.5M12.5 16.5v-5M17 16.5V7.5" />
    </Moldura>
  )
}

function IconeAjustes(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M3 6.5h8.2M15.4 6.5H17M3 13.5h2.6M9.8 13.5H17" />
      <circle cx="13.4" cy="6.5" r="1.9" />
      <circle cx="7.6" cy="13.5" r="1.9" />
    </Moldura>
  )
}

function IconeSair(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M12 14v2.5H4V3.5h8V6M9 10h8m0 0l-2.6-2.6M17 10l-2.6 2.6" />
    </Moldura>
  )
}

function IconeImpressora(props: PropsDeIcone): ReactElement {
  return (
    <Moldura {...props}>
      <path d="M6 7.5V3.5h8v4M6 14H4V7.5h12V14h-2M6 11h8v6H6z" />
    </Moldura>
  )
}

function IconeImagem({ traco = 1.4, ...resto }: PropsDeIcone): ReactElement {
  return (
    <Moldura traco={traco} {...resto}>
      <rect x="2.5" y="3" width="15" height="14" rx="1.6" />
      <path d="M2.5 13l4-3.6 3.4 3 2.6-2.2 5 4.4" />
      <circle cx="7.2" cy="7.4" r="1.3" />
    </Moldura>
  )
}

/**
 * Registro exaustivo: o `Record<NomeDeIcone, …>` faz o compilador cobrar
 * o desenho de todo nome declarado em `icone-nomes.ts`. É esta linha que
 * transforma "esqueci de desenhar o ícone" em erro de `typecheck`.
 */
export const ICONES: Record<NomeDeIcone, ComponenteDeIcone> = {
  check: IconeCheck,
  troca: IconeTroca,
  relogio: IconeRelogio,
  fita: IconeFita,
  aviso: IconeAviso,
  xis: IconeXis,
  info: IconeInfo,
  painel: IconePainel,
  busca: IconeBusca,
  mais: IconeMais,
  livros: IconeLivros,
  'codigo-de-barras': IconeCodigoDeBarras,
  carrinho: IconeCarrinho,
  pessoas: IconePessoas,
  grafico: IconeGrafico,
  ajustes: IconeAjustes,
  sair: IconeSair,
  impressora: IconeImpressora,
  imagem: IconeImagem,
}

export function Icone({ nome, ...resto }: { nome: NomeDeIcone } & PropsDeIcone): ReactElement {
  const Desenho = ICONES[nome]
  return <Desenho {...resto} />
}

/**
 * A marca: o livro com a fita terracota saindo por cima.
 *
 * Grade própria de 26 porque é o único desenho que não é ícone de
 * interface — e a fita é a identidade do produto, não um estado.
 */
export function Logotipo({ tamanho = 26, className }: { tamanho?: number; className?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect
        x="2.6"
        y="2"
        width="17"
        height="22"
        rx="2.6"
        fill="var(--color-superficie)"
        stroke="var(--color-tinta)"
        strokeWidth="1.7"
      />
      <path d="M13.4 2h6.2v13.4l-3.1-2.3-3.1 2.3V2z" fill="var(--color-fita)" />
    </svg>
  )
}
