import { expect, test } from '@playwright/test'

// ITEM-05: papelera por UI — eliminar desde la ficha y desde el menú de fila,
// restaurar y eliminar definitivamente (con confirmación). UX-02: el modal de
// activo abre siempre en «Resumen» y el listbox de «Activos asociados» viaja en
// un portal (el modal no lo recorta).

async function createAsset(page: import('@playwright/test').Page, code: string, serialNumber: string) {
  const [typesRes, statusesRes] = await Promise.all([
    page.request.get('/api/asset-types'),
    page.request.get('/api/statuses'),
  ])
  const types = await typesRes.json() as Array<{ id: number; name: string }>
  const statuses = await statusesRes.json() as Array<{ id: number; name: string }>
  const response = await page.request.post('/api/assets', {
    data: {
      code,
      name: `Activo papelera ${code}`,
      serialNumber,
      installDate: '2026-07-15',
      typeId: types[0].id,
      statusId: statuses[0].id,
      locationId: 1,
      projectId: 1,
      responsibleId: 1,
      initials: 'QA',
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()) as { id: number }
}

test.describe.serial('trash and modal fixes', () => {
  test('moves assets to the trash, restores and purges them through the UI', async ({ page }) => {
    const one = await createAsset(page, 'QA-TR-ONE', 'QA-TR-ONE-SN')
    await createAsset(page, 'QA-TR-TWO', 'QA-TR-TWO-SN')

    // Eliminar desde la ficha del activo.
    await page.goto('/assets')
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('QA-TR-ONE')
    await page.locator('tbody tr', { hasText: 'QA-TR-ONE' }).click()
    const assetDialog = page.getByRole('dialog', { name: 'Activo papelera QA-TR-ONE' })
    await expect(assetDialog).toBeVisible()
    await assetDialog.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await expect(assetDialog).toBeHidden()
    await expect(page.locator('tbody tr', { hasText: 'QA-TR-ONE' })).toHaveCount(0)

    // La papelera lo muestra con la fecha de eliminación.
    await page.getByRole('button', { name: /Papelera/ }).click()
    await page.getByPlaceholder('Buscar en la papelera por nombre, código o serie…').fill('QA-TR-ONE')
    const trashedRow = page.locator('tbody tr', { hasText: 'QA-TR-ONE' })
    await expect(trashedRow).toHaveCount(1)
    await expect(trashedRow.getByText(/Eliminado el/)).toBeVisible()

    // Restaurar: vuelve a la lista normal y sale de la papelera.
    await trashedRow.getByLabel('Acciones de QA-TR-ONE').click()
    await page.getByRole('menuitem', { name: 'Restaurar' }).click()
    await expect(trashedRow).toHaveCount(0)

    await page.getByRole('button', { name: 'Volver a activos' }).click()
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('QA-TR-ONE')
    await expect(page.locator('tbody tr', { hasText: 'QA-TR-ONE' })).toHaveCount(1)

    // Eliminar desde el menú de acciones de la fila.
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('QA-TR-TWO')
    const secondRow = page.locator('tbody tr', { hasText: 'QA-TR-TWO' })
    await expect(secondRow).toHaveCount(1)
    await secondRow.getByLabel('Acciones de QA-TR-TWO').click()
    await page.getByRole('menuitem', { name: 'Eliminar' }).click()
    await expect(secondRow).toHaveCount(0)

    // Eliminar definitivamente desde la papelera, con confirmación.
    await page.getByRole('button', { name: /Papelera/ }).click()
    await page.getByPlaceholder('Buscar en la papelera por nombre, código o serie…').fill('QA-TR-TWO')
    const purgedRow = page.locator('tbody tr', { hasText: 'QA-TR-TWO' })
    await expect(purgedRow).toHaveCount(1)
    await purgedRow.getByLabel('Acciones de QA-TR-TWO').click()
    await page.getByRole('menuitem', { name: 'Eliminar definitivamente' }).click()
    const confirmDialog = page.getByRole('dialog', { name: 'Eliminar definitivamente' })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Eliminar definitivamente' }).click()
    await expect(confirmDialog).toBeHidden()
    await expect(purgedRow).toHaveCount(0)

    // El activo purgado no reaparece en la lista normal.
    await page.getByRole('button', { name: 'Volver a activos' }).click()
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('QA-TR-TWO')
    await expect(page.locator('tbody tr', { hasText: 'QA-TR-TWO' })).toHaveCount(0)

    // Limpieza: devolver el activo restaurado al estado inicial de la BD E2E.
    await page.request.post(`/api/assets/${one.id}/purge`, {}).catch(() => undefined)
  })

  test('opens the asset dialog always on the Resumen tab', async ({ page }) => {
    // La suite z-locations-lifecycle resetea la BD a cero: creamos los activos.
    await createAsset(page, 'QA-TAB-ONE', 'QA-TAB-ONE-SN')
    await createAsset(page, 'QA-TAB-TWO', 'QA-TAB-TWO-SN')

    await page.goto('/assets')
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('QA-TAB-ONE')
    await page.locator('tbody tr', { hasText: 'QA-TAB-ONE' }).click()
    const dialog = page.getByRole('dialog', { name: 'Activo papelera QA-TAB-ONE' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Próximos eventos')).toBeVisible()

    // Navegar a la pestaña Documentos y cerrar.
    await dialog.getByRole('button', { name: /^Documentos/ }).click()
    await expect(dialog.getByRole('heading', { name: 'Documentos asociados' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Cerrar' }).last().click()
    await expect(dialog).toBeHidden()

    // Al abrir otro activo, el modal arranca en Resumen, no en la pestaña previa.
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill('QA-TAB-TWO')
    await page.locator('tbody tr', { hasText: 'QA-TAB-TWO' }).click()
    const secondDialog = page.getByRole('dialog', { name: 'Activo papelera QA-TAB-TWO' })
    await expect(secondDialog).toBeVisible()
    await expect(secondDialog.getByText('Próximos eventos')).toBeVisible()
    await expect(secondDialog.getByRole('heading', { name: 'Documentos asociados' })).toHaveCount(0)
    await secondDialog.getByRole('button', { name: 'Cerrar' }).last().click()
  })

  test('renders the asset picker listbox in a portal so the modal never clips it', async ({ page }) => {
    const asset = await createAsset(page, 'QA-PIK-ONE', 'QA-PIK-ONE-SN')
    const bytes = Buffer.from('DOCUCORE-PORTAL-KNOWN-BYTES')
    const created = await page.request.post('/api/documents', {
      multipart: {
        name: 'Documento portal QA',
        type: 'Manual',
        projectId: '1',
        assetIds: JSON.stringify([asset.id]),
        issueDate: '2026-07-15',
        file: { name: 'portal.pdf', mimeType: 'application/pdf', buffer: bytes },
      },
    })
    expect(created.status()).toBe(201)

    await page.goto('/docs')
    await page.locator('tbody tr', { hasText: 'Documento portal QA' }).click()
    const dialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    await expect(dialog).toBeVisible()

    // El listbox viaja en un portal a document.body: el modal con overflow no lo recorta.
    const combobox = page.getByRole('combobox', { name: 'Activos asociados' })
    await combobox.click()
    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeVisible()
    expect(await listbox.evaluate((el) => el.parentElement?.parentElement?.tagName)).toBe('BODY')

    // Las opciones se pueden seleccionar (interacción real con el portal).
    const firstOption = listbox.getByRole('option').first()
    await expect(firstOption).toBeVisible()
    await firstOption.click()
    await expect(page.getByLabel('Quitar QA-PIK-ONE · Activo papelera QA-PIK-ONE')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
  })
})
