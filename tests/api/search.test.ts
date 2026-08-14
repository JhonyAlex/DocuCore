import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl: string

function api(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, init)
}

describe('global search API', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DOCUCORE_NOW = '2026-07-15T00:00:00.000Z'
    await ensureTestDatabase()
    const { default: app } = await import('../../server/index')
    await new Promise<void>((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`
        server = instance
        resolve()
      })
    })
  }, 120_000)

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
  })

  it('rejects empty query parameter with 400', async () => {
    const response = await api('/api/search')
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toBe('Parámetros de búsqueda inválidos')
  })

  it('finds assets matching code or name', async () => {
    const response = await api('/api/search?q=CNC&projectId=1')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      query: string
      assets: Array<{ id: number; code: string; name: string; typeName: string; statusName: string }>
      totalMatches: number
    }
    expect(body.query).toBe('CNC')
    expect(body.assets.length).toBeGreaterThan(0)
    expect(body.assets.some((a) => a.code.includes('CNC'))).toBe(true)
    expect(body.totalMatches).toBeGreaterThan(0)
  })

  it('finds documents matching title, category or code', async () => {
    const response = await api('/api/search?q=Certificado&projectId=1')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      documents: Array<{ id: number; name: string; type: string }>
      totalMatches: number
    }
    expect(body.documents.length).toBeGreaterThan(0)
    expect(body.documents.some((d) => d.name.toLowerCase().includes('certificado') || d.type.toLowerCase().includes('certificado'))).toBe(true)
  })

  it('finds locations matching name or code', async () => {
    const response = await api('/api/search?q=Planta&projectId=1')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      locations: Array<{ id: number; code: string; name: string }>
      totalMatches: number
    }
    expect(body.locations.length).toBeGreaterThan(0)
    expect(body.locations.some((l) => l.name.toLowerCase().includes('planta'))).toBe(true)
  })

  it('finds floor plans matching location or name', async () => {
    const response = await api('/api/search?q=Plano&projectId=1')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      plans: Array<{ id: number; name: string; locationCode: string }>
    }
    expect(body.plans).toBeDefined()
  })

  it('finds events matching title or type', async () => {
    const response = await api('/api/search?q=Mantenimiento&projectId=1')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      events: Array<{ id: number; title: string; type: string }>
    }
    expect(body.events.length).toBeGreaterThan(0)
    expect(body.events.some((e) => e.title.toLowerCase().includes('mantenimiento') || e.type.toLowerCase().includes('mantenimiento'))).toBe(true)
  })

  it('finds project configuration and audit entries, not only operational records', async () => {
    const configResponse = await api('/api/search?q=Fuera%20de%20servicio&projectId=1')
    expect(configResponse.status).toBe(200)
    const config = await configResponse.json() as {
      settings: Array<{ kind: string; title: string; path: string }>
    }
    expect(config.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'Estado', title: 'Fuera de servicio', path: '/config/statuses' }),
    ]))

    const historyResponse = await api('/api/search?q=Creaci%C3%B3n&projectId=1')
    expect(historyResponse.status).toBe(200)
    const history = await historyResponse.json() as {
      history: Array<{ action: string; detail: string }>
    }
    expect(history.history.some((entry) => entry.action.includes('Creación') || entry.detail.includes('Creación'))).toBe(true)
  })

  it('returns empty lists for queries with no matching entities', async () => {
    const response = await api('/api/search?q=nonexistent_xyz_98765&projectId=1')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      assets: unknown[]
      documents: unknown[]
      locations: unknown[]
      plans: unknown[]
      events: unknown[]
      totalMatches: number
    }
    expect(body.assets).toHaveLength(0)
    expect(body.documents).toHaveLength(0)
    expect(body.locations).toHaveLength(0)
    expect(body.plans).toHaveLength(0)
    expect(body.events).toHaveLength(0)
    expect(body.totalMatches).toBe(0)
  })

  it('respects limit parameter per section', async () => {
    const response = await api('/api/search?q=a&limit=2&projectId=1')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      assets: unknown[]
      documents: unknown[]
      locations: unknown[]
      plans: unknown[]
      events: unknown[]
    }
    expect(body.assets.length).toBeLessThanOrEqual(2)
    expect(body.documents.length).toBeLessThanOrEqual(2)
    expect(body.locations.length).toBeLessThanOrEqual(2)
    expect(body.plans.length).toBeLessThanOrEqual(2)
    expect(body.events.length).toBeLessThanOrEqual(2)
  })
})
