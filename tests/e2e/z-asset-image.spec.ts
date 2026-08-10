import { expect, test } from './fixtures'

// IMG-01: imagen del activo. El alta desde cero permite elegir la foto en el
// formulario (se sube al guardar) y la ficha permite subirla, cambiarla y
// quitarla desde el cuadro de imagen; el `<img>` apunta al API
// (/api/assets/:id/image) con el alt de la ficha.

// PNG 1x1 válido y un JPEG 1x1 de muestra.
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex')
const JPEG_BYTES = Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb0043000b08080808080b0a0a0affc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda000c03010002110311003f00fd3ffd9', 'hex')

async function createAsset(page: import('@playwright/test').Page, code: string, serialNumber: string) {
  const [typesRes, statusesRes] = await Promise.all([
    page.request.get('/api/asset-types'),
    page.request.get('/api/statuses'),
  ])
  const types = await typesRes.json() as Array<{ id: number; name: string }>
  const statuses = await statusesRes.json() as Array<{ id: number; name: string }>
  const response = await page.request.post('/api/assets', {
    data: {
      code,
      name: `Activo imagen ${code}`,
      serialNumber,
      installDate: '2026-07-15',
      typeId: types[0].id,
      statusId: statuses[0].id,
      locationId: 1,
      projectId: 1,
      responsibleId: 1,
      initials: 'QA',
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()) as { id: number; name: string }
}

test.describe.serial('asset image', () => {
  test('creates an asset from scratch choosing its image in the form', async ({ page, consoleIssues }) => {
    const code = `QA-IMG-${Date.now() % 100000}`
    const name = `E2E Imagen alta ${Date.now()}`

    await page.goto('/assets')
    await page.getByRole('button', { name: 'Nuevo activo', exact: true }).click()
    const formDialog = page.getByRole('dialog', { name: 'Nuevo activo' })
    await expect(formDialog).toBeVisible()

    await formDialog.getByLabel('Código').fill(code)
    await formDialog.getByLabel('Nombre').fill(name)
    await formDialog.getByLabel('Nº de serie').fill(`SN-${code}`)
    await formDialog.getByLabel('Instalación').fill('2026-07-15')
    await formDialog.getByLabel('Ubicación').selectOption({ index: 1 })
    await formDialog.getByLabel('Tipo').selectOption({ index: 1 })
    await formDialog.getByLabel('Estado').selectOption({ index: 1 })
    await formDialog.getByLabel('Iniciales').fill('QA')

    // La imagen se elige en el formulario y se sube al guardar.
    await expect(formDialog.getByLabel('Elegir imagen')).toHaveAttribute('accept', /image\/png|image\/jpeg|image\/webp|image\/gif/)
    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/assets'))
    await formDialog.getByLabel('Elegir imagen').setInputFiles({ name: 'foto-alta.png', mimeType: 'image/png', buffer: PNG_BYTES })
    const imageUpload = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/assets\/\d+\/image$/.test(response.url()))
    await formDialog.getByRole('button', { name: 'Crear activo' }).click()
    expect((await createResponse).status()).toBe(201)
    expect((await imageUpload).status()).toBe(200)
    await expect(formDialog).toBeHidden()

    // La ficha del activo recién creado muestra la imagen servida por el API.
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(code)
    await page.locator('tbody tr', { hasText: code }).click()
    const assetDialog = page.getByRole('dialog', { name })
    await expect(assetDialog).toBeVisible()
    const assetImage = assetDialog.getByRole('img', { name: `Foto de ${name}` })
    await expect(assetImage).toBeVisible()
    await expect(assetImage).toHaveAttribute('src', /\/api\/assets\/\d+\/image$/)

    await assetDialog.getByRole('button', { name: 'Cerrar' }).last().click()
    expect(consoleIssues).toEqual([])
  })

  test('shows, replaces and removes the image from the asset ficha', async ({ page, consoleIssues }) => {
    const asset = await createAsset(page, `QA-FIC-${Date.now() % 100000}`, `SN-FIC-${Date.now()}`)
    const upload = await page.request.post(`/api/assets/${asset.id}/image`, {
      multipart: { image: { name: 'foto.png', mimeType: 'image/png', buffer: PNG_BYTES } },
    })
    expect(upload.status()).toBe(200)

    await page.goto('/assets')
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(asset.name)
    await page.locator('tbody tr', { hasText: asset.name }).click()
    const assetDialog = page.getByRole('dialog', { name: asset.name })
    const assetImage = assetDialog.getByRole('img', { name: `Foto de ${asset.name}` })
    await expect(assetImage).toBeVisible()
    await expect(assetImage).toHaveAttribute('src', /\/api\/assets\/\d+\/image$/)

    // Reemplazar: el input de subida vive siempre en el cuadro (sr-only), sin
    // necesidad de hover.
    const replaceResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/assets\/\d+\/image$/.test(response.url()))
    await assetDialog.getByLabel('Subir imagen del activo').setInputFiles({ name: 'foto-nueva.jpg', mimeType: 'image/jpeg', buffer: JPEG_BYTES })
    expect((await replaceResponse).status()).toBe(200)
    await expect(assetImage).toBeVisible()

    // Quitar: el overlay solo es interactivo con hover (opacity 0→100), por lo
    // que el clic va forzado contra el botón siempre presente en el DOM.
    const removeResponse = page.waitForResponse((response) => response.request().method() === 'DELETE' && /\/api\/assets\/\d+\/image$/.test(response.url()))
    await assetDialog.getByRole('button', { name: 'Quitar' }).click({ force: true })
    expect((await removeResponse).status()).toBe(204)
    await expect(assetImage).toHaveCount(0)

    await assetDialog.getByRole('button', { name: 'Cerrar' }).last().click()
    // Limpieza: devolver el activo al estado inicial de la BD E2E.
    await page.request.post(`/api/assets/${asset.id}/purge`, {}).catch(() => undefined)
    expect(consoleIssues).toEqual([])
  })

  test('opens the photo in a viewer when touching the preview and closes it with Escape', async ({ page, consoleIssues }) => {
    const asset = await createAsset(page, `QA-VIEW-${Date.now() % 100000}`, `SN-VIEW-${Date.now()}`)
    const upload = await page.request.post(`/api/assets/${asset.id}/image`, {
      multipart: { image: { name: 'foto.png', mimeType: 'image/png', buffer: PNG_BYTES } },
    })
    expect(upload.status()).toBe(200)

    await page.goto('/assets')
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(asset.name)
    await page.locator('tbody tr', { hasText: asset.name }).click()
    const assetDialog = page.getByRole('dialog', { name: asset.name })
    const openViewer = assetDialog.getByRole('button', { name: `Abrir foto de ${asset.name}` })
    await expect(openViewer).toBeVisible()

    // Tocar cualquier zona de la foto abre el visor ampliado con la misma imagen.
    await openViewer.click()
    const photoDialog = page.getByRole('dialog', { name: `Foto de ${asset.name}` })
    await expect(photoDialog.getByRole('img', { name: `Foto de ${asset.name}` })).toBeVisible()

    // Escape cierra solo el visor; la ficha permanece abierta.
    await page.keyboard.press('Escape')
    await expect(photoDialog).toBeHidden()
    await expect(assetDialog).toBeVisible()

    // Reabrir y cerrar con ✕.
    await openViewer.click()
    await expect(photoDialog).toBeVisible()
    await photoDialog.getByRole('button', { name: 'Cerrar foto' }).click()
    await expect(photoDialog).toBeHidden()
    await expect(assetDialog).toBeVisible()

    await assetDialog.getByRole('button', { name: 'Cerrar' }).last().click()
    await page.request.post(`/api/assets/${asset.id}/purge`, {}).catch(() => undefined)
    expect(consoleIssues).toEqual([])
  })
})
