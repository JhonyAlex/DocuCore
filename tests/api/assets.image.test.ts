import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase } from '../helpers/database'

// IMG-01: imagen del activo. POST /api/assets/:id/image sube o reemplaza la
// foto (multipart, campo `image`), GET /:id/image la sirve inline y
// DELETE /:id/image la elimina. El binario vive en el storage gestionado; en
// BD solo la clave + MIME + tamaño (imageStorageKey nunca se expone).

let server: Server | undefined
let baseUrl: string
let storageDir: string
// El seed canónico escribe sus documentos en el storage; el conteo de ficheros
// de imagen es relativo al estado tras el seed.
let baselineFiles: string[] = []
const createdAssetIds: number[] = []

// PNG 1x1 válido y un JPEG 1x1 de muestra (cabecera mínima).
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex')
const JPEG_BYTES = Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb0043000b08080808080b0a0a0affc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda000c03010002110311003f00fd3ffd9', 'hex')
const PDF_BYTES = Buffer.from('%PDF-1.4 QA IMAGE REJECT')

async function api(apiPath: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${apiPath}`, init)
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

async function createAsset(code: string): Promise<number> {
  const response = await api('/api/assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      name: `Activo imagen ${code}`,
      serialNumber: `SN-IMG-${uniqueSuffix()}`,
      installDate: '2026-07-15',
      typeId: 1,
      statusId: 1,
      locationId: 1,
      projectId: 1,
      responsibleId: 1,
      initials: 'QA',
    }),
  })
  expect(response.status).toBe(201)
  const created = (await response.json()) as { id: number }
  createdAssetIds.push(created.id)
  return created.id
}

function uploadForm(bytes: Buffer, mimeType: string, fileName: string): FormData {
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(bytes)], { type: mimeType }), fileName)
  return form
}

async function storageFiles(): Promise<string[]> {
  const entries = await readdir(storageDir)
  return entries.filter((entry) => entry !== '.docucore-storage.json')
}

// Ficheros que no estaban tras el seed (los de las imágenes de los tests).
async function addedStorageFiles(): Promise<string[]> {
  const current = await storageFiles()
  return current.filter((entry) => !baselineFiles.includes(entry))
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl
  storageDir = await mkdtemp(path.join(tmpdir(), 'docucore-asset-image-'))
  process.env.DOCUMENT_STORAGE_PATH = storageDir
  await ensureTestDatabase()
  baselineFiles = await storageFiles()
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
  // Limpieza tolerante: purgar los activos creados (borra su imagen del storage).
  for (const id of createdAssetIds) {
    await api(`/api/assets/${id}/purge`, { method: 'POST' }).catch(() => undefined)
  }
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => error ? reject(error) : resolve())
  })
  await rm(storageDir, { recursive: true, force: true })
})

describe('asset image endpoints', () => {
  it('uploads an image and serves it back inline with the stored mime type', async () => {
    const id = await createAsset(`QA-IMG-${uniqueSuffix()}`)
    const before = (await addedStorageFiles()).length
    const upload = await api(`/api/assets/${id}/image`, { method: 'POST', body: uploadForm(PNG_BYTES, 'image/png', 'foto.png') })
    expect(upload.status).toBe(200)
    const updated = (await upload.json()) as { imageUrl: string | null; imageMimeType: string | null; imageSizeBytes: number | null; imageStorageKey?: unknown }
    expect(updated.imageUrl).toBe(`/api/assets/${id}/image`)
    expect(updated.imageMimeType).toBe('image/png')
    expect(updated.imageSizeBytes).toBe(PNG_BYTES.length)
    expect(updated.imageStorageKey).toBeUndefined()

    expect((await addedStorageFiles()).length).toBe(before + 1)
    const served = await api(updated.imageUrl as string)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toContain('image/png')
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG_BYTES)
  })

  it('replaces the previous image and removes its file from storage', async () => {
    const id = await createAsset(`QA-RP-${uniqueSuffix()}`)
    const before = (await addedStorageFiles()).length
    expect((await api(`/api/assets/${id}/image`, { method: 'POST', body: uploadForm(PNG_BYTES, 'image/png', 'primera.png') })).status).toBe(200)
    const replace = await api(`/api/assets/${id}/image`, { method: 'POST', body: uploadForm(JPEG_BYTES, 'image/jpeg', 'segunda.jpg') })
    expect(replace.status).toBe(200)
    const updated = (await replace.json()) as { imageMimeType: string }
    expect(updated.imageMimeType).toBe('image/jpeg')

    // La anterior se borró: el saldo neto es un único fichero nuevo.
    expect((await addedStorageFiles()).length).toBe(before + 1)
    const served = await api(`/api/assets/${id}/image`)
    expect(served.headers.get('content-type')).toContain('image/jpeg')
    expect(Buffer.from(await served.arrayBuffer())).toEqual(JPEG_BYTES)
  })

  it('returns 404 for an asset without image and for an unknown asset', async () => {
    const id = await createAsset(`QA-NI-${uniqueSuffix()}`)
    expect((await api(`/api/assets/${id}/image`)).status).toBe(404)
    expect((await api('/api/assets/99999999/image')).status).toBe(404)
  })

  it('rejects an upload without a file', async () => {
    const id = await createAsset(`QA-NF-${uniqueSuffix()}`)
    const response = await api(`/api/assets/${id}/image`, { method: 'POST', body: new FormData() })
    expect(response.status).toBe(400)
  })

  it('rejects a non-image format on upload', async () => {
    const id = await createAsset(`QA-NS-${uniqueSuffix()}`)
    const response = await api(`/api/assets/${id}/image`, { method: 'POST', body: uploadForm(PDF_BYTES, 'application/pdf', 'plano.pdf') })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('Unsupported image type')
  })

  it('rejects an image larger than the 10 MB limit', async () => {
    const id = await createAsset(`QA-BG-${uniqueSuffix()}`)
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1)
    const response = await api(`/api/assets/${id}/image`, { method: 'POST', body: uploadForm(oversized, 'image/png', 'enorme.png') })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('Image exceeds the 10 MB limit')
  })

  it('rejects an upload for an asset in the trash', async () => {
    const id = await createAsset(`QA-TR-${uniqueSuffix()}`)
    expect((await api(`/api/assets/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/assets/${id}/image`, { method: 'POST', body: uploadForm(PNG_BYTES, 'image/png', 'foto.png') })).status).toBe(404)
  })

  it('deletes the image and removes its file from storage', async () => {
    const id = await createAsset(`QA-DL-${uniqueSuffix()}`)
    const before = (await addedStorageFiles()).length
    expect((await api(`/api/assets/${id}/image`, { method: 'POST', body: uploadForm(PNG_BYTES, 'image/png', 'foto.png') })).status).toBe(200)
    expect((await addedStorageFiles()).length).toBe(before + 1)

    expect((await api(`/api/assets/${id}/image`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/assets/${id}/image`)).status).toBe(404)
    expect((await addedStorageFiles()).length).toBe(before)
    const asset = (await (await api(`/api/assets/${id}`)).json()) as { imageUrl: string | null; imageMimeType: string | null; imageSizeBytes: number | null }
    expect(asset.imageUrl).toBeNull()
    expect(asset.imageMimeType).toBeNull()
    expect(asset.imageSizeBytes).toBeNull()
  })

  it('removes the image file when the asset is purged', async () => {
    const id = await createAsset(`QA-PG-${uniqueSuffix()}`)
    const before = (await addedStorageFiles()).length
    expect((await api(`/api/assets/${id}/image`, { method: 'POST', body: uploadForm(PNG_BYTES, 'image/png', 'foto.png') })).status).toBe(200)
    expect((await addedStorageFiles()).length).toBe(before + 1)

    expect((await api(`/api/assets/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/assets/${id}/purge`, { method: 'POST' })).status).toBe(204)
    expect((await addedStorageFiles()).length).toBe(before)
  })
})
