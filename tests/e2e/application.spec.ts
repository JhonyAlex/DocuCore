import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

type ItemType = { id: number; name: string }
type Status = { id: number; name: string }
type LocationSummary = { id: number; name: string }

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
  const [typesResponse, statusesResponse, locationsResponse] = await Promise.all([
    page.request.get('/api/item-types'),
    page.request.get('/api/statuses'),
    page.request.get('/api/locations'),
  ])
  const types = await typesResponse.json() as ItemType[]
  const statuses = await statusesResponse.json() as Status[]
  const locationsBody = await locationsResponse.json() as { locations: LocationSummary[] }
  const machine = types.find((type) => type.name === 'Máquina')
  const active = statuses.find((status) => status.name === 'Activo')
  const naveA = locationsBody.locations.find((location) => location.name === 'Planta 1 · Nave A')

  if (!machine || !active || !naveA) throw new Error('Canonical item metadata is missing.')

  const response = await page.request.post('/api/items', {
    data: {
      code,
      name: `Ítem de paginación ${code}`,
      serialNumber: `SERIE-${code}`,
      serialLabel: `SN: ${code}`,
      installDate: '2026-07-15',
      typeId: machine.id,
      statusId: active.id,
      locationId: naveA.id,
      projectId: 1,
      responsibleId: 1,
      initials: 'PG',
    },
  })

  expect(response.status(), `Failed to create ${code}`).toBe(201)
}

