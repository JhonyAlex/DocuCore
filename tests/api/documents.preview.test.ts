import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

// DOC-03: vista previa de la versión actual. GET /api/documents/:id/preview
// sirve el fichero inline (Content-Disposition: inline) para que el navegador
// lo muestre (iframe/PDF, <img> en imágenes), y los formatos de imagen pasan
// a estar permitidos en la subida. La descarga mantiene attachment.

let server: Server | undefined
let baseUrl: string
let storageDir: string
const createdDocumentIds: number[] = []

// PNG 1x1 válido.
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex')
const PDF_BYTES = Buffer.from('%PDF-1.4 QA PREVIEW BYTES')
const XLSX_BYTES = Buffer.from('PK\x03\x04QA-PREVIEW-XLSX')

async function api(apiPath: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${apiPath}`, init)
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

async function createDocument(name: string, mimeType: string, bytes: Buffer, fileName: string): Promise<number> {
  const form = new FormData()
  form.set('name', name)
  form.set('type', 'Manual')
  form.set('projectId', '1')
  form.set('issueDate', '2026-08-01')
  form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType }), fileName)
  const response = await api('/api/documents', { method: 'POST', body: form })
  expect(response.status).toBe(201)
  const created = (await response.json()) as { id: number }
  createdDocumentIds.push(created.id)
  return created.id
}

async function createVersion(id: number, mimeType: string, bytes: Buffer, fileName: string): Promise<void> {
  const form = new FormData()
  form.set('issueDate', '2026-08-02')
  form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType }), fileName)
  expect((await api(`/api/documents/${id}/versions`, { method: 'POST', body: form })).status).toBe(201)
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  storageDir = await mkdtemp(path.join(tmpdir(), 'docucore-preview-'))
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
  // Limpieza tolerante: eliminar los documentos creados (borra sus ficheros).
  for (const id of createdDocumentIds) {
    await api(`/api/documents/${id}`, { method: 'DELETE' }).catch(() => undefined)
  }
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => error ? reject(error) : resolve())
  })
  await rm(storageDir, { recursive: true, force: true })
})

describe('document preview endpoint', () => {
  it('serves the current version of an image document inline', async () => {
    const id = await createDocument(`QA-PREVIEW-IMG-${uniqueSuffix()}`, 'image/png', PNG_BYTES, 'foto.png')
    const response = await api(`/api/documents/${id}/preview`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('image/png')
    expect(response.headers.get('content-disposition')).toContain('inline')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES)
  })

  it('serves a pdf document inline for the iframe viewer', async () => {
    const id = await createDocument(`QA-PREVIEW-PDF-${uniqueSuffix()}`, 'application/pdf', PDF_BYTES, 'plano.pdf')
    const response = await api(`/api/documents/${id}/preview`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/pdf')
    expect(response.headers.get('content-disposition')).toContain('inline')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PDF_BYTES)
  })

  it('serves a selected historical version inline without changing the current version', async () => {
    const firstBytes = Buffer.from('VERSION HISTORICA')
    const currentBytes = Buffer.from('VERSION VIGENTE')
    const id = await createDocument(`QA-PREVIEW-HISTORY-${uniqueSuffix()}`, 'text/plain', firstBytes, 'historica.txt')
    await createVersion(id, 'text/plain', currentBytes, 'vigente.txt')

    const historical = await api(`/api/documents/${id}/versions/1/preview`)
    expect(historical.status).toBe(200)
    expect(historical.headers.get('content-type')).toContain('text/plain')
    expect(historical.headers.get('content-disposition')).toContain('inline')
    expect(Buffer.from(await historical.arrayBuffer())).toEqual(firstBytes)

    const current = await api(`/api/documents/${id}/preview`)
    expect(Buffer.from(await current.arrayBuffer())).toEqual(currentBytes)
  })

  it('serves an xlsx document (no native preview; download keeps attachment)', async () => {
    const id = await createDocument(`QA-PREVIEW-XLSX-${uniqueSuffix()}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', XLSX_BYTES, 'tabla.xlsx')
    const preview = await api(`/api/documents/${id}/preview`)
    expect(preview.status).toBe(200)
    expect(Buffer.from(await preview.arrayBuffer())).toEqual(XLSX_BYTES)
    const download = await api(`/api/documents/${id}/download`)
    expect(download.headers.get('content-disposition')).toContain('attachment')
  })

  it('returns 404 for an unknown document', async () => {
    expect((await api('/api/documents/99999999/preview')).status).toBe(404)
  })

  it('rejects an unsupported document format on upload', async () => {
    const form = new FormData()
    form.set('name', `QA-PREVIEW-DOCX-${uniqueSuffix()}`)
    form.set('type', 'Manual')
    form.set('projectId', '1')
    form.set('issueDate', '2026-08-01')
    form.append('file', new Blob([new Uint8Array(Buffer.from('DOCX'))], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'documento.docx')
    const response = await api('/api/documents', { method: 'POST', body: form })
    expect(response.status).toBe(400)
  })
})
