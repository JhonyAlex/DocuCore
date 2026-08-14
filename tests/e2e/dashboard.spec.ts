import { expect, test } from './fixtures'

test.describe('Dashboard (Panel general)', () => {
  test.describe.configure({ mode: 'serial' })

  test('renders real project summary, KPIs, expirations, alerts, chart and recent activity', async ({ page, consoleIssues }) => {
    await page.goto('/dashboard')

    const main = page.locator('main')

    // Heading and project summary with formatted date
    await expect(main.getByRole('heading', { name: 'Panel general', exact: true })).toBeVisible()
    await expect(main.getByText('Planta Industrial Norte', { exact: true })).toBeVisible()
    await expect(main.getByText(/miércoles, 15 de julio de 2026/i)).toBeVisible()

    // 4 KPIs
    await expect(main.getByText('Activos totales', { exact: true })).toBeVisible()
    await expect(main.getByText('Documentos por vencer', { exact: true })).toBeVisible()
    await expect(main.getByText('Eventos próximos', { exact: true })).toBeVisible()
    await expect(main.getByText('Incidencias abiertas', { exact: true })).toBeVisible()

    // Upcoming expirations section
    await expect(main.getByRole('heading', { name: 'Próximos vencimientos', exact: true })).toBeVisible()
    const expirationCard = main.getByRole('heading', { name: 'Próximos vencimientos', exact: true }).locator('..').locator('..')
    await expect(expirationCard.locator('[role="button"]').first()).toBeVisible()

    // Critical alerts section
    await expect(main.getByRole('heading', { name: 'Alertas críticas', exact: true })).toBeVisible()
    const alertCard = main.getByRole('heading', { name: 'Alertas críticas', exact: true }).locator('..').locator('..')
    await expect(alertCard.locator('[role="button"]').first()).toBeVisible()

    // Chart section
    await expect(main.getByRole('heading', { name: 'Evolución de eventos y vencimientos', exact: true })).toBeVisible()

    // Recent activity section
    await expect(main.getByRole('heading', { name: 'Actividad reciente', exact: true })).toBeVisible()
    await expect(main.locator('ol li').first()).toBeVisible()

    expect(consoleIssues).toHaveLength(0)
  })

  test('KPI cards navigate to respective sections when clicked', async ({ page }) => {
    await page.goto('/dashboard')
    const main = page.locator('main')

    // Click KPI 1: Activos totales -> /assets
    await main.getByText('Activos totales', { exact: true }).click()
    await expect(page).toHaveURL(/\/assets$/)
    await expect(page.getByRole('heading', { name: 'Activos', exact: true })).toBeVisible()

    // Return to dashboard and click KPI 2: Documentos por vencer -> /docs
    await page.goto('/dashboard')
    await main.getByText('Documentos por vencer', { exact: true }).click()
    await expect(page).toHaveURL(/\/docs$/)
    await expect(page.getByRole('heading', { name: 'Documentos', exact: true })).toBeVisible()

    // Return to dashboard and click KPI 3: Eventos próximos -> /calendar
    await page.goto('/dashboard')
    await main.getByText('Eventos próximos', { exact: true }).click()
    await expect(page).toHaveURL(/\/calendar/)
    await expect(page.getByRole('heading', { name: 'Calendario', exact: true })).toBeVisible()
  })

  test('upcoming expirations and critical alerts open relevant asset and calendar targets', async ({ page }) => {
    await page.goto('/dashboard')
    const main = page.locator('main')

    // Click "Ver todos →" in Próximos vencimientos -> /calendar
    await main.getByRole('button', { name: 'Ver todos →' }).click()
    await expect(page).toHaveURL(/\/calendar/)

    // Return to dashboard and click on the first live expiration target.
    await page.goto('/dashboard')
    const expirationCard = main.getByRole('heading', { name: 'Próximos vencimientos', exact: true }).locator('..').locator('..')
    await expirationCard.locator('[role="button"]').first().click()
    await expect(page).toHaveURL(/\/(assets|docs|calendar)/)

    // Return to dashboard and click on critical alert -> opens asset modal
    await page.goto('/dashboard')
    const alertCard = main.getByRole('heading', { name: 'Alertas críticas', exact: true }).locator('..').locator('..')
    await alertCard.locator('[role="button"]').first().click()
    await expect(page).toHaveURL(/\/assets\?assetId=/)
  })

  test('recent activity navigates to history and asset details', async ({ page }) => {
    await page.goto('/dashboard')
    const main = page.locator('main')

    // Click "Ver historial" -> /history
    await main.getByRole('button', { name: 'Ver historial' }).click()
    await expect(page).toHaveURL(/\/history$/)
    await expect(page.getByRole('heading', { name: 'Historial y auditoría', exact: true })).toBeVisible()

    // Return to dashboard and click on a real activity row.
    await page.goto('/dashboard')
    await main.locator('ol li').first().click()
    await expect(page).toHaveURL(/\/(assets|history)/)
  })
})
