import { expect, test } from './fixtures'

test.describe('Historial global del proyecto', () => {
  test('loads real audit rows, filters them and exports the active result', async ({ page, consoleIssues }) => {
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Historial y auditoría', exact: true })).toBeVisible()

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()

    const pageResponse = page.waitForResponse((response) => response.url().includes('/api/projects/1/history?') && response.url().includes('page=2') && response.request().method() === 'GET')
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await expect((await pageResponse).status()).toBe(200)
    await expect(page.getByText(/2 \/ \d+/)).toBeVisible()

    await page.locator('#history-action-filter').selectOption({ label: 'Creación' })
    await expect(rows.first()).toContainText('Creación')

    const download = page.waitForEvent('download')
    await page.locator('#history-export-btn').click()
    await (await download).cancel()

    expect(consoleIssues).toEqual([])
  })
})
