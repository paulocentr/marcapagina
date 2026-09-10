import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // `semear.ts` não é um teste, é o setup — fora do padrão de spec para
  // o Playwright não tentar executá-lo como suíte.
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/semear.ts',
  // UM worker, e isto é medição e não superstição.
  //
  // `limparAcervo` (tests/e2e/apoio.ts) dá TRUNCATE no acervo no
  // `beforeEach` do acervo.spec, e os workers compartilham UM banco. Com
  // dois, o TRUNCATE de um apaga a obra que o outro acabou de catalogar,
  // e o teste "acrescentar exemplares não cria uma segunda ficha" acha 0
  // resultados na busca. Medido nesta árvore, repetidamente:
  //
  //   --workers=1  ->  17 passed (35,0s)
  //   --workers=2  ->  1 failed | 16 passed (33,5s)
  //
  // O paralelismo comprava 1,5s de 35, porque o tempo é dominado pela
  // build. Um teste que reprova por causa do vizinho é pior que um teste
  // lento: ensina a reexecutar até passar, e aí um vermelho de verdade
  // passa batido.
  //
  // Se a suíte crescer ao ponto de o serial doer, a saída NÃO é voltar a
  // subir workers: é dar um banco por worker
  // (`DATABASE_URL` + índice do worker) e migrar cada um.
  workers: 1,
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
