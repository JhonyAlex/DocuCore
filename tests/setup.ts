import { afterEach, beforeAll, vi } from 'vitest'

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://docucore:docucore@127.0.0.1:5436/docucore?schema=public'

const nativeFetch = globalThis.fetch

beforeAll(() => {
  // Domain API tests authenticate explicitly as the seed owner without adding
  // a production fallback. Individual authorization tests can send a distinct
  // actor header or x-docucore-test-unauthenticated=true.
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (!url.includes('/api/')) return nativeFetch(input, init)
    const headers = new Headers(init?.headers)
    if (headers.get('x-docucore-test-unauthenticated') === 'true') {
      return nativeFetch(input, { ...init, headers })
    }
    if (!headers.has('x-docucore-test-actor-id')) {
      headers.set('x-docucore-test-actor-id', '1')
    }
    return nativeFetch(input, { ...init, headers })
  })
})

afterEach(() => {
  vi.clearAllMocks()
})
