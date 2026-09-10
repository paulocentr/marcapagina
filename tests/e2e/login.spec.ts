import { test, expect } from '@playwright/test'

test.describe('login de staff', () => {
  test('entra com credenciais corretas e chega ao painel', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('coord@escola.br')
    await page.getByLabel('Senha').fill('SenhaForte#2026')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL('/painel')
    await expect(page.getByText('Coordenação')).toBeVisible()
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
    await expect(page.getByText('Ana Souza')).toBeVisible()
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
