import { defineConfig, devices } from '@playwright/test'
import { E2E_DATABASE_URL } from './tests/helpers/database'

// La BD del webServer es SIEMPRE el destino E2E canónico (P0-REM-01): un
// DATABASE_URL/DOCUCORE_DB_PORT heredado del shell o del .env no puede hacer
// que la API de Playwright use 5435 u otra base.
const apiPort = process.env.DOCUCORE_E2E_API_PORT ?? '3185'
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
      timeout: 120_000,
      reuseExistingServer: true,
      env: {
        ...process.env,
        DATABASE_URL: E2E_DATABASE_URL,
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
      timeout: 120_000,
      reuseExistingServer: true,
      env: { ...process.env, VITE_API_PROXY_TARGET: apiUrl },
    },
    {
      command: 'tsx tests/helpers/referenceServer.ts',
      url: 'http://127.0.0.1:4173/docucore-prototype.html',
      timeout: 60_000,
      reuseExistingServer: true,
    },
  ],
})
