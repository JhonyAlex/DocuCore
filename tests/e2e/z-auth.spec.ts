import { expect, test } from './fixtures'

const testActorHeader = { 'x-docucore-test-actor-id': '1' }

test.describe.serial('AUTH-01 sesiones reales', () => {
  test('protege una ruta profunda y conserva la sesión tras recargar hasta cerrar sesión', async ({ page, context }) => {
    await context.setExtraHTTPHeaders({})
    await context.clearCookies()
    try {
      await page.goto('/projects/1/assets')
      await expect(page.getByRole('heading', { name: 'Report Map Online' })).toBeVisible()

      await page.getByLabel('Correo electrónico').fill('maria@docucore.local')
      await page.getByLabel('Contraseña').fill('DocuCore!2026')
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()
      await expect(page).toHaveURL(/\/projects\/1\/assets$/)
      await expect(page.getByText('María Fernández')).toBeVisible()

      await page.reload()
      await expect(page.getByText('María Fernández')).toBeVisible()
      await page.getByTitle('Cerrar sesión').click()
      await expect(page.getByRole('heading', { name: 'Report Map Online' })).toBeVisible()
    } finally {
      await context.setExtraHTTPHeaders(testActorHeader)
    }
  })

  test('rechaza cuentas inactivas y no filtra proyectos ajenos mediante enlaces profundos', async ({ page, context }) => {
    await context.setExtraHTTPHeaders({})
    await context.clearCookies()
    try {
      await page.goto('/login')
      await page.getByLabel('Correo electrónico').fill('inactive@docucore.local')
      await page.getByLabel('Contraseña').fill('DocuCore!2026')
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()
      await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.')

      await page.getByLabel('Correo electrónico').fill('ltorres@docucore.local')
      await page.getByLabel('Contraseña').fill('DocuCore!2026')
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()
      await expect(page).toHaveURL(/\/projects$/)
      await page.goto('/projects/2/assets')
      await expect(page.getByText('Project access denied')).toBeVisible()
      await expect(page.getByText('CNC-05')).not.toBeVisible()
    } finally {
      await context.setExtraHTTPHeaders(testActorHeader)
    }
  })

  test('permite cambiar el nombre de usuario e iniciales desde Mi Cuenta y se actualiza inmediatamente', async ({ page, context }) => {
    await context.setExtraHTTPHeaders({})
    await context.clearCookies()
    try {
      await page.goto('/login')
      await page.getByLabel('Correo electrónico').fill('maria@docucore.local')
      await page.getByLabel('Contraseña').fill('DocuCore!2026')
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()
      await expect(page).toHaveURL(/\/projects$/)
      await expect(page.getByText('María Fernández')).toBeVisible()

      // Navigate to Account page
      await page.goto('/account')
      await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Perfil de usuario' })).toBeVisible()

      const nameInput = page.locator('#account-user-name')
      await expect(nameInput).toHaveValue('María Fernández')

      // Edit name
      await nameInput.fill('María F. Actualizada')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()

      // Success feedback
      await expect(page.getByRole('status')).toHaveText('Nombre de usuario actualizado correctamente.')

      // Check sidebar reflects updated name immediately without manual reload
      await expect(page.locator('aside').getByText('María F. Actualizada')).toBeVisible()

      // Reload page and ensure persistence
      await page.reload()
      await expect(nameInput).toHaveValue('María F. Actualizada')
      await expect(page.locator('aside').getByText('María F. Actualizada')).toBeVisible()

      // Restore original name
      await nameInput.fill('María Fernández')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByRole('status')).toHaveText('Nombre de usuario actualizado correctamente.')
      await expect(page.locator('aside').getByText('María Fernández')).toBeVisible()
    } finally {
      await context.setExtraHTTPHeaders(testActorHeader)
    }
  })
})
