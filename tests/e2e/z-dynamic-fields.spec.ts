import { expect, test } from './fixtures'

test.describe('CFG-DYN-01 campos dinámicos', () => {
  test('configures a periodic date, edits it in Características and advances its event', async ({ page, consoleIssues }) => {
    const fieldName = `Próxima inspección QA ${Date.now()}`

    await page.goto('/config')
    await page.getByRole('button', { name: /Campos dinámicos/ }).click()
    await expect(page).toHaveURL(/\/config\/dynamic-fields/)
    await page.getByRole('button', { name: 'Nuevo campo' }).click()
    const form = page.getByRole('dialog', { name: 'Nuevo campo dinámico' })
    await form.getByLabel('Nombre').fill(fieldName)
    await form.getByLabel('Grupo').fill('Inspecciones QA')
    await form.getByLabel('Tipo').selectOption('DATE')
    await form.getByLabel('Título del evento').fill('Inspección periódica QA')
    await form.getByLabel('Periodicidad').selectOption('Trimestral')
    await form.getByLabel('Modo').selectOption('Calendario')
    await form.getByRole('button', { name: 'Crear campo' }).click()
    await expect(page.getByRole('row').filter({ hasText: fieldName })).toBeVisible()

    await page.goto('/assets')
    await page.locator('tbody tr').filter({ hasText: 'CNC-05' }).click()
    const assetDialog = page.getByRole('dialog', { name: /Torno CNC Haas ST-20/ })
    await assetDialog.getByRole('button', { name: 'Características' }).click()
    await expect(assetDialog.getByText(fieldName, { exact: true })).toBeVisible()
    await assetDialog.getByRole('button', { name: 'Editar características' }).click()
    await assetDialog.getByLabel(fieldName).fill('2026-09-15')
    await assetDialog.getByRole('button', { name: 'Guardar características' }).click()
    await expect(assetDialog.getByText('15/9/2026')).toBeVisible()

    await assetDialog.getByRole('button', { name: /^Eventos/ }).click()
    await expect(assetDialog.getByText('Inspección periódica QA', { exact: true })).toBeVisible()
    await expect(assetDialog.getByText(/15\/09\/2026 · Característica/)).toBeVisible()

    await assetDialog.getByRole('button', { name: 'Características' }).click()
    await assetDialog.getByRole('button', { name: 'Completar y programar siguiente →' }).click()
    const completeDialog = page.getByRole('dialog', { name: new RegExp(`Completar ${fieldName}`) })
    await completeDialog.getByLabel('Fecha de realización').fill('2026-09-20')
    await completeDialog.getByRole('button', { name: 'Completar y programar' }).click()
    await expect(completeDialog).toBeHidden()
    await expect(assetDialog.getByText('15/12/2026')).toBeVisible()

    await assetDialog.getByLabel('Cerrar').click()
    await page.goto('/config/dynamic-fields')
    const row = page.getByRole('row').filter({ hasText: fieldName })
    const actions = row.getByLabel(`Acciones de ${fieldName}`)
    await actions.scrollIntoViewIfNeeded()
    await actions.click()
    await page.getByRole('menuitem', { name: 'Archivar' }).click()
    await page.getByRole('dialog', { name: 'Archivar campos dinámicos' }).getByRole('button', { name: 'Archivar' }).click()
    await expect(row).toBeHidden()
    expect(consoleIssues).toEqual([])
  })
})
