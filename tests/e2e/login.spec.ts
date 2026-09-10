import { test, expect } from '@playwright/test'

test.describe('login de staff', () => {
  test('entra com credenciais corretas e chega ao painel', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('coord@escola.br')
    await page.getByLabel('Senha').fill('SenhaForte#2026')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL('/painel')
    // Escopado à navegação: é ali que o nome de quem entrou aparece. Sem
    // o escopo, o dia em que o <h1> do painel passar a citar o usuário o
    // route announcer duplica o texto e este teste quebra por um motivo
    // que não tem nada a ver com o que ele prova.
    await expect(
      page.getByRole('navigation', { name: 'Seções do painel' }).getByText('Coordenação'),
    ).toBeVisible()
  })

  test('mostra erro genérico com senha errada', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('coord@escola.br')
    await page.getByLabel('Senha').fill('errada')
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Escopado ao formulário: o Next monta um <div role="alert"> próprio
    // (o route announcer) em toda página, e `getByRole('alert')` solto
    // casaria com os dois.
    await expect(page.locator('form').getByRole('alert')).toContainText(
      'Dados de acesso incorretos',
    )
    await expect(page).toHaveURL('/entrar')
  })

  test('rota protegida sem sessão redireciona para o login', async ({ page }) => {
    await page.goto('/painel')
    await expect(page).toHaveURL(/\/entrar/)
  })
})

test.describe('login de aluno', () => {
  test('entra com matrícula e data de nascimento', async ({ page }) => {
    await page.goto('/aluno/entrar')
    await page.getByLabel('Matrícula').fill('2024001')
    await page.getByLabel('Data de nascimento').fill('2012-03-15')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL('/aluno')
    // Escopado ao <main> pela MESMA razão do erro de login acima: o Next
    // monta um <div role="alert"> próprio (o route announcer) e enche com
    // o texto do <h1> da página. O <h1> do portal é "Olá, Ana Souza",
    // então um getByText solto casa com dois elementos e viola o strict
    // mode. Passava localmente e reprovou no CI — era corrida, não sorte.
    await expect(page.locator('main').getByText('Ana Souza')).toBeVisible()
  })

  test('aluno autenticado não alcança o painel de staff', async ({ page }) => {
    await page.goto('/aluno/entrar')
    await page.getByLabel('Matrícula').fill('2024001')
    await page.getByLabel('Data de nascimento').fill('2012-03-15')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/aluno')

    await page.goto('/painel')
    await expect(page).toHaveURL(/\/entrar/)
  })
})
