import { expect, test } from './fixtures'
import { minimalPdf } from './pdf'

// Acciones masivas (bulk): selección múltiple en tablas de Activos y Documentos.
// Las acciones del menú ⋯ de una fila deben estar también disponibles como acción masiva.

async function createAsset(page: import('@playwright/test').Page, code: string, serialNumber: string): Promise<{ id: number }> {
  const [typesRes, statusesRes] = await Promise.all([
    page.request.get('/api/asset-types'),
    page.request.get('/api/statuses'),
  ])
  const types = await typesRes.json() as Array<{ id: number; name: string }>
  const statuses = await statusesRes.json() as Array<{ id: number; name: string }>
  const response = await page.request.post('/api/assets', {
    data: {
      code,
      name: `Activo bulk ${code}`,
      serialNumber,
      installDate: '2026-07-15',
      typeId: types[0].id,
      statusId: statuses[0].id,
      locationId: 1,
      projectId: 1,
      responsibleId: 1,
      initials: 'QB',
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()) as { id: number }
}

async function createDocument(page: import('@playwright/test').Page, name: string): Promise<{ id: number }> {
  const bytes = minimalPdf()
  const response = await page.request.post('/api/documents', {
    multipart: {
      name,
      type: 'Manual',
      projectId: '1',
      assetIds: JSON.stringify([]),
      issueDate: '2026-07-15',
      file: { name: 'bulk.pdf', mimeType: 'application/pdf', buffer: bytes },
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()) as { id: number }
}

async function searchAssetsAndWait(page: import('@playwright/test').Page, text: string): Promise<void> {
  const response = page.waitForResponse((r) => r.url().includes('/api/assets?') && r.request().method() === 'GET')
  await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(text)
  await response
}

async function searchTrashAndWait(page: import('@playwright/test').Page, text: string): Promise<void> {
  const response = page.waitForResponse((r) => r.url().includes('/api/assets?') && r.request().method() === 'GET')
  await page.getByPlaceholder('Buscar en la papelera por nombre, código o serie…').fill(text)
  await response
}

test.describe.serial('bulk actions', () => {
  test('bulk delete and restore assets through the UI', async ({ page }) => {
    await createAsset(page, 'QA-BK-ONE', 'QA-BK-ONE-SN')
    await createAsset(page, 'QA-BK-TWO', 'QA-BK-TWO-SN')

    // Seleccionar ambos activos y eliminar en bloque.
    await page.goto('/assets')
    await searchAssetsAndWait(page, 'QA-BK')

    // El header checkbox selecciona todos los de la página.
    await page.locator('thead input[type="checkbox"]').first().click()
    await expect(page.getByText(/2 seleccionados/)).toBeVisible()

    // Acción masiva: Eliminar (soft delete → papelera).
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
    const deleteDialog = page.getByRole('dialog', { name: 'Eliminar activo' })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await expect(page.locator('tbody tr', { hasText: 'QA-BK-ONE' })).toHaveCount(0)
    await expect(page.locator('tbody tr', { hasText: 'QA-BK-TWO' })).toHaveCount(0)

    // Ir a la papelera, seleccionar y restaurar en bloque.
    await page.getByRole('button', { name: /Papelera/ }).click()
    await searchTrashAndWait(page, 'QA-BK')

    await page.locator('thead input[type="checkbox"]').first().click()
    await expect(page.getByText(/2 seleccionados/)).toBeVisible()
    const restoreResponse = page.waitForResponse((r) => r.url().includes('/api/assets/') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Restaurar', exact: true }).click()
    await restoreResponse

    // Volver a activos: los dos están de vuelta.
    const listResponse = page.waitForResponse((r) => r.url().includes('/api/assets?') && r.request().method() === 'GET')
    await page.getByRole('button', { name: 'Volver a activos' }).click()
    await listResponse
    await searchAssetsAndWait(page, 'QA-BK')
    await expect(page.locator('tbody tr', { hasText: 'QA-BK-ONE' })).toHaveCount(1)
    await expect(page.locator('tbody tr', { hasText: 'QA-BK-TWO' })).toHaveCount(1)
  })

  test('bulk purge assets from the trash with confirmation', async ({ page }) => {
    await createAsset(page, 'QA-BP-ONE', 'QA-BP-ONE-SN')

    // Eliminar primero (soft delete) vía API para tenerlo en la papelera.
    const asset = await createAsset(page, 'QA-BP-TWO', 'QA-BP-TWO-SN')
    await page.request.post(`/api/assets/${asset.id}/restore`)
    await page.request.delete(`/api/assets/${asset.id}`)

    await page.goto('/assets')
    await page.getByRole('button', { name: /Papelera/ }).click()
    await searchTrashAndWait(page, 'QA-BP')

    await page.locator('thead input[type="checkbox"]').first().click()
    await page.getByRole('button', { name: 'Eliminar definitivamente' }).click()
    const purgeDialog = page.getByRole('dialog', { name: 'Eliminar definitivamente' })
    await expect(purgeDialog).toBeVisible()
    await purgeDialog.getByRole('button', { name: 'Eliminar definitivamente' }).click()
    await expect(purgeDialog).toBeHidden()

    // Confirmar que ya no están en la papelera.
    await expect(page.locator('tbody tr', { hasText: 'QA-BP-ONE' })).toHaveCount(0)
    await expect(page.locator('tbody tr', { hasText: 'QA-BP-TWO' })).toHaveCount(0)
  })

  test('bulk delete documents through the UI', async ({ page }) => {
    const docOne = await createDocument(page, 'QA-BULK-DOC-ONE')
    const docTwo = await createDocument(page, 'QA-BULK-DOC-TWO')

    await page.goto('/docs')
    await expect(page.locator('tbody tr', { hasText: 'QA-BULK-DOC-ONE' })).toBeVisible()

    // Seleccionar los dos documentos de test mediante sus checkboxes individuales.
    await page.locator('tbody tr', { hasText: 'QA-BULK-DOC-ONE' }).locator('input[type="checkbox"]').check()
    await page.locator('tbody tr', { hasText: 'QA-BULK-DOC-TWO' }).locator('input[type="checkbox"]').check()
    await expect(page.getByText(/2 seleccionados/)).toBeVisible()
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click()

    const deleteDialog = page.getByRole('dialog', { name: 'Eliminar documento' })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await expect(deleteDialog).toBeHidden()

    // Ambos desaparecen de la lista.
    await expect(page.locator('tbody tr', { hasText: 'QA-BULK-DOC-ONE' })).toHaveCount(0)
    await expect(page.locator('tbody tr', { hasText: 'QA-BULK-DOC-TWO' })).toHaveCount(0)

    // Confirmar server-side que ya no existen.
    const checkOne = await page.request.get(`/api/documents/${docOne.id}`)
    expect(checkOne.status()).toBe(404)
    const checkTwo = await page.request.get(`/api/documents/${docTwo.id}`)
    expect(checkTwo.status()).toBe(404)
  })
  // Nota: el menú ⋯ de fila (RowActionsMenu) se verifica en z-trash.spec.ts
  // para activos; el componente es compartido por DocumentsTable.
})
