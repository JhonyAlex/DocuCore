import { expect, test } from './fixtures'

test.describe('CFG-STATUS-01 estados de activo', () => {
  test('creates, renames, exposes, archives and restores an asset status', async ({ page, consoleIssues }) => {
    const suffix = Date.now()
    const originalName = `En calibración QA ${suffix}`
    const renamedName = `En calibración externa QA ${suffix}`

    await page.goto('/config')
    await page.getByRole('button', { name: /Estados/ }).click()
    await expect(page).toHaveURL(/\/config\/statuses/)
    await page.getByRole('button', { name: 'Nuevo estado' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Nuevo estado' })
    await createDialog.getByLabel('Nombre del estado').fill(originalName)
    await createDialog.locator('button[data-color-key="indigo"]').click()
    await expect(createDialog.getByRole('option', { name: /Índigo/ })).toHaveAttribute('aria-selected', 'true')
    await createDialog.getByLabel('Punto pulsante de alerta').check()
    await createDialog.getByRole('button', { name: 'Crear estado' }).click()
    await expect(page.getByRole('row').filter({ hasText: originalName })).toBeVisible()

    let row = page.getByRole('row').filter({ hasText: originalName })
    await row.getByLabel(`Acciones de ${originalName}`).click()
    await page.getByRole('menuitem', { name: 'Editar' }).click()
    const editDialog = page.getByRole('dialog', { name: 'Editar estado' })
    await editDialog.getByLabel('Nombre del estado').fill(renamedName)
    await editDialog.locator('button[data-color-key="purple"]').click()
    await editDialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('row').filter({ hasText: renamedName })).toBeVisible()

    await page.goto('/assets')
    await page.getByRole('button', { name: 'Nuevo activo' }).click()
    const assetDialog = page.getByRole('dialog', { name: 'Nuevo activo' })
    await expect(assetDialog.getByLabel('Estado')).toContainText(renamedName)
    await assetDialog.getByLabel('Cerrar').click()

    await page.goto('/config/statuses')
    row = page.getByRole('row').filter({ hasText: renamedName })
    const actions = row.getByLabel(`Acciones de ${renamedName}`)
    await actions.scrollIntoViewIfNeeded()
    await actions.click()
    await page.getByRole('menuitem', { name: 'Archivar' }).click()
    await page.getByRole('dialog', { name: 'Archivar estados' }).getByRole('button', { name: 'Archivar' }).click()
    await expect(row).toBeHidden()

    await page.getByLabel('Mostrar archivados').check()
    row = page.getByRole('row').filter({ hasText: renamedName })
    await expect(row.getByText('Archivado')).toBeVisible()
    await row.getByLabel(`Acciones de ${renamedName}`).click()
    await page.getByRole('menuitem', { name: 'Reactivar' }).click()
    await expect(row.getByText('Activo', { exact: true })).toBeVisible()
    expect(consoleIssues).toEqual([])
  })
})
