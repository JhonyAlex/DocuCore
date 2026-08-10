import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024

export const ALLOWED_DOCUMENT_MIME_TYPES = new Map<string, string>([
  ['application/pdf', '.pdf'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['application/vnd.ms-excel', '.xls'],
  ['text/plain', '.txt'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
])

// Marcador propio que identifica un directorio como almacenamiento de DocuCore.
const STORAGE_MARKER_FILE = '.docucore-storage.json'
const STORAGE_MARKER_OWNER = 'docucore-document-storage'

// Distingue un directorio que aún no es nuestro (marcador ausente, provisionable
// si está vacío) de uno que no debe usarse bajo ninguna circunstancia (marcador
// corrupto, de otro propietario o con contenido ajeno). Solo MISSING_MARKER es
// recuperable mediante provisión; el resto son errores bloqueantes.
export class StorageMarkerError extends Error {
  constructor(
    public readonly code: 'MISSING_MARKER' | 'INVALID_MARKER' | 'NOT_EMPTY',
    message: string,
  ) {
    super(message)
    this.name = 'StorageMarkerError'
  }
}

export function documentStoragePath(): string {
  return path.resolve(process.env.DOCUMENT_STORAGE_PATH ?? path.join(process.cwd(), 'data', 'documents'))
}

export function storageMarkerPath(): string {
  return path.join(documentStoragePath(), STORAGE_MARKER_FILE)
}

function assertSafeStorageRoot(base: string): void {
  const parent = path.resolve(base, '..')
  if (!base || base === parent || base === path.sep) {
    throw new Error('Invalid document storage path')
  }
}

// Provisión del marcador, únicamente en un directorio nuevo y vacío. Si la
// escritura falla, el error se propaga: nunca se oculta un fallo de writeFile.
async function ensureStorageMarker(): Promise<void> {
  const base = documentStoragePath()
  assertSafeStorageRoot(base)
  await mkdir(base, { recursive: true })
  const entries = await readdir(base)
  if (entries.length > 0) {
    throw new StorageMarkerError('NOT_EMPTY', 'Invalid document storage path: directory is not empty (no DocuCore marker)')
  }
  try {
    await writeFile(storageMarkerPath(), `${JSON.stringify({ owner: STORAGE_MARKER_OWNER, createdAt: new Date().toISOString() }, null, 2)}\n`, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      // Carrera con otro proceso: el marcador ya existe, debe ser válido.
      await assertValidStorage()
      return
    }
    throw error
  }
}

// Valida que la ruta configurada es un almacenamiento de DocuCore: no es una
// raíz del sistema y contiene el marcador propio en buen estado. Distingue
// marcador ausente (MISSING_MARKER) de marcador corrupto o de otro propietario
// (INVALID_MARKER). Lanza si no es válida.
export async function assertValidStorage(): Promise<string> {
  const base = documentStoragePath()
  assertSafeStorageRoot(base)
  let marker: string
  try {
    marker = await readFile(storageMarkerPath(), 'utf8')
  } catch {
    throw new StorageMarkerError('MISSING_MARKER', 'Invalid document storage path: missing DocuCore marker')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(marker)
  } catch {
    throw new StorageMarkerError('INVALID_MARKER', 'Invalid document storage path: corrupt DocuCore marker')
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as { owner?: unknown }).owner !== STORAGE_MARKER_OWNER) {
    throw new StorageMarkerError('INVALID_MARKER', 'Invalid document storage path: unrecognized DocuCore marker owner')
  }
  return base
}

// Clave de almacenamiento gestionada: UUID canónico (versión 4 y variant
// 8/9/a/b) con extensión permitida. Solo estos nombres se crean y se eliminan.
const MANAGED_STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|xlsx|xls|txt|png|jpg|jpeg|webp|gif)$/i

function isManagedStorageKey(storageKey: string): boolean {
  return path.basename(storageKey) === storageKey && MANAGED_STORAGE_KEY_PATTERN.test(storageKey)
}

function safeStoragePath(storageKey: string): string {
  if (!isManagedStorageKey(storageKey)) {
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

  try {
    await assertValidStorage()
  } catch (error) {
    // Únicamente un marcador ausente es recuperable, y solo si el directorio
    // está vacío; un marcador corrupto o de otro propietario es bloqueante.
    if (!(error instanceof StorageMarkerError) || error.code !== 'MISSING_MARKER') throw error
    await ensureStorageMarker()
  }
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

// Elimina únicamente los ficheros gestionados (claves de almacenamiento
// válidas) del directorio marcado. Devuelve el nº de ficheros eliminados.
// Lanza si la ruta o el marcador no son válidos (ausente, corrupto o de otro
// propietario) sin tocar nada, y también si un `rm` falla (EACCES, EBUSY o
// cualquier otro): una limpieza parcial nunca se silencia.
export async function cleanDocumentStorage(): Promise<number> {
  const base = await assertValidStorage()

  const entries = await readdir(base)

  let removed = 0
  for (const entry of entries) {
    if (entry === STORAGE_MARKER_FILE) continue
    // Solo se borran claves gestionadas; cualquier otro nombre se ignora sin
    // pasar por `rm` (nunca se captura un fallo de eliminación).
    if (!isManagedStorageKey(entry)) continue
    await rm(safeStoragePath(entry), { force: true })
    removed += 1
  }
  return removed
}
