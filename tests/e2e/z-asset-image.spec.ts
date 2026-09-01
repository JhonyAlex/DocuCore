import { expect, test } from './fixtures'
import { createTestJpegBuffer, createTestPngBuffer } from '../helpers/imageFixtures'

// IMG-01: hasta 5 imágenes por activo. El alta desde cero permite elegir múltiples
// fotos en el formulario (se suben al guardar) y la ficha permite desplazarse entre
// ellas con botones y miniaturas, así como abrir el visor ampliado con carrusel,
// navegación por teclado y tira de miniaturas.

// PNG y JPEG de muestra, generados con el mismo decodificador que usa el servidor.
let PNG_BYTES: Buffer
let JPEG_BYTES: Buffer

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
  test.beforeAll(async () => {
    PNG_BYTES = await createTestPngBuffer()
    JPEG_BYTES = await createTestJpegBuffer()
  })

  test('creates an asset from scratch choosing multiple images in the form', async ({ page, consoleIssues }) => {
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

    // Se eligen 2 imágenes en el formulario
    const fileInput = formDialog.locator('input[type="file"]')
    await fileInput.setInputFiles([
      { name: 'foto1.png', mimeType: 'image/png', buffer: PNG_BYTES },
      { name: 'foto2.jpg', mimeType: 'image/jpeg', buffer: JPEG_BYTES },
    ])

    await expect(formDialog.getByText('(2/5)')).toBeVisible()

    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/assets'))
    const imageUpload = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/assets\/\d+\/images$/.test(response.url()))
    await formDialog.getByRole('button', { name: 'Crear activo' }).click()
    expect((await createResponse).status()).toBe(201)
    expect((await imageUpload).status()).toBe(200)
    await expect(formDialog).toBeHidden()

    // La ficha del activo recién creado muestra la imagen con indicador 1/2 y miniaturas
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(code)
    await page.locator('tbody tr', { hasText: code }).click()
    const assetDialog = page.getByRole('dialog', { name })
    await expect(assetDialog).toBeVisible()
    await expect(assetDialog.getByText('1/2')).toBeVisible()

    // Las miniaturas permiten alternar entre imágenes
    const thumb2 = assetDialog.getByRole('button', { name: 'Seleccionar foto 2' })
    await expect(thumb2).toBeVisible()
    await thumb2.click()
    await expect(assetDialog.getByText('2/2')).toBeVisible()

    await assetDialog.getByRole('button', { name: 'Cerrar' }).last().click()
    expect(consoleIssues).toEqual([])
  })

  test('shows, navigates and removes images from the asset ficha', async ({ page, consoleIssues }) => {
    const asset = await createAsset(page, `QA-FIC-${Date.now() % 100000}`, `SN-FIC-${Date.now()}`)
    const upload = await page.request.post(`/api/assets/${asset.id}/images`, {
      multipart: {
        images: { name: 'foto1.png', mimeType: 'image/png', buffer: PNG_BYTES },
      },
    })
    expect(upload.status()).toBe(200)

    await page.goto('/assets')
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(asset.name)
    await page.locator('tbody tr', { hasText: asset.name }).click()
    const assetDialog = page.getByRole('dialog', { name: asset.name })
    const assetImage = assetDialog.getByRole('img', { name: `Foto de ${asset.name}` })
    await expect(assetImage).toBeVisible()

    // Añadir una segunda foto desde la ficha
    const addUploadResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/assets\/\d+\/images$/.test(response.url()))
    await assetDialog.getByLabel('Subir imagen del activo').setInputFiles({ name: 'foto2.jpg', mimeType: 'image/jpeg', buffer: JPEG_BYTES })
    expect((await addUploadResponse).status()).toBe(200)
    await expect(assetDialog.getByText('2/2')).toBeVisible()

    // Quitar la foto activa: confirmación mediante diálogo
    const removeResponse = page.waitForResponse((response) => response.request().method() === 'DELETE' && /\/api\/assets\/\d+\/images\/\d+$/.test(response.url()))
    await assetDialog.getByRole('button', { name: 'Quitar foto' }).click({ force: true })
    const removeDialog = page.getByRole('dialog', { name: 'Quitar foto' })
    await expect(removeDialog).toBeVisible()
    await removeDialog.getByRole('button', { name: 'Quitar foto' }).click()
    expect((await removeResponse).status()).toBe(204)

    // Queda 1 foto restante
    await expect(assetDialog.getByText('1/2')).toHaveCount(0)

    await assetDialog.getByRole('button', { name: 'Cerrar' }).last().click()
    await page.request.post(`/api/assets/${asset.id}/purge`, {}).catch(() => undefined)
    expect(consoleIssues).toEqual([])
  })

  test('opens the photo viewer with carousel, thumbnails, and keyboard navigation', async ({ page, consoleIssues }) => {
    const asset = await createAsset(page, `QA-VIEW-${Date.now() % 100000}`, `SN-VIEW-${Date.now()}`)
    const upload1 = await page.request.post(`/api/assets/${asset.id}/images`, {
      multipart: {
        images: { name: 'foto1.png', mimeType: 'image/png', buffer: PNG_BYTES },
      },
    })
    expect(upload1.status()).toBe(200)
    const upload2 = await page.request.post(`/api/assets/${asset.id}/images`, {
      multipart: {
        images: { name: 'foto2.jpg', mimeType: 'image/jpeg', buffer: JPEG_BYTES },
      },
    })
    expect(upload2.status()).toBe(200)

    await page.goto('/assets')
    await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(asset.name)
    await page.locator('tbody tr', { hasText: asset.name }).click()
    const assetDialog = page.getByRole('dialog', { name: asset.name })
    const openViewer = assetDialog.getByRole('button', { name: `Abrir foto de ${asset.name}` })
    await expect(openViewer).toBeVisible()

    // Abrir el visor
    await openViewer.click()
    const photoDialog = page.getByRole('dialog', { name: `Foto de ${asset.name}` })
    await expect(photoDialog).toBeVisible()
    await expect(photoDialog.getByRole('heading', { name: `Foto 1 de 2 · ${asset.name}` })).toBeVisible()

    // Navegación con botón siguiente
    await photoDialog.getByRole('button', { name: 'Foto siguiente' }).click()
    await expect(photoDialog.getByRole('heading', { name: `Foto 2 de 2 · ${asset.name}` })).toBeVisible()

    // Navegación por teclado: Flecha izquierda
    await page.keyboard.press('ArrowLeft')
    await expect(photoDialog.getByRole('heading', { name: `Foto 1 de 2 · ${asset.name}` })).toBeVisible()

    // Navegación haciendo clic en miniatura
    const viewerThumb2 = photoDialog.getByRole('button', { name: 'Ver foto 2 de 2' })
    await expect(viewerThumb2).toBeVisible()
    await viewerThumb2.click()
    await expect(photoDialog.getByRole('heading', { name: `Foto 2 de 2 · ${asset.name}` })).toBeVisible()

    // Escape cierra solo el visor; la ficha permanece abierta.
    await page.keyboard.press('Escape')
    await expect(photoDialog).toBeHidden()
    await expect(assetDialog).toBeVisible()

    // Reabrir y cerrar con ✕
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
