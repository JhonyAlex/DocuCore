import { expect, test } from './fixtures'

test.use({ hasTouch: true })

function multiPagePdf(): Buffer {
  const stream = (text: string) => {
    const content = `BT /F1 22 Tf 40 100 Td (${text}) Tj ET\n`
    return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`
  }
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    stream('Plano pagina uno'),
    stream('Plano pagina dos'),
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n` }
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body)
}

test.describe.serial('floor plans', () => {
  test('uses direct contextual placement, marker interaction and PDF creation without an edit mode', async ({ page, consoleIssues }) => {
    const locationsResponse = await page.request.get('/api/locations')
    const locations = await locationsResponse.json() as { locations: Array<{ id: number; parentId: number | null }> }
    const root = locations.locations.find((location) => location.parentId === null)!
    const assetsResponse = await page.request.get(`/api/assets?locationId=${root.id}&limit=100`)
    const assets = (await assetsResponse.json()).data as Array<{ id: number; code: string; name: string; type: { name: string; iconKey: string } }>
    const asset = assets.find((candidate) => candidate.code === 'CP-02')!
    const name = `Plano PDF E2E ${Date.now()}`

    await page.goto(`/plans?locationId=${root.id}`)
    await page.getByRole('button', { name: 'Crear plano', exact: true }).click()
    const createDialog = page.getByRole('dialog', { name: 'Crear plano' })
    await createDialog.getByLabel('Nombre').fill(name)
    await createDialog.getByLabel('Ubicación').selectOption(String(root.id))
    await createDialog.getByRole('button', { name: 'Importar desde PDF', exact: true }).click()
    const pdfDialog = page.getByRole('dialog', { name: 'Importar desde PDF' })
    await pdfDialog.getByLabel('Elegir PDF').setInputFiles({ name: 'plano-multipagina.pdf', mimeType: 'application/pdf', buffer: multiPagePdf() })
    await pdfDialog.getByLabel('Página PDF').selectOption('2')
    const pdfCanvas = pdfDialog.locator('canvas')
    await expect(pdfCanvas).toBeVisible()
    const pdfBox = await pdfCanvas.boundingBox()
    if (!pdfBox) throw new Error('PDF preview canvas is not available')
    await page.mouse.move(pdfBox.x + 20, pdfBox.y + 20); await page.mouse.down(); await page.mouse.move(pdfBox.x + Math.min(180, pdfBox.width - 10), pdfBox.y + Math.min(120, pdfBox.height - 10)); await page.mouse.up()
    await pdfDialog.getByRole('button', { name: 'Convertir e importar', exact: true }).click()
    await expect(pdfDialog).toBeHidden()
    await expect(createDialog.getByLabel('Nombre')).toHaveValue(name)
    await expect(createDialog.getByLabel('Ubicación')).toHaveValue(String(root.id))
    await expect(createDialog.getByText(/Convertido desde PDF/)).toBeVisible()
    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/floor-plans'))
    await createDialog.getByRole('button', { name: 'Crear plano', exact: true }).click()
    const created = await (await createResponse).json() as { id: number }
    const planId = created.id
    await expect(createDialog).toBeHidden()
    const viewer = page.getByTestId('floor-plan-viewer')
    await expect(viewer).toBeVisible()
    await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0)

    const viewerBox = await viewer.boundingBox()
    if (!viewerBox) throw new Error('Floor plan viewer is not available')
    await page.mouse.move(viewerBox.x + 420, viewerBox.y + 420); await page.mouse.down(); await page.mouse.move(viewerBox.x + 500, viewerBox.y + 440); await page.mouse.up()
    await expect(page.getByTestId('floor-plan-placement-popover')).toHaveCount(0)

    await viewer.click({ position: { x: 360, y: 350 } })
    const placement = page.getByRole('dialog', { name: 'Añadir activo aquí' })
    await expect(placement).toBeVisible()
    await placement.getByLabel('Buscar activo para colocar').fill(asset.name)
    const createMarkerResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/floor-plans/${planId}/markers`))
    await placement.getByRole('button').filter({ hasText: asset.code }).click()
    await page.getByRole('button', { name: 'Guardar posiciones', exact: true }).click()
    expect((await createMarkerResponse).status()).toBe(201)

    const marker = page.getByRole('button', { name: `Abrir activo ${asset.name}` })
    await expect(marker).toBeVisible()
    await expect(marker.locator(`[data-asset-icon="${asset.type.iconKey}"]`)).toBeVisible()
    const beforeHoverTransform = await marker.evaluate((element) => getComputedStyle(element).transform)
    await marker.hover()
    await expect.poll(() => marker.evaluate((element) => getComputedStyle(element).transform)).toBe(beforeHoverTransform)
    await expect(marker).toHaveAttribute('data-lod', 'dot')

    await page.getByLabel('Buscar activo').fill(asset.name)
    const results = page.getByRole('listbox', { name: 'Resultados de activos' })
    await expect(results.getByText('Colocado')).toBeVisible()
    await results.getByRole('button').filter({ hasText: asset.code }).click()
    await expect(marker).toHaveAttribute('data-lod', 'detail')
    await expect(marker).toContainText(asset.name)
    await expect(marker).toContainText(asset.code)
    await page.getByLabel('Buscar activo').fill('')

    await marker.tap()
    const markerPopover = page.getByTestId('floor-plan-marker-popover')
    await expect(markerPopover).toBeVisible()
    await expect(markerPopover).toContainText(asset.name)
    await expect(markerPopover).toContainText(asset.code)
    await expect(markerPopover).toContainText(asset.type.name)
    await expect(markerPopover).toContainText('Arrastra el marcador directamente para moverlo.')
    await markerPopover.getByRole('button', { name: 'Cerrar activo del plano' }).click()

    const before = await (await page.request.get(`/api/floor-plans/${planId}`)).json() as { markers: Array<{ id: number; x: number; y: number }> }
    const initial = before.markers.find((item) => item.id > 0)!
    const markerBox = await marker.boundingBox()
    if (!markerBox) throw new Error('Marker is not available for dragging')
    await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2)
    await page.mouse.down(); await page.mouse.move(markerBox.x + markerBox.width / 2 + 70, markerBox.y + markerBox.height / 2 + 28, { steps: 6 }); await page.mouse.up()
    await expect(page.getByRole('button', { name: 'Guardar posiciones', exact: true })).toBeEnabled()
    const moveResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes(`/api/floor-plans/${planId}/markers/`))
    await page.getByRole('button', { name: 'Guardar posiciones', exact: true }).click()
    expect((await moveResponse).status()).toBe(200)
    await page.reload()
    await expect(viewer).toBeVisible()
    const moved = await (await page.request.get(`/api/floor-plans/${planId}`)).json() as { markers: Array<{ id: number; x: number; y: number }> }
    const persisted = moved.markers.find((item) => item.id === initial.id)!
    expect(persisted.x !== initial.x || persisted.y !== initial.y).toBe(true)

    const movedMarker = page.getByRole('button', { name: `Abrir activo ${asset.name}` })
    await movedMarker.click()
    await expect(page.getByTestId('floor-plan-marker-popover')).toBeVisible()
    await page.getByRole('button', { name: 'Quitar del plano', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: 'Quitar activo del plano' })
    await confirm.getByRole('button', { name: 'Quitar del plano', exact: true }).click()
    const removeResponse = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().includes(`/api/floor-plans/${planId}/markers/`))
    await page.getByRole('button', { name: 'Guardar posiciones', exact: true }).click()
    expect((await removeResponse).status()).toBe(204)
    await page.reload()
    await expect(page.getByRole('button', { name: `Abrir activo ${asset.name}` })).toHaveCount(0)
    expect(consoleIssues).toEqual([])
  })
})
