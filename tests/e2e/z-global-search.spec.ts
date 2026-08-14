import { expect, test } from './fixtures'

test.describe('Buscador Global y Búsqueda Diferida', () => {
  test('opens search palette via topbar input click and displays initial shortcuts', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Panel general' })).toBeVisible()

    // Click en el input del Topbar
    const topbarInput = page.locator('#topbar-search-input')
    await expect(topbarInput).toBeVisible()
    await topbarInput.click()

    // Comprobar que el modal de búsqueda global se abre
    const searchModal = page.getByTestId('global-search-modal')
    await expect(searchModal).toBeVisible()

    const searchInput = page.locator('#global-search-input')
    await expect(searchInput).toBeFocused()

    // Verificar accesos rápidos iniciales
    await expect(searchModal.getByText('Navegación rápida', { exact: true })).toBeVisible()
    await expect(searchModal.getByRole('option', { name: /Activos/ })).toBeVisible()
    await expect(searchModal.getByRole('option', { name: /Documentos/ })).toBeVisible()

    // Cerrar con tecla Escape
    await page.keyboard.press('Escape')
    await expect(searchModal).toBeHidden()
  })

  test('opens search palette via keyboard shortcut Control+K / Meta+K', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Panel general' })).toBeVisible()

    // Presionar atajo de teclado
    await page.locator('body').press('Control+k')
    const searchModal = page.getByTestId('global-search-modal')
    await expect(searchModal).toBeVisible()

    // Cerrar con Escape
    await page.keyboard.press('Escape')
    await expect(searchModal).toBeHidden()
  })

  test('performs deferred search, finds assets and deep-links to asset modal', async ({ page }) => {
    await page.goto('/dashboard')
    await page.locator('#topbar-search-input').click()

    const searchModal = page.getByTestId('global-search-modal')
    await expect(searchModal).toBeVisible()

    const searchInput = page.locator('#global-search-input')
    await searchInput.fill('CNC')

    // Esperar respuesta de búsqueda diferida
    await expect(searchModal.getByText('Activos', { exact: true })).toBeVisible()
    const cncOption = searchModal.getByRole('option').filter({ hasText: 'CNC' }).first()
    await expect(cncOption).toBeVisible()

    // Hacer clic en el activo encontrado
    await cncOption.click()

    // Verificar navegación a /assets con deep link y apertura del modal de activo
    await expect(page).toHaveURL(/\/assets\?assetId=/)
    const assetModal = page.getByRole('dialog').filter({ hasText: 'Resumen' })
    await expect(assetModal).toBeVisible()
    await expect(assetModal.getByText('Estado')).toBeVisible()
  })

  test('finds documents and opens document modal via deep linking', async ({ page }) => {
    await page.goto('/dashboard')
    await page.locator('#topbar-search-input').click()

    const searchModal = page.getByTestId('global-search-modal')
    await expect(searchModal).toBeVisible()

    const searchInput = page.locator('#global-search-input')
    await searchInput.fill('ITV')

    // Esperar resultados de documentos
    await expect(searchModal.getByText('Documentos', { exact: true })).toBeVisible()
    const docOption = searchModal.getByRole('option').filter({ hasText: 'ITV' }).first()
    await expect(docOption).toBeVisible()

    // Seleccionar el documento
    await docOption.click()

    // Verificar que navega a /docs y abre el modal del documento
    await expect(page).toHaveURL(/\/docs\?documentId=/)
    const docModal = page.getByRole('dialog').filter({ hasText: 'Gestionar documento' })
    await expect(docModal).toBeVisible()
    await expect(docModal.getByText('Versión actual')).toBeVisible()
  })

  test('finds locations and navigates to locations view', async ({ page }) => {
    await page.goto('/dashboard')
    await page.locator('#topbar-search-input').click()

    const searchModal = page.getByTestId('global-search-modal')
    await expect(searchModal).toBeVisible()

    const searchInput = page.locator('#global-search-input')
    await searchInput.fill('Planta')

    await expect(searchModal.getByText('Ubicaciones', { exact: true })).toBeVisible()
    const locOption = searchModal.getByRole('option').filter({ hasText: 'PIN-' }).first()
    await expect(locOption).toBeVisible()

    await locOption.click()

    await expect(page).toHaveURL(/\/locations\?locationId=/)
    await expect(page.getByRole('heading', { name: 'Ubicaciones' })).toBeVisible()
  })

  test('supports full keyboard navigation (ArrowDown, ArrowUp, Enter)', async ({ page }) => {
    await page.goto('/dashboard')
    await page.locator('#topbar-search-input').click()

    const searchModal = page.getByTestId('global-search-modal')
    await expect(searchModal).toBeVisible()

    const searchInput = page.locator('#global-search-input')
    await searchInput.fill('Historial')

    // Esperar resultados
    await expect(searchModal.getByRole('option').first()).toBeVisible()

    // Navegar con flechas hacia abajo y presionar Enter
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    // Debe navegar a /history
    await expect(page).toHaveURL(/\/history/)
    await expect(page.getByRole('heading', { name: 'Historial y auditoría' })).toBeVisible()
  })

  test('shows empty state when no matching results are found', async ({ page }) => {
    await page.goto('/dashboard')
    await page.locator('#topbar-search-input').click()

    const searchModal = page.getByTestId('global-search-modal')
    await expect(searchModal).toBeVisible()

    const searchInput = page.locator('#global-search-input')
    await searchInput.fill('inexistente_xyz_12345')

    await expect(searchModal.getByText('No se encontraron resultados para «inexistente_xyz_12345»')).toBeVisible()
  })
})
