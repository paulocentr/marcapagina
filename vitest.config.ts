import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          // Testes de unidade NUNCA tocam banco. Se um deles ficar lento,
          // é sinal de que virou teste de integração no lugar errado.
          include: ['tests/unit/**/*.test.ts', 'tests/arquitetura/**/*.test.ts', 'tests/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/apoio/banco.ts'],
          // Os testes de integração compartilham UM banco e cada um começa
          // com TRUNCATE. Rodar arquivos em paralelo faria um limpar o banco
          // debaixo do outro. `fileParallelism` só existe na raiz da config,
          // então a serialização por project sai por aqui: um único fork
          // executa todos os arquivos deste project em sequência.
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
        },
      },
    ],
  },
})
