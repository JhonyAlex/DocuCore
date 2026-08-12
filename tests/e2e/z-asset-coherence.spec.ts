import { expect, test } from './fixtures'

test.describe('coherencia funcional de la ficha del activo', () => {
  test('edits characteristics globally, opens documents explicitly, focuses preventives and keeps history populated', async ({ page, consoleIssues }) => {
    await page.goto('/assets')
    await page.locator('tbody tr').filter({ hasText: 'CNC-05' }).click()
    const assetDialog = page.getByRole('dialog', { name: 'Torno CNC Haas ST-20' })

    await assetDialog.getByRole('button', { name: 'Características' }).click()
    await expect(assetDialog.getByRole('button', { name: 'Editar características' })).toHaveCount(0)
    await assetDialog.getByRole('button', { name: 'Editar', exact: true }).click()
    const editForm = page.getByRole('dialog', { name: 'Editar activo' })
    await editForm.getByLabel('Fabricante').fill('Haas Automation QA')
    await editForm.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(editForm).toBeHidden()
    await expect(assetDialog.getByText('Haas Automation QA', { exact: true })).toBeVisible()

    await assetDialog.getByRole('button', { name: 'Editar', exact: true }).click()
    const restoreForm = page.getByRole('dialog', { name: 'Editar activo' })
    await restoreForm.getByLabel('Fabricante').fill('Haas Automation')
    await restoreForm.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(restoreForm).toBeHidden()

    await assetDialog.getByRole('button', { name: 'Resumen' }).click()
    await expect(assetDialog.getByText('Progreso de tareas', { exact: false })).toHaveCount(0)
    await assetDialog.getByRole('button', { name: 'Ver', exact: true }).first().click()
    await expect(page.getByRole('dialog', { name: 'Gestionar documento' })).toBeVisible()
    await page.getByRole('dialog', { name: 'Gestionar documento' }).getByRole('button', { name: 'Cerrar' }).click()

    await assetDialog.getByRole('button', { name: /^Eventos/ }).click()
    await assetDialog.getByRole('button', { name: 'Ver preventivo' }).click()
    await expect(assetDialog.getByText('Preventivos y planes periódicos', { exact: true })).toBeVisible()
    await expect(assetDialog.locator('[data-focused-preventive="true"]')).toHaveCount(1)

    await assetDialog.getByRole('button', { name: 'Historial' }).click()
    await expect(assetDialog.getByRole('heading', { name: 'Historial', exact: true })).toBeVisible()
    expect(consoleIssues).toEqual([])
  })
})
