import { test, expect, type Page } from '@playwright/test'
import { limparAcervo } from './apoio'

// Os avisos são procurados DENTRO de <main>: o Next monta um
// <div role="alert"> próprio em toda página (o route announcer), e um
// getByRole solto casaria com os dois.
//
// Pela mesma razão as obras da busca também são procuradas dentro de
// <main>: a casca do painel (src/app/painel/layout.tsx) desenha a
// navegação lateral como <ul>, um <li> por item de menu, e ela vem ANTES
// do conteúdo no DOM — um getByRole('listitem') solto acha "Painel", não
// o primeiro resultado da busca.
function obrasEncontradas(page: Page) {
  return page.locator('main').getByRole('listitem')
}

// ISBN que a fixture conhece (MP_METADADOS_FAKE=1) e ISBN válido que ela
// NÃO conhece — este último exercita o caminho de "nenhuma API achou",
// que é comum em didático e infantojuvenil nacional (spec §2.6).
const ISBN_CONHECIDO = '9788535902778'
const ISBN_DESCONHECIDO = '9780804429573'
const ISBN_COM_DIGITO_TROCADO = '9788535902779'

async function entrarComoCoordenacao(page: Page) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill('coord@escola.br')
  await page.getByLabel('Senha').fill('SenhaForte#2026')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL('/painel')
}

async function catalogar(page: Page, isbn: string, quantidade?: string) {
  await page.getByLabel('ISBN', { exact: true }).fill(isbn)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByLabel('Título')).not.toBeEmpty()
  if (quantidade) {
    await page.getByLabel('Quantos exemplares').fill(quantidade)
  }
  await page.getByRole('button', { name: 'Salvar e próximo' }).click()
  // Esperar a CONFIRMAÇÃO, não só o clique: a gravação é uma Server
  // Action, e navegar antes dela terminar aborta a requisição — o teste
  // seguiria em frente com o acervo vazio e falharia num ponto que não
  // tem nada a ver com a causa.
  await expect(page.locator('main').getByRole('status')).toContainText('salvo')
}

test.beforeEach(async ({ page }) => {
  await limparAcervo()
  await entrarComoCoordenacao(page)
})

test.describe('catalogação em série', () => {
  test('bipa ISBN, preenche a ficha e o CURSOR VOLTA ao campo de ISBN', async ({ page }) => {
    // Este teste É o requisito da spec §5.5, não uma checagem de conforto:
    // sem navegar menu entre um livro e o próximo, a catalogação de um
    // acervo inteiro deixa de ser plausível.
    await page.goto('/painel/acervo/novo')

    await page.getByLabel('ISBN', { exact: true }).fill(ISBN_CONHECIDO)
    await page.getByRole('button', { name: 'Buscar' }).click()

    await expect(page.getByLabel('Título')).toHaveValue('Dom Casmurro')
    await expect(page.getByLabel('Autores')).toHaveValue(/Machado de Assis/)

    await page.getByRole('button', { name: 'Salvar e próximo' }).click()

    await expect(page.getByLabel('ISBN', { exact: true })).toBeFocused()
    await expect(page.getByLabel('ISBN', { exact: true })).toHaveValue('')
  })

  test('mostra os tombos criados para a operadora etiquetar', async ({ page }) => {
    await page.goto('/painel/acervo/novo')
    await catalogar(page, ISBN_CONHECIDO, '3')

    await expect(page.locator('main').getByRole('status')).toContainText('000001')
    await expect(page.locator('main').getByRole('status')).toContainText('000003')
  })

  test('conta quantos livros foram catalogados na sessão', async ({ page }) => {
    // Numa sessão de 40 livros, saber onde parou é o que permite parar.
    // O segundo livro é um que as APIs não conhecem e a operadora digita à
    // mão — a sessão real mistura os dois casos, e o contador precisa
    // valer para ambos.
    await page.goto('/painel/acervo/novo')
    await catalogar(page, ISBN_CONHECIDO)

    await page.getByLabel('ISBN', { exact: true }).fill(ISBN_DESCONHECIDO)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByLabel('Título').fill('Apostila de Matemática 5º ano')
    await page.getByRole('button', { name: 'Salvar e próximo' }).click()
    await expect(page.locator('main').getByRole('status')).toContainText('salvo')

    await expect(page.getByTestId('contador-da-sessao')).toContainText('2')
  })

  test('avisa que a obra JÁ está no acervo e oferece acrescentar exemplares', async ({ page }) => {
    await page.goto('/painel/acervo/novo')
    await catalogar(page, ISBN_CONHECIDO)

    await page.getByLabel('ISBN', { exact: true }).fill(ISBN_CONHECIDO)
    await page.getByRole('button', { name: 'Buscar' }).click()

    await expect(page.locator('main').getByRole('alert')).toContainText('já está no acervo')
    await expect(
      page.getByRole('button', { name: 'Acrescentar exemplares a esta obra' }),
    ).toBeVisible()
  })

  test('acrescentar exemplares não cria uma segunda ficha', async ({ page }) => {
    await page.goto('/painel/acervo/novo')
    await catalogar(page, ISBN_CONHECIDO, '2')

    await page.getByLabel('ISBN', { exact: true }).fill(ISBN_CONHECIDO)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('button', { name: 'Acrescentar exemplares a esta obra' }).click()
    await page.getByLabel('Quantos exemplares').fill('3')
    await page.getByRole('button', { name: 'Salvar e próximo' }).click()

    await page.goto('/painel/acervo?termo=casmurro')

    // Uma ficha só, com cinco exemplares.
    await expect(obrasEncontradas(page)).toHaveCount(1)
    await expect(obrasEncontradas(page).first()).toContainText('5')
  })

  test('quando nenhuma API acha, abre o formulário manual com o ISBN preenchido', async ({
    page,
  }) => {
    await page.goto('/painel/acervo/novo')

    await page.getByLabel('ISBN', { exact: true }).fill(ISBN_DESCONHECIDO)
    await page.getByRole('button', { name: 'Buscar' }).click()

    await expect(page.locator('main').getByRole('status')).toContainText('não foi encontrado')
    // O ISBN não pode se perder: redigitá-lo é o atrito que faz a
    // operadora desistir de cadastrar o didático nacional.
    await expect(page.getByLabel('ISBN da obra')).toHaveValue(ISBN_DESCONHECIDO)
    await expect(page.getByLabel('Título')).toHaveValue('')
  })

  test('recusa ISBN com dígito trocado dizendo que é erro de digitação', async ({ page }) => {
    // A mensagem errada aqui faz a operadora cadastrar uma duplicata.
    await page.goto('/painel/acervo/novo')

    await page.getByLabel('ISBN', { exact: true }).fill(ISBN_COM_DIGITO_TROCADO)
    await page.getByRole('button', { name: 'Buscar' }).click()

    await expect(page.locator('main').getByRole('alert')).toContainText('não confere')
  })
})

