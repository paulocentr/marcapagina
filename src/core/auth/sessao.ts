import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { principalSchema, type Principal } from '@/core/auth/principal'

export const NOME_COOKIE_SESSAO = 'mp_sessao'

// Spec §3.6: staff 12 h, aluno 8 h.
const DURACAO_POR_REINO = { STAFF: '12h', ALUNO: '8h' } as const
const DURACAO_SEGUNDOS = { STAFF: 12 * 60 * 60, ALUNO: 8 * 60 * 60 } as const

function segredo(): Uint8Array {
  const valor = process.env.SESSION_SECRET
  if (!valor || valor.length < 32) {
    // Falhar alto: um segredo ausente em produção assinaria sessões com
    // valor previsível, e isso não pode degradar em silêncio.
    throw new Error('SESSION_SECRET ausente ou curto demais (mínimo 32 caracteres).')
  }
  return new TextEncoder().encode(valor)
}

export async function assinarSessao(principal: Principal): Promise<string> {
  return new SignJWT({ ...principal })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(DURACAO_POR_REINO[principal.reino])
    .sign(segredo())
}

export async function verificarSessao(token: string): Promise<Principal | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, segredo(), { algorithms: ['HS256'] })
    // Assinatura válida não basta: o corpo tem que ter o formato esperado,
    // senão o RBAC receberia permissões inventadas.
    const analisado = principalSchema.safeParse(payload)
    return analisado.success ? analisado.data : null
  } catch {
    return null
  }
}

export async function gravarCookieDeSessao(principal: Principal): Promise<void> {
  const token = await assinarSessao(principal)
  const armazem = await cookies()
  armazem.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACAO_SEGUNDOS[principal.reino],
  })
}

export async function lerSessao(): Promise<Principal | null> {
  const armazem = await cookies()
  const token = armazem.get(NOME_COOKIE_SESSAO)?.value
  return token ? verificarSessao(token) : null
}

export async function apagarCookieDeSessao(): Promise<void> {
  const armazem = await cookies()
  armazem.delete(NOME_COOKIE_SESSAO)
}
