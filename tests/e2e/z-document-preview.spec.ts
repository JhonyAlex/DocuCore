import { expect, test } from './fixtures'
import { minimalPdf } from './pdf'

// DOC-03: vista previa de documentos. Al abrir «Gestionar documento», la
// versión actual se muestra incrustada justo debajo del campo Emisión (PDF en
// iframe, imágenes en <img>, texto plano en <pre>) sin botón previo; al tocar
// la vista previa se abre el visor ampliado. Los formatos sin visor nativo
// (xlsx/xls) muestran el área deshabilitada. Escape cierra solo el visor, sin
// cerrar el modal padre.

// PNG 1x1 válido.
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex')
const XLSX_BYTES = Buffer.from('PK\x03\x04DOCUCORE-PREVIEW-XLSX')

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
    const manageDialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    const embeddedImage = manageDialog.getByRole('img', { name: docName })
    await expect(embeddedImage).toBeVisible()
    await expect(embeddedImage).toHaveAttribute('src', /^blob:/)
    await manageDialog.getByRole('button', { name: `Abrir vista previa de ${docName}` }).click()
    const previewDialog = page.getByRole('dialog', { name: `Vista previa de ${docName}` })
    await expect(previewDialog.getByRole('img', { name: docName })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(previewDialog).toBeHidden()
    await expect(manageDialog).toBeVisible()
    await manageDialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
    expect(consoleIssues).toEqual([])
  })

  test('embeds a pdf in an iframe and disables the preview area for xlsx', async ({ page, consoleIssues }) => {
    const pdfName = `E2E Preview PDF ${Date.now()}`
    const xlsxName = `E2E Preview XLSX ${Date.now()}`
    const pdf = await createDocument(page, pdfName, 'application/pdf', minimalPdf(), 'plano-e2e.pdf')
    const xlsx = await createDocument(page, xlsxName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', XLSX_BYTES, 'tabla-e2e.xlsx')
    expect(pdf.id).toBeGreaterThan(0)
    expect(xlsx.id).toBeGreaterThan(0)

    await page.goto('/docs')
    await page.getByText(pdfName, { exact: true }).click()
    const manageDialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    await expect(manageDialog.locator('iframe')).toBeVisible()
    await manageDialog.getByRole('button', { name: `Abrir vista previa de ${pdfName}` }).click()
    const pdfPreview = page.getByRole('dialog', { name: `Vista previa de ${pdfName}` })
    await expect(pdfPreview.locator('iframe')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(pdfPreview).toBeHidden()
    await manageDialog.getByRole('button', { name: 'Cerrar', exact: true }).click()

    await page.getByText(xlsxName, { exact: true }).click()
    const xlsxDialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    await expect(xlsxDialog.getByText('Sin vista previa para este formato. Descarga el archivo para visualizarlo.', { exact: true })).toBeVisible()
    await expect(xlsxDialog.getByRole('button', { name: /Abrir vista previa/ })).toHaveCount(0)
    await xlsxDialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
    expect(consoleIssues).toEqual([])
  })

  test('refreshes the embedded preview right after uploading a new version', async ({ page, consoleIssues }) => {
    const name = `E2E Preview Refresh ${Date.now()}`
    await createDocument(page, name, 'text/plain', Buffer.from('PRIMERA VERSION'), 'primera-e2e.txt')

    await page.goto('/docs')
    await page.getByText(name, { exact: true }).click()
    const manageDialog = page.getByRole('dialog', { name: 'Gestionar documento' })
    await expect(manageDialog.locator('pre')).toContainText('PRIMERA VERSION')

    // Subir una nueva versión de otro contenido: la vista previa incrustada
    // debe mostrar la versión vigente nueva sin reabrir el modal.
    await manageDialog.getByLabel('Nueva versión').setInputFiles({ name: 'segunda-e2e.txt', mimeType: 'text/plain', buffer: Buffer.from('SEGUNDA VERSION') })
    await expect(manageDialog.locator('pre')).toContainText('SEGUNDA VERSION')
    await expect(manageDialog.locator('pre')).not.toContainText('PRIMERA VERSION')
    await expect(manageDialog.getByText(/v2 · segunda-e2e\.txt/)).toBeVisible()
    await manageDialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
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
    const manageDialog = page.getByRole('dialog', { name: 'Gestionar documento' })

    // Nombres de fichero largos: el historial los trunca con ellipsis (title
    // con el nombre completo) y las acciones «Ver»/«Descargar» permanecen dentro.
    const rows = manageDialog.locator('ul li')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator('span[title]')).toHaveAttribute('title', longName2)
    await expect(rows.nth(1).locator('span[title]')).toHaveAttribute('title', longName1)
    await expect(manageDialog.getByRole('button', { name: 'Ver v2' })).toBeInViewport()
    await expect(manageDialog.getByRole('button', { name: 'Descargar v2' })).toBeInViewport()
    await expect(manageDialog.getByRole('button', { name: 'Ver v1' })).toBeInViewport()
    await expect(manageDialog.getByRole('button', { name: 'Descargar v1' })).toBeInViewport()

    // La vista histórica usa sus propios bytes y deja el modal de gestión abierto.
    await manageDialog.getByRole('button', { name: 'Ver v1' }).click()
    const historicalPreview = page.getByRole('dialog', { name: `Vista previa de ${name}` })
    await expect(historicalPreview).toContainText('v1')
    await expect(historicalPreview.locator('pre')).toContainText('v1')
    await historicalPreview.getByRole('button', { name: 'Cerrar vista previa' }).click()
    await expect(manageDialog).toBeVisible()

    await manageDialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
    expect(consoleIssues).toEqual([])
  })
})
