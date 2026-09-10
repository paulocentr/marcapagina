import { prisma } from '@/core/db/client'

// Resolve a escola a partir do host. Em deploy multi-tenant o subdomínio
// identifica o tenant (escola-x.marcapagina.app). Em deploy single-tenant
// não há subdomínio útil, e o fallback por env resolve — que é o caso da
// escola da coordenação hoje.
export async function resolverTenant(
  host: string | null,
): Promise<{ id: string; slug: string } | null> {
  const slugCandidato = extrairSlug(host)

  if (slugCandidato) {
    const porSubdominio = await prisma.escola.findUnique({
      where: { slug: slugCandidato },
      select: { id: true, slug: true, ativa: true },
    })
    if (porSubdominio?.ativa) return { id: porSubdominio.id, slug: porSubdominio.slug }
  }

  const padrao = process.env.ESCOLA_PADRAO_SLUG
  if (!padrao) return null

  const escola = await prisma.escola.findUnique({
    where: { slug: padrao },
    select: { id: true, slug: true, ativa: true },
  })
  return escola?.ativa ? { id: escola.id, slug: escola.slug } : null
}

function extrairSlug(host: string | null): string | null {
  if (!host) return null
  const semPorta = host.split(':')[0] ?? ''
  const partes = semPorta.split('.')
  if (partes.length < 3) return null // localhost, marcapagina.app
  const primeiro = partes[0]
  if (!primeiro || primeiro === 'www') return null
  return primeiro
}
