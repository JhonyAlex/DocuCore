import { expect, test as base } from '@playwright/test'

type ConsoleFixture = {
  consoleIssues: string[]
}

const E2E_DEFAULT_PROJECT_ID = 1

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
  if (!value.startsWith('/api/') || value.startsWith('/api/projects/') || value === '/api/health' || value === '/api/session' || value === '/api/projects') return value
  return value.replace('/api/', `/api/projects/${requestedProjectId(value, args, method)}/`)
}

export const test = base.extend<ConsoleFixture>({
  page: async ({ page, context }, runFixture) => {
    await context.addInitScript(() => window.localStorage.setItem('docucore.activeProjectId', '1'))
    const request = page.request as unknown as Record<string, unknown>
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'fetch']) {
      const original = request[method]
      if (typeof original !== 'function') continue
      const invoke = (original as (nextUrl: string, ...nextArgs: unknown[]) => unknown).bind(page.request)
      request[method] = (url: string, ...args: unknown[]) => invoke(scopedApiUrl(url, args, method), ...args)
    }
    const nativeWaitForResponse = page.waitForResponse.bind(page)
    const pageWithLegacyMatchers = page as unknown as { waitForResponse: typeof page.waitForResponse }
    pageWithLegacyMatchers.waitForResponse = ((matcher: string | RegExp | ((response: { url: () => string }) => boolean), options?: { timeout?: number }) => {
      if (typeof matcher !== 'function') return nativeWaitForResponse(matcher, options)
      return nativeWaitForResponse((response) => matcher(new Proxy(response, { get(target, key) { if (key === 'url') return () => target.url().replace('/api/projects/1', '/api'); return Reflect.get(target, key) } })), options)
    }) as typeof page.waitForResponse
    await runFixture(page)
  },
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
