import { expect, test } from "./fixtures"

test.describe.serial("SAAS-07 SaaS User Journey", () => {
  test("completes public landing, registration, login and account billing inspection", async ({ page, context }) => {
    await context.setExtraHTTPHeaders({})
    await context.clearCookies()

    const stamp = Date.now()
    const newEmail = `journey.${stamp}@docucore.test`

    // 1. App entry
    await page.goto("/login")
    await expect(page).toHaveTitle(/Report Map Online/)
    await expect(page.getByRole("heading", { name: "Report Map Online" })).toBeVisible()

    // 2. Click Register CTA
    await page.getByRole("link", { name: "Crear cuenta (14 días gratis)" }).click()
    await expect(page).toHaveURL(/\/register$/)
    await expect(page.getByRole("heading", { name: "Crear cuenta en Report Map Online" })).toBeVisible()

    // 3. Fill registration
    await page.getByPlaceholder("Ej. Ana Martínez").fill("Elena Ingeniera")
    await page.getByPlaceholder("Ej. Industrias Metalmecánicas Norte").fill(`Fábrica Elena ${stamp}`)
    await page.getByPlaceholder("ana.martinez@empresa.com").fill(newEmail)
    await page.locator("input[type='password']").first().fill("SecureElenaPassword2026!")
    await page.locator("input[type='password']").nth(1).fill("SecureElenaPassword2026!")
    await page.getByRole("button", { name: "Iniciar prueba gratuita de 14 días" }).click()

    // 4. Verification notice visible
    await expect(page.getByRole("heading", { name: "Verifica tu correo electrónico" })).toBeVisible()
    await expect(page.getByText(newEmail)).toBeVisible()

    // 5. Login as verified member (María Fernández)
    await page.goto("/login")
    await page.getByLabel("Correo electrónico").fill("maria@docucore.local")
    await page.getByLabel("Contraseña").fill("DocuCore!2026")
    await page.getByRole("button", { name: "Iniciar sesión" }).click()

    // 6. Projects page
    await page.waitForURL(/\/projects/, { timeout: 10000 })
    await expect(page.getByRole("heading", { name: "Proyectos", level: 1 })).toBeVisible()

    // 7. Navigate to Account / Billing
    await page.goto("/account")
    await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible()
    await expect(page.getByText("Suscripción y facturación")).toBeVisible()
    await expect(page.getByText("Plan Pro").first()).toBeVisible()
    await expect(page.getByText("Garantía de preservación de datos")).toBeVisible()
  })
})
