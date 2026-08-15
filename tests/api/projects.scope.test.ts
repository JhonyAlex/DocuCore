import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

let server: Server | undefined
let baseUrl = ''
const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}${path}`, init)
const scoped = (projectId: number, path: string) => `/api/projects/${projectId}${path}`

type Catalog = { id: number; name: string }
type Location = { id: number }
type Asset = { id: number; code: string; serialNumber: string; projectId: number }

async function createIsolatedAsset(projectId: number, code: string): Promise<Response> {
  const [typesResponse, statusesResponse, locationsResponse] = await Promise.all([
    api(scoped(projectId, '/asset-types')),
    api(scoped(projectId, '/statuses')),
    api(scoped(projectId, '/locations?limit=20')),
  ])
  const types = await typesResponse.json() as Catalog[]
  const statuses = await statusesResponse.json() as Catalog[]
  const locationsPayload = await locationsResponse.json() as { locations: Location[] }
  return api(scoped(projectId, '/assets'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, name: `Aislamiento ${code}`, serialNumber: `SN-${code}`, installDate: '2026-07-15', typeId: types[0].id, statusId: statuses[0].id, locationId: locationsPayload.locations[0].id, responsibleId: 1, initials: 'MP', projectId }),
  })
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  process.env.DOCUCORE_NOW = '2026-07-15T00:00:00.000Z'
  await ensureTestDatabase()
  const { default: app } = await import('../../server/index')
  await new Promise<void>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`; resolve() })
    server = instance
  })
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
})

