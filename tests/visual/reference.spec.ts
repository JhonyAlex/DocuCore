import type { Browser, Page, TestInfo } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { compareImages, VISUAL_THRESHOLD_PERCENT, visualOutputPath } from './imageDiff'

type Theme = 'dark' | 'light'

type VisualTarget = {
  name: string
  route: string
  referenceView: string
  heading: string
  modal?: boolean
}

const targets: VisualTarget[] = [
  { name: 'dashboard', route: '/dashboard', referenceView: 'dashboard', heading: 'Panel general' },
  { name: 'projects', route: '/projects', referenceView: 'projects', heading: 'Proyectos' },
  { name: 'items', route: '/items', referenceView: 'items', heading: 'Activos e ítems' },
  { name: 'documents', route: '/docs', referenceView: 'docs', heading: 'Documentos' },
  { name: 'calendar', route: '/calendar', referenceView: 'calendar', heading: 'Calendario' },
  { name: 'plans', route: '/plans', referenceView: 'plans', heading: 'Planos interactivos' },
  { name: 'locations', route: '/locations', referenceView: 'locations', heading: 'Ubicaciones' },
  { name: 'history', route: '/history', referenceView: 'history', heading: 'Historial y auditoría' },
  { name: 'config', route: '/config', referenceView: 'config', heading: 'Configuración' },
  { name: 'item-modal', route: '/items', referenceView: 'items', heading: 'Torno CNC Haas ST-20', modal: true },
]

const variants: Array<{ name: string; width: number; height: number; theme: Theme }> = [
  { name: '1440x1000-dark', width: 1440, height: 1000, theme: 'dark' },
  { name: '1440x1000-light', width: 1440, height: 1000, theme: 'light' },
  { name: '1920x1080-dark', width: 1920, height: 1080, theme: 'dark' },
]

async function setTheme(page: Page, theme: Theme): Promise<void> {
  await expect(page.locator('html')).toHaveClass(/dark/)
  if (theme === 'light') {
    await page.getByTitle('Cambiar tema').click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  }
}

async function openAppTarget(page: Page, target: VisualTarget, theme: Theme): Promise<void> {
  await page.goto(target.route, { waitUntil: 'domcontentloaded' })
  // El shell carga la sesión (proyecto activo + usuario) de forma asíncrona.
  await expect(page.getByText('María Fernández', { exact: true }).first()).toBeVisible()
  if (target.route === '/items') {
    await expect(page.getByText('CNC-05', { exact: true })).toBeVisible()
  }
  if (target.route === '/locations') {
    await expect(page.getByRole('heading', { name: 'Planta 1 · Nave A', exact: true })).toBeVisible()
  }
  await setTheme(page, theme)

  if (target.modal) {
    await page.locator('tbody tr').filter({ hasText: 'CNC-05' }).click()
  }
  await expect(page.getByRole('heading', { name: target.heading, exact: true })).toBeVisible()
}

async function openReferenceTarget(page: Page, target: VisualTarget, theme: Theme): Promise<void> {
  await page.goto('http://127.0.0.1:4173/docucore-prototype.html', { waitUntil: 'domcontentloaded' })
  await setTheme(page, theme)
  if (target.referenceView !== 'dashboard') {
    await page.locator(`[data-view="${target.referenceView}"]`).click()
  }
  if (target.modal) {
    await page.locator('[data-item="1"]').first().click()
  }
  await expect(page.getByRole('heading', { name: target.heading, exact: true })).toBeVisible()
}

async function attachDiff(testInfo: TestInfo, name: string, result: Awaited<ReturnType<typeof compareImages>>): Promise<void> {
  const metrics = JSON.stringify({
    name,
    thresholdPercent: VISUAL_THRESHOLD_PERCENT,
    mismatchPixels: result.mismatchPixels,
    mismatchPercent: result.mismatchPercent,
  }, null, 2)
  await Promise.all([
    testInfo.attach(`${name}-metrics`, { body: metrics, contentType: 'application/json' }),
    testInfo.attach(`${name}-app`, { path: result.appPath, contentType: 'image/png' }),
    testInfo.attach(`${name}-reference`, { path: result.referencePath, contentType: 'image/png' }),
    testInfo.attach(`${name}-diff`, { path: result.diffPath, contentType: 'image/png' }),
  ])
}

async function compareTarget(browser: Browser, testInfo: TestInfo, target: VisualTarget, variant: typeof variants[number]): Promise<void> {
  const name = `${target.name}-${variant.name}`
  const context = await browser.newContext({
    viewport: { width: variant.width, height: variant.height },
    deviceScaleFactor: 1,
  })
  const appPage = await context.newPage()
  const referencePage = await context.newPage()

  try {
    await Promise.all([appPage.emulateMedia({ reducedMotion: 'reduce' }), referencePage.emulateMedia({ reducedMotion: 'reduce' })])
    await openAppTarget(appPage, target, variant.theme)
    await openReferenceTarget(referencePage, target, variant.theme)

    const [appPath, referencePath] = await Promise.all([
      visualOutputPath(name, 'app'),
      visualOutputPath(name, 'reference'),
    ])
    await Promise.all([
      appPage.screenshot({ path: appPath, animations: 'disabled' }),
      referencePage.screenshot({ path: referencePath, animations: 'disabled' }),
    ])

    const result = await compareImages(name, appPath, referencePath)
    console.log(`${name}: ${result.mismatchPixels} pixels (${result.mismatchPercent.toFixed(4)}%) differ; threshold ${VISUAL_THRESHOLD_PERCENT}%.`)
    await attachDiff(testInfo, name, result)
    expect(result.mismatchPercent, `${name} exceeds the ${VISUAL_THRESHOLD_PERCENT}% visual mismatch threshold.`).toBeLessThanOrEqual(VISUAL_THRESHOLD_PERCENT)
  } finally {
    await context.close()
  }
}

test.describe('Visual fidelity against protected reference @visual', () => {
  for (const variant of variants) {
    for (const target of targets) {
      test(`${target.name} ${variant.name} @visual`, async ({ browser }, testInfo) => {
        await compareTarget(browser, testInfo, target, variant)
      })
    }
  }
})
