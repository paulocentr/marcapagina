import { cpSync, existsSync } from 'node:fs'
import path from 'node:path'

// `next build` com output: 'standalone' produz .next/standalone/server.js,
// mas NÃO copia para lá os assets estáticos — quem copia é o Dockerfile.
// Este script faz a mesma cópia localmente, para que `npm start` suba o
// MESMO artefato que vai para produção. Sem isso, `next start` serviria
// uma variante que não é a que roda no contêiner, e o E2E estaria
// testando algo que não é o que se entrega (spec §2.4).
const raiz = process.cwd()
const standalone = path.join(raiz, '.next', 'standalone')

if (!existsSync(standalone)) {
  console.error('.next/standalone não existe. Rode `npm run build` antes.')
  process.exit(1)
}

cpSync(path.join(raiz, 'public'), path.join(standalone, 'public'), { recursive: true })
cpSync(path.join(raiz, '.next', 'static'), path.join(standalone, '.next', 'static'), {
  recursive: true,
})
