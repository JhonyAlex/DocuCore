import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase, projectApiPath } from '../helpers/database'

// ITEM-05: papelera de activos. El DELETE mueve el activo a la papelera
// (recuperable 30 días), POST /:id/restore lo devuelve y POST /:id/purge lo
// borra físicamente; la purga automática elimina los que superan 30 días.

let server: Server | undefined
let baseUrl: string
const createdAssetIds: number[] = []

type AssetRow = { id: number; code: string; name: string; deletedAt: string | null }

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${projectApiPath(path, init)}`, init)
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function assetPayload(code: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code,
    name: `Activo papelera ${code}`,
    serialNumber: `SN-TRASH-${uniqueSuffix()}`,
    installDate: '2026-07-15',
    typeId: 1,
    statusId: 1,
    locationId: 1,
    projectId: 1,
    responsibleId: 1,
    initials: 'QA',
    ...overrides,
  }
}

async function createAsset(code: string): Promise<AssetRow> {
  const response = await api('/api/assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(assetPayload(code)),
  })
  expect(response.status).toBe(201)
  const created = (await response.json()) as AssetRow
  createdAssetIds.push(created.id)
  return created
}

async function findAsset(code: string, trashed: boolean): Promise<AssetRow | null> {
  const response = await api(`/api/assets?search=${code}&limit=100${trashed ? '&trashed=true' : ''}`)
  expect(response.status).toBe(200)
  const body = (await response.json()) as { data: AssetRow[] }
  return body.data.find((asset) => asset.code === code) ?? null
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  await ensureTestDatabase()
  const { default: app } = await import('../../server/index')
  await new Promise<void>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => {
      const address = instance.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
    server = instance
  })
})

afterAll(async () => {
  // Limpieza tolerante: purgar los activos creados que sigan en papelera.
  for (const id of createdAssetIds) {
    await api(`/api/assets/${id}/purge`, { method: 'POST' }).catch(() => undefined)
  }
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => error ? reject(error) : resolve())
  })
})

describe('assets trash lifecycle', () => {
  it('moves an asset to the trash on DELETE and hides it from the regular list', async () => {
    const asset = await createAsset(`QA-TR-${uniqueSuffix()}`)
    const deleteResponse = await api(`/api/assets/${asset.id}`, { method: 'DELETE' })
    expect(deleteResponse.status).toBe(204)

    expect(await findAsset(asset.code, false)).toBeNull()
    const trashed = await findAsset(asset.code, true)
    expect(trashed).not.toBeNull()
    expect(trashed?.deletedAt).not.toBeNull()
  })

  it('restores a trashed asset and returns it to the regular list', async () => {
    const asset = await createAsset(`QA-RS-${uniqueSuffix()}`)
    expect((await api(`/api/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(204)

    const restoreResponse = await api(`/api/assets/${asset.id}/restore`, { method: 'POST' })
    expect(restoreResponse.status).toBe(200)
    const restored = (await restoreResponse.json()) as AssetRow
    expect(restored.deletedAt).toBeNull()

    expect((await findAsset(asset.code, false))?.id).toBe(asset.id)
    expect(await findAsset(asset.code, true)).toBeNull()
  })

  it('purges a trashed asset permanently and blocks further restore', async () => {
    const asset = await createAsset(`QA-PG-${uniqueSuffix()}`)
    expect((await api(`/api/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(204)

    const purgeResponse = await api(`/api/assets/${asset.id}/purge`, { method: 'POST' })
    expect(purgeResponse.status).toBe(204)

    expect(await findAsset(asset.code, true)).toBeNull()
    expect((await api(`/api/assets/${asset.id}/restore`, { method: 'POST' })).status).toBe(404)
    expect((await api(`/api/assets/${asset.id}`, { method: 'GET' })).status).toBe(404)
  })

  it('rejects purging an asset that is not in the trash', async () => {
    const asset = await createAsset(`QA-NT-${uniqueSuffix()}`)
    const response = await api(`/api/assets/${asset.id}/purge`, { method: 'POST' })
    expect(response.status).toBe(409)
  })

  it('rejects deleting an asset that is already in the trash', async () => {
    const asset = await createAsset(`QA-TT-${uniqueSuffix()}`)
    expect((await api(`/api/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(404)
  })

  it('keeps the unique code occupied by a trashed asset until it is purged', async () => {
    const code = `QA-UC-${uniqueSuffix()}`
    const asset = await createAsset(code)
    expect((await api(`/api/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(204)

    const conflict = await api('/api/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(assetPayload(code)),
    })
    expect(conflict.status).toBe(409)

    expect((await api(`/api/assets/${asset.id}/restore`, { method: 'POST' })).status).toBe(200)
    expect((await api(`/api/assets/${asset.id}/purge`, { method: 'POST' })).status).toBe(409)

    expect((await api(`/api/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/assets/${asset.id}/purge`, { method: 'POST' })).status).toBe(204)

    const reuse = await api('/api/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(assetPayload(code)),
    })
    expect(reuse.status).toBe(201)
    createdAssetIds.push(((await reuse.json()) as AssetRow).id)
  })

  it('excludes trashed assets from the project aggregate count', async () => {
    const before = (await (await api('/api/projects/1')).json()) as { assetCount: number }
    const asset = await createAsset(`QA-SC-${uniqueSuffix()}`)
    expect((await api(`/api/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(204)

    const afterDelete = (await (await api('/api/projects/1')).json()) as { assetCount: number }
    expect(afterDelete.assetCount).toBe(before.assetCount)

    expect((await api(`/api/assets/${asset.id}/restore`, { method: 'POST' })).status).toBe(200)
    const afterRestore = (await (await api('/api/projects/1')).json()) as { assetCount: number }
    expect(afterRestore.assetCount).toBe(before.assetCount + 1)

    expect((await api(`/api/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/assets/${asset.id}/purge`, { method: 'POST' })).status).toBe(204)
  })

  it('hides a trashed asset from its documents until it is restored', async () => {
    // VH-014 del seed canónico está asociado al documento "Certificado ITV 2025".
    const asset = (await (await api('/api/assets?search=VH-014&limit=100')).json()) as { data: AssetRow[] }
    const target = asset.data.find((row) => row.code === 'VH-014')
    expect(target).toBeDefined()

    const documentBefore = (await (await api('/api/documents?search=ITV&limit=100')).json()) as { data: Array<{ name: string; assets: Array<{ id: number }> }> }
    const itv = documentBefore.data.find((document) => document.name === 'Certificado ITV 2025')
    expect(itv?.assets.some((linked) => linked.id === target!.id)).toBe(true)

    expect((await api(`/api/assets/${target!.id}`, { method: 'DELETE' })).status).toBe(204)

    const documentDuring = (await (await api('/api/documents?search=ITV&limit=100')).json()) as { data: Array<{ name: string; assets: Array<{ id: number }> }> }
    const itvDuring = documentDuring.data.find((document) => document.name === 'Certificado ITV 2025')
    expect(itvDuring?.assets.some((linked) => linked.id === target!.id)).toBe(false)

    expect((await api(`/api/assets/${target!.id}/restore`, { method: 'POST' })).status).toBe(200)

    const documentAfter = (await (await api('/api/documents?search=ITV&limit=100')).json()) as { data: Array<{ name: string; assets: Array<{ id: number }> }> }
    const itvAfter = documentAfter.data.find((document) => document.name === 'Certificado ITV 2025')
    expect(itvAfter?.assets.some((linked) => linked.id === target!.id)).toBe(true)
  })

  it('automatically purges trashed assets older than 30 days when listing the trash', async () => {
    const asset = await createAsset(`QA-EX-${uniqueSuffix()}`)
    expect((await api(`/api/assets/${asset.id}`, { method: 'DELETE' })).status).toBe(204)

    const previousClock = process.env.DOCUCORE_NOW
    try {
      // 31 días después: la purga perezosa debe borrarlo físicamente.
      process.env.DOCUCORE_NOW = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString()
      const trashed = await findAsset(asset.code, true)
      expect(trashed).toBeNull()
      expect((await api(`/api/assets/${asset.id}/restore`, { method: 'POST' })).status).toBe(404)
    } finally {
      process.env.DOCUCORE_NOW = previousClock
    }
  })
})
