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
})
