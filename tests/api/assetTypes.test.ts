import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl: string
let createdId = 0

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init)
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
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
  if (createdId) await api(`/api/projects/1/asset-types/${createdId}`, { method: 'DELETE' }).catch(() => undefined)
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
})

describe('asset types API', () => {
  it('keeps the default catalog scoped to its project and creates a new type', async () => {
    const projectOne = await api('/api/projects/1/asset-types')
    const defaults = await projectOne.json() as Array<{ name: string }>
    expect(defaults.map((type) => type.name)).toEqual(['Máquina', 'Extintor', 'Vehículo', 'Servidor', 'Instrumento'])

    const projectTwo = await api('/api/projects/2/asset-types')
    expect((await projectTwo.json() as Array<{ name: string }>).map((type) => type.name)).toEqual(['Máquina', 'Extintor', 'Vehículo', 'Servidor', 'Instrumento'])

    const response = await api('/api/projects/1/asset-types', json('POST', { name: `Equipo QA ${Date.now()}` }))
    expect(response.status).toBe(201)
    const created = await response.json() as { id: number; name: string; projectId: number; assetCount: number; fieldCount: number }
    createdId = created.id
    expect(created).toMatchObject({ projectId: 1, assetCount: 0, fieldCount: 0 })
    expect((await (await api('/api/projects/2/asset-types')).json() as Array<{ id: number }>).some((type) => type.id === createdId)).toBe(false)
  })

  it('renames immediately and rejects a case-insensitive duplicate', async () => {
    const renamed = await api(`/api/projects/1/asset-types/${createdId}`, json('PATCH', { name: 'Equipo especializado QA' }))
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ name: 'Equipo especializado QA' })

    const duplicate = await api('/api/projects/1/asset-types', json('POST', { name: 'máquina' }))
    expect(duplicate.status).toBe(409)
  })

  it('propagates a renamed type through assets and dynamic field configuration', async () => {
    const rename = await api('/api/projects/1/asset-types/1', json('PATCH', { name: 'Maquinaria QA' }))
    expect(rename.status).toBe(200)

    const asset = await (await api('/api/assets/1')).json() as { type: { id: number; name: string } }
    expect(asset.type).toEqual({ id: 1, name: 'Maquinaria QA' })
    const definitions = await (await api('/api/projects/1/dynamic-fields')).json() as Array<{ assetTypes: Array<{ id: number; name: string }> }>
    expect(definitions.some((field) => field.assetTypes.some((type) => type.id === 1 && type.name === 'Maquinaria QA'))).toBe(true)

    expect((await api('/api/projects/1/asset-types/1', json('PATCH', { name: 'Máquina' }))).status).toBe(200)
  })

  it('blocks archiving a referenced type', async () => {
    const response = await api('/api/projects/1/asset-types/1', { method: 'DELETE' })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('No se puede archivar') })
  })

  it('archives an unused type, hides it from catalogs and reactivates it', async () => {
    expect((await api(`/api/projects/1/asset-types/${createdId}`, { method: 'DELETE' })).status).toBe(204)

    const activeCatalog = await api('/api/asset-types?projectId=1')
    expect((await activeCatalog.json() as Array<{ id: number }>).some((type) => type.id === createdId)).toBe(false)
    const withInactive = await api('/api/projects/1/asset-types?includeInactive=true')
    expect(await withInactive.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: createdId, isActive: false })]))

    const reactivated = await api(`/api/projects/1/asset-types/${createdId}`, json('PATCH', { isActive: true }))
    expect(reactivated.status).toBe(200)
    expect(await reactivated.json()).toMatchObject({ id: createdId, isActive: true })
  })
})
