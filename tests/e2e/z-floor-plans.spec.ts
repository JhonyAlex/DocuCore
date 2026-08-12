import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './fixtures'

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
  test('creates a plan, places and moves an asset, persists it, versions it and removes its association', async ({ page, consoleIssues }) => {
    const locationsResponse = await page.request.get('/api/locations')
    const locations = await locationsResponse.json() as { locations: Array<{ id: number; parentId: number | null }> }
    const root = locations.locations.find((location) => location.parentId === null)!
    const assetsResponse = await page.request.get(`/api/assets?locationId=${root.id}&limit=100`)
    const assets = (await assetsResponse.json()).data as Array<{ id: number; code: string; name: string; type: { name: string } }>
    const asset = assets.find((candidate) => candidate.code === 'CP-02')!
    const soonAsset = assets.find((candidate) => candidate.code === 'MG-203')!
    const image = await readFile(path.join(process.cwd(), 'public', 'floor-plan.png'))
    const name = `Plano E2E ${Date.now()}`

    await page.goto(`/plans?locationId=${root.id}`)
    await page.getByRole('button', { name: 'Crear plano', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Crear plano' })
    await dialog.getByLabel('Nombre').fill(name)
    await dialog.getByLabel('Ubicación').selectOption(String(root.id))
    await dialog.getByLabel('Imagen del plano').setInputFiles({ name: 'plano-e2e.png', mimeType: 'image/png', buffer: image })
    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/floor-plans'))
    await dialog.getByRole('button', { name: 'Crear plano', exact: true }).click()
    const created = await (await createResponse).json() as { id: number }
    const planId = created.id
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('floor-plan-viewer')).toBeVisible()

    await page.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.locator('#floor-plan-asset').selectOption(String(asset.id))
    const viewer = page.getByTestId('floor-plan-viewer')
    const createMarkerResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/floor-plans/${planId}/markers`))
    await viewer.click({ position: { x: 320, y: 320 } })
    await page.locator('#floor-plan-asset').selectOption(String(soonAsset.id))
    await viewer.click({ position: { x: 430, y: 350 } })
    await page.getByRole('button', { name: 'Guardar posiciones', exact: true }).click()
    expect((await createMarkerResponse).status()).toBe(201)
    const marker = page.getByRole('button', { name: `Abrir ficha de ${asset.code}` })
    await expect(marker).toBeVisible()
    await expect(marker).toHaveAttribute('data-alert', 'overdue')
    await expect(page.getByRole('button', { name: `Abrir ficha de ${soonAsset.code}` })).toHaveAttribute('data-alert', 'soon')
    await page.getByLabel('Alerta').selectOption('overdue')
    await expect(page.getByText(`${asset.code} · ${asset.name} · Colocado`)).toBeVisible()
    await page.getByLabel('Alerta').selectOption('all')
    await expect(page.getByText(asset.type.name).first()).toBeVisible()

    await expect(marker).toHaveAttribute('data-lod', 'dot')
    for (let step = 0; step < 2; step += 1) await page.getByLabel('Acercar').click()
    await expect(marker).toHaveAttribute('data-lod', 'code')
    for (let step = 0; step < 2; step += 1) await page.getByLabel('Acercar').click()
    await expect(marker).toHaveAttribute('data-lod', 'detail')
    const before = await (await page.request.get(`/api/floor-plans/${planId}`)).json() as { markers: Array<{ id: number; x: number; y: number }> }
    const initial = before.markers.find((item) => item.id > 0)!

    await page.getByRole('button', { name: `Mover ${asset.code} · ${asset.name}` }).click()
    const moveResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes(`/api/floor-plans/${planId}/markers/`))
    await page.getByLabel('Desplazar a la derecha').click()
    await page.getByRole('button', { name: 'Guardar posiciones', exact: true }).click()
    expect((await moveResponse).status()).toBe(200)

    await page.reload()
    await expect(page.getByTestId('floor-plan-viewer')).toBeVisible()
    const moved = await (await page.request.get(`/api/floor-plans/${planId}`)).json() as { markers: Array<{ id: number; x: number; y: number }> }
    const persisted = moved.markers.find((item) => item.id === initial.id)!
    expect(persisted.x !== initial.x || persisted.y !== initial.y).toBe(true)

    const versionResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/floor-plans/${planId}/versions`))
    await page.getByLabel('Subir nueva versión').setInputFiles({ name: 'plano-e2e-v2.png', mimeType: 'image/png', buffer: image })
    expect((await versionResponse).status()).toBe(201)
    await expect(page.getByText(/v2 · Subido:/)).toBeVisible()

    await page.getByRole('button', { name: 'Importar desde PDF', exact: true }).click()
    const pdfDialog = page.getByRole('dialog', { name: 'Importar desde PDF' })
    await pdfDialog.getByLabel('Elegir PDF').setInputFiles({ name: 'plano-multipagina.pdf', mimeType: 'application/pdf', buffer: multiPagePdf() })
    await pdfDialog.getByLabel('Página PDF').selectOption('2')
    const pdfCanvas = pdfDialog.locator('canvas')
    await expect(pdfCanvas).toBeVisible()
    const box = await pdfCanvas.boundingBox()
    if (!box) throw new Error('PDF preview canvas is not available')
    await page.mouse.move(box.x + 25, box.y + 25); await page.mouse.down(); await page.mouse.move(box.x + Math.min(150, box.width - 10), box.y + Math.min(100, box.height - 10)); await page.mouse.up()
    const importResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/floor-plans/${planId}/versions`))
    await pdfDialog.getByRole('button', { name: 'Convertir e importar', exact: true }).click()
    expect((await importResponse).status()).toBe(201)
    await expect(page.getByText(/v3 · Subido:/)).toBeVisible()

    const markerAfterReload = page.getByRole('button', { name: `Abrir ficha de ${asset.code}` })
    await markerAfterReload.click()
    const assetDialog = page.getByRole('dialog', { name: new RegExp(asset.name) })
    await expect(assetDialog).toBeVisible()
    await assetDialog.getByLabel('Cerrar').click()
    await page.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.getByRole('button', { name: 'Quitar asociación', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: 'Quitar asociación del plano' })
    await confirm.getByRole('button', { name: 'Quitar asociación', exact: true }).click()
    const removeResponse = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().includes(`/api/floor-plans/${planId}/markers/`))
    await page.getByRole('button', { name: 'Guardar posiciones', exact: true }).click()
    expect((await removeResponse).status()).toBe(204)
    await page.reload()
    await expect(page.getByRole('button', { name: `Abrir ficha de ${asset.code}` })).toHaveCount(0)
    expect(consoleIssues).toEqual([])
  })
})
