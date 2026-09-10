import { execFileSync } from 'node:child_process'

// O E2E entra com um usuário e um aluno REAIS, então depende da seed.
// E os testes de integração dão TRUNCATE no banco a cada teste — quem
// rodar `test:integration` antes do `test:e2e`, como manda a verificação
// final do plano, encontraria o banco vazio e veria cinco falhas que não
// têm nada a ver com o código. Semear aqui torna o E2E independente da
// ordem em que as suítes rodam.
export default function semear(): void {
  execFileSync('npm', ['run', 'db:seed'], { stdio: 'inherit' })
}
