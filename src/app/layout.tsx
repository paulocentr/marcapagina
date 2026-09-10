import type { Metadata } from 'next'
import { Literata, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import { nomeDoProduto } from '@/core/produto'
import './globals.css'

/**
 * Três famílias, cada uma com um trabalho (prancha de Fundamentos).
 *
 * Literata e IBM Plex Sans têm versão variável no Google Fonts, então
 * vêm sem lista de pesos — um arquivo cobre 400 a 700. A IBM Plex Mono
 * não é variável: os pesos são declarados, e só os três que o kit usa,
 * porque cada peso é um arquivo a mais no primeiro carregamento.
 */
const fonteDeTitulo = Literata({
  variable: '--fonte-titulo',
  subsets: ['latin'],
  display: 'swap',
})

const fonteDeInterface = IBM_Plex_Sans({
  variable: '--fonte-interface',
  subsets: ['latin'],
  display: 'swap',
})

// Tombo, ISBN e matrícula são SEMPRE mono: é assim que a operadora
// confere dígito a dígito contra a etiqueta.
const fonteDeCodigo = IBM_Plex_Mono({
  variable: '--fonte-codigo',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  // Sai do módulo de produto e não de literal: o nome é de trabalho e
  // muda num lugar só (spec §1).
  title: nomeDoProduto(),
  description: 'Sistema de gestão da biblioteca escolar',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // lang="pt-BR": o sistema é todo em português. Com "en" o leitor de
    // tela pronuncia "Devolução" como palavra inglesa e a correção
    // ortográfica do navegador sublinha a tela inteira.
    <html
      lang="pt-BR"
      className={`${fonteDeTitulo.variable} ${fonteDeInterface.variable} ${fonteDeCodigo.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  )
}
