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
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
