import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

type AssetType = { id: number; name: string }
type Status = { id: number; name: string }
type LocationSummary = { id: number; name: string }

const navDestinations: Array<{ label: string; route: string; heading?: string }> = [
  { label: 'Panel general', route: '/dashboard' },
  { label: 'Proyectos', route: '/projects' },
  { label: 'Activos', route: '/assets' },
  { label: 'Documentos', route: '/docs' },
  { label: 'Calendario', route: '/calendar' },
  { label: 'Planos', route: '/plans', heading: 'Planos interactivos' },
  { label: 'Ubicaciones', route: '/locations' },
  { label: 'Historial', route: '/history', heading: 'Historial y auditoría' },
  { label: 'Configuración', route: '/config' },
]

async function goToAssets(page: Page): Promise<void> {
  const response = page.waitForResponse((candidate) => candidate.url().includes('/api/assets?') && candidate.request().method() === 'GET')
  await page.goto('/assets')
  await response
  await expect(page.getByText('CNC-05', { exact: true })).toBeVisible()
}

async function createSeededAsset(page: Page, code: string): Promise<void> {
  const [typesResponse, statusesResponse, locationsResponse] = await Promise.all([
    page.request.get('/api/asset-types'),
    page.request.get('/api/statuses'),
    page.request.get('/api/locations'),
  ])
  const types = await typesResponse.json() as AssetType[]
  const statuses = await statusesResponse.json() as Status[]
  const locationsBody = await locationsResponse.json() as { locations: LocationSummary[] }
  const machine = types.find((type) => type.name === 'Máquina')
  const active = statuses.find((status) => status.name === 'Activo')
  const naveA = locationsBody.locations.find((location) => location.name === 'Planta 1 · Nave A')

  if (!machine || !active || !naveA) throw new Error('Canonical asset metadata is missing.')

  const response = await page.request.post('/api/assets', {
    data: {
      code,
      name: `Activo de paginación ${code}`,
      serialNumber: `SERIE-${code}`,
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

  test('opens and closes the asset modal', async ({ page, consoleIssues }) => {
    await goToAssets(page)
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
      await createSeededAsset(page, `PAGE-${index}`)
    }

    await goToAssets(page)
    await expect(page.getByText('Mostrando 1-6 de 147 resultados')).toBeVisible()

    const nextResponse = page.waitForResponse((response) => response.url().includes('page=2') && response.url().includes('/api/assets?'))
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await nextResponse
    await expect(page.getByText('Mostrando 7-12 de 147 resultados')).toBeVisible()

    const search = page.getByPlaceholder('Buscar por nombre, código, serie…')
    const filterResponse = page.waitForResponse((response) => response.url().includes('search=CNC-05') && response.url().includes('/api/assets?'))
    await search.fill('CNC-05')
    await filterResponse
    await expect(page.getByText('Mostrando 1-1 de 1 resultados')).toBeVisible()
    await expect(page.getByText('Torno CNC Haas ST-20', { exact: true })).toBeVisible()
    expect(consoleIssues).toEqual([])
  })

  test('keeps the latest filter result when responses arrive out of order', async ({ page, consoleIssues }) => {
    let delayedInstrumentRequest = false
    await page.route('**/api/assets?**', async (route) => {
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

    await goToAssets(page)
    const selects = page.locator('main select')
    const instrumentRequest = page.waitForRequest((request) => request.url().includes('typeId=5') && !request.url().includes('statusId='))
    await selects.nth(0).selectOption({ label: 'Instrumento' })
    await instrumentRequest
    await expect(selects.nth(0)).toHaveValue('5')

    const latestResponse = page.waitForResponse((response) => response.url().includes('typeId=5') && response.url().includes('statusId=1'))
    await selects.nth(1).selectOption({ label: 'Activo' })
    await latestResponse
    await expect(page.getByText('No se encontraron activos', { exact: true })).toBeVisible()
    await page.waitForTimeout(800)
    await expect(page.getByText('No se encontraron activos', { exact: true })).toBeVisible()
    expect(consoleIssues).toEqual([])
  })

  test('recovers the assets list after a temporary API failure', async ({ page }) => {
    let apiAvailable = false
    await page.route('**/api/assets?**', async (route) => {
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

    await page.goto('/assets')
    await expect(page.getByRole('alert')).toContainText('No se pudieron cargar los activos')
    await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible()

    apiAvailable = true
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
    await expect(page.getByText('CNC-05', { exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('closes asset dialogs with Escape and restores focus', async ({ page, consoleIssues }) => {
    await goToAssets(page)
    await page.locator('tbody tr').filter({ hasText: 'CNC-05' }).click()
    await expect(page.getByRole('dialog', { name: 'Torno CNC Haas ST-20' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Torno CNC Haas ST-20' })).toHaveCount(0)

    // UX-03: el alta de activos es único desde la cabecera (Topbar).
    const createButton = page.getByRole('button', { name: 'Nuevo activo', exact: true })
    await createButton.focus()
    await createButton.click()
    const formDialog = page.getByRole('dialog', { name: 'Nuevo activo' })
    await expect(formDialog).toBeVisible()
    await expect(formDialog.locator('#asset-code')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(formDialog).toHaveCount(0)
    await expect(createButton).toBeFocused()
    expect(consoleIssues).toEqual([])
  })

  test('keeps the asset dialog anchored at the top and changes status directly from the inline menu', async ({ page, consoleIssues }) => {
    await goToAssets(page)
    const row = page.locator('tbody tr').filter({ hasText: 'CNC-05' })
    await row.click()
    const assetDialog = page.getByRole('dialog', { name: 'Torno CNC Haas ST-20' })

    // El campo Estado abre inmediatamente las opciones, sin controles intermedios.
    await assetDialog.getByLabel('Cambiar estado').click()
    const statusListbox = assetDialog.getByRole('listbox', { name: 'Seleccionar estado' })
    await expect(statusListbox).toBeVisible()
    await statusListbox.getByRole('option', { name: 'Fuera de servicio' }).click()
    await expect(assetDialog.getByText('Fuera de servicio', { exact: true })).toBeVisible()
    await expect(statusListbox).toHaveCount(0)

    // Restaura el estado original para no contaminar el resto de la suite.
    await assetDialog.getByLabel('Cambiar estado').click()
    await assetDialog.getByRole('listbox', { name: 'Seleccionar estado' }).getByRole('option', { name: 'Activo' }).click()
    await expect(assetDialog.getByText('Activo', { exact: true })).toBeVisible()

    // El modal queda anclado arriba: el borde superior no se mueve al cambiar de pestaña.
    const boxBefore = await assetDialog.boundingBox()
    expect(boxBefore).not.toBeNull()
    expect(boxBefore!.y).toBeLessThan(64)
    await assetDialog.getByRole('button', { name: /^Documentos/ }).click()
    const boxAfter = await assetDialog.boundingBox()
    expect(boxAfter).not.toBeNull()
    expect(boxAfter!.y).toBe(boxBefore!.y)

    await assetDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    expect(consoleIssues).toEqual([])
  })

  test('creates, edits, decommissions, reactivates, and persists an asset through the UI', async ({ page, consoleIssues }) => {
    const code = 'E2E-900'
    await goToAssets(page)
    await page.getByRole('button', { name: 'Nuevo activo', exact: true }).last().click()
    await expect(page.getByRole('heading', { name: 'Nuevo activo', exact: true })).toBeVisible()

    await page.locator('#asset-code').fill(code)
    await page.locator('#asset-name').fill('Activo de prueba E2E')
    await page.locator('#asset-serial-number').fill('E2E-SERIAL-900')
    await page.locator('#asset-install-date').fill('2026-07-15')
    await page.locator('#asset-location').selectOption({ label: 'Planta 1 · Nave A' })
    await page.locator('#asset-type').selectOption({ label: 'Máquina' })
    await page.locator('#asset-status').selectOption({ label: 'Activo' })
    await page.locator('#asset-initials').fill('E2E')
    await expect(page.getByLabel('Próximo evento', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Fecha del evento', { exact: true })).toHaveCount(0)

    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/assets'))
    await page.getByRole('button', { name: 'Crear activo', exact: true }).click()
    expect((await createResponse).status()).toBe(201)
    await expect(page.getByRole('heading', { name: 'Nuevo activo', exact: true })).toHaveCount(0)
    const createdItemResponse = page.waitForResponse((response) => response.url().includes(`search=${code}`) && response.url().includes('/api/assets?'))
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(code)
    await createdItemResponse
    await expect(page.locator('tbody tr').filter({ hasText: code })).toBeVisible()

    await page.locator('tbody tr').filter({ hasText: code }).click()
    await page.getByRole('button', { name: 'Editar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Editar activo', exact: true })).toBeVisible()
    await page.locator('#asset-name').fill('Activo E2E editado')

    const updateResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes('/api/assets/'))
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    expect((await updateResponse).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Activo E2E editado', exact: true })).toBeVisible()

    const decommissionResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes('/status'))
    await page.getByRole('button', { name: 'Dar de baja', exact: true }).click()
    expect((await decommissionResponse).status()).toBe(200)
    await expect(page.locator('.fixed.inset-0 span').filter({ hasText: 'Fuera de servicio' })).toBeVisible()

    const reactivateResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes('/status'))
    await page.getByRole('button', { name: 'Reactivar', exact: true }).click()
    expect((await reactivateResponse).status()).toBe(200)
    await expect(page.locator('.fixed.inset-0 span').filter({ hasText: 'Activo' })).toBeVisible()

    const reloadResponse = page.waitForResponse((response) => response.url().includes('/api/assets?') && response.request().method() === 'GET')
    await page.reload()
    await reloadResponse
    const persistedItemResponse = page.waitForResponse((response) => response.url().includes(`search=${code}`) && response.url().includes('/api/assets?'))
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(code)
    await persistedItemResponse
    const persistedRow = page.locator('tbody tr').filter({ hasText: code })
    await expect(persistedRow).toContainText('Activo E2E editado')
    await expect(persistedRow).toContainText('Activo')
    await expect(persistedRow).toContainText('Sin eventos programados')
    expect(consoleIssues).toEqual([])
  })

  test('duplicates an asset with copied properties, a fresh default status, and new unique identifiers', async ({ page, consoleIssues }) => {
    const sourceResponse = await page.request.get('/api/assets?search=CP-02&limit=1')
    const source = (await sourceResponse.json() as { data: Array<{ code: string; typeId: number; statusId: number; locationId: number; responsibleId: number; installDate: string }> }).data[0]
    expect(source.code).toBe('CP-02')
    const statusesResponse = await page.request.get('/api/statuses')
    const statuses = (await statusesResponse.json()) as Array<{ id: number; name: string }>
    const activeStatusId = statuses.find((status) => status.name === 'Activo')!.id
    // Premisa: el origen está «Fuera de servicio»; el duplicado debe nacer con el
    // estado por defecto de un activo nuevo (Activo), no heredar el ciclo de vida.
    expect(activeStatusId).not.toBe(source.statusId)
    await goToAssets(page)
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('CP-02')
    const sourceRow = page.locator('tbody tr').filter({ hasText: 'CP-02' })
    const actionsButton = sourceRow.getByRole('button', { name: 'Acciones de CP-02' })
    const tableScroller = sourceRow.locator('xpath=ancestor::div[contains(@class, "overflow-x-auto")][1]')
    const scrollHeightBefore = await tableScroller.evaluate((element) => element.scrollHeight)
    await actionsButton.click()
    const actionsMenu = page.getByRole('menu')
    await expect(actionsMenu).toBeVisible()
    expect(await actionsMenu.evaluate((element) => element.parentElement === document.body)).toBe(true)
    expect(await tableScroller.evaluate((element) => element.scrollHeight)).toBe(scrollHeightBefore)
    await page.keyboard.press('Escape')
    await expect(actionsMenu).toHaveCount(0)
    await actionsButton.click()
    await page.getByRole('menuitem', { name: 'Duplicar', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Duplicar activo' })
    await expect(dialog.locator('#asset-code')).toHaveValue('')
    await expect(dialog.locator('#asset-name')).toHaveValue('Compresor Atlas Copco GA37')
    await expect(dialog.locator('#asset-serial-number')).toHaveValue('')
    await expect(dialog.getByLabel('Etiqueta de serie')).toHaveCount(0)
    await expect(dialog.locator('#asset-install-date')).toHaveValue('2021-03-12')
    await expect(dialog.locator('#asset-location')).toHaveValue(/\d+/)
    await expect(dialog.locator('#asset-type')).toHaveValue(/\d+/)
    await expect(dialog.locator('#asset-status')).toHaveValue(String(activeStatusId))
    await expect(dialog.locator('#asset-initials')).toHaveValue('CP')

    await dialog.locator('#asset-code').fill('CP-DUP-E2E')
    await dialog.locator('#asset-serial-number').fill('AC-37-2021-04')
    const conflictResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/assets'))
    await dialog.getByRole('button', { name: 'Crear duplicado', exact: true }).click()
    expect((await conflictResponse).status()).toBe(409)
    await expect(dialog.getByRole('alert')).toContainText('código o número de serie')
    const expectedConflictIssue = consoleIssues.findIndex((issue) => issue.includes('409 (Conflict)'))
    expect(expectedConflictIssue).toBeGreaterThanOrEqual(0)
    consoleIssues.splice(expectedConflictIssue, 1)

    await dialog.locator('#asset-serial-number').fill('AC-37-2021-04-DUP')
    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/assets'))
    await dialog.getByRole('button', { name: 'Crear duplicado', exact: true }).click()
    const createdResponse = await createResponse
    expect(createdResponse.status()).toBe(201)
    const created = await createdResponse.json() as { id: number; code: string; name: string; serialNumber: string; installDate: string; typeId: number; statusId: number; locationId: number; responsibleId: number; documentCount: number; eventCount: number }
    expect(created).toMatchObject({
      code: 'CP-DUP-E2E',
      name: 'Compresor Atlas Copco GA37',
      serialNumber: 'AC-37-2021-04-DUP',
      installDate: source.installDate,
      typeId: source.typeId,
      statusId: activeStatusId,
      locationId: source.locationId,
      responsibleId: source.responsibleId,
      documentCount: 0,
      eventCount: 0,
    })

    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Compresor Atlas Copco GA37' })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    const duplicatedItemResponse = page.waitForResponse((response) => response.url().includes('search=CP-DUP-E2E') && response.url().includes('/api/assets?'))
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('CP-DUP-E2E')
    await duplicatedItemResponse
    const row = page.locator('tbody tr').filter({ hasText: 'CP-DUP-E2E' })
    await expect(row).toContainText('Compresor Atlas Copco GA37')
    await expect(row).toContainText('SN: AC-37-2021-04-DUP')
    expect(consoleIssues).toEqual([])
  })

  test('uploads, versions, downloads, persists, and detaches a document from an asset', async ({ page, consoleIssues }) => {
    const firstBytes = Buffer.from('DOCUCORE-DOCUMENT-V1-KNOWN-BYTES')
    const secondBytes = Buffer.from('DOCUCORE-DOCUMENT-V2-KNOWN-BYTES')
    const asset = await page.request.get('/api/assets?search=AST-001&limit=1')
    const assetBody = await asset.json()
    const assetId = assetBody.data[0].id as number

    await page.goto('/docs')
    await expect(page.getByRole('heading', { name: 'Documentos', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Subir documento', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Subir documento' })
    await dialog.getByLabel('Nombre').fill('Certificado E2E Documento-Activo')
    await dialog.getByLabel('Tipo').selectOption({ label: 'Certificado' })
    await dialog.getByLabel('Activos asociados').fill('AST-001')
    await page.getByRole('option', { name: /AST-001 · Activo industrial 001/ }).click()
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

    await goToAssets(page)
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('AST-001')
    await page.locator('tbody tr').filter({ hasText: 'AST-001' }).click()
    const assetDialog = page.getByRole('dialog', { name: /Activo industrial 001/ })
    await expect(assetDialog.getByText('Próximos eventos', { exact: true })).toBeVisible()
    await expect(assetDialog.getByText('Certificado E2E Documento-Activo', { exact: true })).toBeVisible()
    await assetDialog.getByRole('button', { name: /Documentos.*1/ }).click()
    await expect(assetDialog.getByText('Certificado E2E Documento-Activo v1', { exact: true })).toBeVisible()
    await assetDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click()

    await page.goto('/docs')
    await page.getByText('Certificado E2E Documento-Activo', { exact: true }).click()
    const manageDialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    await expect(manageDialog.getByText('v1 · known-v1.pdf', { exact: true })).toBeVisible()
    await manageDialog.getByLabel('Vencimiento (opcional)').fill('2026-09-20')
    const versionResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/api/documents/${documentId}/versions`))
    await manageDialog.getByLabel('Nueva versión').setInputFiles({ name: 'known-v2.pdf', mimeType: 'application/pdf', buffer: secondBytes })
    expect((await versionResponse).status()).toBe(201)
    await expect(manageDialog.getByText('v2 · known-v2.pdf', { exact: true })).toBeVisible()
    await expect(manageDialog.getByText('v1 · known-v1.pdf', { exact: true })).toBeVisible()
    const historicalDownload = await page.request.get(`/api/documents/${documentId}/versions/1/download`)
    expect(await historicalDownload.body()).toEqual(firstBytes)
    const latestDownload = await page.request.get(`/api/documents/${documentId}/download`)
    expect(await latestDownload.body()).toEqual(secondBytes)
    await page.reload()
    await expect(page.getByText('Certificado E2E Documento-Activo', { exact: true })).toBeVisible()

    const itemAfterVersion = await page.request.get(`/api/assets/${assetId}`)
    const itemAfterVersionBody = await itemAfterVersion.json()
    expect(itemAfterVersionBody.documentCount).toBe(1)
    expect(itemAfterVersionBody.nextEvents).toEqual(expect.arrayContaining([expect.objectContaining({ id: `document:${documentId}`, date: '2026-09-20T00:00:00.000Z' })]))

    await page.getByText('Certificado E2E Documento-Activo', { exact: true }).click()
    const detachDialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    await detachDialog.getByLabel('Quitar AST-001 · Activo industrial 001').click()
    const detachResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().endsWith(`/api/documents/${documentId}`))
    await detachDialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    expect((await detachResponse).status()).toBe(200)
    const detachedAsset = await page.request.get(`/api/assets/${assetId}`)
    const detachedAssetBody = await detachedAsset.json()
    expect(detachedAssetBody.documentCount).toBe(0)
    expect(detachedAssetBody.nextEvents).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: `document:${documentId}` })]))
    expect(consoleIssues).toEqual([])
  })

  test('links an existing document and creates a new one from the asset ficha', async ({ page, consoleIssues }) => {
    const docName = `E2E Vincular ${Date.now()}`
    const newDocName = `${docName} nuevo`
    const bytes = Buffer.from('DOCUCORE-LINK-KNOWN-BYTES')
    const asset = await page.request.get('/api/assets?search=AST-001&limit=1')
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

    await goToAssets(page)
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('AST-001')
    await page.locator('tbody tr').filter({ hasText: 'AST-001' }).click()
    const assetDialog = page.getByRole('dialog', { name: /Activo industrial 001/ })
    await assetDialog.getByRole('button', { name: /^Documentos/ }).click()
    await assetDialog.getByRole('button', { name: 'Vincular documento' }).click()
    const linkDialog = page.getByRole('dialog', { name: 'Vincular documento' })
    await linkDialog.getByLabel('Buscar documento').fill(docName)
    await page.getByRole('option', { name: new RegExp(docName) }).click()
    await expect(linkDialog).toBeHidden()
    await expect(assetDialog.getByText(`${docName} v1`, { exact: true })).toBeVisible()

    const linkedAsset = await page.request.get(`/api/assets/${assetId}`)
    const linkedBody = await linkedAsset.json()
    expect(linkedBody.documentCount).toBe(before + 1)
    expect(linkedBody.nextEvents).toEqual(expect.arrayContaining([expect.objectContaining({ id: `document:${documentId}` })]))

    await assetDialog.getByRole('button', { name: 'Nuevo documento' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Subir documento' })
    await expect(createDialog.getByLabel('Quitar AST-001 · Activo industrial 001')).toBeVisible()
    await createDialog.getByLabel('Nombre').fill(newDocName)
    await createDialog.getByLabel('Emisión').fill('2026-08-01')
    await createDialog.getByLabel('Vencimiento (opcional)').fill('2026-12-31')
    await createDialog.getByLabel('Fichero').setInputFiles({ name: 'nuevo.pdf', mimeType: 'application/pdf', buffer: bytes })
    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/documents'))
    await createDialog.getByRole('button', { name: 'Subir documento', exact: true }).last().click()
    expect((await createResponse).status()).toBe(201)
    await expect(assetDialog.getByText(`${newDocName} v1`, { exact: true })).toBeVisible()

    const finalAsset = await page.request.get(`/api/assets/${assetId}`)
    expect((await finalAsset.json()).documentCount).toBe(before + 2)
    expect(consoleIssues).toEqual([])
  })

  test('persists an edited document expiry and exposes it as the linked asset next event', async ({ page, consoleIssues }) => {
    const suffix = Date.now().toString().slice(-6)
    const code = `EVT-${suffix}`
    const documentName = `Vencimiento editable ${suffix}`
    await createSeededAsset(page, code)

    const createResponse = await page.request.post('/api/documents', {
      multipart: {
        file: { name: 'editable-expiry.pdf', mimeType: 'application/pdf', buffer: Buffer.from('DOCUCORE-EDITABLE-EXPIRY') },
        name: documentName,
        type: 'Certificado',
        projectId: 1,
        issueDate: '2026-07-01',
      },
    })
    expect(createResponse.status()).toBe(201)
    const created = await createResponse.json() as { id: number }

    await page.goto('/docs')
    await page.getByText(documentName, { exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    await dialog.getByLabel('Activos asociados').fill(code)
    await page.getByRole('option', { name: new RegExp(code) }).click()
    await dialog.getByLabel('Vencimiento (opcional)').fill('2026-07-20')
    const updateResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().endsWith(`/api/documents/${created.id}`))
    await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    const updatedResponse = await updateResponse
    expect(updatedResponse.status()).toBe(200)
    const updated = await updatedResponse.json() as { assets: Array<{ code: string }>; currentVersion: { expiryDate: string | null } }
    expect(updated.assets.some((asset) => asset.code === code)).toBe(true)
    expect(updated.currentVersion.expiryDate).toBe('2026-07-20T00:00:00.000Z')

    const documentRow = page.locator('tbody tr').filter({ hasText: documentName })
    await expect(documentRow).toContainText(code)
    await expect(documentRow).toContainText('20/07/2026')

    await goToAssets(page)
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(code)
    const itemRow = page.locator('tbody tr').filter({ hasText: code })
    await expect(itemRow).toContainText(documentName)
    await expect(itemRow).toContainText('20/07/2026')
    await itemRow.click()
    const assetDialog = page.getByRole('dialog', { name: new RegExp(`Activo de paginación ${code}`) })
    await expect(assetDialog.getByText(documentName, { exact: true })).toBeVisible()
    await expect(assetDialog.getByText(/20\/07\/2026/)).toBeVisible()
    expect(consoleIssues).toEqual([])
  })

  test('associates a document with multiple assets, opens it from the whole row, and keeps the other link when removing one', async ({ page, consoleIssues }) => {
    const documentName = `Multi activo ${Date.now()}`
    const bytes = Buffer.from('DOCUCORE-MULTI-ASSET')
    const firstAsset = await page.request.get('/api/assets?search=AST-001&limit=1')
    const firstAssetId = ((await firstAsset.json()).data[0].id) as number
    const secondAsset = await page.request.get('/api/assets?search=CNC-05&limit=1')
    const secondAssetId = ((await secondAsset.json()).data[0].id) as number

    await page.goto('/docs')
    await page.getByRole('button', { name: 'Subir documento', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Subir documento' })
    await dialog.getByLabel('Nombre').fill(documentName)
    await dialog.getByLabel('Tipo').selectOption({ label: 'Manual' })
    await dialog.getByLabel('Activos asociados').fill('AST-001')
    await page.getByRole('option', { name: /AST-001 · Activo industrial 001/ }).click()
    await dialog.getByLabel('Activos asociados').fill('CNC-05')
    await page.getByRole('option', { name: /CNC-05 · Torno CNC Haas ST-20/ }).click()
    await dialog.getByLabel('Emisión').fill('2026-07-15')
    await dialog.getByLabel('Fichero').setInputFiles({ name: 'multi.pdf', mimeType: 'application/pdf', buffer: bytes })
    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/documents'))
    await dialog.getByRole('button', { name: 'Subir documento', exact: true }).last().click()
    const createdResponse = await createResponse
    expect(createdResponse.status()).toBe(201)
    const created = await createdResponse.json() as { id: number; assets: Array<{ code: string }> }
    expect(created.assets.map((asset) => asset.code).sort()).toEqual(['AST-001', 'CNC-05'])

    const row = page.locator('tbody tr').filter({ hasText: documentName })
    await expect(row).toContainText('AST-001 · Activo industrial 001')
    await expect(row).toContainText('CNC-05 · Torno CNC Haas ST-20')
    await row.click()
    const manageDialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    await expect(manageDialog.getByLabel('Quitar AST-001 · Activo industrial 001')).toBeVisible()
    await expect(manageDialog.getByLabel('Quitar CNC-05 · Torno CNC Haas ST-20')).toBeVisible()

    for (const assetId of [firstAssetId, secondAssetId]) {
      const asset = await page.request.get(`/api/assets/${assetId}`)
      const itemBody = await asset.json()
      expect(itemBody.documents.some((document: { id: number }) => document.id === created.id)).toBe(true)
    }

    await manageDialog.getByLabel('Quitar CNC-05 · Torno CNC Haas ST-20').click()
    const updateResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().endsWith(`/api/documents/${created.id}`))
    await manageDialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    expect((await updateResponse).status()).toBe(200)
    const removedAsset = await page.request.get(`/api/assets/${secondAssetId}`)
    expect((await removedAsset.json()).documents.some((document: { id: number }) => document.id === created.id)).toBe(false)
    const keptAsset = await page.request.get(`/api/assets/${firstAssetId}`)
    expect((await keptAsset.json()).documents.some((document: { id: number }) => document.id === created.id)).toBe(true)
    expect(consoleIssues).toEqual([])
  })

  test('does not expose the SPA fallback under /api routes', async ({ page, consoleIssues }) => {
    const response = await page.request.get('/api/not-found')

    expect(response.status()).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(consoleIssues).toEqual([])
  })
})
