import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase, projectApiPath } from '../helpers/database'

let server: Server | undefined
let baseUrl: string
let createdId = 0

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${projectApiPath(path, init)}`, init)
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  await ensureTestDatabase()
  const { default: app } = await import('../../server/index')
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
      resolve()
    })
  })
})

afterAll(async () => {
  if (createdId) await api(`/api/projects/1/statuses/${createdId}`, { method: 'DELETE' }).catch(() => undefined)
  await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())))
})

describe('statuses API', () => {
  it('keeps the default catalog scoped to its project and creates a new status', async () => {
    const projectOne = await api('/api/projects/1/statuses')
    const defaults = (await projectOne.json()) as Array<{ name: string; color: string }>
    expect(defaults.map((status) => status.name)).toEqual([
      'Activo',
      'En revisión',
      'Fuera de servicio',
      'Vencido',
      'Alerta',
    ])

    const projectTwo = await api('/api/projects/2/statuses')
    expect(((await projectTwo.json()) as Array<{ name: string }>).map((status) => status.name)).toEqual([
      'Activo',
      'En revisión',
      'Fuera de servicio',
      'Vencido',
      'Alerta',
    ])

    const response = await api(
      '/api/projects/1/statuses',
      json('POST', { name: `En calibración QA ${Date.now()}`, color: 'indigo', pulseDot: 'red' }),
    )
    expect(response.status).toBe(201)
    const created = (await response.json()) as {
      id: number
      name: string
      color: string
      pulseDot: string | null
      projectId: number
      assetCount: number
    }
    createdId = created.id
    expect(created).toMatchObject({
      projectId: 1,
      color: 'indigo',
      pulseDot: 'red',
      assetCount: 0,
    })
    expect(
      ((await (await api('/api/projects/2/statuses')).json()) as Array<{ id: number }>).some(
        (status) => status.id === createdId,
      ),
    ).toBe(false)
  })

  it('renames immediately and rejects a case-insensitive duplicate', async () => {
    const renamed = await api(
      `/api/projects/1/statuses/${createdId}`,
      json('PATCH', { name: 'En calibración externa QA', color: 'purple' }),
    )
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ name: 'En calibración externa QA', color: 'purple' })

    const duplicate = await api('/api/projects/1/statuses', json('POST', { name: 'activo' }))
    expect(duplicate.status).toBe(409)
  })

  it('rejects an invalid color outside the controlled catalog', async () => {
    const response = await api(
      '/api/projects/1/statuses',
      json('POST', { name: `Color inválido ${Date.now()}`, color: 'magenta' }),
    )
    expect(response.status).toBe(400)
  })

  it('blocks archiving a referenced status', async () => {
    // Status 1 is "Activo" and has 142 assets associated
    const response = await api('/api/projects/1/statuses/1', { method: 'DELETE' })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('No se puede archivar') })
  })

  it('archives an unused status, hides it from catalogs and reactivates it', async () => {
    expect((await api(`/api/projects/1/statuses/${createdId}`, { method: 'DELETE' })).status).toBe(204)

    const activeCatalog = await api('/api/statuses?projectId=1')
    expect(
      ((await activeCatalog.json()) as Array<{ id: number }>).some((status) => status.id === createdId),
    ).toBe(false)

    const withInactive = await api('/api/projects/1/statuses?includeInactive=true')
    expect(await withInactive.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: createdId, isActive: false })]),
    )

    const reactivated = await api(`/api/projects/1/statuses/${createdId}`, json('PATCH', { isActive: true }))
    expect(reactivated.status).toBe(200)
    expect(await reactivated.json()).toMatchObject({ id: createdId, isActive: true })
  })
})
