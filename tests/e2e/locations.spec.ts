import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

type LocationRow = { id: number; name: string; code: string }

async function goToLocations(page: Page): Promise<void> {
  const response = page.waitForResponse((candidate) => candidate.url().includes('/api/locations') && candidate.request().method() === 'GET')
  await page.goto('/locations')
  await response
  await expect(page.getByRole('heading', { name: 'Ubicaciones', exact: true })).toBeVisible()
}

async function createLocationViaApi(page: Page, data: { name: string; code: string; surface: string; parentId?: number | null; label?: string }): Promise<LocationRow> {
  const usersResponse = await page.request.get('/api/users')
  const users = await usersResponse.json() as Array<{ id: number }>
  const response = await page.request.post('/api/locations', {
    data: {
      name: data.name,
      code: data.code,
      surface: data.surface,
      parentId: data.parentId ?? null,
      responsibleId: users[0].id,
      projectId: 1,
      ...(data.label ? { label: data.label } : {}),
    },
  })
  expect(response.status(), `Failed to create location ${data.code}`).toBe(201)
  return await response.json() as LocationRow
}

test.describe('Locations', () => {
  test.describe.configure({ mode: 'serial' })

  test('renders the project tree with seeded locations', async ({ page, consoleIssues }) => {
    await goToLocations(page)

    // Nodo raíz del proyecto con el total de activos.
    await expect(page.locator('summary', { hasText: 'Planta Industrial Norte' })).toBeVisible()
    // Ramas del prototipo.
    await expect(page.locator('summary', { hasText: 'Nave Principal' })).toBeVisible()
    await expect(page.locator('summary', { hasText: 'Anexo Oficinas' })).toBeVisible()
    await expect(page.locator('summary', { hasText: 'Almacén exterior' })).toBeVisible()
    // Hojas visibles con sus conteos del prototipo.
    await expect(page.locator('a', { hasText: 'Planta 1 · Nave A' })).toBeVisible()
    await expect(page.locator('a', { hasText: 'Sala compresores' })).toBeVisible()
    await expect(page.locator('a', { hasText: 'Laboratorio' })).toBeVisible()
    // Toda ubicación es visible al expandir su rama (sin nodos ocultos).
    await page.locator('summary', { hasText: 'Planta 1 · Nave B' }).click()
    await expect(page.locator('a', { hasText: 'Pasillo 3' })).toBeVisible()

    expect(consoleIssues).toEqual([])
  })

  test('shows the detail of a selected location from the API', async ({ page, consoleIssues }) => {
    await goToLocations(page)

    await page.locator('a', { hasText: 'Planta 1 · Nave A' }).click()

    await expect(page.getByRole('heading', { name: 'Planta 1 · Nave A', exact: true })).toBeVisible()
    await expect(page.getByText('PIN-NA-01A', { exact: true })).toBeVisible()
    await expect(page.getByText('840 m²', { exact: true })).toBeVisible()
    await expect(page.getByText('J. Ramírez', { exact: true })).toBeVisible()
    // El activo canónico de Nave A aparece en el detalle.
    await expect(page.getByText('CNC-05 · Torno CNC Haas ST-20', { exact: true })).toBeVisible()

    expect(consoleIssues).toEqual([])
  })

  test('creates, edits and persists a location through the UI', async ({ page, consoleIssues }) => {
    const code = `E2E-${Date.now().toString().slice(-6)}`
    await goToLocations(page)

    await page.getByRole('button', { name: 'Nueva ubicación', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Nueva ubicación' })
    await expect(dialog).toBeVisible()

    await dialog.locator('#location-name').fill('Sala de pruebas E2E')
    await dialog.locator('#location-code').fill(code)
    await dialog.locator('#location-surface').fill('99 m²')
    await dialog.locator('#location-responsible').selectOption({ label: 'J. Ramírez' })

    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/locations'))
    await dialog.getByRole('button', { name: 'Crear ubicación', exact: true }).click()
    expect((await createResponse).status()).toBe(201)
    await expect(dialog).toHaveCount(0)

    // La nueva ubicación aparece en el árbol.
    await expect(page.locator('a', { hasText: 'Sala de pruebas E2E' })).toBeVisible()

    // Persistencia tras recarga.
    await page.reload()
    await expect(page.locator('a', { hasText: 'Sala de pruebas E2E' })).toBeVisible()

    // Edición de la ubicación recién creada.
    await page.locator('a', { hasText: 'Sala de pruebas E2E' }).click()
    await expect(page.getByRole('heading', { name: 'Sala de pruebas E2E', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Editar', exact: true }).click()
    const editDialog = page.getByRole('dialog', { name: 'Editar ubicación' })
    await expect(editDialog).toBeVisible()
    await editDialog.locator('#location-surface').fill('120 m²')
    const updateResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes('/api/locations/'))
    await editDialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    expect((await updateResponse).status()).toBe(200)
    await expect(editDialog).toHaveCount(0)
    await expect(page.getByText('120 m²', { exact: true })).toBeVisible()

    expect(consoleIssues).toEqual([])
  })

  test('builds a hierarchy of locations', async ({ page, consoleIssues }) => {
    const suffix = Date.now().toString().slice(-6)
    const parent = await createLocationViaApi(page, { name: `Nave E2E ${suffix}`, code: `NAV-${suffix}`, surface: '500 m²' })
    await createLocationViaApi(page, { name: `Zona E2E ${suffix}`, code: `ZON-${suffix}`, surface: '50 m²', parentId: parent.id })

    await goToLocations(page)

    // La rama creada aparece en el árbol.
    const branch = page.locator('summary', { hasText: `Nave E2E ${suffix}` })
    await expect(branch).toBeVisible()

    // Al expandirla se muestra la ubicación hija anidada.
    await branch.click()
    await expect(page.locator('a', { hasText: `Zona E2E ${suffix}` })).toBeVisible()

    expect(consoleIssues).toEqual([])
  })

  test('keeps the location label in sync when renamed, preserving custom labels', async ({ page }) => {
    const suffix = Date.now().toString().slice(-6)

    // Sin label personalizado: el label sigue al nuevo nombre al renombrar.
    const follow = await createLocationViaApi(page, { name: `Sala QA ${suffix}`, code: `QA-LBL-${suffix}`, surface: '10 m²' })
    const followRename = await page.request.put(`/api/locations/${follow.id}`, { data: { name: `Sala QA renombrada ${suffix}` } })
    expect(followRename.status()).toBe(200)
    expect(((await followRename.json()) as { label: string }).label).toBe(`Sala QA renombrada ${suffix}`)

    // Con label personalizado: se conserva al renombrar.
    const custom = await createLocationViaApi(page, { name: `Almacén QA ${suffix}`, code: `QA-LBC-${suffix}`, surface: '20 m²', label: `Ficha QA ${suffix}` })
    const customRename = await page.request.put(`/api/locations/${custom.id}`, { data: { name: `Almacén QA nuevo ${suffix}` } })
    expect(customRename.status()).toBe(200)
    expect(((await customRename.json()) as { label: string }).label).toBe(`Ficha QA ${suffix}`)

    // Un label explícito en el PUT siempre tiene prioridad sobre la regla.
    const explicit = await page.request.put(`/api/locations/${follow.id}`, { data: { label: `Etiqueta explícita ${suffix}` } })
    expect(explicit.status()).toBe(200)
    expect(((await explicit.json()) as { label: string }).label).toBe(`Etiqueta explícita ${suffix}`)

    // Limpieza para no alterar el árbol del resto de la suite.
    expect((await page.request.delete(`/api/locations/${follow.id}`)).status()).toBe(204)
    expect((await page.request.delete(`/api/locations/${custom.id}`)).status()).toBe(204)
  })

  test('assigns a location to an asset from the asset form', async ({ page, consoleIssues }) => {
    await page.goto('/assets')
    await expect(page.getByText('CNC-05', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Nuevo activo', exact: true }).last().click()
    const dialog = page.getByRole('dialog', { name: 'Nuevo activo' })
    await expect(dialog).toBeVisible()

    // El selector de ubicación carga las ubicaciones reales desde el API.
    const locationSelect = dialog.locator('#asset-location')
    await expect(locationSelect).toBeVisible()
    await expect(locationSelect.locator('option', { hasText: 'Planta 1 · Nave A' })).toHaveCount(1)
    await expect(locationSelect.locator('option', { hasText: 'Planta 1 · Laboratorio' })).toHaveCount(1)

    await dialog.locator('#asset-code').fill('LOC-E2E-1')
    await dialog.locator('#asset-name').fill('Activo con ubicación E2E')
    await dialog.locator('#asset-serial-number').fill('LOC-SN-1')
    await dialog.locator('#asset-install-date').fill('2026-07-15')
    await locationSelect.selectOption({ label: 'Planta 1 · Laboratorio' })
    await dialog.locator('#asset-type').selectOption({ label: 'Instrumento' })
    await dialog.locator('#asset-status').selectOption({ label: 'Activo' })
    await dialog.locator('#asset-initials').fill('LE')

    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/assets'))
    await dialog.getByRole('button', { name: 'Crear activo', exact: true }).click()
    expect((await createResponse).status()).toBe(201)
    const created = await (await createResponse).json()
    expect(created.locationId).toBeGreaterThan(0)
    expect(created.location.label).toBe('Planta 1 · Laboratorio')

    // Limpieza: el conteo de activos se valida en otros tests de la suite.
    const deleteResponse = await page.request.delete(`/api/assets/${created.id}`)
    expect(deleteResponse.status()).toBe(204)

    expect(consoleIssues).toEqual([])
  })

  test('creates a location from the asset form and selects it (UX-03)', async ({ page, consoleIssues }) => {
    await page.goto('/assets')
    await expect(page.getByText('CNC-05', { exact: true })).toBeVisible()

    // El alta de activos se abre desde el botón único de la cabecera.
    await page.getByRole('button', { name: 'Nuevo activo', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Nuevo activo' })
    await expect(dialog).toBeVisible()

    // UX-03: el campo de ubicación ofrece crear una ubicación nueva sin salir del formulario.
    const locationSelect = dialog.locator('#asset-location')
    await expect(locationSelect.locator('option', { hasText: 'Crear nueva ubicación' })).toHaveCount(1)
    await locationSelect.selectOption('__new__')
    const locationForm = page.getByRole('dialog', { name: 'Nueva ubicación' })
    await expect(locationForm).toBeVisible()

    await locationForm.locator('#location-name').fill('Sala UX-03')
    await locationForm.locator('#location-code').fill('UX-03-SALA')
    await locationForm.locator('#location-surface').fill('40 m²')
    // Responsable precargado con el del formulario de activo; sin padre al no haber selección previa.
    await expect(locationForm.locator('#location-responsible')).not.toHaveValue('')
    await expect(locationForm.locator('#location-parent')).toHaveValue('')

    const locationResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/locations'))
    await locationForm.getByRole('button', { name: 'Crear ubicación', exact: true }).click()
    expect((await locationResponse).status()).toBe(201)

    // El alta se cierra, la ubicación queda seleccionada y el formulario de activo sigue abierto.
    await expect(locationForm).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await expect(locationSelect).not.toHaveValue('')

    await dialog.locator('#asset-code').fill('UX03-ASSET-1')
    await dialog.locator('#asset-name').fill('Activo creado con ubicación UX-03')
    await dialog.locator('#asset-serial-number').fill('UX03-SN-1')
    await dialog.locator('#asset-install-date').fill('2026-07-15')
    await dialog.locator('#asset-type').selectOption({ label: 'Instrumento' })
    await dialog.locator('#asset-status').selectOption({ label: 'Activo' })
    await dialog.locator('#asset-initials').fill('UX')

    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/assets'))
    await dialog.getByRole('button', { name: 'Crear activo', exact: true }).click()
    expect((await createResponse).status()).toBe(201)
    const created = await (await createResponse).json()
    expect(created.location.label).toBe('Sala UX-03')

    // Limpieza: el activo pasa a la papelera y se purga (la FK Restrict de la
    // ubicación cuenta los activos en papelera), y luego se borra la ubicación.
    const deleteAssetResponse = await page.request.delete(`/api/assets/${created.id}`)
    expect(deleteAssetResponse.status()).toBe(204)
    const purgeAssetResponse = await page.request.post(`/api/assets/${created.id}/purge`)
    expect(purgeAssetResponse.status()).toBe(204)
    const locationsBody = await (await page.request.get('/api/locations')).json() as { locations: LocationRow[] }
    const createdLocation = locationsBody.locations.find((location) => location.code === 'UX-03-SALA')
    expect(createdLocation).toBeDefined()
    const deleteLocationResponse = await page.request.delete(`/api/locations/${createdLocation!.id}`)
    expect(deleteLocationResponse.status()).toBe(204)

    expect(consoleIssues).toEqual([])
  })

  test('opens the asset ficha from the location detail without leaving the view (LOC-02)', async ({ page, consoleIssues }) => {
    await goToLocations(page)
    await page.locator('a', { hasText: 'Planta 1 · Nave A' }).click()
    await expect(page.getByRole('heading', { name: 'Planta 1 · Nave A', exact: true })).toBeVisible()

    // El activo del detalle abre la misma ficha que en Activos.
    await page.getByRole('button', { name: /CNC-05 · Torno CNC Haas ST-20/ }).click()
    const modal = page.getByRole('dialog', { name: 'Torno CNC Haas ST-20' })
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Torno CNC Haas ST-20', exact: true })).toBeVisible()
    // Paridad con Activos: próximo evento derivado de las relaciones.
    await expect(modal.getByText('Mantenimiento preventivo trimestral', { exact: true })).toBeVisible()

    // Cerrar con Escape vuelve a Ubicaciones, sin navegar.
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Ubicaciones', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Planta 1 · Nave A', exact: true })).toBeVisible()

    expect(consoleIssues).toEqual([])
  })

  test('edits an asset from the ficha and refreshes the location detail (LOC-02)', async ({ page, consoleIssues }) => {
    const newName = `Bomba hidráulica ${Date.now().toString().slice(-6)}`
    await goToLocations(page)
    await page.locator('a', { hasText: 'Planta 1 · Nave A' }).click()
    await expect(page.getByRole('heading', { name: 'Planta 1 · Nave A', exact: true })).toBeVisible()

    // BH-04 es uno de los activos del preview del detalle de Nave A.
    await page.getByRole('button', { name: /BH-04 · Bomba hidráulica/ }).click()
    const modal = page.getByRole('dialog', { name: 'Bomba hidráulica' })
    await expect(modal).toBeVisible()

    await modal.getByRole('button', { name: 'Editar', exact: true }).click()
    const form = page.getByRole('dialog', { name: 'Editar activo' })
    await expect(form).toBeVisible()
    await form.locator('#asset-name').fill(newName)
    const updateResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes('/api/assets/'))
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    expect((await updateResponse).status()).toBe(200)
    await expect(form).toHaveCount(0)
    // La ficha muestra el nombre guardado.
    await expect(modal.getByRole('heading', { name: newName, exact: true })).toBeVisible()

    // Al cerrar, el detalle de la ubicación refleja el cambio (refresco).
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Planta 1 · Nave A', exact: true })).toBeVisible()
    await expect(page.getByText(`BH-04 · ${newName}`, { exact: true })).toBeVisible()

    // Restauración del nombre canónico para el resto de la suite.
    const assetsBody = await (await page.request.get('/api/assets?search=BH-04&limit=100')).json() as { data: Array<{ id: number; code: string }> }
    const bh04 = assetsBody.data.find((asset) => asset.code === 'BH-04')
    expect(bh04).toBeDefined()
    expect((await page.request.put(`/api/assets/${bh04!.id}`, { data: { name: 'Bomba hidráulica' } })).status()).toBe(200)

    expect(consoleIssues).toEqual([])
  })
})
