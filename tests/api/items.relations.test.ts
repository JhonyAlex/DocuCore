import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

// Valida contra la BD aislada de E2E que POST /api/items y PUT /api/items/:id
// comprueben antes de escribir que la ubicación pertenece al proyecto del ítem
// y que el responsable es miembro del proyecto, incluyendo el PUT parcial.

let server: Server | undefined
let baseUrl: string
const createdItemIds: number[] = []
const createdLocationIds: number[] = []

type LocationRow = { id: number; name: string; code: string }
type UserRow = { id: number; name: string }

let project1Location: LocationRow
let project2Location: LocationRow
let project1OnlyUser: UserRow
let bothProjectsUser: UserRow

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init)
}

function itemPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: `QA-REL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: 'Ítem de relaciones QA',
    serialNumber: `SN-REL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    installDate: '2026-07-15',
    typeId: 1,
    statusId: 1,
    locationId: project1Location.id,
    projectId: 1,
    responsibleId: project1OnlyUser.id,
    initials: 'QA',
    ...overrides,
  }
}

// ensureTestDatabase ya reintenta internamente durante 60 s (arranque en frío
// de la BD E2E); aquí solo se amplía el timeout del hook por encima de ese
// margen para que un primer arranque no sea un flake.
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

  // Datos canónicos: J. Ramírez (2) solo es miembro del proyecto 1; María (1)
  // es miembro de ambos. El árbol público solo expone el proyecto 1, así que la
  // ubicación del proyecto 2 para el caso cross-project se crea en el test.
  const locationsBody = await (await api('/api/locations')).json() as { locations: LocationRow[] }
  project1Location = locationsBody.locations.find((location) => location.code === 'PIN-NA-01A')!
  const users = await (await api('/api/users')).json() as UserRow[]
  project1OnlyUser = users.find((user) => user.name.includes('Ramírez')) ?? users[1]
  bothProjectsUser = users.find((user) => user.name.includes('María')) ?? users[0]
  if (!project1Location || !project1OnlyUser || !bothProjectsUser) {
    throw new Error('Canonical seed data for relation tests is missing.')
  }
  const project2LocationResponse = await api('/api/locations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Sede QA cross-project',
      code: `QA-SEDE-${Date.now().toString().slice(-6)}`,
      surface: '10 m²',
      parentId: null,
      responsibleId: bothProjectsUser.id,
      projectId: 2,
    }),
  })
  if (project2LocationResponse.status !== 201) {
    throw new Error('Failed to create the cross-project location for relation tests.')
  }
  project2Location = await project2LocationResponse.json() as LocationRow
  createdLocationIds.push(project2Location.id)
}, 120_000)

afterAll(async () => {
  // Si beforeAll falló, server no se inicializó: no hay nada que limpiar y el
  // cierre se omite para conservar el error original (evitar un TypeError
  // de server.close() sobre undefined que enmascararía el fallo real).
  const activeServer = server
  if (!activeServer) return
  for (const id of createdLocationIds) {
    await api(`/api/locations/${id}`, { method: 'DELETE' }).catch(() => undefined)
  }
  for (const id of createdItemIds) {
    await api(`/api/items/${id}`, { method: 'DELETE' }).catch(() => undefined)
  }
  await new Promise<void>((resolve, reject) => {
    activeServer.close((error) => error ? reject(error) : resolve())
  })
})