describe('PROJ-01 project scope', () => {
  it('creates, updates and manages project members without allowing duplicate or orphaned ownership', async () => {
    const code = `PROJECT-CRUD-${Date.now()}`
    const createdResponse = await api('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, name: 'Proyecto CRUD', description: 'Proyecto aislado para gestionar miembros', themeKey: 'rose', memberIds: [{ userId: 2, role: 'EDITOR' }] }),
    })
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json() as { id: number; code: string; memberCount: number; assetCount: number; locationCount: number; documentCount: number }
    expect(created).toMatchObject({ code, memberCount: 2, assetCount: 0, locationCount: 0, documentCount: 0 })

    const updatedResponse = await api(`/api/projects/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Proyecto CRUD editado', themeKey: 'amber' }),
    })
    expect(updatedResponse.status).toBe(200)
    expect(await updatedResponse.json()).toMatchObject({ id: created.id, name: 'Proyecto CRUD editado', themeKey: 'amber' })

    expect((await api(`/api/projects/${created.id}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 3, role: 'VIEWER' }) })).status).toBe(201)
    expect((await api(`/api/projects/${created.id}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 3, role: 'VIEWER' }) })).status).toBe(409)
    expect((await api(`/api/projects/${created.id}/members/2`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'ADMIN' }) })).status).toBe(200)
    const membersResponse = await api(`/api/projects/${created.id}/members?page=1&limit=2`)
    expect(membersResponse.status).toBe(200)
    expect((await membersResponse.json() as { total: number }).total).toBe(3)
    expect((await api(`/api/projects/${created.id}/members/3`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/projects/${created.id}/members/1`, { method: 'DELETE' })).status).toBe(409)
  })

  it('does not disclose known entity IDs from another project', async () => {
    const projectTwoAssets = await (await api(scoped(2, '/assets?limit=20'))).json() as { data: Asset[] }
    const foreign = projectTwoAssets.data[0]
    expect(foreign.projectId).toBe(2)
    expect((await api(scoped(1, `/assets/${foreign.id}`))).status).toBe(404)
    expect((await api(scoped(1, `/assets/${foreign.id}`), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Intento cruzado' }) })).status).toBe(404)

    const [localAssetsResponse, foreignStatusesResponse] = await Promise.all([
      api(scoped(1, '/assets?limit=1')),
      api(scoped(2, '/statuses')),
    ])
    const localAsset = (await localAssetsResponse.json() as { data: Asset[] }).data[0]
    const foreignStatus = (await foreignStatusesResponse.json() as Catalog[])[0]
    expect((await api(scoped(1, `/assets/${localAsset.id}`), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ statusId: foreignStatus.id }) })).status).toBe(400)

    const foreignDocuments = await (await api(scoped(2, '/documents?limit=20'))).json() as { data: Array<{ id: number }> }
    expect(foreignDocuments.data.length).toBeGreaterThan(0)
    expect((await api(scoped(1, `/documents/${foreignDocuments.data[0].id}`))).status).toBe(404)
  })

  it('keeps codes and serial numbers unique only inside each project', async () => {
    const code = `PROJ-SCOPE-${Date.now()}`
    const [one, two] = await Promise.all([createIsolatedAsset(1, code), createIsolatedAsset(2, code)])
    expect(one.status).toBe(201)
    expect(two.status).toBe(201)
    const first = await one.json() as Asset
    const second = await two.json() as Asset
    expect(first.projectId).toBe(1)
    expect(second.projectId).toBe(2)
    expect((await createIsolatedAsset(1, code)).status).toBe(409)
    expect((await api(scoped(1, '/assets'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `${code}-BAD`, name: 'Ámbito falso', serialNumber: `${code}-BAD`, installDate: '2026-07-15', typeId: 1, statusId: 1, locationId: 1, responsibleId: 1, initials: 'MP', projectId: 2 }) })).status).toBe(400)
  })

  it('allows reads but blocks ordinary writes when a project is archived', async () => {
    expect((await api('/api/projects/2/archive', { method: 'POST' })).status).toBe(200)
    expect((await api(scoped(2, '/assets?limit=1'))).status).toBe(200)
    expect((await createIsolatedAsset(2, `ARCHIVED-${Date.now()}`)).status).toBe(409)
    expect((await api('/api/projects/2/restore', { method: 'POST' })).status).toBe(200)
  })

  it('clones configuration without operational rows', async () => {
    const code = `CLONE-${Date.now()}`
    const response = await api('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, name: 'Proyecto de clonación', description: 'Solo configuración', themeKey: 'emerald', copyConfigurationFromProjectId: 1 }) })
    expect(response.status).toBe(201)
    const cloned = await response.json() as { id: number; assetCount: number; locationCount: number; documentCount: number }
    expect(cloned).toMatchObject({ assetCount: 0, locationCount: 0, documentCount: 0 })
    const [sourceTypes, cloneTypes, sourceFields, cloneFields, sourceTasks, cloneTasks, sourcePlans, clonePlans] = await Promise.all([
      api(scoped(1, '/asset-types')),
      api(scoped(cloned.id, '/asset-types')),
      api(scoped(1, '/dynamic-fields')),
      api(scoped(cloned.id, '/dynamic-fields')),
      api(scoped(1, '/tasks?includeInactive=true')),
      api(scoped(cloned.id, '/tasks?includeInactive=true')),
      api(scoped(1, '/preventive-plans')),
      api(scoped(cloned.id, '/preventive-plans')),
    ])
    expect((await cloneTypes.json() as Catalog[]).length).toBe((await sourceTypes.json() as Catalog[]).length)
    expect((await cloneFields.json() as unknown[]).length).toBe((await sourceFields.json() as unknown[]).length)
    expect((await cloneTasks.json() as Catalog[]).length).toBe((await sourceTasks.json() as Catalog[]).length)
    const sourcePlanRows = await sourcePlans.json() as Array<{ taskIds: number[]; assetTypeIds: number[] }>
    const clonedPlanRows = await clonePlans.json() as Array<{ taskIds: number[]; assetTypeIds: number[] }>
    expect(clonedPlanRows.map((plan) => ({ tasks: plan.taskIds.length, types: plan.assetTypeIds.length }))).toEqual(
      sourcePlanRows.map((plan) => ({ tasks: plan.taskIds.length, types: plan.assetTypeIds.length })),
    )
  })
})
