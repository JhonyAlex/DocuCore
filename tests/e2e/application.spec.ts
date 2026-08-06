import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

type ItemType = { id: number; name: string }
type Status = { id: number; name: string }

const navDestinations: Array<{ label: string; route: string; heading?: string }> = [
  { label: 'Panel general', route: '/dashboard' },
  { label: 'Proyectos', route: '/projects' },
  { label: 'Activos e ítems', route: '/items' },
  { label: 'Documentos', route: '/docs' },
  { label: 'Calendario', route: '/calendar' },
  { label: 'Planos', route: '/plans', heading: 'Planos interactivos' },
  { label: 'Ubicaciones', route: '/locations' },
  { label: 'Historial', route: '/history', heading: 'Historial y auditoría' },
  { label: 'Configuración', route: '/config' },
]

async function goToItems(page: Page): Promise<void> {
  const response = page.waitForResponse((candidate) => candidate.url().includes('/api/items?') && candidate.request().method() === 'GET')
  await page.goto('/items')
  await response
  await expect(page.getByText('CNC-05', { exact: true })).toBeVisible()
}

async function createSeededItem(page: Page, code: string): Promise<void> {
  const [typesResponse, statusesResponse] = await Promise.all([
    page.request.get('/api/item-types'),
    page.request.get('/api/statuses'),
  ])
  const types = await typesResponse.json() as ItemType[]
  const statuses = await statusesResponse.json() as Status[]
  const machine = types.find((type) => type.name === 'Máquina')
  const active = statuses.find((status) => status.name === 'Activo')

  if (!machine || !active) throw new Error('Canonical item metadata is missing.')

  const response = await page.request.post('/api/items', {
    data: {
      code,
      name: `Ítem de paginación ${code}`,
      serialNumber: `SERIE-${code}`,
      serialLabel: `SN: ${code}`,
      installDate: '2026-07-15',
      typeId: machine.id,
      statusId: active.id,
      location: 'Planta 1 · Nave A',
      projectId: 1,
      responsibleId: 1,
      initials: 'PG',
      nextEventLabel: 'Revisión de prueba',
      nextEventDate: '01/08/2026 · 17d',
      nextEventUrgency: 'amber',
    },
  })

  expect(response.status(), `Failed to create ${code}`).toBe(201)
}

