import { NextResponse, type NextRequest } from 'next/server'
import { apagarCookieDeSessao, lerSessao } from '@/core/auth/sessao'
import { ehAluno } from '@/core/auth/principal'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const principal = await lerSessao()
  const destino = principal && ehAluno(principal) ? '/aluno/entrar' : '/entrar'
  await apagarCookieDeSessao()
  return NextResponse.redirect(new URL(destino, request.url))
}
