import { expect, test } from './fixtures'

test.describe.serial('PLAN-04 ficha de activo y planos', () => {
  test('loads a centered DZI preview and follows its reproducible plan link', async ({ page, consoleIssues }) => {
    const plansResponse = await page.request.get('/api/floor-plans?projectId=1')
    const plans = (await plansResponse.json()).data as Array<{ id: number; markers: Array<{ assetId: number }> }>
    const plan = plans.find((candidate) => candidate.markers.length > 0)!
    const marker = plan.markers[0]!
    const assetResponse = await page.request.get(`/api/assets/${marker.assetId}`)
    const asset = await assetResponse.json() as { id: number; code: string; name: string }

    await page.goto('/assets')
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(asset.code)
    await page.locator('tbody tr', { hasText: asset.code }).click()
    const assetDialog = page.getByRole('dialog', { name: asset.name })
    await assetDialog.getByRole('button', { name: 'Plano', exact: true }).click()

    const preview = assetDialog.getByTestId('asset-floor-plan-preview')
    await expect(preview).toBeVisible()
    await expect(preview.getByTestId('floor-plan-viewer')).toBeVisible()
    const previewMarker = preview.getByRole('button', { name: `Abrir activo ${asset.name}` })
    await expect(previewMarker).toHaveAttribute('data-lod', 'detail')
    await expect(previewMarker).toHaveAttribute('data-focused', 'true')

    await preview.getByTestId('asset-open-in-plans').click()
    await expect(page).toHaveURL(new RegExp(`/plans\\?assetId=${asset.id}&planId=${plan.id}$`))
    const plansViewer = page.getByTestId('floor-plan-viewer')
    await expect(plansViewer).toBeVisible()
    const focusedMarker = plansViewer.getByRole('button', { name: `Abrir activo ${asset.name}` })
    await expect(focusedMarker).toHaveAttribute('data-focused', 'true')
    expect(consoleIssues).toEqual([])
  })
})
