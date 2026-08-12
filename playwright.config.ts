import { defineConfig, devices } from '@playwright/test'

const databaseUrl = process.env.DATABASE_URL ?? `postgresql://docucore:docucore@127.0.0.1:${process.env.DOCUCORE_DB_PORT ?? '5436'}/docucore?schema=public`
const apiPort = process.env.DOCUCORE_E2E_API_PORT ?? '3101'
const apiUrl = `http://127.0.0.1:${apiPort}`

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: 'test-results/playwright',
  reporter: [['list', { omitTags: true }], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  globalSetup: './tests/e2e/globalSetup.ts',
  globalTeardown: './tests/e2e/globalTeardown.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm start',
      url: `${apiUrl}/api/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DOCUCORE_NOW: '2026-07-15T00:00:00.000Z',
        NODE_ENV: 'test',
        PORT: apiPort,
        DOCUMENT_STORAGE_PATH: `${process.cwd()}/test-results/e2e-documents`,
        FLOOR_PLAN_STORAGE_PATH: `${process.cwd()}/test-results/e2e-floor-plans`,
      },
    },
    {
      command: 'pnpm dev',
      url: 'http://127.0.0.1:5173',
      timeout: 60_000,
      reuseExistingServer: false,
      env: { ...process.env, VITE_API_PROXY_TARGET: apiUrl },
    },
    {
      command: 'tsx tests/helpers/referenceServer.ts',
      url: 'http://127.0.0.1:4173/docucore-prototype.html',
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
})
