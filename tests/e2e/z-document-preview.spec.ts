import { expect, test } from './fixtures'
import { minimalPdf } from './pdf'
import { createSampleWorkbookBuffer } from '../helpers/excelFixture'
import { createTestPngBuffer } from '../helpers/imageFixtures'

// DOC-03: vista previa de documentos. Al abrir «Gestionar documento», la
// versión actual se muestra incrustada justo debajo del campo Emisión (PDF
// renderizado con pdf.js en canvas propios — sin la barra del visor nativo y
// siempre desde arriba —, Excel renderizado en cuadrícula de solo lectura con
// pestañas de hojas y celdas combinadas, imágenes en <img>, texto plano en <pre>)
// sin botón previo; al tocar la vista previa se abre el visor ampliado. Escape
// cierra solo el visor, sin cerrar el modal padre.

// PNG de muestra, generado con el mismo decodificador que usa el servidor.
let PNG_BYTES: Buffer
const XLSX_BYTES = createSampleWorkbookBuffer()
const CORRUPTED_XLSX_BYTES = Buffer.from('PK\x03\x04CORRUPTED-ZIP-HEADER')

test.beforeAll(async () => {
  PNG_BYTES = await createTestPngBuffer()
})

async function createDocument(page: import('@playwright/test').Page, name: string, mimeType: string, bytes: Buffer, fileName: string): Promise<{ id: number }> {
  const response = await page.request.post('/api/documents', {
    multipart: {
      name,
      type: 'Manual',
      projectId: '1',
      assetIds: JSON.stringify([]),
      issueDate: '2026-07-15',
      file: { name: fileName, mimeType, buffer: bytes },
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()) as { id: number }
}

test.describe.serial('document preview', () => {
  test('shows an uploaded image embedded in the dialog and opens it in the viewer', async ({ page, consoleIssues }) => {
    const docName = `E2E Preview Imagen ${Date.now()}`
    await page.goto('/docs')
    await expect(page.getByRole('heading', { name: 'Documentos', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Subir documento', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Subir documento' })
    await dialog.getByLabel('Nombre').fill(docName)
    await dialog.getByLabel('Tipo').selectOption({ label: 'Manual' })
    await dialog.getByLabel('Emisión').fill('2026-07-15')
    await expect(dialog.getByLabel('Fichero')).toHaveAttribute('accept', /image\/png|\.png/)
    await dialog.getByLabel('Fichero').setInputFiles({ name: 'foto-e2e.png', mimeType: 'image/png', buffer: PNG_BYTES })
    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/documents'))
    await dialog.getByRole('button', { name: 'Subir documento', exact: true }).last().click()
    expect((await createResponse).status()).toBe(201)
    await expect(page.getByText(docName, { exact: true })).toBeVisible()

    await page.getByText(docName, { exact: true }).click()
    const manageDialog = page.getByRole('dialog', { name: docName })
    const embeddedImage = manageDialog.getByRole('img', { name: docName })
    await expect(embeddedImage).toBeVisible()
    await expect(embeddedImage).toHaveAttribute('src', /^blob:/)
    await manageDialog.getByRole('button', { name: `Abrir vista previa de ${docName}` }).first().click()
    const previewDialog = page.getByRole('dialog', { name: `Vista previa de ${docName}` })
    await expect(previewDialog.getByRole('img', { name: docName })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(previewDialog).toBeHidden()
    await expect(manageDialog).toBeVisible()
    await manageDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    expect(consoleIssues).toEqual([])
  })

  test('renders a pdf with canvas previews and scroll reset', async ({ page, consoleIssues }) => {
    const pdfName = `E2E Preview PDF ${Date.now()}`
    const pdf = await createDocument(page, pdfName, 'application/pdf', minimalPdf(3), 'plano-e2e.pdf')
    expect(pdf.id).toBeGreaterThan(0)

    await page.goto('/docs')
    await page.getByText(pdfName, { exact: true }).click()
    const manageDialog = page.getByRole('dialog', { name: pdfName })
    // La vista previa del PDF se renderiza con pdf.js (canvas propios, sin el
    // visor nativo): cada página pinta un canvas.
    await expect(manageDialog.locator('.pdf-preview canvas')).toHaveCount(3, { timeout: 10_000 })
    await manageDialog.getByRole('button', { name: `Abrir vista previa de ${pdfName}` }).first().click()
    const pdfPreview = page.getByRole('dialog', { name: `Vista previa de ${pdfName}` })
    const viewer = pdfPreview.locator('.pdf-preview')
    await expect(viewer.locator('canvas')).toHaveCount(3, { timeout: 10_000 })
    // El visor abre siempre arriba (el scroll es del contenedor propio; cada
    // montaje renderiza desde la página 1 y arranca en 0).
    expect(await viewer.evaluate((element) => element.scrollTop)).toBe(0)
    await viewer.evaluate((element) => { element.scrollTop = 400 })
    expect(await viewer.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await expect(pdfPreview).toBeHidden()
    // Al reabrir el visor, el documento vuelve a empezar arriba (no conserva
    // la posición de scroll de la apertura anterior).
    await manageDialog.getByRole('button', { name: `Abrir vista previa de ${pdfName}` }).first().click()
    await expect(viewer.locator('canvas')).toHaveCount(3, { timeout: 10_000 })
    expect(await viewer.evaluate((element) => element.scrollTop)).toBe(0)
    await page.keyboard.press('Escape')
    await expect(pdfPreview).toBeHidden()
    await manageDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    expect(consoleIssues).toEqual([])
  })

  test('renders an uploaded xlsx in embedded preview, switches sheet tabs, opens enlarged viewer, and handles corrupted files gracefully', async ({ page, consoleIssues }) => {
    const xlsxName = `E2E Preview XLSX ${Date.now()}`
    const corruptedName = `E2E Corrupted XLSX ${Date.now()}`
    const xlsx = await createDocument(page, xlsxName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', XLSX_BYTES, 'inventario.xlsx')
    const corrupted = await createDocument(page, corruptedName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', CORRUPTED_XLSX_BYTES, 'corrupto.xlsx')
    expect(xlsx.id).toBeGreaterThan(0)
    expect(corrupted.id).toBeGreaterThan(0)

    await page.goto('/docs')
    await page.getByText(xlsxName, { exact: true }).click()
    const manageDialog = page.getByRole('dialog', { name: xlsxName })

    // Vista previa incrustada en el modal de gestión
    // El div de la vista previa incrustada comparte aria-label con el botón de la
    // barra de herramientas: el contenido verificable es el div (último).
    const previewBtn = manageDialog.getByRole('button', { name: `Abrir vista previa de ${xlsxName}` }).last()
    await expect(previewBtn).toBeVisible({ timeout: 10_000 })
    await expect(previewBtn.getByText('Resumen de Equipos y Calibración')).toBeVisible()
    await expect(previewBtn.getByText('MG-203')).toBeVisible()

    // Abrir visor ampliado
    await previewBtn.click()
    const enlargedDialog = page.getByRole('dialog', { name: `Vista previa de ${xlsxName}` })
    await expect(enlargedDialog).toBeVisible()

    // Pestañas de hojas: Inventario y Mantenimiento
    const invTab = enlargedDialog.getByRole('button', { name: 'Inventario', exact: true })
    const mantTab = enlargedDialog.getByRole('button', { name: 'Mantenimiento', exact: true })
    await expect(invTab).toBeVisible()
    await expect(mantTab).toBeVisible()

    // Comprobar contenido de la primera hoja
    await expect(enlargedDialog.getByText('Manómetro digital')).toBeVisible()
    await expect(enlargedDialog.getByText('85%')).toBeVisible()

    // Cambiar a la segunda hoja (Mantenimiento)
    await mantTab.click()
    await expect(enlargedDialog.getByText('Calibración anual')).toBeVisible()
    await expect(enlargedDialog.getByText('Juan Pérez')).toBeVisible()
    await expect(enlargedDialog.getByText('150 €')).toBeVisible()

    // Volver a la primera hoja
    await invTab.click()
    await expect(enlargedDialog.getByText('MG-203')).toBeVisible()

    // Escape cierra el visor ampliado sin cerrar el modal de gestión
    await page.keyboard.press('Escape')
    await expect(enlargedDialog).toBeHidden()
    await expect(manageDialog).toBeVisible()
    await manageDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click()

    // Comprobar manejo de archivo Excel corrupto
    await page.getByText(corruptedName, { exact: true }).click()
    const corruptDialog = page.getByRole('dialog', { name: corruptedName })
    await expect(corruptDialog.getByText('No se pudo generar la vista previa de esta hoja de cálculo.')).toBeVisible()
    await corruptDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click()

    expect(consoleIssues).toEqual([])
  })

  test('refreshes the embedded preview right after uploading a new version', async ({ page, consoleIssues }) => {
    const name = `E2E Preview Refresh ${Date.now()}`
    await createDocument(page, name, 'text/plain', Buffer.from('PRIMERA VERSION'), 'primera-e2e.txt')

    await page.goto('/docs')
    await page.getByText(name, { exact: true }).click()
    const manageDialog = page.getByRole('dialog', { name })
    await expect(manageDialog.locator('pre')).toContainText('PRIMERA VERSION')

    // Subir una nueva versión de otro contenido: la vista previa incrustada
    // debe mostrar la versión vigente nueva sin reabrir el modal.
    await manageDialog.getByLabel('Nueva versión').setInputFiles({ name: 'segunda-e2e.txt', mimeType: 'text/plain', buffer: Buffer.from('SEGUNDA VERSION') })
    await expect(manageDialog.locator('pre')).toContainText('SEGUNDA VERSION')
    await expect(manageDialog.locator('pre')).not.toContainText('PRIMERA VERSION')
    await expect(manageDialog.getByText(/v2 · segunda-e2e\.txt/)).toBeVisible()
    await manageDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    expect(consoleIssues).toEqual([])
  })

  test('keeps long version filenames inside the dialog without overflowing', async ({ page, consoleIssues }) => {
    const name = `E2E Long Name ${Date.now()}`
    const longName1 = `certificado-calibracion-${'a'.repeat(180)}-v1.txt`
    const longName2 = `certificado-calibracion-${'b'.repeat(180)}-v2.txt`
    const doc = await createDocument(page, name, 'text/plain', Buffer.from('v1'), longName1)
    const version = await page.request.post(`/api/documents/${doc.id}/versions`, {
      multipart: { issueDate: '2026-07-15', file: { name: longName2, mimeType: 'text/plain', buffer: Buffer.from('v2') } },
    })
    expect(version.status()).toBe(201)

    await page.goto('/docs')
    await page.getByText(name, { exact: true }).click()
    const manageDialog = page.getByRole('dialog', { name })

    // Nombres de fichero largos: el historial los trunca con ellipsis (title
    // con el nombre completo) y las acciones «Ver»/«Descargar» permanecen
    // dentro del diálogo: alcanzables con scroll propio de la columna.
    const rows = manageDialog.locator('ul li')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator('span[title]')).toHaveAttribute('title', longName2)
    await expect(rows.nth(1).locator('span[title]')).toHaveAttribute('title', longName1)
    for (const actionName of ['Ver v2', 'Descargar v2', 'Ver v1', 'Descargar v1']) {
      const action = manageDialog.getByRole('button', { name: actionName })
      await action.scrollIntoViewIfNeeded()
      await expect(action).toBeInViewport()
    }

    // La vista histórica usa sus propios bytes y deja el modal de gestión abierto.
    await manageDialog.getByRole('button', { name: 'Ver v1' }).click()
    const historicalPreview = page.getByRole('dialog', { name: `Vista previa de ${name}` })
    await expect(historicalPreview).toContainText('v1')
    await expect(historicalPreview.locator('pre')).toContainText('v1')
    await historicalPreview.getByRole('button', { name: 'Cerrar vista previa' }).click()
    await expect(manageDialog).toBeVisible()

    await manageDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    expect(consoleIssues).toEqual([])
  })
})
