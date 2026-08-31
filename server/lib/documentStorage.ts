import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { normalizeFileName } from './textEncoding'

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

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export type StoredDocumentUpload = { storageKey: string; mimeType: string; sizeBytes: number; originalName: string }

function webpName(originalName: string): string {
  const stem = originalName.replace(/\.[^.]+$/, '') || 'imagen'
  return `${stem}.webp`
}

async function optimizeImageForWeb(bytes: Buffer, mimeType: string): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!IMAGE_MIME_TYPES.has(mimeType)) return { bytes, mimeType }
  try {
    const optimized = await sharp(bytes, { failOn: 'error', animated: true }).rotate().webp({ quality: 82, effort: 4 }).toBuffer()
    if (optimized.length === 0 || optimized.length > MAX_DOCUMENT_SIZE_BYTES) throw new Error('Invalid document size')
    return { bytes: optimized, mimeType: 'image/webp' }
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid document size') throw error
    throw new Error('Invalid document image')
  }
}

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

// Error de prevalidación READ-ONLY: la estructura del almacenamiento haría
// fallar cleanDocumentStorage() (p. ej. un directorio con nombre de clave
// gestionada). Se lanza antes de cualquier mutación de BD.
export class StoragePrevalidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StoragePrevalidationError'
  }
}

