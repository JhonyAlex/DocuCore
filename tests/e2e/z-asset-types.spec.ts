import { expect, test } from './fixtures'

test.describe('CFG-TYPE-01 tipos de activo', () => {
  test('creates, renames, exposes, archives and restores an asset type', async ({ page, consoleIssues }) => {
    const suffix = Date.now()
    const originalName = `Equipo QA ${suffix}`
    const renamedName = `Equipo especializado QA ${suffix}`

    await page.goto('/config')
    await page.getByRole('button', { name: /Tipos de activo/ }).click()
    await expect(page).toHaveURL(/\/config\/asset-types/)
    await page.getByRole('button', { name: 'Nuevo tipo' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Nuevo tipo de activo' })
    await createDialog.getByLabel('Nombre del tipo').fill(originalName)
    await createDialog.locator('button[data-icon-key="wrench"]').click()
    await expect(createDialog.getByRole('option', { name: 'Llave inglesa' })).toHaveAttribute('aria-selected', 'true')
    await createDialog.getByRole('button', { name: 'Crear tipo' }).click()
    await expect(page.getByRole('row').filter({ hasText: originalName })).toBeVisible()

    let row = page.getByRole('row').filter({ hasText: originalName })
    await row.getByLabel(`Acciones de ${originalName}`).click()
    await page.getByRole('menuitem', { name: 'Editar' }).click()
    const editDialog = page.getByRole('dialog', { name: 'Editar tipo de activo' })
    await editDialog.getByLabel('Nombre del tipo').fill(renamedName)
    await editDialog.locator('button[data-icon-key="server"]').click()
    await editDialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('row').filter({ hasText: renamedName })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: renamedName }).locator('[data-asset-icon="server"]')).toBeVisible()

    await page.goto('/assets')
    await page.getByRole('button', { name: 'Nuevo activo' }).click()
    const assetDialog = page.getByRole('dialog', { name: 'Nuevo activo' })
    await expect(assetDialog.getByLabel('Tipo')).toContainText(renamedName)
    await assetDialog.getByLabel('Cerrar').click()

    await page.goto('/config/asset-types')
    row = page.getByRole('row').filter({ hasText: renamedName })
    const actions = row.getByLabel(`Acciones de ${renamedName}`)
    await actions.scrollIntoViewIfNeeded()
    await actions.click()
    await page.getByRole('menuitem', { name: 'Archivar' }).click()
    await page.getByRole('dialog', { name: 'Archivar tipos de activo' }).getByRole('button', { name: 'Archivar' }).click()
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
