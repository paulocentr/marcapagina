import { NextResponse, type NextRequest } from 'next/server'

const NOME_COOKIE_SESSAO = 'mp_sessao'

// O middleware roda em Edge, onde não há AsyncLocalStorage nem Prisma.
// Por isso ele NÃO valida a assinatura do token nem consulta banco: só
// verifica a presença do cookie, para evitar um redirect desnecessário.
// A autorização real acontece no servidor, nos guards. Um cookie forjado
// passa por aqui e é rejeitado lá — que é onde importa.
export function middleware(request: NextRequest) {
  const temCookie = request.cookies.has(NOME_COOKIE_SESSAO)
  const { pathname } = request.nextUrl

  if (temCookie) return NextResponse.next()

  const destino = pathname.startsWith('/aluno') ? '/aluno/entrar' : '/entrar'
  const url = request.nextUrl.clone()
  url.pathname = destino
  url.searchParams.set('de', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/painel/:path*', '/aluno((?!/entrar).*)'],
}
