import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl = ''

function api(path: string, init: RequestInit = {}) { return fetch(`${baseUrl}${path}`, init) }

describe('PERF-01 bounded data contracts', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DOCUCORE_NOW = '2026-07-15T00:00:00.000Z'
    await ensureTestDatabase()
    const { default: app } = await import('../../server/index')
    await new Promise<void>((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => { server = instance; baseUrl = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`; resolve() })
    })
  }, 120_000)

  afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve())) })

  it('pages documents in the database and validates the maximum request size', async () => {
    const response = await api('/api/documents?projectId=1&limit=20&page=1&status=Vigente')
    expect(response.status).toBe(200)
    const body = await response.json() as { data: Array<Record<string, unknown>>; total: number; totalPages: number }
    expect(body.data.length).toBeLessThanOrEqual(20)
    expect(body.total).toBeGreaterThan(body.data.length)
    expect(body.totalPages).toBeGreaterThan(1)
    expect(body.data.every((row) => row.status === 'Vigente' && !('versions' in row))).toBe(true)
    expect((await api('/api/documents?limit=101')).status).toBe(400)
  })

  it('keeps asset rows light and location detail as a bounded preview', async () => {
    const assets = await (await api('/api/assets?projectId=1&limit=20')).json() as { data: Array<Record<string, unknown>> }
    expect(assets.data).toHaveLength(20)
    expect(assets.data.every((row) => !('documents' in row) && !('dynamicFields' in row) && !('preventivePlans' in row))).toBe(true)
    const locations = await (await api('/api/locations')).json() as { locations: Array<{ id: number }> }
    const locationId = locations.locations[0]!.id
    const detail = await (await api(`/api/locations/${locationId}`)).json() as { assets: unknown[] }
    expect(detail.assets.length).toBeLessThanOrEqual(3)
    const page = await (await api(`/api/locations/${locationId}/assets?limit=2&page=1`)).json() as { data: unknown[] }
    expect(page.data.length).toBeLessThanOrEqual(2)
  })

  it('limits abusive calendar ranges and plan asset discovery', async () => {
    expect((await api('/api/calendar?projectId=1&from=2026-01-01&to=2026-05-01')).status).toBe(400)
    const plans = await (await api('/api/floor-plans?projectId=1')).json() as { data: Array<{ id: number }> }
    const planId = plans.data[0]!.id
    const assets = await (await api(`/api/floor-plans/${planId}/assets?limit=100`)).json() as { data: unknown[] }
    expect(assets.data.length).toBeLessThanOrEqual(50)
  })
})
