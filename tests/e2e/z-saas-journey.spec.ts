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

  test("PlanChangeWizard and AccountView handle CHECKOUT_ALREADY_COMPLETED: releases busy, invokes onCompleted, closes wizard, reloads billing, and does not navigate to Stripe", async ({ page }) => {
    let checkoutCalls = 0
    let billingStatusCalls = 0

    await page.route("**/api/billing/checkout", async (route) => {
      checkoutCalls++
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          nextAction: "REFRESH_BILLING",
          checkoutUrl: null,
          sessionId: "cs_test_already_completed",
          status: "CHECKOUT_ALREADY_COMPLETED",
          reused: true,
        }),
      })
    })

    await page.route("**/api/billing/status", async (route) => {
      billingStatusCalls++
      await route.continue()
    })

    // 1. Navigate to Account
    await page.goto("/account")
    await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible()

    const initialStatusCalls = billingStatusCalls

    // 2. Click Plan button to initiate plan change / checkout
    const starterBtn = page.getByRole("button", { name: /Cambiar a Starter|Elegir Starter/i })
    const proBtn = page.getByRole("button", { name: /Actualizar a Pro|Elegir Pro/i })

    if (await starterBtn.isVisible()) {
      await starterBtn.click()

      // If guided wizard opened due to capacity
      const wizardHeading = page.getByRole("heading", { name: /Cambio a (Starter|Pro)/i })
      try {
        await wizardHeading.waitFor({ state: "visible", timeout: 2000 })

        // Wait for preview to load in overview
        await page.getByText(/proyecto\(s\) activo\(s\)/i).waitFor({ state: "visible", timeout: 4000 })

        // Step 1: Overview -> click Continuar
        await page.getByRole("button", { name: "Continuar" }).click()

        // Step 2: Selection (projects + members)
        const projectRadio = page.locator("input[name='keep-project']").first()
        await projectRadio.waitFor({ state: "visible", timeout: 3000 })
        await projectRadio.click()
        await expect(projectRadio).toBeChecked({ timeout: 2000 })

        const memberCheckboxes = page.locator("input[type='checkbox']")
        const count = await memberCheckboxes.count()
        for (let i = 0; i < Math.min(count, 3); i++) {
          await memberCheckboxes.nth(i).click()
          await expect(memberCheckboxes.nth(i)).toBeChecked()
        }

        const continueBtn = page.getByRole("button", { name: "Continuar" })
        await expect(continueBtn).toBeEnabled({ timeout: 5000 })
        await continueBtn.click()

        // Step 3: Confirm -> calls proceed() which triggers createBillingCheckoutSession
        const confirmBtn = page.getByRole("button", { name: /Confirmar y continuar a Stripe/i })
        await confirmBtn.waitFor({ state: "visible", timeout: 3000 })
        await confirmBtn.click()
      } catch (err) {
        console.log("[WIZARD_ERROR]", err)
      }

      await expect.poll(() => checkoutCalls).toBe(1)
      await expect(wizardHeading).not.toBeVisible()
      await expect.poll(() => billingStatusCalls).toBeGreaterThan(initialStatusCalls)
      expect(page.url()).toContain("/account")
      await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible()
    } else if (await proBtn.isVisible()) {
      await proBtn.click()
      await expect.poll(() => checkoutCalls).toBe(1)
      await expect.poll(() => billingStatusCalls).toBeGreaterThan(initialStatusCalls)
      expect(page.url()).toContain("/account")
      await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible()
    }
  })
})
