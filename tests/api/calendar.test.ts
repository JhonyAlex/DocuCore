import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl: string
let createdEventId: number | undefined

function api(path: string, init: RequestInit = {}) { return fetch(`${baseUrl}${path}`, init) }

describe('calendar API', () => {
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
    if (createdEventId) await api(`/api/calendar/events/${createdEventId}`, { method: 'DELETE' }).catch(() => undefined)
    if (server) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
  })

  it('returns only the requested project and date range with document occurrences per asset', async () => {
    const response = await api('/api/calendar?projectId=1&from=2026-07-01&to=2026-07-31')
    expect(response.status).toBe(200)
    const body = await response.json() as { today: string; events: Array<{ source: string; title: string; date: string; projectId: number; asset: { code: string } | null }> }
    expect(body.today).toBe('2026-07-15')
    expect(body.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'document', title: 'ITV', date: '2026-07-13', asset: expect.objectContaining({ code: 'VH-014' }) }),
      expect.objectContaining({ source: 'document', title: 'Calibración anual', date: '2026-07-19', asset: expect.objectContaining({ code: 'MG-203' }) }),
    ]))
    expect(body.events.every((event) => event.projectId === 1)).toBe(true)

    const otherProject = await api('/api/calendar?projectId=2&from=2026-07-01&to=2026-07-31')
    expect(otherProject.status).toBe(200)
    expect((await otherProject.json() as { events: unknown[] }).events).toHaveLength(0)
  })

  it('creates, filters, updates, completes and deletes a project-level manual event', async () => {
    const create = await api('/api/calendar/events', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Auditoría CAL QA', date: '2026-07-15', category: 'review', assetId: null, projectId: 1 }),
    })
    expect(create.status).toBe(201)
    const created = await create.json() as { sourceId: number }
    createdEventId = created.sourceId

    const listed = await api('/api/calendar?projectId=1&from=2026-07-15&to=2026-07-15&source=event&search=auditor%C3%ADa')
    const body = await listed.json() as { events: Array<{ sourceId: number; assetId: number | null; category: string; status: string; canEdit: boolean; canDelete: boolean }> }
    expect(body.events).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: created.sourceId, assetId: null, category: 'review', status: 'today', canEdit: true, canDelete: true })]))

    const patch = await api(`/api/calendar/events/${created.sourceId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Auditoría CAL actualizada', category: 'maintenance' }) })
    expect(patch.status).toBe(200)
    const complete = await api('/api/calendar/events/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'event', sourceId: created.sourceId, assetId: null, projectId: 1, performedDate: '2026-07-15' }) })
    expect(complete.status).toBe(204)

    const completed = await api('/api/calendar?projectId=1&from=2026-07-15&to=2026-07-15&source=event&status=completed&search=actualizada')
    expect((await completed.json() as { events: Array<{ sourceId: number; status: string }> }).events).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: created.sourceId, status: 'completed' })]))

    const remove = await api(`/api/calendar/events/${created.sourceId}`, { method: 'DELETE' })
    expect(remove.status).toBe(204)
    createdEventId = undefined
  })

  it('exposes a preventive execution and refuses completion while checklist tasks remain', async () => {
    const response = await api('/api/calendar?projectId=1&from=2026-08-05&to=2026-08-05&source=preventive')
    expect(response.status).toBe(200)
    const body = await response.json() as { events: Array<{ source: 'preventive'; sourceId: number; assetId: number; canComplete: boolean; progress: { completed: number; total: number } }> }
    const preventive = body.events[0]
    expect(preventive).toEqual(expect.objectContaining({ source: 'preventive', canComplete: false, progress: expect.objectContaining({ completed: 0 }) }))
    const complete = await api('/api/calendar/events/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'preventive', sourceId: preventive.sourceId, assetId: preventive.assetId, projectId: 1, performedDate: '2026-08-05' }) })
    expect(complete.status).toBe(409)
  })

  it('rejects a manual event whose asset is outside the active project', async () => {
    const response = await api('/api/calendar/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Activo inexistente', date: '2026-07-15', category: 'review', assetId: 999_999, projectId: 1 }) })
    expect(response.status).toBe(400)
  })
})
