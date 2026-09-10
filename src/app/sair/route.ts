import { NextResponse, type NextRequest } from 'next/server'
import { apagarCookieDeSessao, lerSessao } from '@/core/auth/sessao'
import { ehAluno } from '@/core/auth/principal'

export const runtime = 'nodejs'

/**
 * Sair é POST, e NÃO existe GET aqui de propósito.
 *
 * Apagar a sessão é efeito colateral, e efeito colateral em GET é
 * alcançável por qualquer coisa que só *aponte* para a URL: o prefetch do
 * `<Link>` do App Router, um `<img src>` numa mensagem, o pre-render de um
 * cliente de e-mail, um crawler. Isso já aconteceu neste projeto — um
 * `<Link href="/sair">` na tela do painel derrubava a sessão da operadora
 * só por a tela ter renderizado, e o sintoma aparecia na ação seguinte,
 * longe da causa.
 *
 * Sem `GET`, um `<a href="/sair">` esquecido responde 405 em vez de
 * deslogar. Falha visível, e não sessão que evapora.
 *
 * 303 e não 307: 307 preserva o método, e o navegador reenviaria o POST
 * para a tela de login.
 */
export async function POST(request: NextRequest) {
  const principal = await lerSessao()
  const destino = principal && ehAluno(principal) ? '/aluno/entrar' : '/entrar'
  await apagarCookieDeSessao()
  return NextResponse.redirect(new URL(destino, request.url), 303)
}
