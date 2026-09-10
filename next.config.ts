import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Portabilidade (spec §2.4): Vercel Hobby é apenas não-comercial e o
  // sistema é multi-tenant. 'standalone' permite rodar a mesma build em
  // qualquer lugar via Docker, sem reescrever nada.
  output: 'standalone',
  typedRoutes: true,
}

export default nextConfig
