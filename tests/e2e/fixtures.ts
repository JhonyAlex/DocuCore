import { expect, test as base } from '@playwright/test'

type ConsoleFixture = {
  consoleErrors: string[]
}

export const test = base.extend<ConsoleFixture>({
  consoleErrors: async ({ page }, use, testInfo) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await use(errors)

    expect(errors, `Unexpected browser errors in ${testInfo.title}`).toEqual([])
  },
})

export { expect }
