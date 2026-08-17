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
    server = app.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`; resolve() })
  })
}, 120_000)

afterAll(async () => {
  if (createdId) await api(`/api/projects/1/document-types/${createdId}`, { method: 'DELETE' }).catch(() => undefined)
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
}, 120_000)

describe('document types API', () => {
  it('keeps the default catalog scoped to its project and creates a new type', async () => {
    const projectOne = await api('/api/projects/1/document-types')
    const defaults = await projectOne.json() as Array<{ name: string }>
    expect(defaults.map((type) => type.name)).toEqual(['Certificado', 'Calibración', 'Manual', 'Acta', 'Contrato'])

    const projectTwo = await api('/api/projects/2/document-types')
    expect((await projectTwo.json() as Array<{ name: string }>).map((type) => type.name)).toEqual(['Certificado', 'Calibración', 'Manual', 'Acta', 'Contrato'])

    const response = await api('/api/projects/1/document-types', json('POST', { name: `Tipo Doc QA ${Date.now()}`, iconKey: 'file-signature' }))
    expect(response.status).toBe(201)
    const created = await response.json() as { id: number; name: string; iconKey: string; projectId: number; documentCount: number }
    createdId = created.id
    expect(created).toMatchObject({ projectId: 1, iconKey: 'file-signature', documentCount: 0 })
    expect((await (await api('/api/projects/2/document-types')).json() as Array<{ id: number }>).some((type) => type.id === createdId)).toBe(false)
  })

  it('renames immediately and rejects a case-insensitive duplicate', async () => {
    const renamed = await api(`/api/projects/1/document-types/${createdId}`, json('PATCH', { name: 'Contrato Marco QA', iconKey: 'briefcase' }))
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ name: 'Contrato Marco QA', iconKey: 'briefcase' })

    const duplicate = await api('/api/projects/1/document-types', json('POST', { name: 'certificado' }))
    expect(duplicate.status).toBe(409)
  })

  it('rejects an icon outside the controlled catalog', async () => {
    const response = await api('/api/projects/1/document-types', json('POST', { name: `Icono inválido ${Date.now()}`, iconKey: 'invalid-icon-key-xyz' }))
    expect(response.status).toBe(400)
  })

  it('blocks archiving a referenced type', async () => {
    // ID 1 corresponds to "Certificado", which has documents associated in project 1
    const response = await api('/api/projects/1/document-types/1', { method: 'DELETE' })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('No se puede archivar') })
  })

  it('archives an unused type, hides it from active catalogs and reactivates it', async () => {
    expect((await api(`/api/projects/1/document-types/${createdId}`, { method: 'DELETE' })).status).toBe(204)

    const activeCatalog = await api('/api/document-types?projectId=1')
    expect((await activeCatalog.json() as Array<{ id: number }>).some((type) => type.id === createdId)).toBe(false)

    const withInactive = await api('/api/projects/1/document-types?includeInactive=true')
    expect(await withInactive.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: createdId, isActive: false })]))

    const reactivated = await api(`/api/projects/1/document-types/${createdId}`, json('PATCH', { isActive: true }))
    expect(reactivated.status).toBe(200)
    expect(await reactivated.json()).toMatchObject({ id: createdId, isActive: true })
  })
})
