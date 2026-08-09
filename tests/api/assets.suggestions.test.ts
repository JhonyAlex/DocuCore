import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

// UX-04: GET /api/assets/suggestions devuelve los valores actuales de un campo
// (code | name | initials) con los tres campos por fila para dar contexto,
// excluyendo la papelera y, cuando se pide, un activo concreto.

let server: Server | undefined
let baseUrl: string
const createdAssetIds: number[] = []

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init)
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

async function createAsset(code: string, overrides: Record<string, unknown> = {}): Promise<{ id: number; code: string }> {
  const response = await api('/api/assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      name: `Activo sugerido ${code}`,
      serialNumber: `SN-SUG-${uniqueSuffix()}`,
      installDate: '2026-07-15',
      typeId: 1,
      statusId: 1,
      locationId: 1,
      projectId: 1,
      responsibleId: 1,
      initials: 'SU',
      ...overrides,
    }),
  })
  expect(response.status).toBe(201)
  const created = (await response.json()) as { id: number; code: string }
  createdAssetIds.push(created.id)
  return created
}

function suggestions(field: string, q: string, excludeId?: number): Promise<Response> {
  const params = new URLSearchParams({ field, q })
  if (excludeId !== undefined) params.set('excludeId', String(excludeId))
  return api(`/api/assets/suggestions?${params.toString()}`)
}

type SuggestionRow = { code: string | null; name: string | null; initials: string | null }

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

describe('asset suggestions API', () => {
  it('rejects an unknown field with 400', async () => {
    const response = await suggestions('serialNumber', 'SN')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid field' })
  })

  it('suggests distinct current codes with name and initials as context', async () => {
    const suffix = uniqueSuffix()
    await createAsset(`SUG-A-${suffix}`, { initials: 'XA' })
    await createAsset(`SUG-B-${suffix}`, { initials: 'XB' })
    // Dos activos comparten iniciales: el valor debe aparecer una sola vez.
    await createAsset(`SUG-C-${suffix}`, { initials: 'XA', name: 'Otro activo con XA' })

    // El sufijo es subcadena común de los códigos creados (SUG-A/B/C-<suffix>).
    const response = await suggestions('code', `${suffix}`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { values: SuggestionRow[] }
    expect(body.values.map((row) => row.code).sort()).toEqual([`SUG-A-${suffix}`, `SUG-B-${suffix}`, `SUG-C-${suffix}`].sort())
    const a = body.values.find((row) => row.code === `SUG-A-${suffix}`)
    expect(a).toMatchObject({ name: `Activo sugerido SUG-A-${suffix}`, initials: 'XA' })

    // distinct sobre iniciales: XA aparece una sola vez aunque haya dos activos.
    const initialsResponse = await suggestions('initials', 'XA')
    expect(initialsResponse.status).toBe(200)
    const initialsBody = (await initialsResponse.json()) as { values: SuggestionRow[] }
    expect(initialsBody.values.filter((row) => row.initials === 'XA')).toHaveLength(1)
  })

  it('filters case-insensitively and searches by name with code and initials as context', async () => {
    const suffix = uniqueSuffix()
    await createAsset(`SUG-NM-${suffix}`, { name: 'Turbina Gamma Especial', initials: 'TG' })

    const lower = await suggestions('code', `sug-nm-${suffix}`)
    expect(lower.status).toBe(200)
    const lowerBody = (await lower.json()) as { values: SuggestionRow[] }
    expect(lowerBody.values).toHaveLength(1)
    expect(lowerBody.values[0].code).toBe(`SUG-NM-${suffix}`)

    const name = await suggestions('name', 'Turbina')
    expect(name.status).toBe(200)
    const nameBody = (await name.json()) as { values: SuggestionRow[] }
    expect(nameBody.values[0]).toMatchObject({
      name: 'Turbina Gamma Especial',
      code: `SUG-NM-${suffix}`,
      initials: 'TG',
    })
  })

  it('excludes the trash and the excludeId asset', async () => {
    const suffix = uniqueSuffix()
    await createAsset(`SUG-K-${suffix}`)
    const excluded = await createAsset(`SUG-X-${suffix}`)
    const trashed = await createAsset(`SUG-T-${suffix}`)

    const deleteResponse = await api(`/api/assets/${trashed.id}`, { method: 'DELETE' })
    expect(deleteResponse.status).toBe(204)

    // excludeId quita solo el activo indicado (sufijo común a los tres códigos).
    const withoutExcluded = await suggestions('code', `${suffix}`)
    const withoutExcludedBody = (await withoutExcluded.json()) as { values: SuggestionRow[] }
    expect(withoutExcludedBody.values.map((row) => row.code).sort()).toEqual([`SUG-K-${suffix}`, `SUG-X-${suffix}`].sort())

    const withExcluded = await suggestions('code', `${suffix}`, excluded.id)
    const withExcludedBody = (await withExcluded.json()) as { values: SuggestionRow[] }
    expect(withExcludedBody.values.map((row) => row.code)).toEqual([`SUG-K-${suffix}`])
  })
})