test.describe('DocuCore application', () => {
  test.describe.configure({ mode: 'serial' })

  test('navigates to all destinations and updates breadcrumbs', async ({ page, consoleIssues }) => {
    await page.goto('/dashboard')

    for (const destination of navDestinations) {
      await page.locator(`aside a[href="${destination.route}"]`).click()
      await expect(page).toHaveURL(new RegExp(`${destination.route}$`))
      await expect(page.locator('header').getByText(destination.label, { exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: destination.heading ?? destination.label, exact: true })).toBeVisible()
    }

    expect(consoleIssues).toEqual([])
  })

  test('toggles the color theme without browser errors', async ({ page, consoleIssues }) => {
    await page.goto('/dashboard')
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.getByTitle('Cambiar tema').click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.getByTitle('Cambiar tema').click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect(consoleIssues).toEqual([])
  })

  test('opens and closes the item modal', async ({ page, consoleIssues }) => {
    await goToItems(page)
    const canonicalRow = page.locator('tbody tr').filter({ hasText: 'CNC-05' })
    await expect(canonicalRow).toContainText('Mant. preventivo')
    await expect(canonicalRow).toContainText('05/08/2026 · 21d')
    await canonicalRow.click()
    const dialog = page.getByRole('dialog', { name: 'Torno CNC Haas ST-20' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Próximos eventos', exact: true })).toBeVisible()
    await expect(dialog.getByText('Mant. preventivo', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Manual técnico Haas ST-20 v2', { exact: true })).toBeVisible()

    await dialog.getByText('Cerrar', { exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Torno CNC Haas ST-20', exact: true })).toHaveCount(0)
    expect(consoleIssues).toEqual([])
  })

  test('uses API-backed filtering and pagination', async ({ page, consoleIssues }) => {
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
    expect(consoleIssues).toEqual([])
  })

  test('keeps the latest filter result when responses arrive out of order', async ({ page, consoleIssues }) => {
    let delayedInstrumentRequest = false
    await page.route('**/api/items?**', async (route) => {
      const url = new URL(route.request().url())
      const shouldDelay = !delayedInstrumentRequest
        && url.searchParams.get('typeId') === '5'
        && !url.searchParams.has('statusId')

      if (!shouldDelay) {
        await route.continue()
        return
      }

      delayedInstrumentRequest = true
      const response = await route.fetch()
      await new Promise((resolve) => setTimeout(resolve, 700))
      await route.fulfill({ response })
    })

    await goToItems(page)
    const selects = page.locator('main select')
    const instrumentRequest = page.waitForRequest((request) => request.url().includes('typeId=5') && !request.url().includes('statusId='))
    await selects.nth(0).selectOption({ label: 'Instrumento' })
    await instrumentRequest
    await expect(selects.nth(0)).toHaveValue('5')

    const latestResponse = page.waitForResponse((response) => response.url().includes('typeId=5') && response.url().includes('statusId=1'))
    await selects.nth(1).selectOption({ label: 'Activo' })
    await latestResponse
    await expect(page.getByText('No se encontraron ítems', { exact: true })).toBeVisible()
    await page.waitForTimeout(800)
    await expect(page.getByText('No se encontraron ítems', { exact: true })).toBeVisible()
    expect(consoleIssues).toEqual([])
  })

  test('recovers the items list after a temporary API failure', async ({ page }) => {
    let apiAvailable = false
    await page.route('**/api/items?**', async (route) => {
      if (apiAvailable) {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporarily unavailable' }),
      })
    })

    await page.goto('/items')
    await expect(page.getByRole('alert')).toContainText('No se pudieron cargar los ítems')
    await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible()

    apiAvailable = true
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
    await expect(page.getByText('CNC-05', { exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('closes item dialogs with Escape and restores focus', async ({ page, consoleIssues }) => {
    await goToItems(page)
    await page.locator('tbody tr').filter({ hasText: 'CNC-05' }).click()
    await expect(page.getByRole('dialog', { name: 'Torno CNC Haas ST-20' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Torno CNC Haas ST-20' })).toHaveCount(0)

    const createButton = page.locator('section').getByRole('button', { name: 'Nuevo ítem', exact: true })
    await createButton.focus()
    await createButton.click()
    const formDialog = page.getByRole('dialog', { name: 'Nuevo ítem' })
    await expect(formDialog).toBeVisible()
    await expect(formDialog.locator('#item-code')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(formDialog).toHaveCount(0)
    await expect(createButton).toBeFocused()
    expect(consoleIssues).toEqual([])
  })

  test('creates, edits, decommissions, and persists an item through the UI', async ({ page, consoleIssues }) => {
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
    await expect(page.getByLabel('Próximo evento', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Fecha del evento', { exact: true })).toHaveCount(0)

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
    await expect(persistedRow).toContainText('Sin eventos programados')
    expect(consoleIssues).toEqual([])
  })

  test('uploads, versions, downloads, persists, and detaches a document from an asset', async ({ page, consoleIssues }) => {
    const firstBytes = Buffer.from('DOCUCORE-DOCUMENT-V1-KNOWN-BYTES')
    const secondBytes = Buffer.from('DOCUCORE-DOCUMENT-V2-KNOWN-BYTES')
    const asset = await page.request.get('/api/items?search=AST-001&limit=1')
    const assetBody = await asset.json()
    const assetId = assetBody.data[0].id as number

    await page.goto('/docs')
    await expect(page.getByRole('heading', { name: 'Documentos', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Subir documento', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Subir documento' })
    await dialog.getByLabel('Nombre').fill('Certificado E2E Documento-Activo')
    await dialog.getByLabel('Tipo').selectOption({ label: 'Certificado' })
    await dialog.getByLabel('Activo asociado').fill('AST-001')
    await dialog.getByRole('option', { name: /AST-001 · Activo industrial 001/ }).click()
    await dialog.getByLabel('Emisión').fill('2026-07-15')
    await dialog.getByLabel('Vencimiento (opcional)').fill('2026-08-10')
    await dialog.getByLabel('Fichero').setInputFiles({ name: 'known-v1.pdf', mimeType: 'application/pdf', buffer: firstBytes })
    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/documents'))
    await dialog.getByRole('button', { name: 'Subir documento', exact: true }).last().click()
    expect((await createResponse).status()).toBe(201)
    await expect(page.getByText('Certificado E2E Documento-Activo', { exact: true })).toBeVisible()

    const documentsResponse = await page.request.get('/api/documents?search=Certificado%20E2E%20Documento-Activo')
    const documentId = ((await documentsResponse.json()).data[0].id) as number
    const currentDownload = await page.request.get(`/api/documents/${documentId}/download`)
    expect(currentDownload.status()).toBe(200)
    expect(await currentDownload.body()).toEqual(firstBytes)

    await goToItems(page)
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('AST-001')
    await page.locator('tbody tr').filter({ hasText: 'AST-001' }).click()
    const itemDialog = page.getByRole('dialog', { name: /Activo industrial 001/ })
    await expect(itemDialog.getByText('Próximos eventos', { exact: true })).toBeVisible()
    await expect(itemDialog.getByText('Certificado E2E Documento-Activo', { exact: true })).toBeVisible()
    await itemDialog.getByRole('button', { name: /Documentos.*1/ }).click()
    await expect(itemDialog.getByText('Certificado E2E Documento-Activo v1', { exact: true })).toBeVisible()
    await itemDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click()

    await page.goto('/docs')
    await page.getByText('Certificado E2E Documento-Activo', { exact: true }).click()
    const manageDialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    await expect(manageDialog.getByText('v1 · known-v1.pdf', { exact: true })).toBeVisible()
    await manageDialog.getByLabel('Vencimiento (opcional)').fill('2026-09-20')
    await manageDialog.getByLabel('Nueva versión').setInputFiles({ name: 'known-v2.pdf', mimeType: 'application/pdf', buffer: secondBytes })
    const versionResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/api/documents/${documentId}/versions`))
    await manageDialog.getByRole('button', { name: 'Subir nueva versión', exact: true }).click()
    expect((await versionResponse).status()).toBe(201)
    await expect(manageDialog.getByText('v2 · known-v2.pdf', { exact: true })).toBeVisible()
    await expect(manageDialog.getByText('v1 · known-v1.pdf', { exact: true })).toBeVisible()
    const historicalDownload = await page.request.get(`/api/documents/${documentId}/versions/1/download`)
    expect(await historicalDownload.body()).toEqual(firstBytes)
    const latestDownload = await page.request.get(`/api/documents/${documentId}/download`)
    expect(await latestDownload.body()).toEqual(secondBytes)
    await page.reload()
    await expect(page.getByText('Certificado E2E Documento-Activo', { exact: true })).toBeVisible()

    const itemAfterVersion = await page.request.get(`/api/items/${assetId}`)
    const itemAfterVersionBody = await itemAfterVersion.json()
    expect(itemAfterVersionBody.documentCount).toBe(1)
    expect(itemAfterVersionBody.nextEvents).toEqual(expect.arrayContaining([expect.objectContaining({ id: `document:${documentId}`, date: '2026-09-20T00:00:00.000Z' })]))

    await page.getByText('Certificado E2E Documento-Activo', { exact: true }).click()
    const detachDialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    await detachDialog.getByLabel('Activo asociado').click()
    await detachDialog.getByRole('option', { name: 'Sin activo' }).click()
    const detachResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().endsWith(`/api/documents/${documentId}`))
    await detachDialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    expect((await detachResponse).status()).toBe(200)
    const detachedItem = await page.request.get(`/api/items/${assetId}`)
    const detachedItemBody = await detachedItem.json()
    expect(detachedItemBody.documentCount).toBe(0)
    expect(detachedItemBody.nextEvents).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: `document:${documentId}` })]))
    expect(consoleIssues).toEqual([])
  })

  test('links an existing document and creates a new one from the asset ficha', async ({ page, consoleIssues }) => {
    const docName = `E2E Vincular ${Date.now()}`
    const newDocName = `${docName} nuevo`
    const bytes = Buffer.from('DOCUCORE-LINK-KNOWN-BYTES')
    const asset = await page.request.get('/api/items?search=AST-001&limit=1')
    const assetBody = await asset.json()
    const assetId = assetBody.data[0].id as number
    const before = assetBody.data[0].documentCount as number

    const create = await page.request.post('/api/documents', {
      multipart: {
        file: { name: 'link.pdf', mimeType: 'application/pdf', buffer: bytes },
        name: docName,
        type: 'Manual',
        projectId: 1,
        issueDate: '2026-08-01',
        expiryDate: '2026-12-31',
      },
    })
    expect(create.status()).toBe(201)
    const documentsResponse = await page.request.get(`/api/documents?search=${encodeURIComponent(docName)}`)
    const documentId = ((await documentsResponse.json()).data[0].id) as number

    await goToItems(page)
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('AST-001')
    await page.locator('tbody tr').filter({ hasText: 'AST-001' }).click()
    const itemDialog = page.getByRole('dialog', { name: /Activo industrial 001/ })
    await itemDialog.getByRole('button', { name: /^Documentos/ }).click()
    await itemDialog.getByRole('button', { name: 'Vincular documento' }).click()
    const linkDialog = page.getByRole('dialog', { name: 'Vincular documento' })
    await linkDialog.getByLabel('Buscar documento').fill(docName)
    await linkDialog.getByRole('option', { name: new RegExp(docName) }).click()
    await expect(linkDialog).toBeHidden()
    await expect(itemDialog.getByText(`${docName} v1`, { exact: true })).toBeVisible()

    const linkedItem = await page.request.get(`/api/items/${assetId}`)
    const linkedBody = await linkedItem.json()
    expect(linkedBody.documentCount).toBe(before + 1)
    expect(linkedBody.nextEvents).toEqual(expect.arrayContaining([expect.objectContaining({ id: `document:${documentId}` })]))

    await itemDialog.getByRole('button', { name: 'Nuevo documento' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Subir documento' })
    await expect(createDialog.getByLabel('Activo asociado')).toHaveValue(/AST-001 · Activo industrial 001/)
    await createDialog.getByLabel('Nombre').fill(newDocName)
    await createDialog.getByLabel('Emisión').fill('2026-08-01')
    await createDialog.getByLabel('Vencimiento (opcional)').fill('2026-12-31')
    await createDialog.getByLabel('Fichero').setInputFiles({ name: 'nuevo.pdf', mimeType: 'application/pdf', buffer: bytes })
    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/documents'))
    await createDialog.getByRole('button', { name: 'Subir documento', exact: true }).last().click()
    expect((await createResponse).status()).toBe(201)
    await expect(itemDialog.getByText(`${newDocName} v1`, { exact: true })).toBeVisible()

    const finalItem = await page.request.get(`/api/items/${assetId}`)
    expect((await finalItem.json()).documentCount).toBe(before + 2)
    expect(consoleIssues).toEqual([])
  })

  test('does not expose the SPA fallback under /api routes', async ({ page, consoleIssues }) => {
    const response = await page.request.get('/api/not-found')

    expect(response.status()).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(consoleIssues).toEqual([])
  })
})