test.describe('busca no acervo', () => {
  test('acha por parte do título, sem etiqueta nenhuma existir', async ({ page }) => {
    // Caminho de primeira classe (spec §2.2): a etiquetagem é gradual e
    // pode nunca terminar.
    await page.goto('/painel/acervo/novo')
    await catalogar(page, ISBN_CONHECIDO)

    await page.goto('/painel/acervo?termo=casmurro')

    await expect(obrasEncontradas(page).first()).toContainText('Dom Casmurro')
  })

  test('busca sem acento acha título com acento', async ({ page }) => {
    await page.goto('/painel/acervo/novo')
    await catalogar(page, ISBN_CONHECIDO)

    await page.goto('/painel/acervo?termo=CASMURRO')
    await expect(obrasEncontradas(page).first()).toContainText('Dom Casmurro')
  })

  test('diz claramente quando não há resultado', async ({ page }) => {
    await page.goto('/painel/acervo?termo=livroquenaoexiste')

    await expect(page.getByText('Nenhuma obra encontrada')).toBeVisible()
  })

  test('a folha de etiquetas sai em PDF a partir da ficha', async ({ page }) => {
    await page.goto('/painel/acervo/novo')
    await catalogar(page, ISBN_CONHECIDO, '2')

    await page.goto('/painel/acervo?termo=casmurro')
    await page.getByRole('link', { name: /Dom Casmurro/ }).click()

    const link = page.getByRole('link', { name: 'Imprimir etiquetas' })
    await expect(link).toBeVisible()

    // Buscar direto em vez de abrir aba: o que importa é que a rota
    // devolve um PDF de verdade, autenticada pela mesma sessão.
    const resposta = await page.request.get(String(await link.getAttribute('href')))
    expect(resposta.status()).toBe(200)
    expect(resposta.headers()['content-type']).toContain('application/pdf')
    expect((await resposta.body()).subarray(0, 5).toString()).toBe('%PDF-')
  })

  test('a ficha da obra mostra os exemplares e seus tombos', async ({ page }) => {
    await page.goto('/painel/acervo/novo')
    await catalogar(page, ISBN_CONHECIDO, '2')

    await page.goto('/painel/acervo?termo=casmurro')
    await page.getByRole('link', { name: /Dom Casmurro/ }).click()

    await expect(page.getByText('000001')).toBeVisible()
    await expect(page.getByText('000002')).toBeVisible()
    await expect(page.getByText('Machado de Assis')).toBeVisible()
  })
})
