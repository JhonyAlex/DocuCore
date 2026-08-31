import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase, projectApiPath } from '../helpers/database'

// DOC-03: periodicidad de documentos. Al crear o subir una versión sin
// vencimiento explícito, el servidor lo calcula según la regla:
//   - 'Calendario': desde el vencimiento vigente (o la emisión si no hay).
//   - 'Subida': desde la emisión de la nueva versión.
// Un vencimiento explícito siempre tiene prioridad sobre el cálculo.

let server: Server | undefined
let baseUrl: string
let storageDir: string
const createdDocumentIds: number[] = []

const PDF_BYTES = Buffer.from('%PDF-1.4 QA PERIODICITY BYTES')

async function api(apiPath: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${projectApiPath(apiPath, init)}`, init)
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

async function createDocument(input: { issueDate: string; periodicity?: string; periodicityMode?: string; locationId?: number }, expiryDate?: string): Promise<number> {
  const form = new FormData()
  form.set('name', `QA-PERIODICITY-${uniqueSuffix()}`)
  form.set('type', 'Manual')
  form.set('projectId', '1')
  form.set('issueDate', input.issueDate)
  if (input.locationId) form.set('locationId', String(input.locationId))
  if (expiryDate) form.set('expiryDate', expiryDate)
  if (input.periodicity) {
    form.set('periodicity', input.periodicity)
    form.set('periodicityMode', input.periodicityMode ?? 'Calendario')
  }
  form.append('file', new Blob([new Uint8Array(PDF_BYTES)], { type: 'application/pdf' }), 'doc.pdf')
  const response = await api('/api/documents', { method: 'POST', body: form })
  expect(response.status).toBe(201)
  const created = (await response.json()) as { id: number }
  createdDocumentIds.push(created.id)
  return created.id
}

async function uploadVersion(id: number, issueDate: string, expiryDate?: string): Promise<Response> {
  const form = new FormData()
  form.set('issueDate', issueDate)
  if (expiryDate) form.set('expiryDate', expiryDate)
  form.append('file', new Blob([new Uint8Array(PDF_BYTES)], { type: 'application/pdf' }), 'v-next.pdf')
  return api(`/api/documents/${id}/versions`, { method: 'POST', body: form })
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  storageDir = await mkdtemp(path.join(tmpdir(), 'docucore-periodicity-'))
  process.env.DOCUMENT_STORAGE_PATH = storageDir
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
  for (const id of createdDocumentIds) {
    await api(`/api/documents/${id}`, { method: 'DELETE' }).catch(() => undefined)
  }
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => error ? reject(error) : resolve())
  })
  await rm(storageDir, { recursive: true, force: true })
})

describe('document periodicity API', () => {
  it('calculates the short periodicities from the selected base date', async () => {
    const id = await createDocument({ issueDate: '2026-07-15', periodicity: 'Quincenal', periodicityMode: 'Calendario' })
    const document = await (await api(`/api/documents/${id}`)).json() as { currentVersion: { expiryDate: string | null } }
    expect(document.currentVersion.expiryDate).toBe('2026-07-30T00:00:00.000Z')
  })

  it('associates a document with a location and exposes it in the location detail', async () => {
    const locations = await (await api('/api/locations?parentId=root')).json() as { locations: Array<{ id: number }> }
    const locationId = locations.locations[0]?.id
    if (!locationId) throw new Error('Expected a seeded root location')
    const id = await createDocument({ issueDate: '2026-07-15', locationId })
    const document = await (await api(`/api/documents/${id}`)).json() as { location: { id: number; code: string } | null }
    expect(document.location).toMatchObject({ id: locationId })

    const location = await (await api(`/api/locations/${locationId}`)).json() as { previewDocumentCount: number; documents: Array<{ id: number }> }
    expect(location.previewDocumentCount).toBeGreaterThan(0)
    expect(location.documents.some((entry) => entry.id === id)).toBe(true)

    const clear = await api(`/api/documents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locationId: null }) })
    expect(clear.status).toBe(200)
    expect((await clear.json() as { location: unknown }).location).toBeNull()
  })

  it('calculates the first expiry from the issue date when creating with periodicity', async () => {
    const id = await createDocument({ issueDate: '2026-07-15', periodicity: 'Trimestral', periodicityMode: 'Calendario' })
    const document = await (await api(`/api/documents/${id}`)).json() as {
      periodicity: string | null
      periodicityMode: string | null
      currentVersion: { version: number; expiryDate: string | null }
    }

    expect(document.periodicity).toBe('Trimestral')
    expect(document.periodicityMode).toBe('Calendario')
    expect(document.currentVersion.expiryDate).toBe('2026-10-15T00:00:00.000Z')
  })

  it('keeps an explicit expiry even with periodicity', async () => {
    const id = await createDocument({ issueDate: '2026-07-15', periodicity: 'Trimestral', periodicityMode: 'Calendario' }, '2026-12-31')
    const document = await (await api(`/api/documents/${id}`)).json() as { currentVersion: { expiryDate: string | null } }

    expect(document.currentVersion.expiryDate).toBe('2026-12-31T00:00:00.000Z')
  })

  it('advances the expiry from the previous one in Calendario mode', async () => {
    const id = await createDocument({ issueDate: '2026-03-15', periodicity: 'Trimestral', periodicityMode: 'Calendario' })
    const version = await uploadVersion(id, '2026-04-20')
    expect(version.status).toBe(201)
    const document = await (await api(`/api/documents/${id}`)).json() as { currentVersion: { version: number; expiryDate: string | null } }

    expect(document.currentVersion.version).toBe(2)
    expect(document.currentVersion.expiryDate).toBe('2026-09-15T00:00:00.000Z')
  })

  it('computes the expiry from the new issue date in Subida mode', async () => {
    const id = await createDocument({ issueDate: '2026-03-15', periodicity: 'Trimestral', periodicityMode: 'Subida' })
    const version = await uploadVersion(id, '2026-04-20')
    expect(version.status).toBe(201)
    const document = await (await api(`/api/documents/${id}`)).json() as { currentVersion: { expiryDate: string | null } }

    expect(document.currentVersion.expiryDate).toBe('2026-07-20T00:00:00.000Z')
  })

  it('uses Subida by default and treats several files as one periodic delivery', async () => {
    const id = await createDocument({ issueDate: '2026-03-15', periodicity: 'Trimestral' })
    const first = await (await api(`/api/documents/${id}`)).json() as { periodicityMode: string | null }
    expect(first.periodicityMode).toBe('Subida')

    const form = new FormData()
    form.set('issueDate', '2026-04-20')
    form.append('files', new Blob([new Uint8Array(PDF_BYTES)], { type: 'application/pdf' }), 'certificado.pdf')
    form.append('files', new Blob([new Uint8Array(Buffer.from('ANEXO QA'))], { type: 'text/plain' }), 'anexo.txt')
    const version = await api(`/api/documents/${id}/versions`, { method: 'POST', body: form })
    expect(version.status).toBe(201)

    const document = await (await api(`/api/documents/${id}`)).json() as {
      currentVersion: { version: number; expiryDate: string | null; attachments: Array<{ id: number; originalName: string }> }
    }
    expect(document.currentVersion.version).toBe(2)
    expect(document.currentVersion.expiryDate).toBe('2026-07-20T00:00:00.000Z')
    expect(document.currentVersion.attachments).toEqual([expect.objectContaining({ originalName: 'anexo.txt' })])

    const attachment = document.currentVersion.attachments[0]!
    const previewed = await api(`/api/documents/${id}/versions/2/files/${attachment.id}/preview`)
    expect(previewed.status).toBe(200)
    expect(previewed.headers.get('content-disposition')).toContain('inline')
    expect(Buffer.from(await previewed.arrayBuffer())).toEqual(Buffer.from('ANEXO QA'))

    const downloaded = await api(`/api/documents/${id}/versions/2/files/${attachment.id}/download`)
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers.get('content-disposition')).toContain('attachment')
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(Buffer.from('ANEXO QA'))
  })

  it('respects a manual expiry when uploading a new version', async () => {
    const id = await createDocument({ issueDate: '2026-03-15', periodicity: 'Trimestral', periodicityMode: 'Calendario' })
    const version = await uploadVersion(id, '2026-04-20', '2026-11-30')
    expect(version.status).toBe(201)
    const document = await (await api(`/api/documents/${id}`)).json() as { currentVersion: { expiryDate: string | null } }

    expect(document.currentVersion.expiryDate).toBe('2026-11-30T00:00:00.000Z')
  })

  it('updates periodicity and mode through PATCH and removes them with null', async () => {
    const id = await createDocument({ issueDate: '2026-07-15' })
    const update = await api(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodicity: 'Anual', periodicityMode: 'Subida' }),
    })
    expect(update.status).toBe(200)
    const updated = await update.json() as { periodicity: string | null; periodicityMode: string | null }
    expect(updated.periodicity).toBe('Anual')
    expect(updated.periodicityMode).toBe('Subida')

    const remove = await api(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodicity: null, periodicityMode: null }),
    })
    expect(remove.status).toBe(200)
    const removed = await remove.json() as { periodicity: string | null; periodicityMode: string | null }
    expect(removed.periodicity).toBeNull()
    expect(removed.periodicityMode).toBeNull()
  })

  it('rejects a periodicity mode without a periodicity on PATCH', async () => {
    const id = await createDocument({ issueDate: '2026-07-15' })
    const response = await api(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodicityMode: 'Calendario' }),
    })

    expect(response.status).toBe(400)
  })

  it('rejects an unknown periodicity when creating', async () => {
    const form = new FormData()
    form.set('name', `QA-PERIODICITY-INVALID-${uniqueSuffix()}`)
    form.set('type', 'Manual')
    form.set('projectId', '1')
    form.set('issueDate', '2026-08-01')
    form.set('periodicity', 'Cada tres días')
    form.append('file', new Blob([new Uint8Array(PDF_BYTES)], { type: 'application/pdf' }), 'doc.pdf')

    const response = await api('/api/documents', { method: 'POST', body: form })
    expect(response.status).toBe(400)
  })
})
