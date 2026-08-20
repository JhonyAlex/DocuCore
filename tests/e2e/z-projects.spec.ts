import { expect, test } from './fixtures'

test.describe('PROJ-01 proyectos', () => {
  test('creates, opens, archives and restores a project from the portfolio', async ({ page, consoleIssues }) => {
    const code = `E2E-PROJ-${Date.now()}`
    const name = `Proyecto aislado ${Date.now()}`
    await page.goto('/projects')

    await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click()
    await page.getByLabel('Código').fill(code)
    await page.getByLabel('Nombre').fill(name)
    await page.getByLabel('Descripción').fill('Creado desde el flujo de cartera multi-proyecto')
    const created = page.waitForResponse((response) => response.url().endsWith('/api/projects') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Crear proyecto' }).click()
    expect((await created).status()).toBe(201)

    const card = page.locator('[role="button"]').filter({ hasText: code })
    await expect(card).toBeVisible()
    let projectLoads = 0
    page.on('request', (request) => {
      if (request.method() === 'GET' && /\/api\/projects\/\d+$/.test(new URL(request.url()).pathname)) projectLoads += 1
    })
    await card.click()
    await expect(page).toHaveURL(/\/projects\/\d+\/dashboard$/)
    await expect(page.locator('aside')).toContainText(name)
    await page.waitForTimeout(150)
    expect(projectLoads).toBeGreaterThanOrEqual(1)
    expect(projectLoads).toBeLessThanOrEqual(2)

    await page.goto('/projects')
    await card.hover()
    await card.getByRole('button', { name: 'Archivar' }).click()
    await page.getByRole('button', { name: 'Archivar' }).last().click()
    await expect(card).toContainText('Archivo')
    await card.hover()
    await card.getByRole('button', { name: 'Reactivar' }).click()
    await page.getByRole('button', { name: 'Reactivar' }).last().click()
    await expect(card).toContainText('Activo')
    expect(consoleIssues).toEqual([])
  })
})
