import { expect, test } from './fixtures'

test.describe('Historial global del proyecto', () => {
  test('loads real audit rows, filters them and exports the active result', async ({ page, consoleIssues }) => {
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Historial y auditoría', exact: true })).toBeVisible()

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()

    // El seed canónico solo siembra 5 trazas de auditoría (una sola página).
    // Para ejercitar la paginación real se genera actividad (25 altas), igual
    // que haría un usuario, de modo que exista una segunda página.
    const [typesRes, statusesRes, locationsRes] = await Promise.all([
      page.request.get('/api/asset-types'),
      page.request.get('/api/statuses'),
      page.request.get('/api/locations?limit=1'),
    ])
    const typeId = ((await typesRes.json()) as Array<{ id: number }>)[0]!.id
    const statusId = ((await statusesRes.json()) as Array<{ id: number }>)[0]!.id
    const locationId = ((await locationsRes.json()) as { locations: Array<{ id: number }> }).locations[0]!.id
    for (let index = 0; index < 25; index += 1) {
      const created = await page.request.post('/api/assets', {
        data: {
          code: `QA-HIST-${index}`, name: `Historial relleno ${index}`, serialNumber: `SN-HIST-${index}`,
          installDate: '2026-07-15', typeId, statusId, locationId, projectId: 1, responsibleId: 1, initials: 'QA',
        },
      })
      expect(created.status()).toBe(201)
    }
    await page.reload()
    await expect(rows.first()).toBeVisible()

    const pageResponse = page.waitForResponse((response) => response.url().includes('/api/history?') && response.url().includes('page=2') && response.request().method() === 'GET')
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
