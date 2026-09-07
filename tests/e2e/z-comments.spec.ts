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
})
