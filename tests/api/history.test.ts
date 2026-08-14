import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl: string

function api(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, init)
}

describe('history and audit log API', () => {
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

  it('returns paginated audit logs for project 1', async () => {
    const response = await api('/api/history?projectId=1&limit=10')
    if (response.status !== 200) {
      console.log('HISTORY ERROR:', response.status, await response.text())
    }
    expect(response.status).toBe(200)
    const body = await response.json() as {
      data: Array<{
        id: number
        timestamp: string
        action: string
        entityId: string
        detail: string
        user: { id: number; name: string; initials: string; color: string }
      }>
      total: number
      page: number
      totalPages: number
      limit: number
      availableActions: string[]
    }
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.total).toBeGreaterThan(0)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(10)
    expect(body.availableActions).toBeDefined()
    expect(body.availableActions.length).toBeGreaterThan(0)

    const first = body.data[0]
    expect(first).toHaveProperty('id')
    expect(first).toHaveProperty('timestamp')
    expect(first).toHaveProperty('action')
    expect(first).toHaveProperty('entityId')
    expect(first).toHaveProperty('detail')
    expect(first).toHaveProperty('user')
    expect(first.user).toHaveProperty('name')
    expect(first.user).toHaveProperty('initials')
  })

  it('filters history by search term', async () => {
    const response = await api('/api/history?projectId=1&search=cread')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      data: Array<{ action: string; detail: string; entityId: string }>
      total: number
    }
    expect(body.total).toBeGreaterThan(0)
    expect(body.data.some((item) => item.action.toLowerCase().includes('cread') || item.detail.toLowerCase().includes('cread'))).toBe(true)
  })

  it('filters history by user ID', async () => {
    const allRes = await api('/api/history?projectId=1')
    const allBody = await allRes.json() as { data: Array<{ user: { id: number } }> }
    const userId = allBody.data[0]?.user.id
    expect(userId).toBeDefined()

    const userRes = await api(`/api/history?projectId=1&userId=${userId}`)
    expect(userRes.status).toBe(200)
    const userBody = await userRes.json() as { data: Array<{ user: { id: number } }> }
    expect(userBody.data.every((item) => item.user.id === userId)).toBe(true)
  })

  it('filters history by action', async () => {
    const allRes = await api('/api/history?projectId=1')
    const allBody = await allRes.json() as { availableActions: string[] }
    const action = allBody.availableActions[0]
    expect(action).toBeDefined()

    const actionRes = await api(`/api/history?projectId=1&action=${encodeURIComponent(action)}`)
    expect(actionRes.status).toBe(200)
    const actionBody = await actionRes.json() as { data: Array<{ action: string }> }
    expect(actionBody.data.every((item) => item.action.toLowerCase() === action.toLowerCase())).toBe(true)
  })

  it('exports CSV with valid UTF-8 BOM, semicolon delimiters and headers', async () => {
    const response = await api('/api/history/export?projectId=1')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('historial-')

    const buffer = Buffer.from(await response.arrayBuffer())
    expect(buffer[0]).toBe(0xEF)
    expect(buffer[1]).toBe(0xBB)
    expect(buffer[2]).toBe(0xBF)

    const csvText = buffer.toString('utf-8')
    const lines = csvText.trim().split(/\r?\n/)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]).toContain('"Fecha";"Usuario";"Acción";"Entidad";"Detalle"')
  })

  it('records audit log on asset status mutation and links it to project', async () => {
    // 1. Get an asset
    const assetsRes = await api('/api/assets?limit=1')
    const assetsBody = await assetsRes.json() as { data: Array<{ id: number; status: { id: number } }> }
    const asset = assetsBody.data[0]
    expect(asset).toBeDefined()

    // 2. Change status
    const newStatusId = asset.status.id === 1 ? 2 : 1
    const updateRes = await api(`/api/assets/${asset.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusId: newStatusId }),
    })
    expect(updateRes.status).toBe(200)

    // 3. Verify history has recorded the status change
    const histRes = await api('/api/history?projectId=1&action=Cambio%20estado&limit=5')
    expect(histRes.status).toBe(200)
    const histBody = await histRes.json() as { data: Array<{ action: string; entityId: string }> }
    expect(histBody.data.some((item) => item.action === 'Cambio estado')).toBe(true)
  })
})