describe('items relation validation', () => {
  it('creates an item whose location and responsible belong to the project', async () => {
    const response = await api('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(itemPayload()),
    })
    expect(response.status).toBe(201)
    const created = await response.json() as { id: number; projectId: number; locationId: number; responsibleId: number }
    createdItemIds.push(created.id)
    expect(created.projectId).toBe(1)
    expect(created.locationId).toBe(project1Location.id)
    expect(created.responsibleId).toBe(project1OnlyUser.id)
  })

  it('rejects a location from another project on create', async () => {
    const response = await api('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(itemPayload({ locationId: project2Location.id })),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Location and responsible must belong to the item project' })
  })

  it('rejects a responsible who is not a member of the project on create', async () => {
    const response = await api('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(itemPayload({ projectId: 2, responsibleId: project1OnlyUser.id })),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Location and responsible must belong to the item project' })
  })

  it('rejects a nonexistent location on create', async () => {
    const response = await api('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(itemPayload({ locationId: 999_999 })),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Location and responsible must belong to the item project' })
  })

  it('keeps existing relations valid when the PUT changes only the name', async () => {
    const created = await (await api('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(itemPayload()),
    })).json() as { id: number }
    createdItemIds.push(created.id)

    const response = await api(`/api/items/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ítem renombrado QA' }),
    })
    expect(response.status).toBe(200)
    const updated = await response.json() as { name: string; projectId: number; locationId: number; responsibleId: number }
    expect(updated.name).toBe('Ítem renombrado QA')
    expect(updated.projectId).toBe(1)
    expect(updated.locationId).toBe(project1Location.id)
    expect(updated.responsibleId).toBe(project1OnlyUser.id)
  })

  it('rejects a partial PUT that moves the project alone, leaving the old relations', async () => {
    const created = await (await api('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(itemPayload()),
    })).json() as { id: number }
    createdItemIds.push(created.id)

    const response = await api(`/api/items/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 2 }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Location and responsible must belong to the item project' })
  })

  it('rejects a partial PUT that changes only the location to another project', async () => {
    const created = await (await api('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(itemPayload()),
    })).json() as { id: number }
    createdItemIds.push(created.id)

    const response = await api(`/api/items/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locationId: project2Location.id }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Location and responsible must belong to the item project' })
  })

  it('accepts a PUT that moves project, location and responsible coherently', async () => {
    const created = await (await api('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(itemPayload()),
    })).json() as { id: number }
    createdItemIds.push(created.id)

    const response = await api(`/api/items/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 2, locationId: project2Location.id, responsibleId: bothProjectsUser.id }),
    })
    expect(response.status).toBe(200)
    const updated = await response.json() as { projectId: number; locationId: number; responsibleId: number }
    expect(updated.projectId).toBe(2)
    expect(updated.locationId).toBe(project2Location.id)
    expect(updated.responsibleId).toBe(bothProjectsUser.id)
  })

  it('updates the location label when it followed the old name, keeps custom labels', async () => {
    // Ubicación sin label personalizada: el label sigue al renombrar.
    const follow = await (await api('/api/locations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Sala QA seguimiento',
        code: `QA-FOL-${Date.now().toString().slice(-6)}`,
        surface: '10 m²',
        parentId: null,
        responsibleId: bothProjectsUser.id,
        projectId: 1,
      }),
    })).json() as { id: number; label: string }
    createdLocationIds.push(follow.id)
    expect(follow.label).toBe('Sala QA seguimiento')
    const followResponse = await api(`/api/locations/${follow.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Sala QA renombrada' }),
    })
    expect(followResponse.status).toBe(200)
    expect((await followResponse.json() as { label: string }).label).toBe('Sala QA renombrada')

    // Ubicación con label personalizada: se conserva al renombrar.
    const custom = await (await api('/api/locations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Sala QA interna',
        label: 'Etiqueta personalizada QA',
        code: `QA-CUS-${Date.now().toString().slice(-6)}`,
        surface: '20 m²',
        parentId: null,
        responsibleId: bothProjectsUser.id,
        projectId: 1,
      }),
    })).json() as { id: number; label: string }
    createdLocationIds.push(custom.id)
    expect(custom.label).toBe('Etiqueta personalizada QA')
    const customResponse = await api(`/api/locations/${custom.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Sala QA pública' }),
    })
    expect(customResponse.status).toBe(200)
    expect((await customResponse.json() as { label: string }).label).toBe('Etiqueta personalizada QA')

    // Un label explícito en la petición siempre tiene prioridad.
    const explicitResponse = await api(`/api/locations/${follow.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Sala QA definitiva', label: 'Ficha técnica QA' }),
    })
    expect(explicitResponse.status).toBe(200)
    expect((await explicitResponse.json() as { label: string }).label).toBe('Ficha técnica QA')
  })
})
