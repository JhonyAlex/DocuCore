import { access, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { BrowserContext, Page, TestInfo } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { compareImages, VISUAL_THRESHOLD_PERCENT, visualOutputPath } from './imageDiff'
import { installProtectedVisualFixtures } from './contractFixtures'

type Theme = 'dark' | 'light'

type VisualTarget = {
  name: string
  route: string
  referenceView: string
  heading: string
  // ITEM-06: la app usa «Activos»; el HTML de referencia (protegido) mantiene
  // «Activos e ítems», así que cada lado espera su propio heading.
  referenceHeading?: string
  modal?: boolean
  // Estas superficies evolucionaron deliberadamente más allá del prototipo
  // protegido. Su estado de reposo aprobado se compara con un baseline
  // versionado, sin cambiar el umbral ni ocultar funcionalidad.
  evolvedContract?: boolean
}

const targets: VisualTarget[] = [
  { name: 'dashboard', route: '/projects/1/dashboard', referenceView: 'dashboard', heading: 'Panel general' },
  { name: 'projects', route: '/projects/1/portfolio', referenceView: 'projects', heading: 'Proyectos' },
  { name: 'items', route: '/projects/1/assets', referenceView: 'items', heading: 'Activos', referenceHeading: 'Activos e ítems', evolvedContract: true },
  { name: 'documents', route: '/projects/1/docs', referenceView: 'docs', heading: 'Documentos', evolvedContract: true },
  { name: 'calendar', route: '/projects/1/calendar', referenceView: 'calendar', heading: 'Calendario', evolvedContract: true },
  { name: 'plans', route: '/projects/1/plans', referenceView: 'plans', heading: 'Planos interactivos', evolvedContract: true },
  { name: 'locations', route: '/projects/1/locations', referenceView: 'locations', heading: 'Ubicaciones' },
  { name: 'history', route: '/projects/1/history', referenceView: 'history', heading: 'Historial y auditoría' },
  { name: 'config', route: '/projects/1/config', referenceView: 'config', heading: 'Configuración', evolvedContract: true },
  { name: 'item-modal', route: '/projects/1/assets', referenceView: 'items', heading: 'Torno CNC Haas ST-20', modal: true, evolvedContract: true },
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
  if (target.name === 'dashboard' || target.name === 'locations' || target.name === 'history') {
    await installProtectedVisualFixtures(page, target.name)
  }
  await page.goto(target.route, { waitUntil: 'domcontentloaded' })
  // El shell carga la sesión (proyecto activo + usuario) de forma asíncrona.
  await expect(page.getByText('María Fernández', { exact: true }).first()).toBeVisible()
  if (target.name === 'items' || target.name === 'item-modal') {
    await expect(page.getByText('CNC-05', { exact: true })).toBeVisible()
  }
  if (target.name === 'documents') {
    await expect(page.getByText('Certificado ITV 2025', { exact: true })).toBeVisible()
  }
  if (target.name === 'calendar') {
    // La primera carga fija `view` y `date` en la URL, lo que provoca una
    // segunda consulta. Esperamos al control funcional para no capturar ese
    // estado transitorio de carga como parte del contrato evolucionado.
    await expect(page.getByRole('button', { name: 'Nuevo evento' })).toBeVisible()
  }
  if (target.name === 'plans') {
    await expect(page.getByTestId('floor-plan-viewer')).toHaveAttribute('data-floor-plan-loaded', 'true')
    const firstMarker = page.getByRole('button', { name: /^Abrir activo / }).first()
    await expect(firstMarker).toBeVisible()
    await expect(firstMarker.locator('[data-asset-icon]')).toBeVisible()
    await expect.poll(() => firstMarker.evaluate((marker) => {
      const box = marker.getBoundingClientRect()
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return hit !== null && marker.contains(hit)
    })).toBe(true)
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  }
  if (target.name === 'locations') {
    await expect(page.getByRole('heading', { name: 'Planta 1 · Nave A', exact: true })).toBeVisible()
  }
  await setTheme(page, theme)

  if (target.modal) {
    await page.locator('tbody tr').filter({ hasText: 'CNC-05' }).click()
  }
  await expect(page.getByRole('heading', { name: target.heading, exact: true })).toBeVisible()
  await expect(page.locator('.animate-pulse')).toHaveCount(0)
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
  await expect(page.getByRole('heading', { name: target.referenceHeading ?? target.heading, exact: true })).toBeVisible()
}

async function attachDiff(testInfo: TestInfo, name: string, source: 'reference' | 'baseline', result: Awaited<ReturnType<typeof compareImages>>): Promise<void> {
  const metrics = JSON.stringify({
    name,
    thresholdPercent: VISUAL_THRESHOLD_PERCENT,
    mismatchPixels: result.mismatchPixels,
    mismatchPercent: result.mismatchPercent,
  }, null, 2)
  await Promise.all([
    testInfo.attach(`${name}-metrics`, { body: metrics, contentType: 'application/json' }),
    testInfo.attach(`${name}-app`, { path: result.appPath, contentType: 'image/png' }),
    testInfo.attach(`${name}-${source}`, { path: result.referencePath, contentType: 'image/png' }),
    testInfo.attach(`${name}-diff`, { path: result.diffPath, contentType: 'image/png' }),
  ])
}

function evolvedBaselinePath(name: string): string {
  return path.resolve(process.cwd(), 'tests', 'visual', 'baselines', 'release-01', `${name}.png`)
}

async function prepareEvolvedBaseline(name: string, appPath: string): Promise<string> {
  const baselinePath = evolvedBaselinePath(name)
  if (process.env.APPROVE_EVOLVED_VISUAL_BASELINES === '1') {
    await mkdir(path.dirname(baselinePath), { recursive: true })
    await copyFile(appPath, baselinePath)
    return baselinePath
  }
  try {
    await access(baselinePath)
  } catch {
    throw new Error(`Missing approved visual baseline for ${name}. Inspect the capture and use APPROVE_EVOLVED_VISUAL_BASELINES=1 only for an explicit contract approval.`)
  }
  return baselinePath
}

async function compareTarget(context: BrowserContext, testInfo: TestInfo, target: VisualTarget, variant: typeof variants[number]): Promise<void> {
  const name = `${target.name}-${variant.name}`
  const appPage = await context.newPage()
  const referencePage = target.evolvedContract ? null : await context.newPage()

  try {
    await appPage.setViewportSize({ width: variant.width, height: variant.height })
    if (referencePage) await referencePage.setViewportSize({ width: variant.width, height: variant.height })
    await appPage.emulateMedia({ reducedMotion: 'reduce' })
    if (referencePage) await referencePage.emulateMedia({ reducedMotion: 'reduce' })
    await openAppTarget(appPage, target, variant.theme)
    if (referencePage) await openReferenceTarget(referencePage, target, variant.theme)

    const appPath = await visualOutputPath(name, 'app')
    await appPage.screenshot({ path: appPath, animations: 'disabled' })
    const source = target.evolvedContract ? 'baseline' : 'reference'
    const referencePath = target.evolvedContract
      ? await prepareEvolvedBaseline(name, appPath)
      : await visualOutputPath(name, 'reference')
    if (referencePage) await referencePage.screenshot({ path: referencePath, animations: 'disabled' })

    const result = await compareImages(name, appPath, referencePath)
    console.log(`${name} vs ${source}: ${result.mismatchPixels} pixels (${result.mismatchPercent.toFixed(4)}%) differ; threshold ${VISUAL_THRESHOLD_PERCENT}%.`)
    await attachDiff(testInfo, name, source, result)
    expect(result.mismatchPercent, `${name} exceeds the ${VISUAL_THRESHOLD_PERCENT}% visual mismatch threshold.`).toBeLessThanOrEqual(VISUAL_THRESHOLD_PERCENT)
  } finally {
    await Promise.all([appPage.close(), referencePage?.close()])
  }
}

test.describe('Visual contract against protected reference and approved baselines @visual', () => {
  let context: BrowserContext

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ deviceScaleFactor: 1 })
  })

  test.afterAll(async () => {
    await context.close()
  })

  for (const variant of variants) {
    for (const target of targets) {
      test(`${target.name} ${variant.name} @visual`, async ({ browser: _browser }, testInfo) => {
        await compareTarget(context, testInfo, target, variant)
      })
    }
  }
})
