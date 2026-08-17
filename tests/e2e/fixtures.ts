import { devices, expect, test as base, type BrowserContext } from '@playwright/test'

type ConsoleFixture = {
  consoleIssues: string[]
}

type WorkerFixtures = {
  e2eContext: BrowserContext
}

const E2E_DEFAULT_PROJECT_ID = 1

function isExpectedConsoleMessage(message: string): boolean {
  // OpenSeadragon warns when a tile response completes after its viewer has
  // reset. The viewer deliberately ignores that stale tile; it is not an app
  // error and does not affect the rendered plan.
  return message.startsWith('Ignoring tile %s loaded before reset:')
}

function requestedProjectId(value: string, args: unknown[], method: string): number {
  const url = new URL(value, 'http://docucore.test')
  const fromQuery = Number(url.searchParams.get('projectId'))
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery

  // En las especificaciones heredadas, solo las altas usaban el projectId del
  // cuerpo para elegir el ámbito. En una edición ese valor se conserva para
  // probar explícitamente que el backend rechaza un cruce de proyecto.
  if (method.toLowerCase() !== 'post') return E2E_DEFAULT_PROJECT_ID
  const options = args[0]
  if (!options || typeof options !== 'object') return E2E_DEFAULT_PROJECT_ID
  const body = options as { data?: unknown; multipart?: unknown }
  for (const candidate of [body.data, body.multipart]) {
    if (!candidate || typeof candidate !== 'object') continue
    const fromBody = Number((candidate as Record<string, unknown>).projectId)
    if (Number.isInteger(fromBody) && fromBody > 0) return fromBody
  }
  return E2E_DEFAULT_PROJECT_ID
}

function scopedApiUrl(value: string, args: unknown[] = [], method = 'get'): string {
  if (
    !value.startsWith('/api/') ||
    value.startsWith('/api/projects/') ||
    value.startsWith('/api/auth/') ||
    value.startsWith('/api/account') ||
    value.startsWith('/api/admin') ||
    value.startsWith('/api/workspaces') ||
    value.startsWith('/api/stripe') ||
    value === '/api/health' ||
    value === '/api/ready' ||
    value === '/api/session' ||
    value === '/api/projects'
  ) return value
  return value.replace('/api/', `/api/projects/${requestedProjectId(value, args, method)}/`)
}

function scopeLegacyRequestContext(request: Record<string, unknown>): void {
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'fetch']) {
    const original = request[method]
    if (typeof original !== 'function') continue
    const invoke = (original as (nextUrl: string, ...nextArgs: unknown[]) => unknown).bind(request)
    request[method] = (url: string, ...args: unknown[]) => invoke(scopedApiUrl(url, args, method), ...args)
  }
}

export const test = base.extend<ConsoleFixture, WorkerFixtures>({
  // Chromium on Windows can exhaust its network buffer space after repeatedly
  // creating and disposing contexts in a long serial suite. Keep one context
  // per worker, but create and close a fresh page for every test so routes,
  // listeners and page state remain isolated. Touch is enabled because the
  // floor-plan suite verifies its touch interaction with marker.tap().
  e2eContext: [async ({ browser }, runFixture) => {
    const context = await browser.newContext({ ...devices['Desktop Chrome'], hasTouch: true })
    await context.setExtraHTTPHeaders({ 'x-docucore-test-actor-id': '1' })
    await context.addInitScript(() => window.localStorage.setItem('docucore.activeProjectId', '1'))
    scopeLegacyRequestContext(context.request as unknown as Record<string, unknown>)
    try {
      await runFixture(context)
    } finally {
      await context.close()
    }
  }, { scope: 'worker' }],
  context: async ({ e2eContext }, runFixture) => {
    await runFixture(e2eContext)
  },
  page: async ({ context, baseURL }, runFixture) => {
    await context.clearCookies()
    await context.request.post(`${baseURL}/api/auth/login`, { data: { email: 'maria@docucore.local', password: 'DocuCore!2026' } })
    const page = await context.newPage()
    const nativeGoto = page.goto.bind(page)
    page.goto = ((url: string, options?: Parameters<typeof page.goto>[1]) => nativeGoto(url.startsWith('/') ? new URL(url, baseURL).toString() : url, options)) as typeof page.goto
    const nativeWaitForResponse = page.waitForResponse.bind(page)
    const pageWithLegacyMatchers = page as unknown as { waitForResponse: typeof page.waitForResponse }
    pageWithLegacyMatchers.waitForResponse = ((matcher: string | RegExp | ((response: { url: () => string }) => boolean), options?: { timeout?: number }) => {
      if (typeof matcher !== 'function') return nativeWaitForResponse(matcher, options)
      return nativeWaitForResponse((response) => matcher(new Proxy(response, { get(target, key) { if (key === 'url') return () => target.url().replace('/api/projects/1', '/api'); return Reflect.get(target, key) } })), options)
    }) as typeof page.waitForResponse
    try {
      await runFixture(page)
    } finally {
      await page.close()
    }
  },
  /*
   * Kept separate from page setup so the console assertion still wraps every
   * test body and reports the failing test title.
   */
  consoleIssues: async ({ page }, runFixture, testInfo) => {
    const issues: string[] = []
    page.on('console', (message) => {
      if ((message.type() === 'error' || message.type() === 'warning') && !isExpectedConsoleMessage(message.text())) issues.push(message.text())
    })
    page.on('pageerror', (error) => issues.push(error.message))

    await runFixture(issues)

    expect(issues, `Unexpected browser console issues in ${testInfo.title}`).toEqual([])
  },
})

export { expect }
