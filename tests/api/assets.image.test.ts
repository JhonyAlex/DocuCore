import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseUrl, ensureTestDatabase, projectApiPath } from '../helpers/database'

// IMG-01: hasta 5 imágenes por activo. POST /api/assets/:id/images sube imágenes
// (multipart, campos `images` o `image`), GET /:id/images/:imageId la sirve inline y
// DELETE /:id/images/:imageId la elimina. El binario vive en el storage gestionado; en
// BD se registra en AssetImage (storageKey nunca se expone).

let server: Server | undefined
let baseUrl: string
let storageDir: string
// El seed canónico escribe sus documentos en el storage; el conteo de ficheros
// de imagen es relativo al estado tras el seed.
let baselineFiles: string[] = []
const createdAssetIds: number[] = []

import sharp from 'sharp'

let PNG_BYTES: Buffer
let JPEG_BYTES: Buffer
const PDF_BYTES = Buffer.from('%PDF-1.4 QA IMAGE REJECT')

async function api(apiPath: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has('x-docucore-test-actor-id')) headers.set('x-docucore-test-actor-id', '1')
  return fetch(`${baseUrl}${projectApiPath(apiPath, init)}`, { ...init, headers })
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

function multiUploadForm(files: Array<{ bytes: Buffer; mimeType: string; fileName: string }>): FormData {
  const form = new FormData()
  for (const file of files) {
    form.append('images', new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }), file.fileName)
  }
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
  PNG_BYTES = await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 4,
      background: { r: 58, g: 100, b: 255, alpha: 1 },
    },
  }).png().toBuffer()

  JPEG_BYTES = await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 3,
      background: { r: 255, g: 100, b: 58 },
    },
  }).jpeg().toBuffer()

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
  // Limpieza tolerante: purgar los activos creados (borra sus imágenes del storage).
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
    const upload = await api(`/api/assets/${id}/images`, { method: 'POST', body: uploadForm(PNG_BYTES, 'image/png', 'foto.png') })
    expect(upload.status).toBe(200)
    const updated = (await upload.json()) as {
      images: Array<{ id: number; url: string; mimeType: string; sizeBytes: number }>
      imageUrl: string | null
      imageMimeType: string | null
      imageSizeBytes: number | null
      imageStorageKey?: unknown
    }
    expect(updated.images).toHaveLength(1)
    expect(updated.images[0].mimeType).toBe('image/webp')
    expect(updated.images[0].sizeBytes).toBeGreaterThan(0)
    expect(updated.imageUrl).toBe(updated.images[0].url)
    expect(updated.imageMimeType).toBe('image/webp')
    expect(updated.imageSizeBytes).toBe(updated.images[0].sizeBytes)
    expect(updated.imageStorageKey).toBeUndefined()

    expect((await addedStorageFiles()).length).toBe(before + 1)
    const served = await api(updated.images[0].url)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toContain('image/webp')

    const servedLegacy = await api(`/api/assets/${id}/image`)
    expect(servedLegacy.status).toBe(200)
    expect(servedLegacy.headers.get('content-type')).toContain('image/webp')
  })

  it('allows uploading up to 5 images and serves each image inline', async () => {
    const id = await createAsset(`QA-MULTI-${uniqueSuffix()}`)
    const before = (await addedStorageFiles()).length

    // Subir 3 imágenes en lote
    const upload3 = await api(`/api/assets/${id}/images`, {
      method: 'POST',
      body: multiUploadForm([
        { bytes: PNG_BYTES, mimeType: 'image/png', fileName: 'img1.png' },
        { bytes: JPEG_BYTES, mimeType: 'image/jpeg', fileName: 'img2.jpg' },
        { bytes: PNG_BYTES, mimeType: 'image/png', fileName: 'img3.png' },
      ]),
    })
    expect(upload3.status).toBe(200)
    const data3 = (await upload3.json()) as { images: Array<{ id: number; url: string; mimeType: string }> }
    expect(data3.images).toHaveLength(3)
    expect((await addedStorageFiles()).length).toBe(before + 3)

    // Subir 2 imágenes adicionales (alcanzando el límite de 5)
    const upload2 = await api(`/api/assets/${id}/images`, {
      method: 'POST',
      body: multiUploadForm([
        { bytes: JPEG_BYTES, mimeType: 'image/jpeg', fileName: 'img4.jpg' },
        { bytes: PNG_BYTES, mimeType: 'image/png', fileName: 'img5.png' },
      ]),
    })
    expect(upload2.status).toBe(200)
    const data5 = (await upload2.json()) as { images: Array<{ id: number; url: string; mimeType: string }> }
    expect(data5.images).toHaveLength(5)
    expect((await addedStorageFiles()).length).toBe(before + 5)

    // Verificar que cada imagen se sirve correctamente
    for (const img of data5.images) {
      const served = await api(img.url)
      expect(served.status).toBe(200)
      expect(served.headers.get('content-type')).toContain(img.mimeType)
    }

    // Intentar subir una 6ª imagen debe ser rechazado con 400
    const uploadExcess = await api(`/api/assets/${id}/images`, {
      method: 'POST',
      body: uploadForm(PNG_BYTES, 'image/png', 'img6.png'),
    })
    expect(uploadExcess.status).toBe(400)
    const excessBody = (await uploadExcess.json()) as { error: string }
    expect(excessBody.error).toContain('5')
  })

  it('deletes a specific image by id and removes its file from storage', async () => {
    const id = await createAsset(`QA-DEL-SPEC-${uniqueSuffix()}`)
    const before = (await addedStorageFiles()).length
    const upload = await api(`/api/assets/${id}/images`, {
      method: 'POST',
      body: multiUploadForm([
        { bytes: PNG_BYTES, mimeType: 'image/png', fileName: 'img1.png' },
        { bytes: JPEG_BYTES, mimeType: 'image/jpeg', fileName: 'img2.jpg' },
      ]),
    })
    expect(upload.status).toBe(200)
    const data = (await upload.json()) as { images: Array<{ id: number; url: string }> }
    expect(data.images).toHaveLength(2)
    expect((await addedStorageFiles()).length).toBe(before + 2)

    // Eliminar solo la primera imagen
    const imageToDelete = data.images[0]
    const deleteRes = await api(`/api/assets/${id}/images/${imageToDelete.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(204)
    expect((await addedStorageFiles()).length).toBe(before + 1)

    // La imagen eliminada ahora da 404
    expect((await api(imageToDelete.url)).status).toBe(404)

    // La segunda imagen sigue accesible y ahora es la principal
    const remainingRes = await api(data.images[1].url)
    expect(remainingRes.status).toBe(200)

    const asset = (await (await api(`/api/assets/${id}`)).json()) as { images: Array<{ id: number }>; imageUrl: string | null }
    expect(asset.images).toHaveLength(1)
    expect(asset.images[0].id).toBe(data.images[1].id)
    expect(asset.imageUrl).toBe(data.images[1].url)
  })

  it('returns 404 for an asset without image and for an unknown asset', async () => {
    const id = await createAsset(`QA-NI-${uniqueSuffix()}`)
    expect((await api(`/api/assets/${id}/image`)).status).toBe(404)
    expect((await api(`/api/assets/${id}/images/999999`)).status).toBe(404)
    expect((await api('/api/assets/99999999/image')).status).toBe(404)
  })

  it('rejects an upload without a file', async () => {
    const id = await createAsset(`QA-NF-${uniqueSuffix()}`)
    const response = await api(`/api/assets/${id}/images`, { method: 'POST', body: new FormData() })
    expect(response.status).toBe(400)
  })

  it('rejects a non-image format on upload', async () => {
    const id = await createAsset(`QA-NS-${uniqueSuffix()}`)
    const response = await api(`/api/assets/${id}/images`, { method: 'POST', body: uploadForm(PDF_BYTES, 'application/pdf', 'plano.pdf') })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('Unsupported image type')
  })

  it('rejects an image larger than the 10 MB limit', async () => {
    const id = await createAsset(`QA-BG-${uniqueSuffix()}`)
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1)
    const response = await api(`/api/assets/${id}/images`, { method: 'POST', body: uploadForm(oversized, 'image/png', 'enorme.png') })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('Image exceeds the 10 MB limit')
  })

  it('rejects an upload for an asset in the trash', async () => {
    const id = await createAsset(`QA-TR-${uniqueSuffix()}`)
    expect((await api(`/api/assets/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/assets/${id}/images`, { method: 'POST', body: uploadForm(PNG_BYTES, 'image/png', 'foto.png') })).status).toBe(404)
  })

  it('deletes all images with DELETE /:id/image and removes files from storage', async () => {
    const id = await createAsset(`QA-DL-${uniqueSuffix()}`)
    const before = (await addedStorageFiles()).length
    expect((await api(`/api/assets/${id}/images`, {
      method: 'POST',
      body: multiUploadForm([
        { bytes: PNG_BYTES, mimeType: 'image/png', fileName: 'f1.png' },
        { bytes: JPEG_BYTES, mimeType: 'image/jpeg', fileName: 'f2.jpg' },
      ]),
    })).status).toBe(200)
    expect((await addedStorageFiles()).length).toBe(before + 2)

    expect((await api(`/api/assets/${id}/image`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/assets/${id}/image`)).status).toBe(404)
    expect((await addedStorageFiles()).length).toBe(before)
    const asset = (await (await api(`/api/assets/${id}`)).json()) as { images: unknown[]; imageUrl: string | null }
    expect(asset.images).toHaveLength(0)
    expect(asset.imageUrl).toBeNull()
  })

  it('removes all image files when the asset is purged', async () => {
    const id = await createAsset(`QA-PG-${uniqueSuffix()}`)
    const before = (await addedStorageFiles()).length
    expect((await api(`/api/assets/${id}/images`, {
      method: 'POST',
      body: multiUploadForm([
        { bytes: PNG_BYTES, mimeType: 'image/png', fileName: 'foto1.png' },
        { bytes: JPEG_BYTES, mimeType: 'image/jpeg', fileName: 'foto2.jpg' },
      ]),
    })).status).toBe(200)
    expect((await addedStorageFiles()).length).toBe(before + 2)

    expect((await api(`/api/assets/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/assets/${id}/purge`, { method: 'POST' })).status).toBe(204)
    expect((await addedStorageFiles()).length).toBe(before)
  })
})
