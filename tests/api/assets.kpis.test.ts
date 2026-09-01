import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase, projectApiPath } from '../helpers/database'

let server: Server | undefined
let baseUrl: string
const createdAssetIds: number[] = []

type AssetRow = { id: number; code: string; name: string; statusId: number; deletedAt: string | null }
type KpisResponse = { operativo: number; enRevision: number; fueraDeServicio: number; total: number }

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${projectApiPath(path, init)}`, init)
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function assetPayload(code: string, statusId = 1): Record<string, unknown> {
  return {
    code,
    name: `Activo KPI ${code}`,
    serialNumber: `SN-KPI-${uniqueSuffix()}`,
    installDate: '2026-07-15',
    typeId: 1,
    statusId,
    locationId: 1,
    projectId: 1,
    responsibleId: 1,
    initials: 'KP',
  }
}

async function createAsset(code: string, statusId = 1): Promise<AssetRow> {
  const response = await api('/api/assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(assetPayload(code, statusId)),
  })
  expect(response.status).toBe(201)
  const created = (await response.json()) as AssetRow
  createdAssetIds.push(created.id)
  return created
}

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
  if (createdAssetIds.length > 0) {
    for (const id of createdAssetIds) {
      await api(`/api/assets/${id}/purge`, { method: 'POST' }).catch(() => undefined)
    }
  }
  if (server) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
})

describe('assets KPIs API', () => {
  it('returns status 200 and valid KPI metrics for project 1', async () => {
    const response = await api('/api/projects/1/assets/kpis')
    expect(response.status).toBe(200)
    const kpis = (await response.json()) as KpisResponse

    expect(typeof kpis.operativo).toBe('number')
    expect(typeof kpis.enRevision).toBe('number')
    expect(typeof kpis.fueraDeServicio).toBe('number')
    expect(typeof kpis.total).toBe('number')

    expect(kpis.total).toBeGreaterThanOrEqual(140)
    expect(kpis.operativo).toBeGreaterThan(0)
    expect(kpis.total).toBeGreaterThanOrEqual(kpis.operativo + kpis.enRevision + kpis.fueraDeServicio)
  })

  it('updates KPIs when an asset is created, trashed, and restored', async () => {
    const initialRes = await api('/api/projects/1/assets/kpis')
    const initial = (await initialRes.json()) as KpisResponse

    // Create an asset in status 1 (Activo / emerald)
    const code = `KPI-TEST-${uniqueSuffix()}`
    const asset = await createAsset(code, 1)

    const afterCreateRes = await api('/api/projects/1/assets/kpis')
    const afterCreate = (await afterCreateRes.json()) as KpisResponse
    expect(afterCreate.total).toBe(initial.total + 1)
    expect(afterCreate.operativo).toBe(initial.operativo + 1)

    // Move to trash
    const deleteRes = await api(`/api/assets/${asset.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(204)

    const afterTrashRes = await api('/api/projects/1/assets/kpis')
    const afterTrash = (await afterTrashRes.json()) as KpisResponse
    expect(afterTrash.total).toBe(initial.total)
    expect(afterTrash.operativo).toBe(initial.operativo)

    // Restore from trash
    const restoreRes = await api(`/api/assets/${asset.id}/restore`, { method: 'POST' })
    expect(restoreRes.status).toBe(200)

    const afterRestoreRes = await api('/api/projects/1/assets/kpis')
    const afterRestore = (await afterRestoreRes.json()) as KpisResponse
    expect(afterRestore.total).toBe(initial.total + 1)
    expect(afterRestore.operativo).toBe(initial.operativo + 1)
  })

  it('updates KPIs when changing status to Fuera de servicio (red)', async () => {
    const initialRes = await api('/api/projects/1/assets/kpis')
    const initial = (await initialRes.json()) as KpisResponse

    const code = `KPI-STATUS-${uniqueSuffix()}`
    const asset = await createAsset(code, 1) // status 1: Activo (emerald)

    // Change status to status 3: Fuera de servicio (red)
    const changeStatusRes = await api(`/api/assets/${asset.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statusId: 3 }),
    })
    expect(changeStatusRes.status).toBe(200)

    const afterChangeRes = await api('/api/projects/1/assets/kpis')
    const afterChange = (await afterChangeRes.json()) as KpisResponse
    expect(afterChange.operativo).toBe(initial.operativo)
    expect(afterChange.fueraDeServicio).toBe(initial.fueraDeServicio + 1)
    expect(afterChange.total).toBe(initial.total + 1)
  })
})