// Opciones de prevalidación READ-ONLY. `allowProvisionable` distingue las dos
// operaciones destructivas: el reset exige un almacenamiento ya gestionado
// (marcador válido), mientras que el seed admite además un storage inexistente
// o vacío sin marcador, únicamente si la provisión posterior (mkdir +
// marcador) podrá completarse de forma segura.
export interface StoragePrevalidationOptions {
  allowProvisionable: boolean
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
  // El marcador debe ser un archivo NORMAL (P0-REM-01, P1 #4): un
  // symlink/junction —válido o roto— o un directorio no es un marcador de
  // DocuCore y se bloquea antes de confiar en su contenido. Solo la ausencia
  // real (ENOENT) es provisionable; el resto de errores de lstat
  // (EACCES/EPERM/I/O) se propagan (fail-closed).
  try {
    const markerLstat = await lstat(storageMarkerPath())
    if (markerLstat.isSymbolicLink() || !markerLstat.isFile()) {
      throw new StorageMarkerError('INVALID_MARKER', 'Invalid document storage path: DocuCore marker is not a regular file (symlink/junction or directory)')
    }
  } catch (error) {
    if (error instanceof StorageMarkerError) throw error
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    throw new StorageMarkerError('MISSING_MARKER', 'Invalid document storage path: missing DocuCore marker')
  }
  let marker: string
  try {
    marker = await readFile(storageMarkerPath(), 'utf8')
  } catch (error) {
    // Carrera posterior al lstat: solo la ausencia real del marcador (ENOENT)
    // es provisionable. Un fallo de permisos (EACCES/EPERM) o de I/O no puede
    // tratarse como «sin marcador»: se propaga y bloquea (fail-closed).
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
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
  return (await storeDocumentUpload(file)).storageKey
}

export async function storeDocumentUpload(file: Express.Multer.File): Promise<StoredDocumentUpload> {
  const optimized = await optimizeImageForWeb(file.buffer, file.mimetype)
  const originalName = normalizeFileName(file.originalname)
  return {
    storageKey: await storePreparedDocumentBuffer(optimized.bytes, optimized.mimeType),
    mimeType: optimized.mimeType,
    sizeBytes: optimized.bytes.length,
    originalName: optimized.mimeType === 'image/webp' && file.mimetype !== 'image/webp' ? webpName(originalName) : originalName,
  }
}

export async function storeDocumentBuffer(bytes: Buffer, mimeType: string): Promise<string> {
  const optimized = await optimizeImageForWeb(bytes, mimeType)
  return storePreparedDocumentBuffer(optimized.bytes, optimized.mimeType)
}

async function storePreparedDocumentBuffer(bytes: Buffer, mimeType: string): Promise<string> {
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

/**
 * Prevalidación READ-ONLY del almacenamiento de documentos para operaciones
 * destructivas: verifica que la ruta es válida, que el marcador existe y
 * pertenece a DocuCore (o, con `allowProvisionable`, que el storage puede
 * provisionarse de forma segura) y que el marcador y las entradas con nombre
 * de clave gestionada son objetos NORMALES —archivos regulares, sin
 * symlinks/junctions (válidos o rotos); un directorio con ese nombre haría
 * fallar el `rm` sin `recursive`— que cleanDocumentStorage() podrá eliminar. Las
 * entradas no gestionadas se ignoran, igual que hará la limpieza. No escribe
 * ni borra nada: se invoca antes de mutar la BD. No garantiza atomicidad
 * BD/filesystem frente a carreras o fallos I/O posteriores al precheck
 * (TOCTOU).
 *
 * - `{ allowProvisionable: false }` (reset): el marcador válido es
 *   obligatorio; un storage inexistente o sin marcador se rechaza.
 * - `{ allowProvisionable: true }` (seed): un storage inexistente o vacío sin
 *   marcador se admite si la provisión posterior (mkdir recursivo + marcador)
 *   podrá completarse de forma segura; un directorio no vacío sin marcador, un
 *   marcador corrupto o de otro propietario, o una entrada gestionada con
 *   estructura incompatible se rechazan igualmente antes de mutar la BD.
 */
export async function prevalidateDocumentStorage({ allowProvisionable }: StoragePrevalidationOptions): Promise<string> {
  let base: string
  try {
    base = await assertValidStorage()
  } catch (error) {
    if (!(error instanceof StorageMarkerError) || error.code !== 'MISSING_MARKER') throw error
    if (!allowProvisionable) {
      throw new StorageMarkerError('MISSING_MARKER', 'Invalid document storage path: missing DocuCore marker (prevalidación estricta: el reset exige un marcador válido)')
    }
    await prevalidateProvisionableDocumentStorage()
    return documentStoragePath()
  }
  const entries = await readdir(base)
  for (const entry of entries) {
    if (entry === STORAGE_MARKER_FILE) continue
    if (!isManagedStorageKey(entry)) continue
    let entryLstat
    try {
      // lstat no sigue el componente final: un symlink/junction (válido o
      // roto) se reporta como enlace, no como el objeto al que apunta
      // (P0-REM-01, P1 #4). Las entradas no gestionadas se ignoran sin
      // inspección, igual que hará la limpieza.
      entryLstat = await lstat(safeStoragePath(entry))
    } catch {
      throw new StoragePrevalidationError(`La entrada "${entry}" parece una clave de documento gestionada pero no se puede inspeccionar; la limpieza posterior no está garantizada.`)
    }
    if (entryLstat.isSymbolicLink()) {
      throw new StoragePrevalidationError(`La entrada "${entry}" parece una clave de documento gestionada pero es un symlink/junction; cleanDocumentStorage() no podría eliminarla de forma segura.`)
    }
    if (!entryLstat.isFile()) {
      throw new StoragePrevalidationError(`La entrada "${entry}" parece una clave de documento gestionada pero no es un archivo; cleanDocumentStorage() no podría eliminarla.`)
    }
  }
  return base
}

// Comprobación READ-ONLY de que la provisión del marcador (mkdir recursivo +
// readdir vacío + writeFile) podrá completarse sin conflicto estructural
// previsible: la base no existe y su ancestro existente más cercano es un
// directorio NORMAL (un archivo en el camino haría fallar el `mkdir`
// posterior; un symlink/junction —válido o roto— haría que la provisión
// atravesara un enlace, prohibido por P0-REM-01), o existe y es un directorio
// vacío. Los componentes se inspeccionan con lstat, que NO sigue el componente
// final: un enlace roto se detecta al alcanzar el propio enlace, y en Windows
// los junction/reparse point se reportan como symlink. Un error de lstat
// distinto de ENOENT (EACCES/EPERM/I/O) se propaga: nunca se trata como
// inexistencia. No crea ni escribe nada.
async function prevalidateProvisionableDocumentStorage(): Promise<void> {
  const base = documentStoragePath()
  assertSafeStorageRoot(base)
  let current = base
  for (;;) {
    try {
      const currentLstat = await lstat(current)
      if (currentLstat.isSymbolicLink()) {
        throw new StorageMarkerError('NOT_EMPTY', 'Invalid document storage path: not provisionable (an existing component of the path is a symlink/junction)')
      }
      if (!currentLstat.isDirectory()) {
        throw new StorageMarkerError('NOT_EMPTY', 'Invalid document storage path: not provisionable (an existing ancestor is not a directory)')
      }
      const entries = await readdir(current)
      if (current === base && entries.length > 0) {
        throw new StorageMarkerError('NOT_EMPTY', 'Invalid document storage path: directory is not empty (no DocuCore marker)')
      }
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = path.dirname(current)
      if (parent === current) {
        // Ni la base ni ningún ancestro existen hasta la raíz: el mkdir
        // recursivo podrá crear la cadena completa (permisos aparte, no
        // previsibles de forma read-only).
        return
      }
      current = parent
    }
  }
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
