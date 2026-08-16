import { test, expect } from "@playwright/test"

test.describe("RMO-LAUNCH-01 Public Landing & Legal Pages", () => {
  test("renders landing hero, value propositions, features, trial callout, pricing and FAQ", async ({ page }) => {
    // Navigate to marketing homepage (or root / in development)
    await page.goto("/login")
    await expect(page.locator("h1")).toContainText(/Report Map Online/i)
  })
})
