import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl: string
let definitionId = 0
let assetId = 0

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init)
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  await ensureTestDatabase()
  const { default: app } = await import('../../server/index')
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`; resolve() })
  })
})

afterAll(async () => {
  if (assetId) {
    await api(`/api/assets/${assetId}`, { method: 'DELETE' }).catch(() => undefined)
    await api(`/api/assets/${assetId}/purge`, { method: 'POST' }).catch(() => undefined)
  }
  if (definitionId) await api(`/api/projects/1/dynamic-fields/${definitionId}`, { method: 'DELETE' }).catch(() => undefined)
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
})

describe('dynamic fields API', () => {
  it('creates a project-scoped periodic date definition', async () => {
    const response = await api('/api/projects/1/dynamic-fields', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fieldName: `QA próxima revisión ${Date.now()}`, groupName: 'QA', fieldType: 'DATE', required: true, periodicity: 'Trimestral', periodicityMode: 'Calendario', eventTitle: 'Revisión QA', assetTypeIds: [1], options: [] }),
    })
    expect(response.status).toBe(201)
    const definition = await response.json() as { id: number; assetTypeIds: number[]; periodicity: string }
    definitionId = definition.id
    expect(definition.assetTypeIds).toEqual([1])
    expect(definition.periodicity).toBe('Trimestral')

    const otherProject = await api('/api/projects/2/dynamic-fields?includeInactive=true')
    expect((await otherProject.json() as Array<{ id: number }>).some((field) => field.id === definitionId)).toBe(false)
  })

  it('stores a typed date, derives an event and advances its recurrence', async () => {
    const create = await api('/api/assets', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: `QA-DYN-${Date.now()}`, name: 'Activo dinámico QA', serialNumber: `QA-DYN-SN-${Date.now()}`, installDate: '2026-08-10', typeId: 1, statusId: 1, locationId: 1, projectId: 1, responsibleId: 1, initials: 'QD', dynamicFields: [{ definitionId, value: '2026-09-15' }] }),
    })
    expect(create.status).toBe(201)
    const asset = await create.json() as { id: number; dynamicFields: Array<{ definitionId: number; value: string }>; nextEvents: Array<{ source: string; title: string; date: string }> }
    assetId = asset.id
    expect(asset.dynamicFields).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId, value: '2026-09-15' })]))
    expect(asset.nextEvents).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'dynamic-field', title: 'Revisión QA', date: '2026-09-15T00:00:00.000Z' })]))

    const complete = await api(`/api/assets/${assetId}/dynamic-fields/${definitionId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ performedDate: '2026-09-20' }) })
    expect(complete.status).toBe(200)
    const completed = await complete.json() as { dynamicFields: Array<{ definitionId: number; value: string }>; nextEvents: Array<{ source: string; date: string }> }
    expect(completed.dynamicFields).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId, value: '2026-12-15' })]))
    expect(completed.nextEvents).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'dynamic-field', date: '2026-12-15T00:00:00.000Z' })]))
  })

  it('protects the type of definitions that already have values', async () => {
    const response = await api(`/api/projects/1/dynamic-fields/${definitionId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fieldType: 'TEXT' }) })
    expect(response.status).toBe(409)
  })
})
