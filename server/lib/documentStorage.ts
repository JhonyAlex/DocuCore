import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024

export const ALLOWED_DOCUMENT_MIME_TYPES = new Map<string, string>([
  ['application/pdf', '.pdf'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['application/vnd.ms-excel', '.xls'],
  ['text/plain', '.txt'],
])

export function documentStoragePath(): string {
  return path.resolve(process.env.DOCUMENT_STORAGE_PATH ?? path.join(process.cwd(), 'data', 'documents'))
}

function safeStoragePath(storageKey: string): string {
  if (path.basename(storageKey) !== storageKey || !/^[a-f0-9-]+\.(pdf|xlsx|xls|txt)$/.test(storageKey)) {
    throw new Error('Invalid document storage key')
  }
  const base = documentStoragePath()
  const candidate = path.resolve(base, storageKey)
  if (!candidate.startsWith(`${base}${path.sep}`)) throw new Error('Invalid document storage key')
  return candidate
}

export async function storeDocumentFile(file: Express.Multer.File): Promise<string> {
  return storeDocumentBuffer(file.buffer, file.mimetype)
}

export async function storeDocumentBuffer(bytes: Buffer, mimeType: string): Promise<string> {
  const extension = ALLOWED_DOCUMENT_MIME_TYPES.get(mimeType)
  if (!extension) throw new Error('Unsupported document type')
  if (bytes.length <= 0 || bytes.length > MAX_DOCUMENT_SIZE_BYTES) throw new Error('Invalid document size')

  const base = documentStoragePath()
  await mkdir(base, { recursive: true })
  const storageKey = `${randomUUID()}${extension}`
  await writeFile(safeStoragePath(storageKey), bytes, { flag: 'wx' })
  return storageKey
}

export async function readDocumentFile(storageKey: string): Promise<Buffer> {
  return readFile(safeStoragePath(storageKey))
}

export async function removeDocumentFile(storageKey: string): Promise<void> {
  await rm(safeStoragePath(storageKey), { force: true })
}
