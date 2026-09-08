import { expect, test } from './fixtures'
import { minimalPdf } from './pdf'

// COM-01: comentarios por UI — alta/edición/borrado en la ficha del activo
// (pestaña Resumen) y en el panel lateral del documento (cabecera
// «Comentarios · N»), con enlaces seguros, indicador «Editado» y
// confirmación de borrado.

async function createAsset(page: import('@playwright/test').Page, code: string): Promise<void> {
  const [typesRes, statusesRes] = await Promise.all([
    page.request.get('/api/asset-types'),
    page.request.get('/api/statuses'),
  ])
  const types = await typesRes.json() as Array<{ id: number }>
  const statuses = await statusesRes.json() as Array<{ id: number }>
  const response = await page.request.post('/api/assets', {
    data: {
      code,
      name: `Activo comentarios ${code}`,
      serialNumber: `SN-COM-${code}`,
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
}

async function createDocument(page: import('@playwright/test').Page, name: string): Promise<void> {
  const response = await page.request.post('/api/documents', {
    multipart: {
      name,
      type: 'Manual',
      projectId: '1',
      assetIds: JSON.stringify([]),
      issueDate: '2026-07-15',
      file: { name: 'comentario-e2e.pdf', mimeType: 'application/pdf', buffer: minimalPdf(1) },
    },
  })
  expect(response.status()).toBe(201)
}

async function searchAssets(page: import('@playwright/test').Page, search: string): Promise<void> {
  const response = page.waitForResponse((candidate) => candidate.url().includes('/api/assets?') && candidate.url().includes(`search=${encodeURIComponent(search)}`) && candidate.request().method() === 'GET')
  await page.getByPlaceholder('Buscar por nombre, código, serie…').fill(search)
  await response
}

test.describe.serial('comments', () => {
  test('adds, edits and deletes an asset comment from the Resumen tab', async ({ page, consoleIssues }) => {
    const code = `QA-COM-${Date.now()}`
    await createAsset(page, code)
    await page.goto('/assets')
    await searchAssets(page, code)
    await page.locator('tbody tr', { hasText: code }).click()
    const assetDialog = page.getByRole('dialog', { name: `Activo comentarios ${code}` })
    await expect(assetDialog).toBeVisible()
    const commentsPanel = assetDialog.getByRole('region', { name: 'Comentarios' })
    await expect(commentsPanel.getByText('Sin comentarios todavía.', { exact: false })).toBeVisible()

    // Alta con texto multilínea y URL segura.
    await commentsPanel.getByLabel('Nuevo comentario').fill(`Primera nota del activo ${code}\ncon segunda línea y https://ejemplo.com/manual.pdf`)
    await commentsPanel.getByRole('button', { name: 'Comentar', exact: true }).click()
    await expect(commentsPanel.getByText(`Primera nota del activo ${code}`, { exact: false })).toBeVisible()
    const link = commentsPanel.locator('a', { hasText: 'https://ejemplo.com/manual.pdf' })
    await expect(link).toHaveAttribute('href', 'https://ejemplo.com/manual.pdf')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)

    // El comentario persiste al reabrir la ficha.
    await assetDialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    await page.locator('tbody tr', { hasText: code }).click()
    const reopenedPanel = page.getByRole('region', { name: 'Comentarios' })
    await expect(reopenedPanel.getByText('Primera nota del activo', { exact: false })).toBeVisible()
    await expect(reopenedPanel.getByText('María Fernández', { exact: true }).first()).toBeVisible()

    // Edición inline desde el menú ⋯ (portal a body); aparece «Editado».
    await reopenedPanel.getByRole('button', { name: /Acciones del comentario/ }).click()
    await page.getByRole('menuitem', { name: 'Editar' }).click()
    const editArea = reopenedPanel.getByLabel('Editar comentario')
    await editArea.fill('Nota corregida tras la revisión')
    await reopenedPanel.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(reopenedPanel.getByText('Nota corregida tras la revisión', { exact: true })).toBeVisible()
    await expect(reopenedPanel.getByText('· Editado', { exact: true })).toBeVisible()

    // Borrado con confirmación.
    await reopenedPanel.getByRole('button', { name: /Acciones del comentario/ }).click()
    await page.getByRole('menuitem', { name: 'Eliminar' }).click()
    const deleteDialog = page.getByRole('dialog', { name: 'Eliminar comentario' })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Eliminar comentario' })).toBeHidden()
    await expect(reopenedPanel.getByText('Nota corregida tras la revisión', { exact: true })).toBeHidden()
    await expect(reopenedPanel.getByText('Sin comentarios todavía.', { exact: false })).toBeVisible()
    expect(consoleIssues).toEqual([])
  })

  test('opens the document comments drawer from the header and loads on demand', async ({ page, consoleIssues }) => {
    const docName = `E2E Comentarios Doc ${Date.now()}`
    await createDocument(page, docName)
    await page.goto('/docs')
    await page.getByText(docName, { exact: true }).click()
    const manageDialog = page.getByRole('dialog', { name: docName })
    const commentsButton = manageDialog.getByRole('button', { name: 'Comentarios', exact: true })
    await expect(commentsButton).toBeVisible()

    await commentsButton.click()
    const drawer = manageDialog.getByRole('complementary', { name: 'Comentarios del documento' })
    await expect(drawer).toBeVisible()
    const commentsPanel = drawer.getByRole('region', { name: 'Comentarios' })
    await expect(commentsPanel.getByText('Sin comentarios todavía.', { exact: false })).toBeVisible()

    await commentsPanel.getByLabel('Nuevo comentario').fill(`Nota documental ${docName}`)
    await commentsPanel.getByRole('button', { name: 'Comentar', exact: true }).click()
    await expect(commentsPanel.getByText(`Nota documental ${docName}`, { exact: true })).toBeVisible()
    // El contador ligero de la cabecera se actualiza con la operación.
    await expect(manageDialog.getByRole('button', { name: 'Comentarios · 1', exact: true })).toBeVisible()

    // Escape cierra primero el panel y, en un segundo Escape, el modal.
    await page.keyboard.press('Escape')
    await expect(commentsPanel).toBeHidden()
    await expect(manageDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(manageDialog).toBeHidden()

    // Al reabrir, la lista se carga bajo demanda y conserva el comentario.
    await page.getByText(docName, { exact: true }).click()
    const reopened = page.getByRole('dialog', { name: docName })
    await expect(reopened.getByRole('button', { name: 'Comentarios · 1', exact: true })).toBeVisible()
    await expect(reopened.locator('section[aria-label="Comentarios"]')).toBeHidden()
    await reopened.getByRole('button', { name: 'Comentarios · 1', exact: true }).click()
    await expect(reopened.getByText(`Nota documental ${docName}`, { exact: true })).toBeVisible()
    expect(consoleIssues).toEqual([])
  })

  test('preserves main content space with ~35% expanded desktop modal in AssetModal and stable comments panel', async ({ page, consoleIssues }) => {
    const code = `QA-WIDTH-${Date.now()}`
    await createAsset(page, code)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/assets')
    await searchAssets(page, code)
    await page.locator('tbody tr', { hasText: code }).click()

    const assetDialog = page.getByRole('dialog', { name: `Activo comentarios ${code}` })
    await expect(assetDialog).toBeVisible()

    const dialogBox = await assetDialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    // El modal en escritorio debe crecer ~35% sobre 768 px (~1036 px → lg:max-w-[1040px]).
    expect(dialogBox!.width).toBeGreaterThanOrEqual(1020)
    expect(dialogBox!.width).toBeLessThanOrEqual(1060)

    const commentsPanel = assetDialog.locator('aside')
    const commentsBox = await commentsPanel.boundingBox()
    expect(commentsBox).not.toBeNull()
    // Ancho cómodo y estable a la derecha (~350 px).
    expect(commentsBox!.width).toBeGreaterThanOrEqual(340)
    expect(commentsBox!.width).toBeLessThanOrEqual(360)

    // La zona principal conserva el espacio original del activo (~670-700 px).
    const mainSection = assetDialog.locator('div.min-h-0.flex-1.flex.flex-col.lg\\:flex-row > div:first-child')
    const mainBox = await mainSection.boundingBox()
    expect(mainBox).not.toBeNull()
    expect(mainBox!.width).toBeGreaterThanOrEqual(660)

    expect(consoleIssues).toEqual([])
  })

  test('expands DocumentModal horizontally on comments open and preserves useful width of form and preview', async ({ page, consoleIssues }) => {
    const docName = `E2E Expansión Doc ${Date.now()}`
    await createDocument(page, docName)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/docs')
    await page.getByText(docName, { exact: true }).click()

    const manageDialog = page.getByRole('dialog', { name: docName })
    await expect(manageDialog).toBeVisible()

    // Ancho inicial cerrado: max-w-5xl (~1024 px).
    const initialDialogBox = await manageDialog.boundingBox()
    expect(initialDialogBox).not.toBeNull()
    expect(initialDialogBox!.width).toBeLessThanOrEqual(1040)

    // Medir ancho del formulario y vista previa iniciales.
    const formCol = manageDialog.locator('div.lg\\:col-span-5').first()
    const previewCol = manageDialog.locator('div.lg\\:col-span-7').first()
    const initialFormBox = await formCol.boundingBox()
    const initialPreviewBox = await previewCol.boundingBox()
    expect(initialFormBox).not.toBeNull()
    expect(initialPreviewBox).not.toBeNull()

    // Abrir comentarios: el modal debe expandirse horizontalmente.
    await manageDialog.getByRole('button', { name: 'Comentarios', exact: true }).click()
    const commentsAside = manageDialog.getByRole('complementary', { name: 'Comentarios del documento' })
    await expect(commentsAside).toBeVisible()

    await expect.poll(async () => {
      const box = await manageDialog.boundingBox()
      return box?.width ?? 0
    }).toBeGreaterThanOrEqual(1360)

    // El ancho útil del formulario y de la vista previa se conserva prácticamente idéntico (delta < 20 px).
    await expect.poll(async () => {
      const form = await formCol.boundingBox()
      return form?.width ?? 0
    }).toBeGreaterThanOrEqual(initialFormBox!.width - 20)

    await expect.poll(async () => {
      const prev = await previewCol.boundingBox()
      return prev?.width ?? 0
    }).toBeGreaterThanOrEqual(initialPreviewBox!.width - 20)

    // Al cerrar comentarios, el modal recupera su tamaño normal.
    await commentsAside.getByRole('button', { name: 'Cerrar comentarios' }).click()
    await expect(commentsAside).toBeHidden()

    await expect.poll(async () => {
      const box = await manageDialog.boundingBox()
      return box?.width ?? 0
    }).toBeLessThanOrEqual(1040)

    expect(consoleIssues).toEqual([])
  })

  test('isolates drafts and resets open state between different entities', async ({ page, consoleIssues }) => {
    const codeA = `QA-DRAFT-A-${Date.now()}`
    const codeB = `QA-DRAFT-B-${Date.now()}`
    await createAsset(page, codeA)
    await createAsset(page, codeB)

    await page.goto('/assets')
    await searchAssets(page, codeA)
    await page.locator('tbody tr', { hasText: codeA }).click()

    const dialogA = page.getByRole('dialog', { name: `Activo comentarios ${codeA}` })
    await expect(dialogA).toBeVisible()
    const textareaA = dialogA.getByLabel('Nuevo comentario')
    await textareaA.fill('Borrador confidencial para activo A no enviado')
    expect(await textareaA.inputValue()).toBe('Borrador confidencial para activo A no enviado')

    // Cerrar y abrir activo B: el borrador de A NO debe aparecer en B.
    await dialogA.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    await searchAssets(page, codeB)
    await page.locator('tbody tr', { hasText: codeB }).click()

    const dialogB = page.getByRole('dialog', { name: `Activo comentarios ${codeB}` })
    await expect(dialogB).toBeVisible()
    const textareaB = dialogB.getByLabel('Nuevo comentario')
    expect(await textareaB.inputValue()).toBe('')
    await dialogB.getByRole('button', { name: 'Cerrar', exact: true }).last().click()

    // Comprobar también en Documentos: el borrador y panel abierto no se arrastran entre documentos.
    const docA = `E2E Doc Draft A ${Date.now()}`
    const docB = `E2E Doc Draft B ${Date.now()}`
    await createDocument(page, docA)
    await createDocument(page, docB)

    await page.goto('/docs')
    await page.getByText(docA, { exact: true }).click()
    const docDialogA = page.getByRole('dialog', { name: docA })
    await docDialogA.getByRole('button', { name: 'Comentarios', exact: true }).click()
    const docCommentsA = docDialogA.getByRole('region', { name: 'Comentarios' })
    await docCommentsA.getByLabel('Nuevo comentario').fill('Borrador pendiente en documento A')

    // Cerrar doc A y abrir doc B: el panel de comentarios debe estar CERRADO y su borrador limpio.
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(docDialogA).toBeHidden()
    await page.getByText(docB, { exact: true }).click()
    const docDialogB = page.getByRole('dialog', { name: docB })
    // El panel de comentarios debe arrancar cerrado en el nuevo documento.
    await expect(docDialogB.locator('section[aria-label="Comentarios"]')).toBeHidden()

    // Al abrir comentarios en doc B, el textarea debe estar vacío.
    await docDialogB.getByRole('button', { name: 'Comentarios', exact: true }).click()
    const docCommentsB = docDialogB.getByRole('region', { name: 'Comentarios' })
    expect(await docCommentsB.getByLabel('Nuevo comentario').inputValue()).toBe('')

    expect(consoleIssues).toEqual([])
  })

  test('adapts cleanly in laptop and mobile viewports without horizontal overflow', async ({ page, consoleIssues }) => {
    const docName = `E2E Responsive Doc ${Date.now()}`
    await createDocument(page, docName)

    // Portátil 1280x800
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/docs')
    await page.getByText(docName, { exact: true }).click()
    const dialogLaptop = page.getByRole('dialog', { name: docName })
    await expect(dialogLaptop).toBeVisible()
    await dialogLaptop.getByRole('button', { name: 'Comentarios', exact: true }).click()
    await expect(dialogLaptop.getByRole('region', { name: 'Comentarios' })).toBeVisible()

    // Comprobar ausencia de desbordamiento horizontal en el viewport.
    const laptopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(laptopOverflow).toBe(false)
    await page.keyboard.press('Escape')

    // Móvil 375x667
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(dialogLaptop).toBeVisible()
    await dialogLaptop.getByRole('button', { name: 'Comentarios', exact: true }).click()

    const commentsMobile = dialogLaptop.getByRole('region', { name: 'Comentarios' })
    await expect(commentsMobile).toBeVisible()
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(mobileOverflow).toBe(false)

    // Escape en móvil cierra el drawer de comentarios sin cerrar el modal.
    await page.keyboard.press('Escape')
    await expect(commentsMobile).toBeHidden()
    await expect(dialogLaptop).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialogLaptop).toBeHidden()

    // Móvil en AssetModal: apilado vertical, comentarios visibles sin overflow horizontal.
    const assetCode = `QA-RESP-${Date.now()}`
    await createAsset(page, assetCode)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/assets')
    await searchAssets(page, assetCode)
    await page.locator('tbody tr', { hasText: assetCode }).click()
    const assetModal = page.getByRole('dialog', { name: `Activo comentarios ${assetCode}` })
    await expect(assetModal).toBeVisible()

    await page.setViewportSize({ width: 375, height: 667 })
    const assetMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(assetMobileOverflow).toBe(false)
    const assetComments = assetModal.getByRole('region', { name: 'Comentarios' })
    await expect(assetComments).toBeVisible()

    expect(consoleIssues).toEqual([])
  })

  test('validates form and preview useful width before and after comments across all standard viewports', async ({ page, consoleIssues }) => {
    const docName = `E2E Viewports Doc ${Date.now()}`
    await createDocument(page, docName)

    const viewports = [
      { width: 1280, height: 800, expectedMode: 'drawer' },
      { width: 1366, height: 768, expectedMode: 'drawer' },
      { width: 1440, height: 900, expectedMode: 'inline' },
      { width: 1536, height: 864, expectedMode: 'inline' },
      { width: 1920, height: 1080, expectedMode: 'inline' },
    ]

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/docs')
      await page.getByText(docName, { exact: true }).click()

      const dialog = page.getByRole('dialog', { name: docName })
      await expect(dialog).toBeVisible()

      const formCol = dialog.locator('div.lg\\:col-span-5').first()
      const previewCol = dialog.locator('div.lg\\:col-span-7').first()

      const beforeForm = (await formCol.boundingBox())!.width
      const beforePreview = (await previewCol.boundingBox())!.width

      // Abrir comentarios
      await dialog.getByRole('button', { name: 'Comentarios', exact: true }).click()
      const commentsAside = dialog.getByRole('complementary', { name: 'Comentarios del documento' })
      await expect(commentsAside).toBeVisible()

      // Verificar modo (drawer vs inline 3ª columna)
      const asidePosition = await commentsAside.evaluate((el) => window.getComputedStyle(el).position)
      if (vp.expectedMode === 'drawer') {
        expect(asidePosition).toBe('fixed')
      } else {
        expect(asidePosition).toBe('static')
      }

      // Medir ancho tras abrir comentarios
      const afterForm = (await formCol.boundingBox())!.width
      const afterPreview = (await previewCol.boundingBox())!.width

      // En NINGÚN viewport se pierde ancho útil de forma apreciable (tolerancia estricta <= 10 px, < 1% de la columna)
      expect(Math.abs(afterForm - beforeForm)).toBeLessThanOrEqual(10)
      expect(Math.abs(afterPreview - beforePreview)).toBeLessThanOrEqual(10)

      // Cero desbordamiento horizontal
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      expect(hasOverflow).toBe(false)

      // Cerrar comentarios (1er Escape) y cerrar diálogo (2º Escape)
      await page.keyboard.press('Escape')
      await expect(commentsAside).toBeHidden()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }

    expect(consoleIssues).toEqual([])
  })
})
