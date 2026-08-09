import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// UX-04: el formulario de activo sugiere los valores actuales de Código,
// Nombre e Iniciales, con el valor de los otros campos como contexto; la
// selección (clic o teclado) rellena el campo y el texto libre sigue posible.
// Datos del seed canónico: CNC-05 (Torno CNC Haas ST-20 · CN), CP-02
// (Compresor Atlas Copco GA37 · CP) y BSC-11 (Báscula industrial · BA).
test.describe('asset form suggestions', () => {
  test.describe.configure({ mode: 'serial' })

  async function openNewAsset(page: Page) {
    await page.goto('/assets')
    await page.getByRole('button', { name: 'Nuevo activo', exact: true }).last().click()
    const dialog = page.getByRole('dialog', { name: 'Nuevo activo' })
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('suggests current codes with name and initials as context and fills on click', async ({ page, consoleIssues }) => {
    expect(consoleIssues).toEqual([])
    const dialog = await openNewAsset(page)
    await dialog.locator('#asset-code').fill('CNC')

    const listbox = page.getByRole('listbox')
    await expect(listbox).toBeVisible()
    const option = listbox.getByRole('option', { name: /CNC-05/ })
    await expect(option).toBeVisible()
    await expect(option).toContainText('Torno CNC Haas ST-20')
    await expect(option).toContainText('CN')

    await option.click()
    await expect(dialog.locator('#asset-code')).toHaveValue('CNC-05')
    await expect(listbox).toHaveCount(0)
  })

  test('navigates suggestions with the keyboard and picks with Enter', async ({ page, consoleIssues }) => {
    expect(consoleIssues).toEqual([])
    const dialog = await openNewAsset(page)
    await dialog.locator('#asset-code').fill('C')

    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option')).toHaveCount(3)
    // Orden ascendente: BSC-11, CNC-05, CP-02. La primera fila está activa.
    await expect(listbox.getByRole('option', { name: /BSC-11/ })).toHaveAttribute('aria-selected', 'true')

    await page.keyboard.press('ArrowDown')
    await expect(listbox.getByRole('option', { name: /CNC-05/ })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')

    await expect(dialog.locator('#asset-code')).toHaveValue('CNC-05')
    await expect(listbox).toHaveCount(0)
  })

  test('suggests name and initials with code as context', async ({ page, consoleIssues }) => {
    expect(consoleIssues).toEqual([])
    const dialog = await openNewAsset(page)

    await dialog.locator('#asset-name').fill('Compresor')
    const listbox = page.getByRole('listbox')
    const nameOption = listbox.getByRole('option', { name: /Compresor Atlas Copco GA37/ })
    await expect(nameOption).toBeVisible()
    await expect(nameOption).toContainText('CP-02 · CP')
    await nameOption.click()
    await expect(dialog.locator('#asset-name')).toHaveValue('Compresor Atlas Copco GA37')

    await dialog.locator('#asset-initials').fill('C')
    const initialsOption = listbox.getByRole('option', { name: /^CP/ })
    await expect(initialsOption).toBeVisible()
    await expect(initialsOption).toContainText('CP-02 · Compresor Atlas Copco GA37')
    await initialsOption.click()
    await expect(dialog.locator('#asset-initials')).toHaveValue('CP')
    await expect(listbox).toHaveCount(0)
  })

  test('keeps the field free for new values and closes the listbox with Escape first', async ({ page, consoleIssues }) => {
    expect(consoleIssues).toEqual([])
    const dialog = await openNewAsset(page)

    // Un valor sin coincidencias no abre un listbox vacío que tape el formulario.
    await dialog.locator('#asset-code').fill('ZZZ-UNICO')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(dialog.locator('#asset-code')).toHaveValue('ZZZ-UNICO')

    // Con coincidencias, el primer Escape cierra solo el listbox; el segundo, el modal.
    await dialog.locator('#asset-code').fill('CNC')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})
