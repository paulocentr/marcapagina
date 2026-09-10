import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // `semear.ts` não é um teste, é o setup — fora do padrão de spec para
  // o Playwright não tentar executá-lo como suíte.
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/semear.ts',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    // Roda contra a build de produção: é o que vai para a Vercel, e
    // diferenças entre dev e build já esconderam bug demais.
    command: 'npm run build && npm run start',
    env: {
      // Troca as duas APIs de metadados por fixtures. A troca acontece no
      // ponto de composição (src/infra/metadados/index.ts), não no
      // serviço nem na rota — o E2E exercita o caminho real, só sem rede.
      // Um teste que depende de rede falha na sexta-feira por motivo
      // alheio ao código.
      MP_METADADOS_FAKE: '1',
    },
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
