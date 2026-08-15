import { expect, test } from './fixtures'

test.describe('Historial global del proyecto', () => {
  test('loads real audit rows, filters them and exports the active result', async ({ page, consoleIssues }) => {
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Historial y auditoría', exact: true })).toBeVisible()

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()

    await page.locator('#history-action-filter').selectOption({ label: 'Creación' })
    await expect(rows.first()).toContainText('Creación')

    const download = page.waitForEvent('download')
    await page.locator('#history-export-btn').click()
    await (await download).cancel()

    expect(consoleIssues).toEqual([])
  })
})
