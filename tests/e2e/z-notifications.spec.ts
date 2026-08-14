import { expect, test } from './fixtures'

test.describe('Sistema de notificaciones', () => {
  test('opens notifications popover from Topbar, filters, marks as read, and navigates', async ({ page, consoleIssues }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('María Fernández', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Panel general', exact: true })).toBeVisible()

    // El botón de la campana debe existir
    const bellBtn = page.getByRole('button', { name: 'Notificaciones' })
    await expect(bellBtn).toBeVisible()

    // Abrir popover
    await bellBtn.click()
    const popover = page.getByRole('dialog', { name: 'Panel de notificaciones' })
    await expect(popover).toBeVisible()
    await expect(popover.getByRole('heading', { name: 'Notificaciones', exact: true })).toBeVisible()

    // Verificar que contiene notificaciones
    const items = popover.locator('.divide-y > div')
    await expect(items.first()).toBeVisible()
    const initialCount = await items.count()
    expect(initialCount).toBeGreaterThan(0)

    // Probar filtro de pestañas
    const allTab = popover.getByRole('button', { name: /^Todas/ })
    const unreadTab = popover.getByRole('button', { name: /^No leídas/ })
    const criticalTab = popover.getByRole('button', { name: /^Críticas/ })

    await criticalTab.click()
    await expect(items.first()).toBeVisible()

    await allTab.click()
    await expect(items.first()).toBeVisible()

    // Probar marcar todas como leídas si hay botón
    const markAllBtn = popover.getByRole('button', { name: 'Marcar leídas' })
    if (await markAllBtn.isVisible()) {
      await markAllBtn.click()
      await expect(markAllBtn).toBeHidden()
    }

    // Probar pestaña no leídas (ahora vacía tras marcar todas)
    await unreadTab.click()
    await expect(popover.getByText('No hay notificaciones')).toBeVisible()

    // Volver a todas
    await allTab.click()

    // Cerrar con Escape
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()

    // Volver a abrir
    await bellBtn.click()
    await expect(popover).toBeVisible()

    // Clic en la primera notificación debe navegar y cerrar el popover
    await items.first().click()
    await expect(popover).toBeHidden()

    expect(consoleIssues).toEqual([])
  })

  test('closes notifications popover on outside click', async ({ page, consoleIssues }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('María Fernández', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Panel general', exact: true })).toBeVisible()

    const bellBtn = page.getByRole('button', { name: 'Notificaciones' })
    await bellBtn.click()
    const popover = page.getByRole('dialog', { name: 'Panel de notificaciones' })
    await expect(popover).toBeVisible()

    // Clic fuera en el fondo de la página
    await page.locator('main').first().click({ position: { x: 50, y: 200 } })
    await expect(popover).toBeHidden()

    expect(consoleIssues).toEqual([])
  })
})