test.describe('DocuCore application', () => {
  test.describe.configure({ mode: 'serial' })

  test('navigates to all destinations and updates breadcrumbs', async ({ page, consoleErrors }) => {
    await page.goto('/dashboard')

    for (const destination of navDestinations) {
      await page.locator(`aside a[href="${destination.route}"]`).click()
      await expect(page).toHaveURL(new RegExp(`${destination.route}$`))
      await expect(page.locator('header').getByText(destination.label, { exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: destination.heading ?? destination.label, exact: true })).toBeVisible()
    }

    expect(consoleErrors).toEqual([])
  })

  test('toggles the color theme without browser errors', async ({ page, consoleErrors }) => {
    await page.goto('/dashboard')
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.getByTitle('Cambiar tema').click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.getByTitle('Cambiar tema').click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect(consoleErrors).toEqual([])
  })

  test('opens and closes the item modal', async ({ page, consoleErrors }) => {
    await goToItems(page)
    await page.locator('tbody tr').filter({ hasText: 'CNC-05' }).click()
    await expect(page.getByRole('heading', { name: 'Torno CNC Haas ST-20', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Torno CNC Haas ST-20', exact: true })).toHaveCount(0)
    expect(consoleErrors).toEqual([])
  })

  test('uses API-backed filtering and pagination', async ({ page, consoleErrors }) => {
    for (let index = 1; index <= 5; index += 1) {
      await createSeededItem(page, `PAGE-${index}`)
    }

    await goToItems(page)
    await expect(page.getByText('Mostrando 1-6 de 147 resultados')).toBeVisible()

    const nextResponse = page.waitForResponse((response) => response.url().includes('page=2') && response.url().includes('/api/items?'))
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await nextResponse
    await expect(page.getByText('Mostrando 7-12 de 147 resultados')).toBeVisible()

    const search = page.getByPlaceholder('Buscar por nombre, código, serie…')
    const filterResponse = page.waitForResponse((response) => response.url().includes('search=CNC-05') && response.url().includes('/api/items?'))
    await search.fill('CNC-05')
    await filterResponse
    await expect(page.getByText('Mostrando 1-1 de 1 resultados')).toBeVisible()
    await expect(page.getByText('Torno CNC Haas ST-20', { exact: true })).toBeVisible()
    expect(consoleErrors).toEqual([])
  })

  test('creates, edits, decommissions, and persists an item through the UI', async ({ page, consoleErrors }) => {
    const code = 'E2E-900'
    await goToItems(page)
    await page.getByRole('button', { name: 'Nuevo ítem', exact: true }).last().click()
    await expect(page.getByRole('heading', { name: 'Nuevo ítem', exact: true })).toBeVisible()

    await page.locator('#item-code').fill(code)
    await page.locator('#item-name').fill('Activo de prueba E2E')
    await page.locator('#item-serial-number').fill('E2E-SERIAL-900')
    await page.locator('#item-serial-label').fill('SN: E2E-SERIAL-900')
    await page.locator('#item-install-date').fill('2026-07-15')
    await page.locator('#item-location').selectOption({ label: 'Planta 1 · Nave A' })
    await page.locator('#item-type').selectOption({ label: 'Máquina' })
    await page.locator('#item-status').selectOption({ label: 'Activo' })
    await page.locator('#item-initials').fill('E2E')
    await page.locator('#item-event-label').fill('Revisión E2E')
    await page.locator('#item-event-date').fill('01/08/2026 · 17d')

    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/items'))
    await page.getByRole('button', { name: 'Crear ítem', exact: true }).click()
    expect((await createResponse).status()).toBe(201)
    await expect(page.getByRole('heading', { name: 'Nuevo ítem', exact: true })).toHaveCount(0)
    const createdItemResponse = page.waitForResponse((response) => response.url().includes(`search=${code}`) && response.url().includes('/api/items?'))
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(code)
    await createdItemResponse
    await expect(page.locator('tbody tr').filter({ hasText: code })).toBeVisible()

    await page.locator('tbody tr').filter({ hasText: code }).click()
    await page.getByRole('button', { name: 'Editar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Editar ítem', exact: true })).toBeVisible()
    await page.locator('#item-name').fill('Activo E2E editado')

    const updateResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes('/api/items/'))
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    expect((await updateResponse).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Activo E2E editado', exact: true })).toBeVisible()

    const decommissionResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes('/status'))
    await page.getByRole('button', { name: 'Dar de baja', exact: true }).click()
    expect((await decommissionResponse).status()).toBe(200)
    await expect(page.locator('.fixed.inset-0 span').filter({ hasText: 'Fuera de servicio' })).toBeVisible()

    const reloadResponse = page.waitForResponse((response) => response.url().includes('/api/items?') && response.request().method() === 'GET')
    await page.reload()
    await reloadResponse
    const persistedItemResponse = page.waitForResponse((response) => response.url().includes(`search=${code}`) && response.url().includes('/api/items?'))
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(code)
    await persistedItemResponse
    const persistedRow = page.locator('tbody tr').filter({ hasText: code })
    await expect(persistedRow).toContainText('Activo E2E editado')
    await expect(persistedRow).toContainText('Fuera de servicio')
    expect(consoleErrors).toEqual([])
  })

  test('does not expose the SPA fallback under /api routes', async ({ page, consoleErrors }) => {
    const response = await page.request.get('/api/not-found')

    expect(response.status()).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(consoleErrors).toEqual([])
  })
})
