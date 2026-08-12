import { expect, test as base } from '@playwright/test'

type ConsoleFixture = {
  consoleIssues: string[]
}

export const test = base.extend<ConsoleFixture>({
  consoleIssues: async ({ page }, runFixture, testInfo) => {
    const issues: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') issues.push(message.text())
    })
    page.on('pageerror', (error) => issues.push(error.message))

    await runFixture(issues)

    expect(issues, `Unexpected browser console issues in ${testInfo.title}`).toEqual([])
  },
})

export { expect }
