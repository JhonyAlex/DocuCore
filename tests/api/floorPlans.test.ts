import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl: string
let storageDir: string
let image: Buffer
let createdPlanId: number | null = null
let highResolutionPlanId: number | null = null
let secondPlacementPlanId: number | null = null

async function api(pathname: string, init?: RequestInit): Promise<Response> { return fetch(`${baseUrl}${pathname}`, init) }
function form(name: string, locationId: number, bytes = image): FormData {
  const data = new FormData()
  data.set('name', name); data.set('projectId', '1'); data.set('locationId', String(locationId))
  data.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'plano.png')
  return data
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  storageDir = await mkdtemp(path.join(tmpdir(), 'docucore-floor-plans-'))
  process.env.FLOOR_PLAN_STORAGE_PATH = storageDir
  image = await readFile(path.join(process.cwd(), 'public', 'floor-plan.png'))
  await ensureTestDatabase()
  const { default: app } = await import('../../server/index')
  await new Promise<void>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`; resolve() })
    server = instance
  })
})

afterAll(async () => {
  if (createdPlanId) await api(`/api/floor-plans/${createdPlanId}`, { method: 'DELETE' }).catch(() => undefined)
  if (highResolutionPlanId) await api(`/api/floor-plans/${highResolutionPlanId}`, { method: 'DELETE' }).catch(() => undefined)
  if (secondPlacementPlanId) await api(`/api/floor-plans/${secondPlacementPlanId}`, { method: 'DELETE' }).catch(() => undefined)
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
  await rm(storageDir, { recursive: true, force: true })
})

describe('floor plan API', () => {
  it('creates a versioned plan, serves its original and generated DZI tiles', async () => {
    const locations = await (await api('/api/locations')).json() as { locations: Array<{ id: number; parentId: number | null }> }
    const root = locations.locations.find((location) => location.parentId === null)!
    const response = await api('/api/floor-plans', { method: 'POST', body: form(`QA plano ${Date.now()}`, root.id) })
    expect(response.status).toBe(201)
    const plan = await response.json() as { id: number; currentVersion: { version: number; width: number; height: number } }
    createdPlanId = plan.id
    expect(plan.currentVersion).toMatchObject({ version: 1 })

    const original = await api(`/api/floor-plans/${plan.id}/current/image`)
    expect(original.status).toBe(200)
    expect(original.headers.get('content-type')).toContain('image/png')
    expect(Buffer.from(await original.arrayBuffer())).toEqual(image)

    const dzi = await api(`/api/floor-plans/${plan.id}/versions/1/dzi`)
    expect(dzi.status).toBe(200)
    expect(await dzi.text()).toContain(`/api/floor-plans/${plan.id}/versions/1/tiles/`)
    const level = Math.ceil(Math.log2(Math.max(plan.currentVersion.width, plan.currentVersion.height)))
    const tile = await api(`/api/floor-plans/${plan.id}/versions/1/tiles/${level}/0_0.jpeg`)
    expect(tile.status).toBe(200)
    expect(tile.headers.get('content-type')).toContain('image/jpeg')
  })

  it('validates project/location ownership and persists marker CRUD without duplicates', async () => {
    expect(createdPlanId).not.toBeNull()
    const planId = createdPlanId as number
    const plan = await (await api(`/api/floor-plans/${planId}`)).json() as { locationId: number }
    const assets = await (await api(`/api/assets?locationId=${plan.locationId}&limit=100`)).json() as { data: Array<{ id: number }> }
    const assetId = assets.data[0].id
    const invalid = await api('/api/floor-plans', { method: 'POST', body: (() => { const data = form('Proyecto incorrecto', plan.locationId); data.set('projectId', '2'); return data })() })
    expect(invalid.status).toBe(400)

    const placed = await api(`/api/floor-plans/${planId}/markers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId, x: 0.2, y: 0.3 }) })
    expect(placed.status).toBe(201)
    const marker = await placed.json() as { id: number; x: number; y: number }
    expect((await api(`/api/floor-plans/${planId}/markers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId, x: 0.4, y: 0.5 }) })).status).toBe(409)
    expect((await api(`/api/floor-plans/${planId}/markers/${marker.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 0.7, y: 0.8 }) })).status).toBe(200)
    const persisted = await (await api(`/api/floor-plans/${planId}`)).json() as { markers: Array<{ id: number; x: number; y: number }> }
    expect(persisted.markers).toContainEqual(expect.objectContaining({ id: marker.id, x: 0.7, y: 0.8 }))
    expect((await api(`/api/floor-plans/${planId}/markers/${marker.id}`, { method: 'DELETE' })).status).toBe(204)
  })

  it('returns the same derived events as the asset API and removes a marker if the asset leaves the plan subtree', async () => {
    const planId = createdPlanId as number
    const plan = await (await api(`/api/floor-plans/${planId}`)).json() as { projectId: number; locationId: number; availableAssets: Array<{ id: number; locationId: number; nextEvents: unknown[] }> }
    const asset = plan.availableAssets[0]!
    const placed = await api(`/api/floor-plans/${planId}/markers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: asset.id, x: 0.25, y: 0.4 }) })
    expect(placed.status).toBe(201)

    const assetResponse = await (await api(`/api/assets/${asset.id}`)).json() as { nextEvents: unknown[] }
    const withMarker = await (await api(`/api/floor-plans/${planId}`)).json() as { markers: Array<{ assetId: number; asset: { nextEvents: unknown[] } }> }
    expect(withMarker.markers.find((marker) => marker.assetId === asset.id)?.asset.nextEvents).toEqual(assetResponse.nextEvents)

    const users = await (await api('/api/users')).json() as Array<{ id: number }>
    const outside = await api('/api/locations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ubicación externa QA planos', code: `QA-PLAN-${Date.now()}`, surface: '1 m²', parentId: null, responsibleId: users[0]!.id, projectId: plan.projectId }),
    })
    expect(outside.status).toBe(201)
    const outsideLocation = await outside.json() as { id: number }
    const moved = await api(`/api/assets/${asset.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locationId: outsideLocation.id }) })
    expect(moved.status).toBe(200)
    const afterMove = await (await api(`/api/floor-plans/${planId}`)).json() as { markers: Array<{ assetId: number }>; availableAssets: Array<{ id: number }> }
    expect(afterMove.markers.some((marker) => marker.assetId === asset.id)).toBe(false)
    expect(afterMove.availableAssets.some((candidate) => candidate.id === asset.id)).toBe(false)

    expect((await api(`/api/assets/${asset.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locationId: asset.locationId }) })).status).toBe(200)
    expect((await api(`/api/locations/${outsideLocation.id}`, { method: 'DELETE' })).status).toBe(204)
  })

  it('makes a newly uploaded version current', async () => {
    const planId = createdPlanId as number
    const data = new FormData(); data.append('file', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'plano-v2.png')
    const response = await api(`/api/floor-plans/${planId}/versions`, { method: 'POST', body: data })
    expect(response.status).toBe(201)
    const updated = await response.json() as { currentVersion: { version: number } }
    expect(updated.currentVersion.version).toBe(2)
    expect((await (await api(`/api/floor-plans/${planId}/current`)).json() as { version: number }).version).toBe(2)
  })

  it('generates a Deep Zoom pyramid for a high-resolution image without exposing the original as tiles', async () => {
    const locations = await (await api('/api/locations')).json() as { locations: Array<{ id: number; parentId: number | null }> }
    const root = locations.locations.find((location) => location.parentId === null)!
    const highResolution = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: '#dbeafe' } }).png().toBuffer()
    const response = await api('/api/floor-plans', { method: 'POST', body: form(`Plano alta resolución ${Date.now()}`, root.id, highResolution) })
    expect(response.status).toBe(201)
    const plan = await response.json() as { id: number; currentVersion: { width: number; height: number; version: number } }
    highResolutionPlanId = plan.id
    expect(plan.currentVersion).toMatchObject({ width: 6000, height: 4000, version: 1 })
    const level = Math.ceil(Math.log2(6000))
    const tile = await api(`/api/floor-plans/${plan.id}/versions/1/tiles/${level}/0_0.jpeg`)
    expect(tile.status).toBe(200)
    expect((await tile.arrayBuffer()).byteLength).toBeGreaterThan(0)
  }, 60_000)

  it('locates zero, one and several placements by asset and reflects a type icon change without mutating markers', async () => {
    const planId = createdPlanId as number
    const plan = await (await api(`/api/floor-plans/${planId}`)).json() as { locationId: number }
    const [types, statuses, users] = await Promise.all([
      (await api('/api/asset-types')).json() as Promise<Array<{ id: number; iconKey: string }>>,
      (await api('/api/statuses')).json() as Promise<Array<{ id: number }>>,
      (await api('/api/users')).json() as Promise<Array<{ id: number }>>,
    ])
    const assetResponse = await api('/api/assets', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: `PLAN-04-${Date.now()}`, name: 'Activo de colocaciones PLAN-04', serialNumber: `PLAN-04-SN-${Date.now()}`, installDate: '2026-08-12', typeId: types[0]!.id, statusId: statuses[0]!.id, locationId: plan.locationId, projectId: 1, responsibleId: users[0]!.id, initials: 'P4' }),
    })
    expect(assetResponse.status).toBe(201)
    const asset = await assetResponse.json() as { id: number; type: { id: number; iconKey: string } }

    const zero = await (await api(`/api/assets/${asset.id}/floor-plans`)).json() as { data: unknown[] }
    expect(zero.data).toHaveLength(0)

    const firstMarkerResponse = await api(`/api/floor-plans/${planId}/markers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: asset.id, x: 0.19, y: 0.37 }) })
    expect(firstMarkerResponse.status).toBe(201)
    const firstMarker = await firstMarkerResponse.json() as { id: number; x: number; y: number; asset: { type: { iconKey: string } } }
    expect(firstMarker.asset.type.iconKey).toBe(asset.type.iconKey)

    const one = await (await api(`/api/assets/${asset.id}/floor-plans`)).json() as { data: Array<{ planId: number; markerId: number; x: number; y: number; dziUrl: string; currentVersion: { width: number; height: number } }> }
    expect(one.data).toEqual([expect.objectContaining({ planId, markerId: firstMarker.id, x: 0.19, y: 0.37, dziUrl: expect.stringContaining(`/api/floor-plans/${planId}/versions/`) })])
    expect(one.data[0]!.currentVersion.width).toBeGreaterThan(0)

    const secondPlanResponse = await api('/api/floor-plans', { method: 'POST', body: form(`QA segundo plano PLAN-04 ${Date.now()}`, plan.locationId) })
    expect(secondPlanResponse.status).toBe(201)
    const secondPlan = await secondPlanResponse.json() as { id: number }
    secondPlacementPlanId = secondPlan.id
    expect((await api(`/api/floor-plans/${secondPlan.id}/markers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: asset.id, x: 0.61, y: 0.42 }) })).status).toBe(201)
    const many = await (await api(`/api/assets/${asset.id}/floor-plans`)).json() as { data: Array<{ planId: number }> }
    expect(many.data.map((placement) => placement.planId).sort((left, right) => left - right)).toEqual([planId, secondPlan.id].sort((left, right) => left - right))

    const iconChange = await api(`/api/projects/1/asset-types/${asset.type.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ iconKey: 'wrench' }) })
    expect(iconChange.status).toBe(200)
    const serialized = await (await api(`/api/floor-plans/${planId}`)).json() as { markers: Array<{ id: number; x: number; y: number; asset: { type: { iconKey: string } } }> }
    expect(serialized.markers).toContainEqual(expect.objectContaining({ id: firstMarker.id, x: firstMarker.x, y: firstMarker.y, asset: expect.objectContaining({ type: expect.objectContaining({ iconKey: 'wrench' }) }) }))
    const restoredIcon = await api(`/api/projects/1/asset-types/${asset.type.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ iconKey: asset.type.iconKey }) })
    expect(restoredIcon.status).toBe(200)
  })
})
